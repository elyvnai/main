const express = require('express');
const { getDb } = require('../../utils/dbAdapter');
const { randomUUID } = require('crypto');
const { webhookQueue } = require('../../utils/queue');

const router = express.Router();

router.post('/', async (req, res) => {
  res.status(200).send('OK');

  const { event, call } = req.body;
  const idempotencyKey = `${event}-${call?.call_id}`;
  
  const db = getDb();
  const { rows } = await db.query('SELECT 1 FROM webhook_events WHERE idempotency_key = $1', [idempotencyKey]);
  if (rows.length > 0) return;

  await db.query('INSERT INTO webhook_events (id, idempotency_key, source, payload) VALUES ($1, $2, $3, $4)', 
    [randomUUID(), idempotencyKey, 'retell', JSON.stringify(req.body)]);

  await webhookQueue.add('retell-webhook', {
    source: 'retell',
    payload: req.body
  }, { jobId: idempotencyKey });
});

const CalComService = require('../../services/CalComService');
const TelegramService = require('../../services/TelegramService');

router.post('/tools', async (req, res) => {
  try {
    const { interaction_type, tool_call_id, name, arguments: toolArguments, call_id, agent_id } = req.body;

    const db = getDb();
    const idempotencyKey = tool_call_id;
    if (idempotencyKey) {
      const { rows } = await db.query('SELECT 1 FROM webhook_events WHERE idempotency_key = $1', [idempotencyKey]);
      if (rows.length > 0) return res.status(200).json({ success: true, tool_call_id, result: "Already processed" });

      await db.query('INSERT INTO webhook_events (id, idempotency_key, source, payload) VALUES ($1, $2, $3, $4)', 
        [randomUUID(), idempotencyKey, 'retell_tool', JSON.stringify(req.body)]);
    }

    if (interaction_type !== 'tool_call') {
      return res.status(400).json({ success: false, error: 'Expected tool_call' });
    }

    let args = {};
    try {
      args = typeof toolArguments === 'string' ? JSON.parse(toolArguments) : toolArguments || {};
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid arguments JSON' });
    }

    // Try to find call + client from DB first
    const { rows: calls } = await db.query('SELECT * FROM calls WHERE call_id = $1', [call_id]);
    const call = calls[0];
    let client = null;
    
    if (call) {
      const { rows: clients } = await db.query('SELECT * FROM clients WHERE id = $1', [call.client_id]);
      client = clients[0];
    }
    
    // Fallback: look up client by retell_agent_id from the request
    if (!client && agent_id) {
      const { rows: clients } = await db.query('SELECT * FROM clients WHERE retell_agent_id = $1', [agent_id]);
      client = clients[0];
    }

    if (!client) {
      return res.status(200).json({
        success: true,
        interaction_type: 'tool_call_result',
        tool_call_id,
        result: "I'm sorry, I couldn't identify your business. Please call back.",
        result_type: 'text'
      });
    }

    let result;

    switch (name) {
      case 'check_availability': {
        if (!args.date) {
          result = 'Please provide a date in YYYY-MM-DD format.';
        } else {
          const avail = await CalComService.checkAvailability(args.date, client);
          result = avail.available
            ? `Available slots: ${avail.slots.join(', ')}`
            : `No availability on ${args.date}.`;
        }
        break;
      }

      case 'book_appointment': {
        const missing = [];
        if (!args.name) missing.push('name');
        if (!args.email) missing.push('email');
        if (!args.date) missing.push('date');
        if (!args.time) missing.push('time');

        if (missing.length > 0) {
          result = `I need: ${missing.join(', ')} to book.`;
        } else {
          const booking = await CalComService.bookAppointment({
            name: args.name,
            email: args.email,
            date: args.date,
            time: args.time,
            phoneNumber: client.phone_number
          }, client);

          if (booking.success) {
            await db.query(`INSERT INTO appointments (id, client_id, phone, name, datetime, calcom_booking_id, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`, 
              [randomUUID(), client.id, client.phone_number, args.name, `${args.date}T${args.time}`, booking.confirmationId]);

            await TelegramService.sendAppointmentNotification({
              name: args.name, email: args.email, date: args.date,
              time: args.time, confirmationId: booking.confirmationId
            }, client);

            result = `Great! Your appointment is confirmed for ${args.date} at ${args.time}.`;
          } else {
            result = `I couldn't complete the booking: ${booking.message}.`;
          }
        }
        break;
      }

      case 'transfer_to_human': {
        const reason = args.reason || 'Caller requested human assistance';
        await TelegramService.sendTransferNotification(call_id, client, reason);
        result = "Please hold on. I'm transferring you to a team member.";
        break;
      }

      default:
        return res.status(404).json({ success: false, error: `Unknown tool: ${name}` });
    }

    res.status(200).json({
      success: true,
      interaction_type: 'tool_call_result',
      tool_call_id,
      result,
      result_type: 'text'
    });
  } catch (error) {
    console.error('❌ Retell tools error:', error);
    res.status(200).json({
      success: true,
      interaction_type: 'tool_call_result',
      tool_call_id: req.body.tool_call_id,
      result: 'I encountered an error. Please try again or request a human.',
      result_type: 'text'
    });
  }
});

module.exports = router;
