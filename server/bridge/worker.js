require('dotenv').config();
const { Worker } = require('bullmq');
const { connection } = require('./utils/queue');
const WebhookService = require('./services/WebhookService');
const TelegramService = require('./services/TelegramService');
const { handleCallStarted, handleCallEnded, handleCallAnalyzed } = require('./routes/retell/calls');

const worker = new Worker('webhook-events', async (job) => {
  const { source, payload } = job.data;
  console.log(`[Worker] Processing job ${job.id} from ${source}`);

  try {
    switch (source) {
      case 'twilio':
        await WebhookService.processTwilioWebhook(payload);
        break;
      case 'retell': {
        const { event, call } = payload;
        switch (event) {
          case 'call_started': await handleCallStarted(call); break;
          case 'call_ended': await handleCallEnded(call); break;
          case 'call_analyzed': await handleCallAnalyzed(call); break;
        }
        break;
      }
      case 'telegram':
        await WebhookService.processTelegramWebhook(payload);
        break;
      case 'telegram-delayed':
        await TelegramService.sendMessage(payload.text, payload.options);
        break;
      default:
        console.warn(`[Worker] Unknown source: ${source}`);
    }
  } catch (err) {
    console.error(`[Worker] Error in job ${job.id}:`, err);
    throw err; // BullMQ handles retry
  }
}, {
  connection,
  concurrency: 10,
  limiter: {
    max: 50,
    duration: 1000,
  },
});

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job.id} failed:`, err);
});

console.log('[Worker] Webhook worker started');
