const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

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

    onQRCode(callback) {
        this.qrCodeCallback = callback;
    }

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
                printQRInTerminal: false,
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

                if (qr) {
                    console.log('📱 QR Code gerado!');
                    if (this.qrCodeCallback) {
                        this.qrCodeCallback(qr);
                    }
                }

                if (connection === 'open') {
                    console.log('\n╔════════════════════════════════════════════════════╗');
                    console.log('║  🤖 BOT WHATSAPP CONECTADO E PRONTO! 🚀          ║');
                    console.log('╚════════════════════════════════════════════════════╝\n');
                    
                    this.isReady = true;
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;

                    if (this.connectedCallback) {
                        this.connectedCallback();
                    }
                }

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

    async baixarImagem(url) {
        try {
            console.log('📥 Baixando imagem:', url);
            
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            console.log('✅ Imagem baixada com sucesso!');
            return Buffer.from(response.data, 'binary');
        } catch (error) {
            console.error('❌ Erro ao baixar imagem:', error.message);
            return null;
        }
    }

    async enviarOfertas(grupoId, ofertas) {
        if (!this.isReady || !this.sock) {
            throw new Error('Bot não está conectado');
        }

        try {
            console.log(`\n📤 Enviando ofertas para: ${grupoId}`);
            console.log(`📦 Total de ofertas: ${ofertas.length}`);

            for (const oferta of ofertas) {
                try {
                    console.log('📋 Dados da oferta recebida:', oferta);

                    // ✅ USA A MENSAGEM EXATAMENTE COMO VEM DO FRONTEND
                    // Se vier o campo 'mensagem', usa ele. Caso contrário, monta
                    let mensagem = oferta.mensagem;
                    
                    if (!mensagem) {
                        // Só monta a mensagem se não vier pronta
                        mensagem = `🔥 *OFERTA IMPERDÍVEL!* 🔥\n\n`;
                        mensagem += `📦 *${oferta.nome}*\n\n`;
                        
                        if (oferta.precoAntigo) {
                            mensagem += `💰 ~${oferta.precoAntigo}~ ➔ *${oferta.preco}*\n\n`;
                        } else if (oferta.preco) {
                            mensagem += `💰 *${oferta.preco}*\n\n`;
                        }
                        
                        if (oferta.link) {
                            mensagem += `🔗 Link: ${oferta.link}`;
                        }
                    }

                    console.log('📝 Mensagem final:', mensagem);

                    // ✅ ENVIAR COM IMAGEM
                    if (oferta.imagem || oferta.image || oferta.foto) {
                        const imagemUrl = oferta.imagem || oferta.image || oferta.foto;
                        console.log(`📸 Tentando enviar com imagem: ${imagemUrl}`);

                        const imagemBuffer = await this.baixarImagem(imagemUrl);

                        if (imagemBuffer) {
                            await this.sock.sendMessage(grupoId, {
                                image: imagemBuffer,
                                caption: mensagem
                            });
                            console.log(`✅ Oferta enviada COM IMAGEM: ${oferta.nome}`);
                        } else {
                            await this.sock.sendMessage(grupoId, { text: mensagem });
                            console.log(`⚠️ Oferta enviada SEM IMAGEM (erro ao baixar): ${oferta.nome}`);
                        }
                    } else {
                        await this.sock.sendMessage(grupoId, { text: mensagem });
                        console.log(`✅ Oferta enviada (sem imagem): ${oferta.nome}`);
                    }

                    if (ofertas.length > 1) {
                        await delay(2000);
                    }

                } catch (error) {
                    console.error(`❌ Erro ao enviar oferta "${oferta.nome}":`, error.message);
                }
            }

            console.log(`\n✅ Processo concluído! Ofertas enviadas para: ${grupoId}\n`);

            return {
                success: true,
                mensagem: `${ofertas.length} oferta(s) enviada(s) com sucesso!`
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