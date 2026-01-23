const express = require('express');
const router = express.Router();
const whatsappService = require('../services/WhatsAppService');

// Inicializar bot (chamar uma vez ao iniciar o servidor)
router.post('/inicializar-bot', async (req, res) => {
    try {
        await whatsappService.initialize();
        res.json({ 
            success: true, 
            mensagem: 'Bot inicializado! Escaneie o QR Code no console.' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Verificar status do bot
router.get('/status-bot', (req, res) => {
    const status = whatsappService.getStatus();
    res.json(status);
});

// Forçar bot como pronto (temporário para debug)
router.post('/forcar-ready', (req, res) => {
    whatsappService.isReady = true;
    res.json({ 
        success: true, 
        mensagem: 'Bot forçado como pronto!' 
    });
});

// Listar grupos disponíveis
router.get('/listar-grupos', async (req, res) => {
    try {
        const grupos = await whatsappService.listarGrupos();
        res.json({ 
            success: true, 
            grupos 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Enviar ofertas para grupo
router.post('/enviar-ofertas', async (req, res) => {
    try {
        const { grupoId, ofertas } = req.body;

        if (!grupoId || !ofertas || ofertas.length === 0) {
            return res.status(400).json({ 
                success: false, 
                erro: 'Grupo e ofertas são obrigatórios' 
            });
        }

        const resultado = await whatsappService.enviarOfertas(grupoId, ofertas);
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Enviar teste
router.post('/enviar-teste', async (req, res) => {
    try {
        const { grupoId } = req.body;
        
        const ofertaTeste = [{
            nome: 'Produto Teste',
            preco: 'R$ 99,90',
            desconto: '-50%',
            link: 'https://exemplo.com'
        }];

        const resultado = await whatsappService.enviarOfertas(grupoId, ofertaTeste);
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            erro: error.message 
        });
    }
});

module.exports = router;