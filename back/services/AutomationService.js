// back/services/AutomationService.js
const cron = require('node-cron');

class AutomationService {
  constructor(whatsappService, io) {
    this.whatsappService = whatsappService;
    this.io = io;
    this.automations = new Map();
  }

  // ─── Helper: emite SOMENTE para o usuário dono ────────────────────────────
  _emit(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // ─── Iniciar automação ────────────────────────────────────────────────────

  start({ userId, sessionId, grupoIds, products, intervalMinutes, currentIndex = 0, totalSent = 0 }) {
    this.stop(userId);

    if (!products || products.length === 0) {
      throw new Error('Nenhum produto para automatizar');
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
      startedAt: Date.now(),
      nextFireAt: Date.now() + intervalMinutes * 60 * 1000,
    };

    const ms = intervalMinutes * 60 * 1000;

    const intervalId = setInterval(async () => {
      const current = this.automations.get(userId);
      if (!current || current.state.isPaused) return;
      await this._sendNext(userId);
    }, ms);

    this.automations.set(userId, { intervalId, state });

    console.log(`🤖 [AutomationService] Automação iniciada para ${userId} — a cada ${intervalMinutes}min`);

    this._emitState(userId);

    return this._getPublicState(state);
  }

  // ─── Parar automação ──────────────────────────────────────────────────────

  stop(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return false;

    clearInterval(entry.intervalId);
    this.automations.delete(userId);

    console.log(`🛑 [AutomationService] Automação cancelada para ${userId}`);

    this._emit(userId, 'automation:cancelled', { userId });
    return true;
  }

  // ─── Pausar / Retomar ─────────────────────────────────────────────────────

  pause(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return false;

    entry.state.isPaused = true;
    console.log(`⏸️  [AutomationService] Automação pausada para ${userId}`);

    this._emit(userId, 'automation:paused', { userId });
    this._emitState(userId);
    return true;
  }

  resume(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return false;

    entry.state.isPaused = false;
    entry.state.nextFireAt = Date.now() + entry.state.intervalMinutes * 60 * 1000;

    clearInterval(entry.intervalId);
    const ms = entry.state.intervalMinutes * 60 * 1000;
    entry.intervalId = setInterval(async () => {
      const current = this.automations.get(userId);
      if (!current || current.state.isPaused) return;
      await this._sendNext(userId);
    }, ms);

    console.log(`▶️  [AutomationService] Automação retomada para ${userId}`);

    this._emit(userId, 'automation:resumed', { userId });
    this._emitState(userId);
    return true;
  }

  // ─── Enviar agora ─────────────────────────────────────────────────────────

  async sendNow(userId) {
    const entry = this.automations.get(userId);
    if (!entry) throw new Error('Automação não encontrada');

    clearInterval(entry.intervalId);
    const ms = entry.state.intervalMinutes * 60 * 1000;
    entry.state.nextFireAt = Date.now() + ms;
    entry.intervalId = setInterval(async () => {
      const current = this.automations.get(userId);
      if (!current || current.state.isPaused) return;
      await this._sendNext(userId);
    }, ms);

    return await this._sendNext(userId);
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  getStatus(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return null;
    return this._getPublicState(entry.state);
  }

  isActive(userId) {
    return this.automations.has(userId);
  }

  // ─── Privado: envia o próximo produto ─────────────────────────────────────

  async _sendNext(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return;

    const { state } = entry;
    const { sessionId, grupoIds, products, currentIndex } = state;

    const product = products[currentIndex];
    if (!product) {
      console.warn(`⚠️  [AutomationService] Produto no índice ${currentIndex} não encontrado`);
      return;
    }

    // FIX: getSession precisa do userId para isolamento correto
    const session = this.whatsappService.getSession(userId, sessionId);
    if (!session || !session.isReady) {
      console.warn(`⚠️  [AutomationService] Sessão ${sessionId} não está pronta`);
      this._emit(userId, 'automation:error', {
        userId,
        error: `Sessão ${sessionId} não está conectada`,
      });
      return;
    }

    try {
      console.log(`📤 [AutomationService] Enviando "${product.nome || product.name}" para ${grupoIds.length} grupo(s)`);

      for (const grupoId of grupoIds) {
        await session.enviarOfertas(grupoId, [
          {
            nome:     product.nome || product.name,
            mensagem: product._mensagem,
            imagem:   product.imagem || product.image || null,
            link:     product.link_afiliado || product.affiliateLink || '',
          },
        ]);
      }

      state.currentIndex = (currentIndex + 1) % products.length;
      state.totalSent   += 1;
      state.nextFireAt   = Date.now() + state.intervalMinutes * 60 * 1000;

      const publicState = this._getPublicState(state);

      this._emit(userId, 'automation:product-sent', {
        userId,
        product:      { nome: product.nome || product.name, imagem: product.imagem || product.image },
        totalSent:    state.totalSent,
        currentIndex: state.currentIndex,
        nextFireAt:   state.nextFireAt,
      });

      console.log(`✅ [AutomationService] Enviado! Total: ${state.totalSent}`);

      return publicState;
    } catch (error) {
      console.error(`❌ [AutomationService] Erro ao enviar:`, error.message);
      this._emit(userId, 'automation:error', { userId, error: error.message });
    }
  }

  // ─── Privado: emite estado atual ──────────────────────────────────────────

  _emitState(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return;
    this._emit(userId, 'automation:state', { userId, ...this._getPublicState(entry.state) });
  }

  _getPublicState(state) {
    return {
      userId:          state.userId,
      sessionId:       state.sessionId,
      intervalMinutes: state.intervalMinutes,
      currentIndex:    state.currentIndex,
      totalSent:       state.totalSent,
      isPaused:        state.isPaused,
      nextFireAt:      state.nextFireAt,
      totalProducts:   state.products.length,
    };
  }
}

module.exports = AutomationService;