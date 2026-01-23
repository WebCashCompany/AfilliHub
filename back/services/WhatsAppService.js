const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

class WhatsAppService {
    constructor() {
        this.sock = null;
        this.isReady = false;
        this.authFolder = path.join(__dirname, '..', 'baileys_auth');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.qrCodeCallback = null;
        this.connectedCallback = null;
    }

    // Callback para QR Code
    onQRCode(callback) {
        this.qrCodeCallback = callback;
    }

    // Callback para conexão estabelecida
    onConnected(callback) {
        this.connectedCallback = callback;
    }

    async initialize() {
        if (this.isConnecting) {
            console.log('⚠️ Bot já está conectando...');
            return;
        }

        if (this.isReady) {
            console.log('✅ Bot já está conectado!');
            return;
        }

        this.isConnecting = true;

        try {
            console.log('\n╔════════════════════════════════════════════════════╗');
            console.log('║     🤖 INICIALIZANDO WHATSAPP BOT...             ║');
            console.log('╚════════════════════════════════════════════════════╝\n');

            if (!fs.existsSync(this.authFolder)) {
                fs.mkdirSync(this.authFolder, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: false, // NÃO printar no terminal
                logger: pino({ level: 'silent' }),
                browser: ['DivulgaLinks Bot', 'Chrome', '10.0.0'],
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: true
            });

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                // QR CODE - Enviar para callback
                if (qr) {
                    console.log('📱 QR Code gerado!');
                    
                    // Enviar QR Code para o callback (frontend)
                    if (this.qrCodeCallback) {
                        this.qrCodeCallback(qr);
                    }
                }

                // CONECTADO
                if (connection === 'open') {
                    console.log('\n╔════════════════════════════════════════════════════╗');
                    console.log('║  🤖 BOT WHATSAPP CONECTADO E PRONTO! 🚀          ║');
                    console.log('╚════════════════════════════════════════════════════╝\n');
                    
                    this.isReady = true;
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;

                    // Chamar callback de conexão
                    if (this.connectedCallback) {
                        this.connectedCallback();
                    }
                }

                // DESCONECTADO
                if (connection === 'close') {
                    this.isReady = false;
                    this.isConnecting = false;

                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.output?.payload?.message || 'Desconhecido';

                    console.log(`\n⚠️ Conexão fechada. Status: ${statusCode} | Motivo: ${reason}`);

                    const dontReconnect = [
                        DisconnectReason.loggedOut,
                        DisconnectReason.badSession,
                        DisconnectReason.connectionReplaced,
                        440
                    ];

                    if (dontReconnect.includes(statusCode)) {
                        console.log('❌ Bot desconectado permanentemente.');
                        console.log('💡 Delete a pasta baileys_auth e tente novamente.');
                        return;
                    }

                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delayMs = this.reconnectAttempts * 5000;
                        
                        console.log(`🔄 Reconectando (${this.reconnectAttempts}/${this.maxReconnectAttempts}) em ${delayMs/1000}s...`);
                        
                        await delay(delayMs);
                        await this.initialize();
                    } else {
                        console.error('❌ Máximo de tentativas atingido.');
                    }
                }
            });

        } catch (error) {
            console.error('❌ Erro ao inicializar WhatsApp:', error);
            this.isConnecting = false;
            throw error;
        }
    }

    async listarGrupos() {
        if (!this.isReady || !this.sock) {
            throw new Error('Bot não está conectado');
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
            console.error('Erro ao listar grupos:', error);
            throw error;
        }
    }

    async enviarOfertas(grupoId, ofertas) {
        if (!this.isReady || !this.sock) {
            throw new Error('Bot não está conectado');
        }

        try {
            let mensagem = '🔥 *OFERTAS IMPERDÍVEIS!* 🔥\n\n';
            
            ofertas.forEach((oferta, index) => {
                mensagem += `*${index + 1}. ${oferta.nome}*\n`;
                mensagem += `💰 Preço: *${oferta.preco}*\n`;
                
                if (oferta.desconto) {
                    mensagem += `📉 Desconto: *${oferta.desconto}*\n`;
                }
                
                if (oferta.link) {
                    mensagem += `🔗 Link: ${oferta.link}\n`;
                }
                
                mensagem += '\n';
            });

            mensagem += '⚡ *Aproveite enquanto tem estoque!*';

            await this.sock.sendMessage(grupoId, { text: mensagem });

            console.log(`✅ Ofertas enviadas para: ${grupoId}`);

            return {
                success: true,
                mensagem: 'Ofertas enviadas com sucesso!'
            };

        } catch (error) {
            console.error('❌ Erro ao enviar ofertas:', error);
            throw error;
        }
    }

    getStatus() {
        return {
            conectado: this.isReady,
            status: this.isReady ? 'online' : 'offline',
            clientReady: this.sock !== null
        };
    }

    async disconnect() {
        if (this.sock) {
            try {
                await this.sock.logout();
            } catch (error) {
                console.log('Erro ao fazer logout:', error.message);
            }
            this.sock = null;
            this.isReady = false;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.qrCodeCallback = null;
            this.connectedCallback = null;
            console.log('🔌 Bot desconectado.');
        }
    }
}

const whatsappService = new WhatsAppService();
module.exports = whatsappService;