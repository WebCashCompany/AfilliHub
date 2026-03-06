// back/services/AutomationService.js
const cron = require('node-cron');

/**
 * AutomationService
 * ─────────────────────────────────────────────────────────────────────────────
 * Gerencia jobs de automação no SERVIDOR.
 * O envio acontece aqui, independente do browser estar aberto ou não.
 *
 * Dependências: npm install node-cron
 */
class AutomationService {
  constructor(whatsappService, io) {
    this.whatsappService = whatsappService;
    this.io = io;

    // Map de automações ativas: userId → { job, config, state }
    this.automations = new Map();
  }

  // ─── Iniciar automação ────────────────────────────────────────────────────

  start({ userId, sessionId, grupoIds, products, intervalMinutes, currentIndex = 0, totalSent = 0 }) {
    // Para qualquer automação anterior desse usuário
    this.stop(userId);

    if (!products || products.length === 0) {
      throw new Error('Nenhum produto para automatizar');
    }

    const state = {
      userId,
      sessionId,
      grupoIds,           // array de IDs de grupos
      products,           // array de produtos elegíveis
      intervalMinutes,
      currentIndex,       // próximo produto a enviar
      totalSent,
      isPaused: false,
      startedAt: Date.now(),
      nextFireAt: Date.now() + intervalMinutes * 60 * 1000,
    };

    // node-cron não suporta intervalos dinâmicos em minutos fracionados,
    // então usamos setInterval para máxima flexibilidade.
    const ms = intervalMinutes * 60 * 1000;

    const intervalId = setInterval(async () => {
      const current = this.automations.get(userId);
      if (!current || current.state.isPaused) return;

      await this._sendNext(userId);
    }, ms);

    this.automations.set(userId, { intervalId, state });

    console.log(`🤖 [AutomationService] Automação iniciada para ${userId} — a cada ${intervalMinutes}min`);

    // Emite estado inicial para o cliente
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

    this.io.emit('automation:cancelled', { userId });
    return true;
  }

  // ─── Pausar / Retomar ─────────────────────────────────────────────────────

  pause(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return false;

    entry.state.isPaused = true;
    console.log(`⏸️  [AutomationService] Automação pausada para ${userId}`);

    this.io.emit('automation:paused', { userId });
    this._emitState(userId);
    return true;
  }

  resume(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return false;

    entry.state.isPaused = false;
    // Recalcula o próximo disparo a partir de agora
    entry.state.nextFireAt = Date.now() + entry.state.intervalMinutes * 60 * 1000;

    // Reinicia o interval para evitar disparo imediato
    clearInterval(entry.intervalId);
    const ms = entry.state.intervalMinutes * 60 * 1000;
    entry.intervalId = setInterval(async () => {
      const current = this.automations.get(userId);
      if (!current || current.state.isPaused) return;
      await this._sendNext(userId);
    }, ms);

    console.log(`▶️  [AutomationService] Automação retomada para ${userId}`);

    this.io.emit('automation:resumed', { userId });
    this._emitState(userId);
    return true;
  }

  // ─── Enviar agora (avança imediatamente) ──────────────────────────────────

  async sendNow(userId) {
    const entry = this.automations.get(userId);
    if (!entry) throw new Error('Automação não encontrada');

    // Reinicia o timer do interval
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

  // ─── Privado: envia o próximo produto ────────────────────────────────────

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

    const session = this.whatsappService.getSession(sessionId);
    if (!session || !session.isReady) {
      console.warn(`⚠️  [AutomationService] Sessão ${sessionId} não está pronta`);
      this.io.emit('automation:error', {
        userId,
        error: `Sessão ${sessionId} não está conectada`,
      });
      return;
    }

    try {
      console.log(`📤 [AutomationService] Enviando produto "${product.nome || product.name}" para ${grupoIds.length} grupo(s)`);

      for (const grupoId of grupoIds) {
        await session.enviarOfertas(grupoId, [
          {
            nome: product.nome || product.name,
            mensagem: product._mensagem, // mensagem pré-formatada salva no start
            imagem: product.imagem || product.image || null,
            link: product.link_afiliado || product.affiliateLink || '',
          },
        ]);
      }

      // Avança o índice de forma circular
      state.currentIndex = (currentIndex + 1) % products.length;
      state.totalSent += 1;
      state.nextFireAt = Date.now() + state.intervalMinutes * 60 * 1000;

      const publicState = this._getPublicState(state);

      // Notifica TODOS os clientes conectados (browser aberto ou não, ao reconectar receberá o estado)
      this.io.emit('automation:product-sent', {
        userId,
        product: { nome: product.nome || product.name, imagem: product.imagem || product.image },
        totalSent: state.totalSent,
        currentIndex: state.currentIndex,
        nextFireAt: state.nextFireAt,
      });

      console.log(`✅ [AutomationService] Enviado! Total: ${state.totalSent}`);

      return publicState;
    } catch (error) {
      console.error(`❌ [AutomationService] Erro ao enviar:`, error.message);
      this.io.emit('automation:error', { userId, error: error.message });
    }
  }

  // ─── Privado: emite estado atual ──────────────────────────────────────────

  _emitState(userId) {
    const entry = this.automations.get(userId);
    if (!entry) return;
    this.io.emit('automation:state', { userId, ...this._getPublicState(entry.state) });
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
    };
  }
}

module.exports = AutomationService;