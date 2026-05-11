require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { configureRoutes } = require('./config/routes');
const { runMigrations } = require('./utils/migrations');

const PORT = process.env.PORT || 3000;

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check mounts immediately — Railway needs this
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Run migrations, then mount routes
runMigrations().then(() => {
  configureRoutes(app);
  console.log('[Elyvn] Routes mounted');
}).catch(err => {
  console.error('[Elyvn] Migration failed — routes NOT mounted:', err.message);
});

app.listen(PORT, () => {
  console.log(`[Elyvn] Bridge live on port ${PORT}`);
});
