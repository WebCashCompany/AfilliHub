const express = require('express');
const router = express.Router();
const whatsappService = require('../services/WhatsAppService');

let currentQRCode = null; // Armazena o QR Code atual

router.get('/status-bot', (req, res) => {
  try {
    const status = whatsappService.getStatus();
    res.json({
      ...status,
      qrCode: currentQRCode // Inclui QR Code se existir
    });
  } catch (error) {
    console.error('Erro ao verificar status:', error);
    res.status(500).json({
      conectado: false,
      status: 'offline',
      clientReady: false,
      error: error.message
    });
  }
});

router.post('/conectar-bot', async (req, res) => {
  try {
    console.log('\n🔌 Solicitação de conexão recebida do frontend...\n');
    
    const status = whatsappService.getStatus();
    if (status.conectado) {
      currentQRCode = null;
      return res.json({
        success: true,
        message: 'Bot já está conectado!',
        status: status
      });
    }

    // Limpar QR Code anterior
    currentQRCode = null;

    // Configurar callback para capturar QR Code
    whatsappService.onQRCode((qr) => {
      currentQRCode = qr;
      console.log('📱 QR Code gerado e armazenado');
    });

    // Configurar callback quando conectar
    whatsappService.onConnected(() => {
      currentQRCode = null;
      console.log('✅ Bot conectado, QR Code limpo');
    });

    await whatsappService.initialize();

    res.json({
      success: true,
      message: 'Bot inicializado! Aguardando QR Code...',
      status: whatsappService.getStatus()
    });

  } catch (error) {
    console.error('❌ Erro ao conectar bot:', error);
    currentQRCode = null;
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/desconectar-bot', async (req, res) => {
  try {
    await whatsappService.disconnect();
    currentQRCode = null;
    
    res.json({
      success: true,
      message: 'Bot desconectado com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao desconectar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/listar-grupos', async (req, res) => {
  try {
    const grupos = await whatsappService.listarGrupos();
    
    res.json({
      success: true,
      grupos: grupos
    });
  } catch (error) {
    console.error('Erro ao listar grupos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      grupos: []
    });
  }
});

router.post('/enviar-ofertas', async (req, res) => {
  try {
    const { grupoId, ofertas } = req.body;

    if (!grupoId || !ofertas || ofertas.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'grupoId e ofertas são obrigatórios'
      });
    }

    const result = await whatsappService.enviarOfertas(grupoId, ofertas);

    res.json(result);
  } catch (error) {
    console.error('Erro ao enviar ofertas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/enviar-teste', async (req, res) => {
  try {
    const { grupoId } = req.body;

    if (!grupoId) {
      return res.status(400).json({
        success: false,
        error: 'grupoId é obrigatório'
      });
    }

    const ofertas = [
      {
        nome: 'Produto Teste',
        preco: 'R$ 99,90',
        desconto: '-50%',
        link: 'https://exemplo.com'
      }
    ];

    const result = await whatsappService.enviarOfertas(grupoId, ofertas);

    res.json(result);
  } catch (error) {
    console.error('Erro ao enviar teste:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;