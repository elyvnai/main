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

  const { rows } = await db.query('SELECT 1 FROM webhook_events WHERE idempotency_key = $1', [idempotencyKey]);
  if (rows.length > 0) return;

  await db.query('INSERT INTO webhook_events (id, idempotency_key, source, payload) VALUES ($1, $2, $3, $4)', 
    [randomUUID(), idempotencyKey, 'telegram', JSON.stringify(req.body)]);

  await webhookQueue.add('telegram-webhook', {
    source: 'telegram',
    payload: req.body
  }, { jobId: idempotencyKey });
});

module.exports = router;
