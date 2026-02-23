// back/services/WhatsAppMultiSessionService.js
// VERSÃO COM PERSISTÊNCIA TOTAL DAS CHAVES NO MONGODB
//
// Mudanças principais vs versão anterior:
//   1. useMultiFileAuthState → useDatabaseAuthState (chaves no MongoDB, não no disco)
//   2. restoreSessionsFromDatabase usa hasAuthState para verificar se pode reconectar
//   3. hardDelete também apaga as chaves do banco (deleteAuthState)
//   4. softDisconnect preserva as chaves no banco (reconexão automática possível)
//   5. Arquivos da pasta baileys_sessions/ não são mais necessários

const {
  default: makeWASocket,
  DisconnectReason,
  delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');

const { useDatabaseAuthState, deleteAuthState, hasAuthState } = require('./useDatabaseAuthState');

// ═══════════════════════════════════════════════════════════
// CLASSE: WhatsAppSession
// ═══════════════════════════════════════════════════════════
class WhatsAppSession {
  constructor(sessionId, io, sessionModel, authModels) {
    this.sessionId    = sessionId;
    this.io           = io;
    this.sessionModel = sessionModel;

    // authModels = { CredsModel, KeysModel }
    this.CredsModel = authModels.CredsModel;
    this.KeysModel  = authModels.KeysModel;

    this.sock               = null;
    this.isReady            = false;
    this.isConnecting       = false;
    this.reconnectAttempts  = 0;
    this.maxReconnectAttempts = 5;
    this.phoneNumber        = null;
    this.connectedAt        = null;

    // Controle de reconexão
    this._destroyed         = false;
  }

  // ─────────────────────────────────────────────────────────
  // PERSISTÊNCIA DE STATUS NO BANCO
  // ─────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────
  // BROADCAST: envia lista atualizada para TODOS os clientes
  // ─────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────
  // INICIALIZAR / CONECTAR
  // ─────────────────────────────────────────────────────────
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

      // ⭐ AUTH STATE DO MONGODB (não do disco)
      const { state, saveCreds } = await useDatabaseAuthState(
        this.sessionId,
        this.CredsModel,
        this.KeysModel
      );

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: [`AffiliateHub`, 'Chrome', '10.0.0'],
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: true
      });

      // ⭐ Salvar creds no MongoDB sempre que o Baileys atualizar
      this.sock.ev.on('creds.update', saveCreds);

      // ─────────────────────────────────────────────────────
      // EVENTOS DE CONEXÃO
      // ─────────────────────────────────────────────────────
      this.sock.ev.on('connection.update', async (update) => {
        if (this._destroyed) return;

        const { connection, lastDisconnect, qr } = update;

        // QR Code gerado — broadcast para todos os clientes
        if (qr) {
          console.log(`📱 QR Code gerado para sessão: ${this.sessionId}`);
          this.io.emit('whatsapp:qr', {
            sessionId: this.sessionId,
            qrCode: qr
          });
        }

        // ── CONECTADO ──────────────────────────────────────
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

        // ── DESCONECTADO ───────────────────────────────────
        if (connection === 'close') {
          this.isReady      = false;
          this.isConnecting = false;

          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const reason     = lastDisconnect?.error?.output?.payload?.message || 'Desconhecido';

          console.log(`⚠️ Sessão ${this.sessionId} fechada. Status: ${statusCode}, Razão: ${reason}`);

          await this.saveToDatabase({
            conectado:       false,
            status:          'offline',
            disconnectedAt:  new Date()
          });

          this.io.emit('whatsapp:disconnected', {
            sessionId: this.sessionId,
            reason
          });

          await this.broadcastSessionsUpdate();

          // Logout manual, sessão substituída ou sessão inválida → NÃO reconectar
          const dontReconnect = [
            DisconnectReason.loggedOut,
            DisconnectReason.badSession,
            DisconnectReason.connectionReplaced,
            440
          ];

          if (dontReconnect.includes(statusCode)) {
            console.log(`❌ Sessão ${this.sessionId} desconectada permanentemente (código ${statusCode}).`);
            // Limpar chaves do banco para forçar novo QR na próxima tentativa
            await deleteAuthState(this.sessionId, this.CredsModel, this.KeysModel);
            return;
          }

          // Queda de conexão normal → tentar reconectar
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

  // ─────────────────────────────────────────────────────────
  // DESCONECTAR SUAVE (preserva chaves → pode reconectar sem QR)
  // ─────────────────────────────────────────────────────────
  async softDisconnect() {
    console.log(`🔌 Desconectando sessão ${this.sessionId} (chaves preservadas no banco)`);
    this._destroyed = true;

    if (this.sock) {
      try {
        await this.sock.end();
      } catch (e) {
        // ignora
      }
      this.sock             = null;
      this.isReady          = false;
      this.isConnecting     = false;
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

  // ─────────────────────────────────────────────────────────
  // EXCLUIR PERMANENTEMENTE (remove chaves + registro do banco)
  // ─────────────────────────────────────────────────────────
  async hardDelete() {
    console.log(`🗑️ EXCLUINDO sessão ${this.sessionId} (chaves removidas do banco)`);
    this._destroyed = true;

    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (e) {
        // ignora
      }
      this.sock         = null;
      this.isReady      = false;
      this.isConnecting = false;
    }

    // Remover chaves criptográficas do banco
    await deleteAuthState(this.sessionId, this.CredsModel, this.KeysModel);

    // Remover registro de sessão do banco
    await this.sessionModel.deleteOne({ sessionId: this.sessionId });

    this.io.emit('whatsapp:disconnected', {
      sessionId: this.sessionId,
      reason: 'Sessão excluída pelo usuário'
    });

    await this.broadcastSessionsUpdate();
    console.log(`✅ Sessão ${this.sessionId} excluída permanentemente`);
  }

  // ─────────────────────────────────────────────────────────
  // LISTAR GRUPOS
  // ─────────────────────────────────────────────────────────
  async listarGrupos() {
    if (!this.isReady || !this.sock) {
      throw new Error('Sessão não está conectada');
    }

    try {
      const chats  = await this.sock.groupFetchAllParticipating();
      const grupos = Object.values(chats);
      return grupos.map(g => ({
        id:            g.id,
        nome:          g.subject,
        participantes: g.participants.length
      }));
    } catch (error) {
      console.error(`Erro ao listar grupos (sessão ${this.sessionId}):`, error.message);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────
  // BAIXAR IMAGEM
  // ─────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────
  // ENVIAR OFERTAS
  // ─────────────────────────────────────────────────────────
  async enviarOfertas(grupoId, ofertas) {
    if (!this.isReady || !this.sock) {
      throw new Error('Sessão não está conectada');
    }

    console.log(`\n📤 Enviando ${ofertas.length} oferta(s) — sessão: ${this.sessionId}`);

    for (const oferta of ofertas) {
      try {
        const mensagem = oferta.mensagem || 'Sem mensagem';
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

    return {
      success: true,
      mensagem: `${ofertas.length} oferta(s) enviada(s) com sucesso!`
    };
  }

  // ─────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════
// CLASSE: WhatsAppMultiSessionService
// ═══════════════════════════════════════════════════════════
class WhatsAppMultiSessionService {
  /**
   * @param {Server}  io           - Instância do Socket.IO
   * @param {Model}   sessionModel - Model WhatsAppSession
   * @param {Object}  authModels   - { CredsModel, KeysModel } de WhatsAppAuthKeys
   */
  constructor(io, sessionModel, authModels) {
    this.sessions     = new Map();
    this.io           = io;
    this.sessionModel = sessionModel;
    this.authModels   = authModels;

    this.restoreSessionsFromDatabase();
  }

  // ─────────────────────────────────────────────────────────
  // RESTAURAR SESSÕES DO BANCO AO INICIAR O SERVIDOR
  // ─────────────────────────────────────────────────────────
  async restoreSessionsFromDatabase() {
    try {
      console.log('\n🔄 Restaurando sessões do banco de dados...');

      const savedSessions = await this.sessionModel.find().lean();
      console.log(`📋 ${savedSessions.length} sessão(ões) encontrada(s) no banco`);

      for (const savedSession of savedSessions) {
        const { sessionId } = savedSession;

        // Verificar se existem chaves de autenticação no banco
        const hasKeys = await hasAuthState(sessionId, this.authModels.CredsModel);

        if (hasKeys) {
          console.log(`♻️ Reconectando automaticamente: ${sessionId} (chaves encontradas no banco)`);
          const session = this.createSession(sessionId);
          session.initialize().catch(err => {
            console.error(`❌ Erro ao reconectar ${sessionId}:`, err.message);
          });
        } else {
          console.log(`⚠️ Sessão ${sessionId} sem chaves no banco — precisará escanear QR`);
          this.createSession(sessionId);
        }
      }

      // Aguardar estabilização e então sincronizar status
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
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }
    const session = new WhatsAppSession(
      sessionId,
      this.io,
      this.sessionModel,
      this.authModels
    );
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  async getAllSessions() {
    try {
      const dbSessions = await this.sessionModel.getAllSessions();
      return dbSessions.map(s => s.toPublic());
    } catch (error) {
      console.error('Erro ao buscar sessões do banco:', error.message);
      return Array.from(this.sessions.values()).map(s => s.getStatus());
    }
  }

  // Desconectar (sem apagar chaves — pode reconectar sem QR)
  async disconnectSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.softDisconnect();
      // Não remove da memória — mantém para possível reconexão
    }
  }

  // Excluir permanentemente (apaga chaves e registro)
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