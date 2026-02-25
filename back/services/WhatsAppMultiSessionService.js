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

class WhatsAppSession {
  constructor(sessionId, io, sessionModel, authModels) {
    this.sessionId    = sessionId;
    this.io           = io;
    this.sessionModel = sessionModel;
    this.CredsModel   = authModels.CredsModel;
    this.KeysModel    = authModels.KeysModel;
    this.sock               = null;
    this.isReady            = false;
    this.isConnecting       = false;
    this.reconnectAttempts  = 0;
    this.maxReconnectAttempts = 5;
    this.phoneNumber        = null;
    this.connectedAt        = null;
    this._destroyed         = false;
  }

  async saveToDatabase(updates = {}) {
    try {
      const data = {
        sessionId:    this.sessionId,
        phoneNumber:  this.phoneNumber,
        conectado:    this.isReady,
        status:       this.isReady ? 'online' : 'offline',
        connectedAt:  this.connectedAt,
        lastActivity: new Date(),
        ...updates
      };
      await this.sessionModel.findOneAndUpdate(
        { sessionId: this.sessionId },
        data,
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`❌ Erro ao salvar sessão no banco:`, error.message);
    }
  }

  async broadcastSessionsUpdate() {
    try {
      const allSessions = await this.sessionModel.getAllSessions();
      const sessionsData = allSessions.map(s => s.toPublic());
      this.io.emit('whatsapp:sessions-update', { sessions: sessionsData });
      console.log(`📡 [BROADCAST] ${sessionsData.length} sessão(ões) sincronizada(s)`);
    } catch (error) {
      console.error(`❌ Erro ao fazer broadcast:`, error.message);
    }
  }

