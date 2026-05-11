// server/bridge/routes/retell/index.js
// Retell AI webhook router — call_started, call_ended, call_analyzed

const express = require('express');
const { handleCallStarted, handleCallEnded, handleCallAnalyzed } = require('./calls');

const router = express.Router();

router.post('/', async (req, res) => {
  const { event, call } = req.body;

  try {
    switch (event) {
      case 'call_started':
        await handleCallStarted(call);
        break;
      case 'call_ended':
        await handleCallEnded(call);
        break;
      case 'call_analyzed':
        await handleCallAnalyzed(call);
        break;
      default:
        console.log(`[Retell] Unhandled event: ${event}`);
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('[Retell] Webhook error:', err);
    res.status(500).send('Error');
  }
});

module.exports = router;
