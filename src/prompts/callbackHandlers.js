/**
 * Telegram Inline Callback Handlers
 */

// transcript:<call_id>
async function handleTranscriptCallback(db, callId, chatId) {
  const call = await db.get('SELECT transcript, caller_phone FROM calls WHERE call_id = ?', [callId]);
  if (!call || !call.transcript) {
    return 'Transcript not available.';
  }
  return `📝 **Transcript — ${call.caller_phone || 'Unknown'}**\n\n${call.transcript}`;
}

// recording:<call_id>
async function handleRecordingCallback(db, callId, chatId, telegramService) {
  const call = await db.get('SELECT recording_url, caller_phone FROM calls WHERE call_id = ?', [callId]);
  if (!call || !call.recording_url) {
    return 'Recording not available.';
  }
  
  // Use TelegramService to send audio
  if (telegramService && telegramService.sendAudio) {
      await telegramService.sendAudio(call.recording_url, `🔊 Recording — ${call.caller_phone || 'Unknown'}`);
      return null;
  }
  
  return 'Recording found, but Telegram service is unavailable to send it.';
}

// reply_prompt:<phone>
async function handleReplyPrompt(db, phone, chatId) {
  return `💬 Reply to this message to send an SMS to ${phone}:`;
}

// mark_booked:<phone>
async function handleMarkBooked(db, phone, clientId) {
  // Use 'leads' or 'clients' or 'calls' depending on schema. 
  // Based on prompt:
  await db.run("UPDATE leads SET stage = 'booked' WHERE phone = ? AND client_id = ?", [phone, clientId]);
  return `✅ ${phone} marked as booked.`;
}

module.exports = {
  handleTranscriptCallback,
  handleRecordingCallback,
  handleReplyPrompt,
  handleMarkBooked
};
