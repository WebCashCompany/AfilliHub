// back/services/AutomationService.js

class AutomationService {
  constructor(whatsappService, io, AutomationState) {
    this.whatsappService = whatsappService;
    this.io = io;
    this.AutomationState = AutomationState;
    this.automations = new Map();
    this.timers = new Map();
  }

  // ─── Helper: emite SOMENTE para o usuário dono ────────────────────────────
  _emit(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // ─── MongoDB: carregar ────────────────────────────────────────────────────
  async _loadAutomationStateFromDB(userId) {
    try {
      const stateDoc = await this.AutomationState.findOne({ userId });
      if (stateDoc) {
        console.log("📦 [AutomationService] Estado restaurado do BD para", userId);
        const state = stateDoc.toObject();
        state.products    = state.products    || [];
        state.grupoIds    = state.grupoIds    || [];
        state.categories  = state.categories  || [];
        state.marketplaces = state.marketplaces || [];
        this.automations.set(userId, { state, intervalId: null });
        return state;
      }
      return null;
    } catch (error) {
      console.error("[AutomationService] Erro ao carregar do BD:", error);
      return null;
    }
  }

  // ─── MongoDB: salvar ──────────────────────────────────────────────────────
  async _saveAutomationStateToDB(state) {
    try {
      const updatedDoc = await this.AutomationState.findOneAndUpdate(
        { userId: state.userId },
        state,
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      console.log("💾 [AutomationService] Estado salvo no BD para:", state.userId);
      return updatedDoc.toObject();
    } catch (error) {
      console.error("[AutomationService] Erro ao salvar no BD:", error);
      return null;
    }
  }

  // ─── MongoDB: deletar ─────────────────────────────────────────────────────
  async _deleteAutomationStateFromDB(userId) {
    try {
      const result = await this.AutomationState.deleteOne({ userId });
      if (result.deletedCount > 0) {
        console.log("🗑️ [AutomationService] Estado deletado do BD para:", userId);
        return true;
      }
      return false;
    } catch (error) {
      console.error("[AutomationService] Erro ao deletar do BD:", error);
      return false;
    }
  }

  // ─── Timer ────────────────────────────────────────────────────────────────
  _startTimer(userId, intervalMinutes) {
    if (this.timers.has(userId)) {
      clearInterval(this.timers.get(userId));
      this.timers.delete(userId);
    }

    const ms = intervalMinutes * 60 * 1000;
    const timerId = setInterval(async () => {
      const entry = this.automations.get(userId);
      if (!entry || entry.state.isPaused) return;
      await this._sendNext(userId);
    }, ms);

    this.timers.set(userId, timerId);
    const entry = this.automations.get(userId);
    if (entry) entry.intervalId = timerId;
  }

  // ─── Iniciar ──────────────────────────────────────────────────────────────
  async start({ userId, sessionId, grupoIds, products, intervalMinutes, currentIndex = 0, totalSent = 0, categories = [], marketplaces = [] }) {
    await this.stop(userId);

    if (!products || products.length === 0) {
      throw new Error("Nenhum produto para automatizar");
    }

    const state = {
      userId,
      sessionId,
      grupoIds,
      products,
      intervalMinutes,
      currentIndex,
      totalSent,
      isPaused: false,
      nextFireAt: Date.now() + intervalMinutes * 60 * 1000,
      categories,
      marketplaces,
    };

    await this._saveAutomationStateToDB(state);
    this.automations.set(userId, { state, intervalId: null });
    this._startTimer(userId, intervalMinutes);

    console.log(`🤖 [AutomationService] Iniciada para ${userId} — a cada ${intervalMinutes}min`);
    this._emitState(userId);
    return this._getPublicState(state);
  }

  // ─── Parar ────────────────────────────────────────────────────────────────
  async stop(userId) {
    if (this.timers.has(userId)) {
      clearInterval(this.timers.get(userId));
      this.timers.delete(userId);
    }

    const entry = this.automations.get(userId);
    if (entry) {
      clearInterval(entry.intervalId);
      this.automations.delete(userId);
    }

    await this._deleteAutomationStateFromDB(userId);

    console.log(`🛑 [AutomationService] Cancelada para ${userId}`);
    this._emit(userId, "automation:cancelled", { userId });
    return true;
  }

  // ─── Pausar ───────────────────────────────────────────────────────────────
  async pause(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return false;

    entry.state.isPaused = true;
    await this._saveAutomationStateToDB(entry.state);

    if (this.timers.has(userId)) {
      clearInterval(this.timers.get(userId));
      this.timers.delete(userId);
    }

    console.log(`⏸️  [AutomationService] Pausada para ${userId}`);
    this._emit(userId, "automation:paused", { userId });
    this._emitState(userId);
    return true;
  }

  // ─── Retomar ──────────────────────────────────────────────────────────────
  async resume(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return false;

    entry.state.isPaused = false;
    entry.state.nextFireAt = Date.now() + entry.state.intervalMinutes * 60 * 1000;
    await this._saveAutomationStateToDB(entry.state);
    this._startTimer(userId, entry.state.intervalMinutes);

    console.log(`▶️  [AutomationService] Retomada para ${userId}`);
    this._emit(userId, "automation:resumed", { userId });
    this._emitState(userId);
    return true;
  }

  // ─── Enviar agora ─────────────────────────────────────────────────────────
  async sendNow(userId) {
    const entry = this.automations.get(userId);
    if (!entry) throw new Error("Automação não encontrada");

    await this._sendNext(userId);

    entry.state.nextFireAt = Date.now() + entry.state.intervalMinutes * 60 * 1000;
    await this._saveAutomationStateToDB(entry.state);
    this._startTimer(userId, entry.state.intervalMinutes);

    return this._getPublicState(entry.state);
  }

  // ─── Status ───────────────────────────────────────────────────────────────
  async getStatus(userId) {
    let entry = this.automations.get(userId);
    if (!entry) {
      const stateFromDB = await this._loadAutomationStateFromDB(userId);
      if (stateFromDB) {
        entry = { state: stateFromDB, intervalId: null };
        if (!stateFromDB.isPaused) {
          this._startTimer(userId, stateFromDB.intervalMinutes);
        }
      }
    }
    if (!entry) return null;
    return this._getPublicState(entry.state);
  }

  // ─── Inicializar automações ativas no boot do servidor ───────────────────
  async initializeActiveAutomations() {
    try {
      console.log("🚀 [AutomationService] Inicializando automações do MongoDB...");
      const activeStates = await this.AutomationState.find({ isPaused: false });
      if (activeStates && activeStates.length > 0) {
        console.log(`📦 [AutomationService] Restaurando ${activeStates.length} automação(ões)`);
        for (const stateDoc of activeStates) {
          const state = stateDoc.toObject();
          this.automations.set(state.userId, { state, intervalId: null });
          this._startTimer(state.userId, state.intervalMinutes);
          console.log(`✅ [AutomationService] Restaurada para: ${state.userId}`);
        }
      }
    } catch (error) {
      console.error("[AutomationService] Erro ao inicializar automações:", error);
    }
  }

  // ─── Privado: envia o próximo produto ─────────────────────────────────────
  async _sendNext(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return;

    const { state } = entry;
    const { sessionId, grupoIds, products, currentIndex } = state;

    const product = products[currentIndex];
    if (!product) {
      await this.stop(userId);
      this._emit(userId, "automation:error", { error: "Nenhum produto restante. Automação parada." });
      return;
    }

    const session = this.whatsappService.getSession(userId, sessionId);

    // ── FIX: sessão não conectada → só avisa, NÃO pausa ──────────────────
    // Pausar aqui causava estado inconsistente no frontend ao recarregar a
    // página, porque o backend recebia automation:request-state antes da
    // sessão reconectar e travava a automação desnecessariamente.
    if (!session || !session.isReady) {
      console.warn(`⚠️ [AutomationService] Sessão ${sessionId} não está pronta — pulando ciclo para ${userId}`);
      this._emit(userId, "automation:error", {
        error: `Sessão ${sessionId} não está conectada — tentará novamente no próximo ciclo`,
      });
      return; // ← só retorna, não pausa nem cancela
    }

    try {
      console.log(`📤 [AutomationService] Enviando "${product.nome || product.name}" para ${grupoIds.length} grupo(s)`);

      for (const grupoId of grupoIds) {
        await session.enviarOfertas(grupoId, [
          {
            nome:     product.nome || product.name,
            mensagem: product._mensagem,
            imagem:   product.imagem || product.image || null,
            link:     product.link_afiliado || product.affiliateLink || "",
          },
        ]);
      }

      state.currentIndex = (currentIndex + 1) % products.length;
      state.totalSent   += 1;
      state.nextFireAt   = Date.now() + state.intervalMinutes * 60 * 1000;

      await this._saveAutomationStateToDB(state);

      this._emit(userId, "automation:product-sent", {
        userId,
        product:      { nome: product.nome || product.name, imagem: product.imagem || product.image },
        totalSent:    state.totalSent,
        currentIndex: state.currentIndex,
        nextFireAt:   state.nextFireAt,
      });

      console.log(`✅ [AutomationService] Enviado! Total: ${state.totalSent}`);
    } catch (error) {
      console.error(`❌ [AutomationService] Erro ao enviar:`, error.message);
      // Erro de envio real → pausa para não ficar em loop de erro
      await this.pause(userId);
      this._emit(userId, "automation:error", { userId, error: error.message });
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  _emitState(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return;
    this._emit(userId, "automation:state", { userId, ...this._getPublicState(entry.state) });
  }

  _getPublicState(state) {
    return {
      userId:         state.userId,
      sessionId:      state.sessionId,
      intervalMinutes: state.intervalMinutes,
      currentIndex:   state.currentIndex,
      totalSent:      state.totalSent,
      isPaused:       state.isPaused,
      nextFireAt:     state.nextFireAt,
      totalProducts:  state.products.length,
      categories:     state.categories,
      marketplaces:   state.marketplaces,
    };
  }
}

module.exports = AutomationService;