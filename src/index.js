require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const http = require('http');

const { initDatabase } = require('./database/init');
const retellWebhook = require('./routes/webhooks/retell');
const twilioWebhook = require('./routes/webhooks/twilio');
const telegramWebhook = require('./routes/webhooks/telegram');
const TelegramService = require('./services/TelegramService');
const RetellService = require('./services/RetellService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log requests
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// Health check
app.get('/health', (req, res) => {
    try {
        const { get } = require('./database');
        get('SELECT 1', []);
        res.json({
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

// Elyvn Webhooks
app.use('/webhooks/retell', retellWebhook);
app.use('/webhooks/twilio', twilioWebhook);
app.use('/webhooks/telegram', telegramWebhook);

// Catch-all
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    TelegramService.sendErrorAlert(err, 'Unhandled Express Error').catch(() => {});
    res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
    try {
        await initDatabase();
        
        // Sync Retell Agent Prompt on startup
        await RetellService.syncAgentPrompt();
        
        const server = http.createServer(app);
        
        server.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     ███████╗██╗     ██╗   ██╗██╗   ██╗███╗   ██╗          ║
║     ██╔════╝██║     ╚██╗ ██╔╝██║   ██║████╗  ██║          ║
║     █████╗  ██║      ╚████╔╝ ██║   ██║██╔██╗ ██║          ║
║     ██╔══╝  ██║       ╚██╔╝  ╚██╗ ██╔╝██║╚██╗██║          ║
║     ███████╗███████╗   ██║    ╚████╔╝ ██║ ╚████║          ║
║     ╚══════╝╚══════╝   ╚═╝     ╚═══╝  ╚═╝  ╚═══╝          ║
║                                                           ║
║     ELYVN: CLEAN REWRITE OPERATIONAL                      ║
║     Speed-to-Lead SMS & Call Management                   ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  🌐 Server running on port: ${PORT}
║                                                           ║
║  📡 Active Webhooks:                                      ║
║     • /webhooks/retell                                    ║
║     • /webhooks/twilio                                    ║
║     • /webhooks/telegram                                  ║
║                                                           ║
║  🏥 Health Check: /health                                 ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
            `);

            const chatId = process.env.TELEGRAM_CHAT_ID;
            if (chatId) {
                TelegramService.sendToAdmin(`
🤖 <b>Elyvn Server Started</b>
🕐 <b>Time:</b> ${new Date().toLocaleString()}
✅ <b>Status:</b> Ready
                `).catch(err => console.warn('Could not send startup notification:', err.message));
            }
        });

        server.on('error', (err) => {
            console.error('❌ Server error:', err);
            process.exit(1);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    const { closeDatabase } = require('./database');
    closeDatabase();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    const { closeDatabase } = require('./database');
    closeDatabase();
    process.exit(0);
});

if (require.main === module) {
    startServer();
}

module.exports = app;
