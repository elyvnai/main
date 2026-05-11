require('dotenv').config();
const { Worker } = require('bullmq');
const { connection } = require('./utils/queue');
const WebhookService = require('./services/WebhookService');
const TelegramService = require('./services/TelegramService');
const TwilioService = require('./services/TwilioService');
const logger = require('./utils/logger');
const { handleCallStarted, handleCallEnded, handleCallAnalyzed } = require('./routes/retell/calls');

const worker = new Worker('webhook-events', async (job) => {
  const { source, payload } = job.data;
  logger.info(`[Worker] Processing job`, { jobId: job.id, source });

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
      case 'sms-delayed':
        await TwilioService.sendSMS(payload.to, payload.body, payload.clientId, null, payload.fromOverride);
        break;
      default:
        logger.warn(`[Worker] Unknown source`, { source });
    }
  } catch (err) {
    logger.error(`[Worker] Error in job`, { jobId: job.id, error: err.message, stack: err.stack });
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
  logger.info(`[Worker] Job completed`, { jobId: job.id });
});

worker.on('failed', (job, err) => {
  logger.error(`[Worker] Job failed`, { jobId: job?.id, error: err.message });
});

logger.info('[Worker] Webhook worker started');
