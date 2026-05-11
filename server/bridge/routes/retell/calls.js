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

async function handleCallStarted(callData) {
  const parsed = RetellService.parseCallEvent({ call: callData });
  const db = getDb();
  
  const client = db.prepare('SELECT * FROM clients WHERE retell_agent_id = ?').get(parsed.agentId);
  
  db.prepare(`
    INSERT INTO calls (id, call_id, client_id, caller_phone, status, duration, created_at)
    VALUES (?, ?, ?, ?, 'in_progress', 0, ?)
    ON CONFLICT(call_id) DO NOTHING
  `).run(randomUUID(), parsed.callId, client?.id, parsed.phoneNumber, new Date().toISOString());

  if (client?.telegram_chat_id) {
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
    randomUUID(), parsed.callId, client?.id, parsed.phoneNumber, status,
    parsed.duration, parsed.transcript, parsed.summary,
    parsed.summary ? 'completed' : status,
    parsed.recordingUrl, parsed.disconnectReason,
    new Date().toISOString()
  );

  // Download recording
  let recordingPath = null;
  if (parsed.recordingUrl) {
    recordingPath = await downloadRecording(parsed.callId, parsed.recordingUrl);
    if (recordingPath) {
      db.prepare('UPDATE calls SET recording_path = ? WHERE call_id = ?').run(recordingPath, parsed.callId);
    }
  }

  // Notify owner
  if (client?.telegram_chat_id) {
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

  // Speed-to-lead for missed calls
  if (isMissed && parsed.phoneNumber) {
    await TwilioService.sendFullMenuSMS(parsed.phoneNumber);
    await TelegramService.sendMessage(
      `\ud83d\udcf4 <b>Missed call from ${parsed.phoneNumber}</b>\n\u23f1\ufe0f ${parsed.duration}s\n\ud83d\udce4 Auto-text sent with booking link.`,
      { chat_id: client?.telegram_chat_id }
    );
  }
}

async function handleCallAnalyzed(callData) {
  const parsed = RetellService.parseCallEvent({ call: callData });
  const db = getDb();
  
  db.prepare(`
    UPDATE calls SET transcript = ?, summary = ?, outcome = ? WHERE call_id = ?
  `).run(parsed.transcript, parsed.summary, parsed.summary ? 'completed' : 'analyzed', parsed.callId);
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
