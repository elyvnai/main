const express = require('express');
const { getDb } = require('../utils/dbAdapter');
const { randomUUID } = require('crypto');
const { webhookQueue } = require('../utils/queue');

const router = express.Router();

router.post('/', async (req, res) => {
  res.set('Content-Type', 'text/xml').send('');

  const { MessageSid } = req.body;
  const idempotencyKey = req.headers['x-twilio-signature'] || MessageSid;
  
  const db = getDb();
  const { rows } = await db.query('SELECT 1 FROM webhook_events WHERE idempotency_key = $1', [idempotencyKey]);
  if (rows.length > 0) return;

  await db.query('INSERT INTO webhook_events (id, idempotency_key, source, payload) VALUES ($1, $2, $3, $4)', 
    [randomUUID(), idempotencyKey, 'twilio', JSON.stringify(req.body)]);

  await webhookQueue.add('twilio-webhook', {
    source: 'twilio',
    payload: req.body
  }, { jobId: idempotencyKey });
});

module.exports = router;
