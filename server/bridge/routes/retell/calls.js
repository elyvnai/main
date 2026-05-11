const { getDb } = require('../../utils/dbAdapter');
const { sendSMS } = require('../../utils/sms');
const { sendMessage: sendTelegram } = require('../../utils/telegram');
const { buildMissedCallSMS } = require('../../utils/nicheTemplates');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const RECORDINGS_DIR = path.join(process.cwd(), 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

async function handleCallStarted(callData) {
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE retell_agent_id = ?').get(callData.agent_id);
  if (!client) return;

  db.prepare(`
    INSERT INTO calls (id, call_id, client_id, caller_phone, status, duration, created_at)
    VALUES (?, ?, ?, ?, 'ongoing', 0, ?)
    ON CONFLICT(call_id) DO NOTHING
  `).run(randomUUID(), callData.call_id, client.id, callData.from_number, new Date().toISOString());

  // Notify owner of live call
  if (client.telegram_chat_id) {
    await sendTelegram(client.telegram_chat_id, 
      `🔔 **Inbound Call**\n\n👤 From: ${callData.from_number}\n📞 Status: Talking...\n\n_The AI is handling this call right now._`
    );
  }
}

async function handleCallEnded(callData) {
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE retell_agent_id = ?').get(callData.agent_id);
  if (!client) return;

  const durationSec = Math.round((callData.duration_ms || 0) / 1000);
  const reason = callData.disconnection_reason || '';
  
  // Missed call detection
  const isMissed = (
    durationSec < 10 ||
    reason === 'voicemail_reached' ||
    reason === 'no_answer' ||
    reason === 'busy'
  );

  const outcome = isMissed ? 'missed' : (callData.call_analysis?.calcom_booking_id ? 'booked' : 'completed');

  // Update call record
  db.prepare(`
    INSERT INTO calls (id, call_id, twilio_call_sid, client_id, caller_phone, status, duration, transcript, summary, outcome, recording_url, disconnection_reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(call_id) DO UPDATE SET
      duration = excluded.duration,
      status = excluded.status,
      outcome = excluded.outcome,
      transcript = excluded.transcript,
      summary = excluded.summary,
      recording_url = excluded.recording_url,
      disconnection_reason = excluded.disconnection_reason
  `).run(
    randomUUID(), callData.call_id, callData.telephony_identifier?.twilio_call_sid || null,
    client.id, callData.from_number, isMissed ? 'missed' : 'completed',
    durationSec, callData.transcript || '', callData.call_analysis?.call_summary || '',
    outcome, callData.recording_url || '', reason, new Date().toISOString()
  );

  // Download recording immediately (10-min expiry!)
  let recordingPath = null;
  if (callData.recording_url) {
    recordingPath = await downloadRecording(callData.call_id, callData.recording_url);
    if (recordingPath) {
      db.prepare('UPDATE calls SET recording_path = ? WHERE call_id = ?').run(recordingPath, callData.call_id);
    }
  }

  if (isMissed) {
    // SPEED-TO-LEAD: Send instant SMS with full menu
    const smsBody = buildMissedCallSMS(client);
    await sendSMS(callData.from_number, smsBody, client.phone_number, db, client.id);

    // Log SMS
    db.prepare(`
      INSERT INTO messages (id, client_id, phone, direction, body, status, created_at)
      VALUES (?, ?, ?, 'outbound', ?, 'sent', ?)
    `).run(randomUUID(), client.id, callData.from_number, smsBody, new Date().toISOString());

    // Upsert lead
    db.prepare(`
      INSERT INTO leads (id, client_id, phone, source, stage, last_contact, created_at, updated_at)
      VALUES (?, ?, ?, 'missed_call', 'new', ?, ?, ?)
      ON CONFLICT(client_id, phone) DO UPDATE SET
        last_contact = excluded.last_contact,
        updated_at = excluded.updated_at
    `).run(randomUUID(), client.id, callData.from_number, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());

    // Notify owner
    if (client.telegram_chat_id) {
      await sendTelegram(client.telegram_chat_id,
        `\ud83d\udcf4 **Missed call** from ${callData.from_number}\n\u23f1\ufe0f ${durationSec}s (hung up)\n\ud83d\udce4 Auto-text sent with booking link.\n\n\ud83d\udcac Reply to this message to text them back.`
      );
    }
  } else {
    // Normal call completed
    if (client.telegram_chat_id) {
      const emoji = outcome === 'booked' ? '\u2705' : '\ud83d\udcde';
      let text = `${emoji} **Call Completed**\n\n\ud83d\udc64 From: ${callData.from_number}\n\u23f1\ufe0f Duration: ${durationSec}s\n\ud83c\udfaf Outcome: ${outcome.toUpperCase()}\n\n\ud83d\udcdd Summary: ${callData.call_analysis?.call_summary || 'No summary'}`;
      
      const buttons = [];
      if (callData.transcript) {
        buttons.push([{ text: '\ud83d\udcc4 View Transcript', callback_data: `transcript:${callData.call_id}` }]);
      }
      if (recordingPath) {
        buttons.push([{ text: '\ud83d\udd0a Download Recording', callback_data: `recording:${callData.call_id}` }]);
      }
      buttons.push([{ text: '\ud83d\udcac Reply via SMS', callback_data: `reply_prompt:${callData.from_number}` }]);
      
      await sendTelegram(client.telegram_chat_id, text, { reply_markup: { inline_keyboard: buttons } });
    }
  }
}

async function handleCallAnalyzed(callData) {
  const db = getDb();
  db.prepare(`
    UPDATE calls SET 
      transcript = ?,
      summary = ?,
      outcome = ?
    WHERE call_id = ?
  `).run(
    callData.transcript || '',
    callData.call_analysis?.call_summary || '',
    callData.call_analysis?.calcom_booking_id ? 'booked' : 'completed',
    callData.call_id
  );
}

function downloadRecording(callId, url) {
  return new Promise((resolve) => {
    const filePath = path.join(RECORDINGS_DIR, `${callId}.wav`);
    const file = fs.createWriteStream(filePath);
    
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filePath);
      });
    }).on('error', () => {
      resolve(null);
    });
    
    // Timeout after 30s
    setTimeout(() => resolve(null), 30000);
  });
}

module.exports = {
  handleCallStarted,
  handleCallEnded,
  handleCallAnalyzed
};
