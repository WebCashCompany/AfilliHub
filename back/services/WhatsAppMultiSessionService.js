// back/services/WhatsAppMultiSessionService.js - VERSÃO CORRIGIDA COM PERSISTÊNCIA TOTAL
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class WhatsAppSession {
    constructor(sessionId, io, sessionModel) {
        this.sessionId = sessionId;
        this.io = io;
        this.sessionModel = sessionModel;
        this.sock = null;
        this.isReady = false;
        this.authFolder = path.join(__dirname, '..', 'baileys_sessions', sessionId);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5; // Aumentado de 3 para 5
        this.phoneNumber = null;
        this.connectedAt = null;
    }

    async saveToDatabase(updates = {}) {
        try {
            const data = {
                sessionId: this.sessionId,
                phoneNumber: this.phoneNumber,
                conectado: this.isReady,
                status: this.isReady ? 'online' : 'offline',
                connectedAt: this.connectedAt,
                lastActivity: new Date(),
                ...updates
            };

            await this.sessionModel.findOneAndUpdate(
                { sessionId: this.sessionId },
                data,
                { upsert: true, new: true }
            );

            console.log(`💾 Sessão ${this.sessionId} salva no banco`);
        } catch (error) {
            console.error(`❌ Erro ao salvar sessão no banco:`, error);
        }
    }

    async broadcastSessionsUpdate() {
        try {
            const allSessions = await this.sessionModel.getAllSessions();
            const sessionsData = allSessions.map(s => s.toPublic());

            this.io.emit('whatsapp:sessions-update', {
                sessions: sessionsData
            });

            console.log(`📡 [BROADCAST] Atualização de sessões enviada`);
        } catch (error) {
            console.error(`❌ Erro ao fazer broadcast:`, error);
        }
    }

    async initialize() {
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

            // 🔥 GARANTIR que a pasta existe
            if (!fs.existsSync(this.authFolder)) {
                fs.mkdirSync(this.authFolder, { recursive: true });
                console.log(`📁 Pasta criada: ${this.authFolder}`);
            }

            const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: [`AffiliateHub ${this.sessionId}`, 'Chrome', '10.0.0'],
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: true
            });

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('connection.update', async (update) => {
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
                    
                    this.isReady = true;
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    this.connectedAt = new Date();

                    try {
                        const me = this.sock.user;
                        this.phoneNumber = me?.id?.split(':')[0] || 'Desconhecido';
                    } catch (e) {
                        this.phoneNumber = 'Desconhecido';
                    }

                    await this.saveToDatabase({
                        conectado: true,
                        status: 'online',
                        connectedAt: this.connectedAt,
                        phoneNumber: this.phoneNumber
                    });

                    this.io.emit('whatsapp:connected', {
                        sessionId: this.sessionId,
                        phoneNumber: this.phoneNumber,
                        connectedAt: this.connectedAt
                    });

                    await this.broadcastSessionsUpdate();
                }

                if (connection === 'close') {
                    this.isReady = false;
                    this.isConnecting = false;

                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.output?.payload?.message || 'Desconhecido';

                    console.log(`⚠️ Sessão ${this.sessionId} fechada. Status: ${statusCode}`);

                    await this.saveToDatabase({
                        conectado: false,
                        status: 'offline',
                        disconnectedAt: new Date()
                    });

                    this.io.emit('whatsapp:disconnected', {
                        sessionId: this.sessionId,
                        reason: reason
                    });

                    await this.broadcastSessionsUpdate();

                    // 🔥 LOGOUT MANUAL OU SESSÃO SUBSTITUÍDA = NÃO RECONECTAR
                    const dontReconnect = [
                        DisconnectReason.loggedOut,
                        DisconnectReason.badSession,
                        DisconnectReason.connectionReplaced,
                        440
                    ];

                    if (dontReconnect.includes(statusCode)) {
                        console.log(`❌ Sessão ${this.sessionId} desconectada permanentemente.`);
                        // 🔥 NÃO DELETAR ARQUIVOS - apenas marcar como offline
                        return;
                    }

                    // 🔥 TENTAR RECONECTAR (sem deletar arquivos)
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delayMs = this.reconnectAttempts * 5000;
                        
                        console.log(`🔄 Reconectando sessão ${this.sessionId} (${this.reconnectAttempts}/${this.maxReconnectAttempts}) em ${delayMs/1000}s...`);
                        
                        await delay(delayMs);
                        await this.initialize();
                    } else {
                        console.error(`❌ Sessão ${this.sessionId}: Máximo de tentativas atingido.`);
                        console.log(`💡 Sessão ficará offline, mas pode ser reconectada manualmente.`);
                    }
                }
            });

        } catch (error) {
            console.error(`❌ Erro ao inicializar sessão ${this.sessionId}:`, error);
            this.isConnecting = false;
            
            await this.saveToDatabase({ status: 'offline', conectado: false });
            await this.broadcastSessionsUpdate();
            
            throw error;
        }
    }

    async listarGrupos() {
        if (!this.isReady || !this.sock) {
            throw new Error('Sessão não está conectada');
        }

        try {
            const chats = await this.sock.groupFetchAllParticipating();
            const grupos = Object.values(chats);

            return grupos.map(grupo => ({
                id: grupo.id,
                nome: grupo.subject,
                participantes: grupo.participants.length
            }));
        } catch (error) {
            console.error(`Erro ao listar grupos (sessão ${this.sessionId}):`, error);
            throw error;
        }
    }

    async baixarImagem(url) {
        try {
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            return Buffer.from(response.data, 'binary');
        } catch (error) {
            console.error(`❌ Erro ao baixar imagem (sessão ${this.sessionId}):`, error.message);
            return null;
        }
    }

    async enviarOfertas(grupoId, ofertas) {
        if (!this.isReady || !this.sock) {
            throw new Error('Sessão não está conectada');
        }

        try {
            console.log(`\n📤 Enviando ${ofertas.length} ofertas para grupo (sessão ${this.sessionId})`);

            for (const oferta of ofertas) {
                try {
                    const mensagem = oferta.mensagem || `Erro: Mensagem não encontrada`;

                    if (oferta.imagem || oferta.image || oferta.foto) {
                        const imagemUrl = oferta.imagem || oferta.image || oferta.foto;
                        const imagemBuffer = await this.baixarImagem(imagemUrl);

                        if (imagemBuffer) {
                            await this.sock.sendMessage(grupoId, {
                                image: imagemBuffer,
                                caption: mensagem
                            });
                            console.log(`✅ Oferta enviada COM IMAGEM`);
                        } else {
                            await this.sock.sendMessage(grupoId, { text: mensagem });
                            console.log(`⚠️ Oferta enviada SEM IMAGEM (erro ao baixar)`);
                        }
                    } else {
                        await this.sock.sendMessage(grupoId, { text: mensagem });
                        console.log(`✅ Oferta enviada (sem imagem)`);
                    }

                    if (ofertas.length > 1) {
                        await delay(2000);
                    }

                    this.io.emit('whatsapp:offer-sent', {
                        sessionId: this.sessionId,
                        groupId: grupoId,
                        offerName: oferta.nome || 'Oferta'
                    });

                } catch (error) {
                    console.error(`❌ Erro ao enviar oferta (sessão ${this.sessionId}):`, error.message);
                }
            }

            await this.saveToDatabase({ lastActivity: new Date() });

            return {
                success: true,
                mensagem: `${ofertas.length} oferta(s) enviada(s) com sucesso!`
            };

        } catch (error) {
            console.error(`❌ Erro ao enviar ofertas (sessão ${this.sessionId}):`, error);
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 🔥 DESCONECTAR (SEM DELETAR ARQUIVOS)
    // ═══════════════════════════════════════════════════════════
    async softDisconnect() {
        console.log(`🔌 Desconectando sessão ${this.sessionId} (arquivos preservados)`);
        
        if (this.sock) {
            try {
                // Apenas fechar conexão, NÃO fazer logout
                await this.sock.end();
            } catch (error) {
                console.log(`Erro ao fechar conexão (sessão ${this.sessionId}):`, error.message);
            }
            
            this.sock = null;
            this.isReady = false;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            
            // 🔥 MANTER ARQUIVOS DO BAILEYS INTACTOS
            // 🔥 Apenas atualizar status no banco
            await this.saveToDatabase({
                conectado: false,
                status: 'offline',
                disconnectedAt: new Date()
            });
            
            console.log(`✅ Sessão ${this.sessionId} desconectada (pode ser reconectada)`);

            this.io.emit('whatsapp:disconnected', {
                sessionId: this.sessionId,
                reason: 'Desconectado pelo usuário'
            });
            
            await this.broadcastSessionsUpdate();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 🔥 EXCLUIR PERMANENTEMENTE (DELETAR TUDO)
    // ═══════════════════════════════════════════════════════════
    async hardDelete() {
        console.log(`🗑️ EXCLUINDO PERMANENTEMENTE sessão ${this.sessionId}`);
        
        if (this.sock) {
            try {
                // Fazer logout completo
                await this.sock.logout();
            } catch (error) {
                console.log(`Erro ao fazer logout (sessão ${this.sessionId}):`, error.message);
            }
            
            this.sock = null;
            this.isReady = false;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
        }
        
        // 🔥 DELETAR PASTA DE AUTENTICAÇÃO
        if (fs.existsSync(this.authFolder)) {
            fs.rmSync(this.authFolder, { recursive: true, force: true });
            console.log(`📁 Pasta de autenticação deletada: ${this.authFolder}`);
        }

        // 🔥 REMOVER DO BANCO
        await this.sessionModel.deleteOne({ sessionId: this.sessionId });
        
        console.log(`✅ Sessão ${this.sessionId} EXCLUÍDA PERMANENTEMENTE`);

        this.io.emit('whatsapp:disconnected', {
            sessionId: this.sessionId,
            reason: 'Sessão excluída pelo usuário'
        });
        
        await this.broadcastSessionsUpdate();
    }

    getStatus() {
        return {
            sessionId: this.sessionId,
            conectado: this.isReady,
            status: this.isReady ? 'online' : 'offline',
            clientReady: this.sock !== null,
            phoneNumber: this.phoneNumber,
            connectedAt: this.connectedAt
        };
    }
}

class WhatsAppMultiSessionService {
    constructor(io, sessionModel) {
        this.sessions = new Map();
        this.io = io;
        this.sessionModel = sessionModel;
        
        this.restoreSessionsFromDatabase();
    }

    async restoreSessionsFromDatabase() {
        try {
            console.log('\n🔄 Restaurando sessões do banco de dados...');
            
            const savedSessions = await this.sessionModel.find();
            
            console.log(`📋 Encontradas ${savedSessions.length} sessões salvas`);

            for (const savedSession of savedSessions) {
                console.log(`♻️ Restaurando sessão: ${savedSession.sessionId} (${savedSession.status})`);
                
                const session = this.createSession(savedSession.sessionId);
                
                // 🔥 SEMPRE TENTAR RECONECTAR (se tinha estado salvo no Baileys)
                const authFolder = path.join(__dirname, '..', 'baileys_sessions', savedSession.sessionId);
                
                if (fs.existsSync(authFolder)) {
                    console.log(`📁 Arquivos de autenticação encontrados para ${savedSession.sessionId}`);
                    
                    // Tentar reconectar automaticamente
                    session.initialize().catch(err => {
                        console.error(`❌ Erro ao reconectar ${savedSession.sessionId}:`, err.message);
                        console.log(`💡 Sessão ficará offline até reconexão manual`);
                    });
                } else {
                    console.log(`⚠️ Sem arquivos de autenticação para ${savedSession.sessionId} - precisará escanear QR Code novamente`);
                }
            }

            // Aguardar um pouco para conexões se estabelecerem
            setTimeout(() => {
                this.broadcastSessionsUpdate();
            }, 3000);

            console.log('✅ Restauração de sessões concluída\n');
        } catch (error) {
            console.error('❌ Erro ao restaurar sessões:', error);
        }
    }

    async broadcastSessionsUpdate() {
        try {
            const allSessions = await this.sessionModel.getAllSessions();
            const sessionsData = allSessions.map(s => s.toPublic());

            this.io.emit('whatsapp:sessions-update', {
                sessions: sessionsData
            });

            console.log(`📡 [BROADCAST] ${sessionsData.length} sessões sincronizadas`);
        } catch (error) {
            console.error(`❌ Erro ao fazer broadcast:`, error);
        }
    }

    createSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            return this.sessions.get(sessionId);
        }

        const session = new WhatsAppSession(sessionId, this.io, this.sessionModel);
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
            console.error('Erro ao buscar sessões do banco:', error);
            return Array.from(this.sessions.values()).map(s => s.getStatus());
        }
    }

    // 🔥 DESCONECTAR (sem deletar)
    async disconnectSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            await session.softDisconnect();
            // NÃO remove da memória - apenas desconecta
        }
    }

    // 🔥 EXCLUIR PERMANENTEMENTE
    async deleteSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            await session.hardDelete();
            this.sessions.delete(sessionId);
        }
    }

    hasActiveSession() {
        for (const session of this.sessions.values()) {
            if (session.isReady) {
                return true;
            }
        }
        return false;
    }

    async getActiveSessions() {
        try {
            const activeSessions = await this.sessionModel.getActiveSessions();
            return activeSessions.map(s => s.toPublic());
        } catch (error) {
            console.error('Erro ao buscar sessões ativas:', error);
            return [];
        }
    }
}

module.exports = WhatsAppMultiSessionService;