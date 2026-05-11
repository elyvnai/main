const { getDb } = require('../../utils/dbAdapter');
const RetellService = require('../../services/RetellService');
const TelegramService = require('../../services/TelegramService');
const TwilioService = require('../../services/TwilioService');
const SpeedToLeadService = require('../../services/SpeedToLeadService');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const RECORDINGS_DIR = path.join(process.cwd(), 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

async function isOptedOut(phone, clientId) {
  const db = getDb();
  const { rows } = await db.query('SELECT 1 FROM sms_opt_outs WHERE phone = $1 AND client_id = $2', [phone, clientId]);
  return rows.length > 0;
}

async function handleCallStarted(callData) {
  const parsed = RetellService.parseCallEvent({ call: callData });
  const db = getDb();
  const { rows } = await db.query('SELECT * FROM clients WHERE retell_agent_id = $1', [parsed.agentId]);
  const client = rows[0];
  if (!client) return;

  await db.query(`
    INSERT INTO calls (id, call_id, client_id, caller_phone, status, duration, created_at)
    VALUES ($1, $2, $3, $4, 'in_progress', 0, $5)
    ON CONFLICT(call_id) DO NOTHING
  `, [randomUUID(), parsed.callId, client.id, parsed.phoneNumber, new Date().toISOString()]);

  if (client.telegram_chat_id && client.ai_enabled) {
    await TelegramService.sendCallNotification(
      { call_id: parsed.callId, caller_phone: parsed.phoneNumber, status: 'in_progress' },
      client,
      'started'
    );
  }
}

async function handleCallEnded(callData) {
  const parsed = RetellService.parseCallEvent({ call: callData });
  const db = getDb();
  const { rows } = await db.query('SELECT * FROM clients WHERE retell_agent_id = $1', [parsed.agentId]);
  const client = rows[0];
  if (!client) return;

  const isMissed = SpeedToLeadService.shouldSendSpeedToLead(parsed);
  const status = isMissed ? 'missed' : 'completed';

  await db.query(`
    INSERT INTO calls (id, call_id, client_id, caller_phone, status, duration, transcript, summary, outcome, recording_url, disconnection_reason, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT(call_id) DO UPDATE SET
      status = EXCLUDED.status,
      duration = EXCLUDED.duration,
      transcript = EXCLUDED.transcript,
      summary = EXCLUDED.summary,
      outcome = EXCLUDED.outcome,
      recording_url = EXCLUDED.recording_url,
      disconnection_reason = EXCLUDED.disconnection_reason
  `, [
    randomUUID(), parsed.callId, client.id, parsed.phoneNumber, status,
    parsed.duration, parsed.transcript, parsed.summary,
    parsed.summary ? 'completed' : status,
    parsed.recordingUrl, parsed.disconnectReason,
    new Date().toISOString()
  ]);

  let recordingPath = null;
  if (parsed.recordingUrl) {
    recordingPath = await downloadRecording(parsed.callId, parsed.recordingUrl);
    if (recordingPath) {
      await db.query('UPDATE calls SET recording_path = $1 WHERE call_id = $2 AND client_id = $3', [recordingPath, parsed.callId, client.id]);
    }
  }

  if (client.telegram_chat_id && client.ai_enabled) {
    await TelegramService.sendCallNotification({
      call_id: parsed.callId,
      caller_phone: parsed.phoneNumber,
      status,
      duration: parsed.duration,
      outcome: parsed.summary ? 'completed' : status,
      summary: parsed.summary,
      transcript: parsed.transcript,
      recording_url: parsed.recordingUrl
    }, client, 'ended');
  }

  // Speed-to-lead with opt-out check
  if (isMissed && parsed.phoneNumber && !(await isOptedOut(parsed.phoneNumber, client.id))) {
    await TwilioService.sendFullMenuSMS(parsed.phoneNumber, client.id);
    if (client.telegram_chat_id && client.ai_enabled) {
      await TelegramService.sendMessage(
        `📵 <b>Missed call from ${parsed.phoneNumber}</b>\n⏱ ${parsed.duration}s\n📤 Auto-text sent with booking link.`,
        { chat_id: client.telegram_chat_id }
      );
    }
  }
}

async function handleCallAnalyzed(callData) {
  const parsed = RetellService.parseCallEvent({ call: callData });
  const db = getDb();
  const { rows } = await db.query('SELECT * FROM clients WHERE retell_agent_id = $1', [parsed.agentId]);
  const client = rows[0];
  if (!client) return;

  await db.query(`
    UPDATE calls SET transcript = $1, summary = $2, outcome = $3 WHERE call_id = $4 AND client_id = $5
  `, [parsed.transcript, parsed.summary, parsed.summary ? 'completed' : 'analyzed', parsed.callId, client.id]);
}

function downloadRecording(callId, url) {
  return new Promise((resolve) => {
    const filePath = path.join(RECORDINGS_DIR, `${callId}.wav`);
    const file = fs.createWriteStream(filePath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(filePath); });
    }).on('error', () => resolve(null));
    setTimeout(() => resolve(null), 30000);
  });
}

module.exports = { handleCallStarted, handleCallEnded, handleCallAnalyzed };
