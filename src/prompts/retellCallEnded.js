const crypto = require('crypto');

/**
 * Retell Call Ended Webhook Handler
 */
async function handleCallEnded(db, call, services = {}) {
  const { telegram, sendSMS, buildMissedCallSMS, downloadRecording, formatCompletedCall } = services;
  
  const callId = call.call_id;
  const durationSec = Math.round((call.duration_ms || 0) / 1000);
  const reason = call.disconnection_reason || '';
  
  // Find client
  const client = await db.get('SELECT * FROM clients WHERE retell_agent_id = ?', [call.agent_id]);
  if (!client) return;
  
  // Determine if missed
  const isMissed = (
    durationSec < 10 ||
    reason === 'voicemail_reached' ||
    reason === 'no_answer' ||
    reason === 'busy'
  );
  
  const outcome = isMissed ? 'missed' : (call.call_analysis?.calcom_booking_id ? 'booked' : 'completed');
  
  // Insert/update call
  await db.run(
    `INSERT INTO calls (id, call_id, client_id, caller_phone, status, duration, transcript, 
      summary, outcome, recording_url, disconnection_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(call_id) DO UPDATE SET
       duration = excluded.duration,
       status = excluded.status,
       outcome = excluded.outcome,
       transcript = excluded.transcript,
       summary = excluded.summary,
       recording_url = excluded.recording_url,
       disconnection_reason = excluded.disconnection_reason`,
    [
      crypto.randomUUID(), callId, client.id, call.from_number,
      isMissed ? 'missed' : 'completed',
      durationSec, call.transcript || '', call.call_analysis?.call_summary || '',
      outcome, call.recording_url || '', reason, new Date().toISOString()
    ]
  );
  
  // Download recording immediately (10-min expiry!)
  if (call.recording_url && downloadRecording) {
    const recordingPath = await downloadRecording(callId, call.recording_url);
    await db.run('UPDATE calls SET recording_path = ? WHERE call_id = ?', [recordingPath, callId]);
  }
  
  if (isMissed) {
    // Trigger speed-to-lead SMS
    const smsBody = buildMissedCallSMS ? buildMissedCallSMS(client) : `Sorry we missed your call! Book here: ${client.calcom_booking_link}`;
    
    if (sendSMS) {
        await sendSMS(call.from_number, smsBody, client.phone_number, db, client.id);
    }
    
    // Log SMS
    await db.run(
      `INSERT INTO messages (id, client_id, phone, direction, body, status, created_at)
       VALUES (?, ?, ?, 'outbound', ?, 'sent', ?)`,
      [crypto.randomUUID(), client.id, call.from_number, smsBody, new Date().toISOString()]
    );
    
    // Upsert lead
    await db.run(
      `INSERT INTO leads (id, client_id, phone, source, stage, created_at, updated_at)
       VALUES (?, ?, ?, 'missed_call', 'new', ?, ?)
       ON CONFLICT(client_id, phone) DO UPDATE SET
         last_contact = excluded.last_contact,
         updated_at = excluded.updated_at`,
      [crypto.randomUUID(), client.id, call.from_number, new Date().toISOString(), new Date().toISOString()]
    );
    
    // Notify owner
    if (telegram && telegram.sendMessage) {
        await telegram.sendMessage(client.telegram_chat_id,
          `\ud83d\udcf4 **Missed call** from ${call.from_number}\n\u23f1\ufe0f ${durationSec}s (hung up)\n\ud83d\udce4 Auto-text sent with booking link.`
        );
    }
  } else {
    // Normal call completed
    if (telegram && telegram.sendMessage) {
        const messageText = formatCompletedCall 
            ? formatCompletedCall({...call, duration: durationSec, outcome}, client)
            : `\u2705 **Call Completed** from ${call.from_number} (${durationSec}s). Outcome: ${outcome}`;
            
        await telegram.sendMessage(client.telegram_chat_id, messageText);
    }
  }
}

module.exports = { handleCallEnded };
