const express = require('express');
const { getDb } = require('../../utils/dbAdapter');
const { randomUUID } = require('crypto');
const { webhookQueue } = require('../../utils/queue');

const router = express.Router();

router.post('/', async (req, res) => {
  res.status(200).send('OK');

  const { update_id } = req.body;
  if (!update_id) return;

  const idempotencyKey = update_id.toString();
  const db = getDb();

  const exists = db.prepare('SELECT 1 FROM webhook_events WHERE idempotency_key = ?').get(idempotencyKey);
  if (exists) return;

  db.prepare('INSERT INTO webhook_events (id, idempotency_key, source, payload) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), idempotencyKey, 'telegram', JSON.stringify(req.body));

  await webhookQueue.add('telegram-webhook', {
    source: 'telegram',
    payload: req.body
  }, { jobId: idempotencyKey });
});

module.exports = router;
