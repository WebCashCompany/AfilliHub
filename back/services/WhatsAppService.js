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
    }

    async initialize() {
        try {
            // Criar pasta de autenticação se não existir
            if (!fs.existsSync(this.authFolder)) {
                fs.mkdirSync(this.authFolder, { recursive: true });
            }

            // Carregar estado de autenticação
            const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

            // Criar socket do WhatsApp
            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }), // Desabilitar logs verbosos
                browser: ['Promoforia Bot', 'Chrome', '10.0.0'],
                defaultQueryTimeoutMs: 60000
            });

            // Evento: QR Code
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    console.log('\n╔════════════════════════════════════════════════════╗');
                    console.log('║  📱 ESCANEIE O QR CODE COM SEU WHATSAPP           ║');
                    console.log('╚════════════════════════════════════════════════════╝\n');
                    qrcode.generate(qr, { small: true });
                    console.log('\n💡 Abra o WhatsApp > Dispositivos Conectados > Conectar\n');
                }

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('⚠️ Conexão fechada. Reconectar?', shouldReconnect);
                    
                    if (shouldReconnect) {
                        await delay(3000);
                        this.initialize();
                    } else {
                        this.isReady = false;
                    }
                }

                if (connection === 'open') {
                    console.log('\n╔════════════════════════════════════════════════════╗');
                    console.log('║  🤖 BOT WHATSAPP CONECTADO E PRONTO! 🚀          ║');
                    console.log('╚════════════════════════════════════════════════════╝\n');
                    this.isReady = true;
                }
            });

            // Salvar credenciais quando atualizadas
            this.sock.ev.on('creds.update', saveCreds);

        } catch (error) {
            console.error('❌ Erro ao inicializar WhatsApp:', error);
            throw error;
        }
    }

    // Listar grupos
    async listarGrupos() {
        if (!this.isReady || !this.sock) {
            throw new Error('Bot não está conectado');
        }

        try {
            // Buscar todos os chats
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

    // Enviar ofertas
    async enviarOfertas(grupoId, ofertas) {
        if (!this.isReady || !this.sock) {
            throw new Error('Bot não está conectado');
        }

        try {
            // Formatar mensagem
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

            // Enviar mensagem
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

    // Verificar status
    getStatus() {
        return {
            conectado: this.isReady,
            status: this.isReady ? 'online' : 'offline',
            clientReady: this.sock !== null
        };
    }
}

// Exportar instância única
const whatsappService = new WhatsAppService();
module.exports = whatsappService;