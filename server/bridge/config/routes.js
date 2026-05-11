const express = require('express');

function configureRoutes(app) {
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Webhooks (order matters - mount before any catch-all)
  app.use('/webhooks/retell', require('../routes/retell/index'));
  app.use('/webhooks/twilio', require('../routes/twilio'));
  app.use('/webhooks/telegram', require('../routes/telegram/index'));

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

module.exports = { configureRoutes };
