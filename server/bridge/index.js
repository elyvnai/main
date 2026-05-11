// server/bridge/index.js — Elyvn Bridge Entry Point
// Connects Twilio → Retell AI → Telegram Bot
// Three webhooks, one number, zero frontend.

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

// Run DB migrations before accepting traffic
runMigrations().then(() => {
  configureRoutes(app);

  app.listen(PORT, () => {
    console.log(`[Elyvn] Bridge live on port ${PORT}`);
    console.log(`[Elyvn] Webhooks: /webhooks/retell | /webhooks/twilio | /webhooks/telegram`);
  });
}).catch(err => {
  console.error('[Elyvn] Migration failed, exiting:', err);
  process.exit(1);
});
