// back/services/AutomationService.js

class AutomationService {
  constructor(whatsappService, io, AutomationState) { // ✅ Agora recebe o modelo Mongoose inicializado
    this.whatsappService = whatsappService;
    this.io = io;
    this.AutomationState = AutomationState; // ✅ Referência ao modelo do MongoDB
    this.automations = new Map(); // Armazena o estado em memória para execução rápida
    this.timers = new Map(); // Armazena os IDs dos setInterval
  }

  // ─── Helper: emite SOMENTE para o usuário dono ────────────────────────────
  _emit(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // ✅ Carregar estado da automação do banco de dados (MongoDB)
  async _loadAutomationStateFromDB(userId) {
    try {
      // Busca a automação do usuário
      const stateDoc = await this.AutomationState.findOne({ userId });

      if (stateDoc) {
        console.log("📦 [AutomationService] Estado da automação restaurado do BD para", userId);
        const state = stateDoc.toObject();
        
        // Garantir que os campos obrigatórios sejam arrays
        state.products = state.products || [];
        state.grupoIds = state.grupoIds || [];
        state.categories = state.categories || [];
        state.marketplaces = state.marketplaces || [];

        this.automations.set(userId, { state, intervalId: null });
        return state;
      }
      return null;
    } catch (error) {
      console.error("[AutomationService] Erro ao carregar estado do BD:", error);
      return null;
    }
  }

  // ✅ Salvar estado da automação no banco de dados (MongoDB)
  async _saveAutomationStateToDB(state) {
    try {
      const { userId } = state;

      // Tenta encontrar e atualizar, se não existir, cria um novo (upsert)
      const updatedDoc = await this.AutomationState.findOneAndUpdate(
        { userId },
        state,
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      console.log("💾 [AutomationService] Estado salvo no BD para usuário:", userId);
      return updatedDoc.toObject();
    } catch (error) {
      console.error("[AutomationService] Erro ao salvar no BD:", error);
      return null;
    }
  }

  // ✅ Remover estado da automação do banco de dados (MongoDB)
  async _deleteAutomationStateFromDB(userId) {
    try {
      const result = await this.AutomationState.deleteOne({ userId });
      if (result.deletedCount > 0) {
        console.log("🗑️ [AutomationService] Estado deletado do BD para usuário:", userId);
        return true;
      }
      return false;
    } catch (error) {
      console.error("[AutomationService] Erro ao deletar do BD:", error);
      return false;
    }
  }

  // ✅ Iniciar o timer periódico
  _startTimer(userId, intervalMinutes) {
    // Limpa qualquer timer existente para este usuário
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
    const automationEntry = this.automations.get(userId);
    if (automationEntry) {
      automationEntry.intervalId = timerId;
    }
  }

  // ─── Iniciar automação ────────────────────────────────────────────────────
  async start({ userId, sessionId, grupoIds, products, intervalMinutes, currentIndex = 0, totalSent = 0, categories = [], marketplaces = [] }) {
    await this.stop(userId); // Para qualquer automação anterior

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

    // Salvar estado inicial no MongoDB
    await this._saveAutomationStateToDB(state);

    this.automations.set(userId, { state, intervalId: null });
    this._startTimer(userId, intervalMinutes);

    console.log(`🤖 [AutomationService] Automação iniciada para ${userId} — a cada ${intervalMinutes}min`);
    this._emitState(userId);

    return this._getPublicState(state);
  }

  // ─── Parar automação ──────────────────────────────────────────────────────
  async stop(userId) {
    const entry = this.automations.get(userId);
    
    // Limpar timers em memória
    if (this.timers.has(userId)) {
      clearInterval(this.timers.get(userId));
      this.timers.delete(userId);
    }

    if (entry) {
      clearInterval(entry.intervalId);
      this.automations.delete(userId);
    }

    // ✅ Remover do MongoDB
    await this._deleteAutomationStateFromDB(userId);

    console.log(`🛑 [AutomationService] Automação cancelada para ${userId}`);
    this._emit(userId, "automation:cancelled", { userId });
    return true;
  }

  // ─── Pausar / Retomar ─────────────────────────────────────────────────────
  async pause(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return false;

    entry.state.isPaused = true;
    
    // ✅ Salvar estado pausado no BD
    await this._saveAutomationStateToDB(entry.state);

    // Parar o timer
    if (this.timers.has(userId)) {
      clearInterval(this.timers.get(userId));
      this.timers.delete(userId);
    }

    console.log(`⏸️  [AutomationService] Automação pausada para ${userId}`);
    this._emit(userId, "automation:paused", { userId });
    this._emitState(userId);
    return true;
  }

  async resume(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return false;

    entry.state.isPaused = false;
    entry.state.nextFireAt = Date.now() + entry.state.intervalMinutes * 60 * 1000;

    // ✅ Salvar estado retomado no BD
    await this._saveAutomationStateToDB(entry.state);

    this._startTimer(userId, entry.state.intervalMinutes);

    console.log(`▶️  [AutomationService] Automação retomada para ${userId}`);
    this._emit(userId, "automation:resumed", { userId });
    this._emitState(userId);
    return true;
  }

  // ─── Enviar agora ─────────────────────────────────────────────────────────
  async sendNow(userId) {
    const entry = this.automations.get(userId);
    if (!entry) throw new Error("Automação não encontrada");

    await this._sendNext(userId);

    // Reinicia o timer para o próximo ciclo
    entry.state.nextFireAt = Date.now() + entry.state.intervalMinutes * 60 * 1000;
    await this._saveAutomationStateToDB(entry.state);
    this._startTimer(userId, entry.state.intervalMinutes);

    return this._getPublicState(entry.state);
  }

  // ─── Status ───────────────────────────────────────────────────────────────
  async getStatus(userId) {
    let entry = this.automations.get(userId);
    if (!entry) {
      // ✅ Tenta carregar do MongoDB se não estiver em memória
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

  // ✅ Inicializar automações ativas ao carregar o servidor
  async initializeActiveAutomations() {
    try {
      console.log("🚀 [AutomationService] Inicializando automações do MongoDB...");
      // Busca todas as automações que não estão pausadas
      const activeStates = await this.AutomationState.find({ isPaused: false });

      if (activeStates && activeStates.length > 0) {
        console.log(`📦 [AutomationService] Restaurando ${activeStates.length} automação(ões) ativa(s)`);
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
    if (!session || !session.isReady) {
      await this.pause(userId);
      this._emit(userId, "automation:error", { error: `Sessão ${sessionId} não está conectada` });
      return;
    }

    try {
      console.log(`📤 [AutomationService] Enviando "${product.nome || product.name}" para ${grupoIds.length} grupo(s)`);

      for (const grupoId of grupoIds) {
        await session.enviarOfertas(grupoId, [
          {
            nome: product.nome || product.name,
            mensagem: product._mensagem,
            imagem: product.imagem || product.image || null,
            link: product.link_afiliado || product.affiliateLink || "",
          },
        ]);
      }

      state.currentIndex = (currentIndex + 1) % products.length;
      state.totalSent += 1;
      state.nextFireAt = Date.now() + state.intervalMinutes * 60 * 1000;

      // ✅ Salvar progresso no MongoDB
      await this._saveAutomationStateToDB(state);

      this._emit(userId, "automation:product-sent", {
        userId,
        product: { nome: product.nome || product.name, imagem: product.imagem || product.image },
        totalSent: state.totalSent,
        currentIndex: state.currentIndex,
        nextFireAt: state.nextFireAt,
      });

      console.log(`✅ [AutomationService] Enviado! Total: ${state.totalSent}`);
    } catch (error) {
      console.error(`❌ [AutomationService] Erro ao enviar:`, error.message);
      await this.pause(userId);
      this._emit(userId, "automation:error", { userId, error: error.message });
    }
  }

  _emitState(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return;
    this._emit(userId, "automation:state", { userId, ...this._getPublicState(entry.state) });
  }

  _getPublicState(state) {
    return {
      userId: state.userId,
      sessionId: state.sessionId,
      intervalMinutes: state.intervalMinutes,
      currentIndex: state.currentIndex,
      totalSent: state.totalSent,
      isPaused: state.isPaused,
      nextFireAt: state.nextFireAt,
      totalProducts: state.products.length,
      categories: state.categories,
      marketplaces: state.marketplaces,
    };
  }
}

module.exports = AutomationService;
