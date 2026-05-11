require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { configureRoutes } = require('./config/routes');
const { runMigrations } = require('./utils/migrations');
const RetellService = require('./services/RetellService');

const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

app.get('/health', async (req, res) => {
  try {
    const db = getDb();
    await db.query('SELECT 1');
    
    const { connection: redis } = require('./utils/queue');
    await redis.ping();

    res.status(200).json({ 
      status: 'ok', 
      database: 'connected', 
      redis: 'connected',
      timestamp: new Date().toISOString() 
    });
  } catch (err) {
    logger.error('Health check failed', { error: err.message });
    res.status(503).json({ 
      status: 'error', 
      error: err.message,
      timestamp: new Date().toISOString() 
    });
  }
});

runMigrations()
  .then(() => RetellService.syncAgentPrompt())
  .then(() => {
    configureRoutes(app);
    logger.info('[Elyvn] Routes mounted');
  })
  .catch(err => {
    logger.error('[Elyvn] Startup error:', { error: err.message });
  });

app.listen(PORT, () => {
  logger.info(`[Elyvn] Bridge live on port ${PORT}`);
});
