const express = require('express');
const { handleCallStarted, handleCallEnded, handleCallAnalyzed } = require('./calls');

const router = express.Router();

router.post('/', async (req, res) => {
  const { event, call } = req.body;
  try {
    switch (event) {
      case 'call_started': await handleCallStarted(call); break;
      case 'call_ended': await handleCallEnded(call); break;
      case 'call_analyzed': await handleCallAnalyzed(call); break;
      default: console.log(`[Retell] Unhandled event: ${event}`);
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('[Retell] Webhook error:', err);
    res.status(500).send('Error');
  }
});

const CalComService = require('../../services/CalComService');
const TelegramService = require('../../services/TelegramService');
const { getDb } = require('../../utils/dbAdapter');

router.post('/tools', async (req, res) => {
  try {
    const { interaction_type, tool_call_id, name, arguments: toolArguments, call_id, agent_id } = req.body;

    if (interaction_type !== 'tool_call') {
      return res.status(400).json({ success: false, error: 'Expected tool_call' });
    }

    let args = {};
    try {
      args = typeof toolArguments === 'string' ? JSON.parse(toolArguments) : toolArguments || {};
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid arguments JSON' });
    }

    const db = getDb();
    
    // Try to find call + client from DB first
    let call = db.prepare('SELECT * FROM calls WHERE call_id = ?').get(call_id);
    let client = call ? db.prepare('SELECT * FROM clients WHERE id = ?').get(call.client_id) : null;
    
    // Fallback: look up client by retell_agent_id from the request
    if (!client && agent_id) {
      client = db.prepare('SELECT * FROM clients WHERE retell_agent_id = ?').get(agent_id);
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
          const avail = await CalComService.checkAvailability(args.date);
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
          });

          if (booking.success) {
            db.prepare(`INSERT INTO appointments (id, client_id, phone, name, datetime, calcom_booking_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`)
              .run(require('crypto').randomUUID(), client.id, client.phone_number, args.name,
                `${args.date}T${args.time}`, booking.confirmationId);

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