// back/services/WhatsAppMultiSessionService.js
const {
  default: makeWASocket,
  DisconnectReason,
  delay,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');

const { useDatabaseAuthState, deleteAuthState, hasAuthState } = require('./useDatabaseAuthState');

// ─────────────────────────────────────────────────────────────────────
// WhatsAppSession — representa UMA sessão de UM usuário
// ─────────────────────────────────────────────────────────────────────
class WhatsAppSession {
  constructor(userId, sessionId, io, sessionModel, authModels) {
    this.userId       = userId;   // ← isolamento por usuário
    this.sessionId    = sessionId;
    this.io           = io;
    this.sessionModel = sessionModel;
    this.CredsModel   = authModels.CredsModel;
    this.KeysModel    = authModels.KeysModel;

    this.sock                 = null;
    this.isReady              = false;
    this.isConnecting         = false;
    this.reconnectAttempts    = 0;
    this.maxReconnectAttempts = 5;
    this.phoneNumber          = null;
    this.connectedAt          = null;
    this._destroyed           = false;
  }

  // ── Salva estado no banco, sempre com userId ───────────────────────
  async saveToDatabase(updates = {}) {
    try {
      await this.sessionModel.findOneAndUpdate(
        { userId: this.userId, sessionId: this.sessionId },
        {
          userId:       this.userId,
          sessionId:    this.sessionId,
          phoneNumber:  this.phoneNumber,
          conectado:    this.isReady,
          status:       this.isReady ? 'online' : 'offline',
          connectedAt:  this.connectedAt,
          lastActivity: new Date(),
          ...updates
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`❌ Erro ao salvar sessão no banco:`, error.message);
    }
  }

  // ── Broadcast apenas para o socket do próprio usuário ─────────────
  async broadcastSessionsUpdate() {
    try {
      const allSessions  = await this.sessionModel.getAllSessions(this.userId);
      const sessionsData = allSessions.map(s => s.toPublic());

      // Emite em room específica do usuário (veja index.js)
      this.io.to(`user:${this.userId}`).emit('whatsapp:sessions-update', { sessions: sessionsData });
      this.io.to(`user:${this.userId}`).emit('sessions:list', { sessions: sessionsData });

      console.log(`📡 [${this.userId}] ${sessionsData.length} sessão(ões) sincronizada(s)`);
    } catch (error) {
      console.error(`❌ Erro ao fazer broadcast:`, error.message);
    }
  }

  async initialize() {
    if (this._destroyed)   return;
    if (this.isConnecting) { console.log(`⚠️ ${this.sessionId} já conectando...`); return; }
    if (this.isReady)      { console.log(`✅ ${this.sessionId} já conectado!`);    return; }

    this.isConnecting = true;
    await this.saveToDatabase({ status: 'connecting' });
    await this.broadcastSessionsUpdate();

    try {
      console.log(`\n🤖 Inicializando userId=${this.userId} session=${this.sessionId}`);

      // userId passado para isolar chaves por usuário
      const { state, saveCreds } = await useDatabaseAuthState(
        this.userId,
        this.sessionId,
        this.CredsModel,
        this.KeysModel
      );

      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`📱 WA Web versão: ${version.join('.')} | latest: ${isLatest}`);

      this.sock = makeWASocket({
        version,
        auth:                   state,
        printQRInTerminal:      false,
        logger:                 pino({ level: 'silent' }),
        browser:                ['Ubuntu', 'Chrome', '120.0.0'],
        defaultQueryTimeoutMs:  60000,
        connectTimeoutMs:       60000,
        keepAliveIntervalMs:    30000,
        markOnlineOnConnect:    true
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        if (this._destroyed) return;
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          // QR só vai para o usuário dono da sessão
          this.io.to(`user:${this.userId}`).emit('whatsapp:qr', {
            sessionId: this.sessionId,
            qrCode:    qr
          });
        }

        if (connection === 'open') {
          this.isReady           = true;
          this.isConnecting      = false;
          this.reconnectAttempts = 0;
          this.connectedAt       = new Date();

          try {
            const me = this.sock.user;
            this.phoneNumber = me?.id?.split(':')[0] || 'Desconhecido';
          } catch (e) {
            this.phoneNumber = 'Desconhecido';
          }

          await this.saveToDatabase({ conectado: true, status: 'online' });

          this.io.to(`user:${this.userId}`).emit('whatsapp:connected', {
            sessionId:   this.sessionId,
            phoneNumber: this.phoneNumber,
            connectedAt: this.connectedAt
          });

          await this.broadcastSessionsUpdate();
        }

        if (connection === 'close') {
          this.isReady      = false;
          this.isConnecting = false;

          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const reason     = lastDisconnect?.error?.output?.payload?.message || 'Desconhecido';

          await this.saveToDatabase({ conectado: false, status: 'offline', disconnectedAt: new Date() });

          this.io.to(`user:${this.userId}`).emit('whatsapp:disconnected', { sessionId: this.sessionId, reason });
          await this.broadcastSessionsUpdate();

          const dontReconnect = [
            DisconnectReason.loggedOut,
            DisconnectReason.badSession,
            DisconnectReason.connectionReplaced,
            440
          ];

          if (dontReconnect.includes(statusCode)) {
            await deleteAuthState(this.userId, this.sessionId, this.CredsModel, this.KeysModel);
            return;
          }

          if (!this._destroyed && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delayMs = this.reconnectAttempts * 5000;
            await delay(delayMs);
            await this.initialize();
          }
        }
      });

    } catch (error) {
      console.error(`❌ Erro ao inicializar sessão ${this.sessionId}:`, error.message);
      this.isConnecting = false;
      await this.saveToDatabase({ status: 'offline', conectado: false });
      await this.broadcastSessionsUpdate();
      throw error;
    }
  }

  async softDisconnect() {
    this._destroyed = true;
    if (this.sock) {
      try { await this.sock.end(); } catch (e) {}
      this.sock         = null;
      this.isReady      = false;
      this.isConnecting = false;
    }
    await this.saveToDatabase({ conectado: false, status: 'offline', disconnectedAt: new Date() });
    this.io.to(`user:${this.userId}`).emit('whatsapp:disconnected', {
      sessionId: this.sessionId,
      reason:    'Desconectado pelo usuário'
    });
    await this.broadcastSessionsUpdate();
  }

  async hardDelete() {
    this._destroyed = true;
    if (this.sock) {
      try { await this.sock.logout(); } catch (e) {}
      this.sock         = null;
      this.isReady      = false;
      this.isConnecting = false;
    }
    await deleteAuthState(this.userId, this.sessionId, this.CredsModel, this.KeysModel);
    await this.sessionModel.deleteOne({ userId: this.userId, sessionId: this.sessionId });
    this.io.to(`user:${this.userId}`).emit('whatsapp:disconnected', {
      sessionId: this.sessionId,
      reason:    'Sessão excluída pelo usuário'
    });
    await this.broadcastSessionsUpdate();
  }

  async listarGrupos() {
    if (!this.isReady || !this.sock) throw new Error('Sessão não está conectada');
    const chats = await this.sock.groupFetchAllParticipating();
    return Object.values(chats).map(g => ({
      id:            g.id,
      nome:          g.subject,
      participantes: g.participants.length
    }));
  }

  async baixarImagem(url) {
    try {
      const response = await axios({
        method:       'GET',
        url,
        responseType: 'arraybuffer',
        timeout:      30000,
        headers:      { 'User-Agent': 'Mozilla/5.0' }
      });
      return Buffer.from(response.data, 'binary');
    } catch (error) {
      console.error(`❌ Erro ao baixar imagem:`, error.message);
      return null;
    }
  }

  async enviarOfertas(grupoId, ofertas) {
    if (!this.isReady || !this.sock) throw new Error('Sessão não está conectada');

    for (const oferta of ofertas) {
      try {
        const mensagem  = oferta.mensagem || 'Sem mensagem';
        const imagemUrl = oferta.imagem || oferta.image || oferta.foto;

        if (imagemUrl) {
          const buffer = await this.baixarImagem(imagemUrl);
          if (buffer) {
            await this.sock.sendMessage(grupoId, { image: buffer, caption: mensagem });
          } else {
            await this.sock.sendMessage(grupoId, { text: mensagem });
          }
        } else {
          await this.sock.sendMessage(grupoId, { text: mensagem });
        }

        if (ofertas.length > 1) await delay(2000);

        this.io.to(`user:${this.userId}`).emit('whatsapp:offer-sent', {
          sessionId: this.sessionId,
          groupId:   grupoId,
          offerName: oferta.nome || 'Oferta'
        });
      } catch (error) {
        console.error(`❌ Erro ao enviar oferta:`, error.message);
      }
    }

    await this.saveToDatabase({ lastActivity: new Date() });
    return { success: true, mensagem: `${ofertas.length} oferta(s) enviada(s)!` };
  }

  getStatus() {
    return {
      sessionId:   this.sessionId,
      conectado:   this.isReady,
      status:      this.isReady ? 'online' : 'offline',
      clientReady: this.sock !== null,
      phoneNumber: this.phoneNumber,
      connectedAt: this.connectedAt
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// WhatsAppMultiSessionService — gerencia sessões de TODOS os usuários
// Chave do Map: `${userId}::${sessionId}` para garantir isolamento
// ─────────────────────────────────────────────────────────────────────
class WhatsAppMultiSessionService {
  constructor(io, sessionModel, authModels) {
    this.sessions     = new Map();   // key: `${userId}::${sessionId}`
    this.io           = io;
    this.sessionModel = sessionModel;
    this.authModels   = authModels;
    this.restoreSessionsFromDatabase();
  }

  _key(userId, sessionId) {
    return `${userId}::${sessionId}`;
  }

  async restoreSessionsFromDatabase() {
    try {
      console.log('\n🔄 Restaurando sessões do banco de dados...');
      // Busca todas as sessões de todos os usuários
      const savedSessions = await this.sessionModel.find().lean();
      console.log(`📋 ${savedSessions.length} sessão(ões) encontrada(s) no banco`);

      for (const savedSession of savedSessions) {
        const { userId, sessionId } = savedSession;
        if (!userId) {
          console.warn(`⚠️ Sessão sem userId encontrada (${sessionId}) — pulando`);
          continue;
        }

        const hasKeys = await hasAuthState(userId, sessionId, this.authModels.CredsModel);

        if (hasKeys) {
          console.log(`♻️ Reconectando userId=${userId} session=${sessionId}`);
          const session = this.createSession(userId, sessionId);
          session.initialize().catch(err => {
            console.error(`❌ Erro ao reconectar ${sessionId}:`, err.message);
          });
        } else {
          console.log(`⚠️ Sem chaves para userId=${userId} session=${sessionId} — aguardando QR`);
          this.createSession(userId, sessionId);
        }
      }

      setTimeout(() => this._broadcastAll(), 3000);
      console.log('✅ Restauração concluída\n');
    } catch (error) {
      console.error('❌ Erro ao restaurar sessões:', error.message);
    }
  }

  // Broadcast separado por usuário ao restaurar
  async _broadcastAll() {
    try {
      const allSessions = await this.sessionModel.find().lean();
      // Agrupa por userId e emite por room
      const byUser = {};
      for (const s of allSessions) {
        if (!s.userId) continue;
        if (!byUser[s.userId]) byUser[s.userId] = [];
        byUser[s.userId].push(s);
      }
      for (const [userId, sessions] of Object.entries(byUser)) {
        this.io.to(`user:${userId}`).emit('sessions:list', { sessions });
      }
    } catch (e) {
      console.error('❌ Erro no broadcast inicial:', e.message);
    }
  }

  createSession(userId, sessionId) {
    const key = this._key(userId, sessionId);
    if (this.sessions.has(key)) return this.sessions.get(key);

    const session = new WhatsAppSession(
      userId, sessionId, this.io, this.sessionModel, this.authModels
    );
    this.sessions.set(key, session);
    return session;
  }

  getSession(userId, sessionId) {
    return this.sessions.get(this._key(userId, sessionId));
  }

  async getAllSessions(userId) {
    try {
      const dbSessions = await this.sessionModel.getAllSessions(userId);
      return dbSessions.map(s => s.toPublic());
    } catch (error) {
      console.error('Erro ao buscar sessões do banco:', error.message);
      // Fallback: filtra o Map por userId
      return Array.from(this.sessions.entries())
        .filter(([key]) => key.startsWith(`${userId}::`))
        .map(([, s])    => s.getStatus());
    }
  }

  async disconnectSession(userId, sessionId) {
    const session = this.sessions.get(this._key(userId, sessionId));
    if (session) await session.softDisconnect();
  }

  async deleteSession(userId, sessionId) {
    const key     = this._key(userId, sessionId);
    const session = this.sessions.get(key);
    if (session) {
      await session.hardDelete();
      this.sessions.delete(key);
    }
  }

  hasActiveSession(userId) {
    for (const [key, session] of this.sessions.entries()) {
      if (key.startsWith(`${userId}::`) && session.isReady) return true;
    }
    return false;
  }

  async getActiveSessions(userId) {
    try {
      const active = await this.sessionModel.getActiveSessions(userId);
      return active.map(s => s.toPublic());
    } catch (error) {
      console.error('Erro ao buscar sessões ativas:', error.message);
      return [];
    }
  }
}

module.exports = WhatsAppMultiSessionService;