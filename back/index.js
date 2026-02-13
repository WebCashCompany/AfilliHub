require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const axios = require('axios'); // Adicionado para self-ping
const { Server } = require('socket.io');
const { connectDB, getProductConnection } = require('./database/mongodb');
const { getWhatsAppSessionModel } = require('./database/models/WhatsAppSession');
const { getUserPreferencesModel } = require('./database/models/UserPreferences');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 10000; // Render usa 10000 por padrão

const io = new Server(server, {
  cors: {
    origin: "*", // Em produção, você pode restringir para o seu domínio do frontend
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors());
app.use(express.json());

let whatsappService = null;
let sessionModel = null;
let preferencesModel = null;
let integrationModel = null;

async function startServer() {
  try {
    await connectDB();
    const connection = getProductConnection();
    
    sessionModel = getWhatsAppSessionModel(connection);
    preferencesModel = getUserPreferencesModel(connection);
    integrationModel = require('./models/Integration')(connection);

    const WhatsAppMultiSessionService = require('./services/WhatsAppMultiSessionService');
    whatsappService = new WhatsAppMultiSessionService(io, sessionModel);

    // Rota de Health Check para o Render
    app.get('/api/health', (req, res) => {
      res.status(200).json({ status: 'online', timestamp: new Date() });
    });

    // Rotas
    app.use('/api/products', require('./routes/products.routes'));
    app.use('/api/scraping', require('./routes/scraping.routes'));
    app.use('/api/divulgacao', require('./routes/divulgacao.routes')(whatsappService));
    app.use('/api/sessions', require('./routes/sessions.routes'));
    app.use('/api/preferences', require('./routes/preferences.routes')(preferencesModel, io));
    app.use('/api/integrations', require('./routes/integrations')(integrationModel));

    server.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      
      // MANTÉM O SERVIDOR ONLINE (Self-ping a cada 10 minutos)
      if (process.env.RENDER_EXTERNAL_URL) {
        setInterval(() => {
          axios.get(`${process.env.RENDER_EXTERNAL_URL}/api/health`)
            .then(() => console.log('💓 Self-ping realizado com sucesso'))
            .catch(err => console.error('⚠️ Erro no self-ping:', err.message));
        }, 600000); 
      }
    });

  } catch (error) {
    console.error('❌ Erro crítico:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGINT', async () => {
  if (whatsappService) {
    for (const [id, session] of whatsappService.sessions) {
      await session.softDisconnect();
    }
  }
  process.exit(0);
});