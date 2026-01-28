// back/services/WhatsAppMultiSessionService.js
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class WhatsAppSession {
    constructor(sessionId, io) {
        this.sessionId = sessionId;
        this.io = io;
        this.sock = null;
        this.isReady = false;
        this.authFolder = path.join(__dirname, '..', 'baileys_sessions', sessionId);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.phoneNumber = null;
        this.connectedAt = null;
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

        try {
            console.log(`\n🤖 Inicializando sessão: ${this.sessionId}`);

            if (!fs.existsSync(this.authFolder)) {
                fs.mkdirSync(this.authFolder, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: [`Bot ${this.sessionId}`, 'Chrome', '10.0.0'],
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
                    
                    // Emitir QR Code via Socket.IO
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

                    // Pegar número conectado
                    try {
                        const me = this.sock.user;
                        this.phoneNumber = me?.id?.split(':')[0] || 'Desconhecido';
                    } catch (e) {
                        this.phoneNumber = 'Desconhecido';
                    }

                    // Emitir status conectado via Socket.IO
                    this.io.emit('whatsapp:connected', {
                        sessionId: this.sessionId,
                        phoneNumber: this.phoneNumber,
                        connectedAt: this.connectedAt
                    });
                }

                if (connection === 'close') {
                    this.isReady = false;
                    this.isConnecting = false;

                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.output?.payload?.message || 'Desconhecido';

                    console.log(`⚠️ Sessão ${this.sessionId} fechada. Status: ${statusCode}`);

                    // Emitir desconexão via Socket.IO
                    this.io.emit('whatsapp:disconnected', {
                        sessionId: this.sessionId,
                        reason: reason
                    });

                    const dontReconnect = [
                        DisconnectReason.loggedOut,
                        DisconnectReason.badSession,
                        DisconnectReason.connectionReplaced,
                        440
                    ];

                    if (dontReconnect.includes(statusCode)) {
                        console.log(`❌ Sessão ${this.sessionId} desconectada permanentemente.`);
                        return;
                    }

                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delayMs = this.reconnectAttempts * 5000;
                        
                        console.log(`🔄 Reconectando sessão ${this.sessionId} (${this.reconnectAttempts}/${this.maxReconnectAttempts}) em ${delayMs/1000}s...`);
                        
                        await delay(delayMs);
                        await this.initialize();
                    } else {
                        console.error(`❌ Sessão ${this.sessionId}: Máximo de tentativas atingido.`);
                    }
                }
            });

        } catch (error) {
            console.error(`❌ Erro ao inicializar sessão ${this.sessionId}:`, error);
            this.isConnecting = false;
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

                } catch (error) {
                    console.error(`❌ Erro ao enviar oferta (sessão ${this.sessionId}):`, error.message);
                }
            }

            return {
                success: true,
                mensagem: `${ofertas.length} oferta(s) enviada(s) com sucesso!`
            };

        } catch (error) {
            console.error(`❌ Erro ao enviar ofertas (sessão ${this.sessionId}):`, error);
            throw error;
        }
    }

    async disconnect() {
        if (this.sock) {
            try {
                await this.sock.logout();
            } catch (error) {
                console.log(`Erro ao fazer logout (sessão ${this.sessionId}):`, error.message);
            }
            
            this.sock = null;
            this.isReady = false;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            
            // Deletar pasta de autenticação
            if (fs.existsSync(this.authFolder)) {
                fs.rmSync(this.authFolder, { recursive: true, force: true });
            }
            
            console.log(`🔌 Sessão ${this.sessionId} desconectada e dados removidos.`);
        }
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
    constructor(io) {
        this.sessions = new Map();
        this.io = io;
    }

    createSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            return this.sessions.get(sessionId);
        }

        const session = new WhatsAppSession(sessionId, this.io);
        this.sessions.set(sessionId, session);
        return session;
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    getAllSessions() {
        return Array.from(this.sessions.values()).map(s => s.getStatus());
    }

    async deleteSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            await session.disconnect();
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

    getActiveSessions() {
        return Array.from(this.sessions.values())
            .filter(s => s.isReady)
            .map(s => s.getStatus());
    }
}

module.exports = WhatsAppMultiSessionService;