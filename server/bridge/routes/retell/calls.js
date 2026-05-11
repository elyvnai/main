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

function isOptedOut(phone, clientId) {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM sms_opt_outs WHERE phone = ? AND client_id = ?').get(phone, clientId);
  return !!row;
}

async function handleCallStarted(callData) {
  const parsed = RetellService.parseCallEvent({ call: callData });
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE retell_agent_id = ?').get(parsed.agentId);
  if (!client) return;

  db.prepare(`
    INSERT INTO calls (id, call_id, client_id, caller_phone, status, duration, created_at)
    VALUES (?, ?, ?, ?, 'in_progress', 0, ?)
    ON CONFLICT(call_id) DO NOTHING
  `).run(randomUUID(), parsed.callId, client.id, parsed.phoneNumber, new Date().toISOString());

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
  const client = db.prepare('SELECT * FROM clients WHERE retell_agent_id = ?').get(parsed.agentId);
  if (!client) return;

  const isMissed = SpeedToLeadService.shouldSendSpeedToLead(parsed);
  const status = isMissed ? 'missed' : 'completed';

  db.prepare(`
    INSERT INTO calls (id, call_id, client_id, caller_phone, status, duration, transcript, summary, outcome, recording_url, disconnection_reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(call_id) DO UPDATE SET
      status = excluded.status,
      duration = excluded.duration,
      transcript = excluded.transcript,
      summary = excluded.summary,
      outcome = excluded.outcome,
      recording_url = excluded.recording_url,
      disconnection_reason = excluded.disconnection_reason
  `).run(
    randomUUID(), parsed.callId, client.id, parsed.phoneNumber, status,
    parsed.duration, parsed.transcript, parsed.summary,
    parsed.summary ? 'completed' : status,
    parsed.recordingUrl, parsed.disconnectReason,
    new Date().toISOString()
  );

  let recordingPath = null;
  if (parsed.recordingUrl) {
    recordingPath = await downloadRecording(parsed.callId, parsed.recordingUrl);
    if (recordingPath) {
      db.prepare('UPDATE calls SET recording_path = ? WHERE call_id = ? AND client_id = ?')
        .run(recordingPath, parsed.callId, client.id);
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
  if (isMissed && parsed.phoneNumber && !isOptedOut(parsed.phoneNumber, client.id)) {
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
  const client = db.prepare('SELECT * FROM clients WHERE retell_agent_id = ?').get(parsed.agentId);
  if (!client) return;

  db.prepare(`
    UPDATE calls SET transcript = ?, summary = ?, outcome = ? WHERE call_id = ? AND client_id = ?
  `).run(parsed.transcript, parsed.summary, parsed.summary ? 'completed' : 'analyzed', parsed.callId, client.id);
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