  async initialize() {
    if (this._destroyed) return;
    if (this.isConnecting) {
      console.log(`⚠️ Sessão ${this.sessionId} já está conectando...`);
      return;
    }
    if (this.isReady) {
      console.log(`✅ Sessão ${this.sessionId} já está conectada!`);
      return;
    }

    this.isConnecting = true;
    await this.saveToDatabase({ status: 'connecting' });
    await this.broadcastSessionsUpdate();

    try {
      console.log(`\n🤖 Inicializando sessão: ${this.sessionId}`);

      const { state, saveCreds } = await useDatabaseAuthState(
        this.sessionId,
        this.CredsModel,
        this.KeysModel
      );

      // ✅ FIX: buscar versão atual do WA Web — evita erro 405
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`📱 WA Web versão: ${version.join('.')} | latest: ${isLatest}`);

      this.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '120.0.0'], // ✅ browser válido
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs:      60000,
        keepAliveIntervalMs:   30000,
        markOnlineOnConnect:   true
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        if (this._destroyed) return;

        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log(`📱 QR Code gerado para sessão: ${this.sessionId}`);
          this.io.emit('whatsapp:qr', {
            sessionId: this.sessionId,
            qrCode: qr
          });
        }

        if (connection === 'open') {
          console.log(`✅ Sessão ${this.sessionId} conectada!`);
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

          await this.saveToDatabase({
            conectado:   true,
            status:      'online',
            connectedAt: this.connectedAt,
            phoneNumber: this.phoneNumber
          });

          this.io.emit('whatsapp:connected', {
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

          console.log(`⚠️ Sessão ${this.sessionId} fechada. Status: ${statusCode}, Razão: ${reason}`);

          await this.saveToDatabase({
            conectado:      false,
            status:         'offline',
            disconnectedAt: new Date()
          });

          this.io.emit('whatsapp:disconnected', {
            sessionId: this.sessionId,
            reason
          });

          await this.broadcastSessionsUpdate();

          const dontReconnect = [
            DisconnectReason.loggedOut,
            DisconnectReason.badSession,
            DisconnectReason.connectionReplaced,
            440
          ];

          if (dontReconnect.includes(statusCode)) {
            console.log(`❌ Sessão ${this.sessionId} desconectada permanentemente (código ${statusCode}).`);
            await deleteAuthState(this.sessionId, this.CredsModel, this.KeysModel);
            return;
          }

          if (!this._destroyed && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delayMs = this.reconnectAttempts * 5000;
            console.log(`🔄 Reconectando ${this.sessionId} (${this.reconnectAttempts}/${this.maxReconnectAttempts}) em ${delayMs / 1000}s...`);
            await delay(delayMs);
            await this.initialize();
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`❌ Sessão ${this.sessionId}: máximo de tentativas atingido. Ficará offline.`);
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
    console.log(`🔌 Desconectando sessão ${this.sessionId} (chaves preservadas no banco)`);
    this._destroyed = true;

    if (this.sock) {
      try { await this.sock.end(); } catch (e) {}
      this.sock              = null;
      this.isReady           = false;
      this.isConnecting      = false;
      this.reconnectAttempts = 0;
    }

    await this.saveToDatabase({
      conectado:      false,
      status:         'offline',
      disconnectedAt: new Date()
    });

    this.io.emit('whatsapp:disconnected', {
      sessionId: this.sessionId,
      reason: 'Desconectado pelo usuário'
    });

    await this.broadcastSessionsUpdate();
    console.log(`✅ Sessão ${this.sessionId} desconectada (pode ser reconectada sem QR)`);
  }

  async hardDelete() {
    console.log(`🗑️ EXCLUINDO sessão ${this.sessionId} (chaves removidas do banco)`);
    this._destroyed = true;

    if (this.sock) {
      try { await this.sock.logout(); } catch (e) {}
      this.sock         = null;
      this.isReady      = false;
      this.isConnecting = false;
    }

    await deleteAuthState(this.sessionId, this.CredsModel, this.KeysModel);
    await this.sessionModel.deleteOne({ sessionId: this.sessionId });

    this.io.emit('whatsapp:disconnected', {
      sessionId: this.sessionId,
      reason: 'Sessão excluída pelo usuário'
    });

    await this.broadcastSessionsUpdate();
    console.log(`✅ Sessão ${this.sessionId} excluída permanentemente`);
  }

  async listarGrupos() {
    if (!this.isReady || !this.sock) throw new Error('Sessão não está conectada');
    try {
      const chats  = await this.sock.groupFetchAllParticipating();
      return Object.values(chats).map(g => ({
        id:            g.id,
        nome:          g.subject,
        participantes: g.participants.length
      }));
    } catch (error) {
      console.error(`Erro ao listar grupos (sessão ${this.sessionId}):`, error.message);
      throw error;
    }
  }

  async baixarImagem(url) {
    try {
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      return Buffer.from(response.data, 'binary');
    } catch (error) {
      console.error(`❌ Erro ao baixar imagem:`, error.message);
      return null;
    }
  }

  async enviarOfertas(grupoId, ofertas) {
    if (!this.isReady || !this.sock) throw new Error('Sessão não está conectada');

    console.log(`\n📤 Enviando ${ofertas.length} oferta(s) — sessão: ${this.sessionId}`);

    for (const oferta of ofertas) {
      try {
        const mensagem  = oferta.mensagem || 'Sem mensagem';
        const imagemUrl = oferta.imagem || oferta.image || oferta.foto;

        if (imagemUrl) {
          const buffer = await this.baixarImagem(imagemUrl);
          if (buffer) {
            await this.sock.sendMessage(grupoId, { image: buffer, caption: mensagem });
            console.log(`✅ Oferta enviada COM IMAGEM`);
          } else {
            await this.sock.sendMessage(grupoId, { text: mensagem });
            console.log(`⚠️ Oferta enviada SEM IMAGEM (erro no download)`);
          }
        } else {
          await this.sock.sendMessage(grupoId, { text: mensagem });
          console.log(`✅ Oferta enviada (sem imagem)`);
        }

        if (ofertas.length > 1) await delay(2000);

        this.io.emit('whatsapp:offer-sent', {
          sessionId: this.sessionId,
          groupId:   grupoId,
          offerName: oferta.nome || 'Oferta'
        });
      } catch (error) {
        console.error(`❌ Erro ao enviar oferta:`, error.message);
      }
    }

    await this.saveToDatabase({ lastActivity: new Date() });
    return { success: true, mensagem: `${ofertas.length} oferta(s) enviada(s) com sucesso!` };
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

class WhatsAppMultiSessionService {
  constructor(io, sessionModel, authModels) {
    this.sessions     = new Map();
    this.io           = io;
    this.sessionModel = sessionModel;
    this.authModels   = authModels;
    this.restoreSessionsFromDatabase();
  }

  async restoreSessionsFromDatabase() {
    try {
      console.log('\n🔄 Restaurando sessões do banco de dados...');
      const savedSessions = await this.sessionModel.find().lean();
      console.log(`📋 ${savedSessions.length} sessão(ões) encontrada(s) no banco`);

      for (const savedSession of savedSessions) {
        const { sessionId } = savedSession;
        const hasKeys = await hasAuthState(sessionId, this.authModels.CredsModel);

        if (hasKeys) {
          console.log(`♻️ Reconectando automaticamente: ${sessionId}`);
          const session = this.createSession(sessionId);
          session.initialize().catch(err => {
            console.error(`❌ Erro ao reconectar ${sessionId}:`, err.message);
          });
        } else {
          console.log(`⚠️ Sessão ${sessionId} sem chaves no banco — precisará escanear QR`);
          this.createSession(sessionId);
        }
      }

      setTimeout(() => this.broadcastSessionsUpdate(), 3000);
      console.log('✅ Restauração de sessões concluída\n');
    } catch (error) {
      console.error('❌ Erro ao restaurar sessões:', error.message);
    }
  }

  async broadcastSessionsUpdate() {
    try {
      const allSessions  = await this.sessionModel.getAllSessions();
      const sessionsData = allSessions.map(s => s.toPublic());
      this.io.emit('whatsapp:sessions-update', { sessions: sessionsData });
      console.log(`📡 [BROADCAST] ${sessionsData.length} sessão(ões) sincronizada(s)`);
    } catch (error) {
      console.error(`❌ Erro ao fazer broadcast:`, error.message);
    }
  }

  createSession(sessionId) {
    if (this.sessions.has(sessionId)) return this.sessions.get(sessionId);
    const session = new WhatsAppSession(sessionId, this.io, this.sessionModel, this.authModels);
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) { return this.sessions.get(sessionId); }

  async getAllSessions() {
    try {
      const dbSessions = await this.sessionModel.getAllSessions();
      return dbSessions.map(s => s.toPublic());
    } catch (error) {
      console.error('Erro ao buscar sessões do banco:', error.message);
      return Array.from(this.sessions.values()).map(s => s.getStatus());
    }
  }

  async disconnectSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) await session.softDisconnect();
  }

  async deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.hardDelete();
      this.sessions.delete(sessionId);
    }
  }

  hasActiveSession() {
    for (const session of this.sessions.values()) {
      if (session.isReady) return true;
    }
    return false;
  }

  async getActiveSessions() {
    try {
      const active = await this.sessionModel.getActiveSessions();
      return active.map(s => s.toPublic());
    } catch (error) {
      console.error('Erro ao buscar sessões ativas:', error.message);
      return [];
    }
  }
}

module.exports = WhatsAppMultiSessionService;