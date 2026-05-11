async function handleCallback(db, chatId, data, messageId, client) {
  if (!client) return 'Not linked.';

  if (data.startsWith('transcript_')) {
    const callId = data.split('_')[1];
    const { rows: calls } = await db.query('SELECT * FROM calls WHERE call_id = $1 AND client_id = $2', [callId, client.id]);
    const call = calls[0];
    if (!call) return 'Call not found.';
    
    return `📄 <b>Transcript for ${call.caller_phone}</b>\n\n${call.transcript || 'No transcript available.'}`;
  }

  if (data === 'quick_calls') {
    const { handleCommand } = require('./commands');
    const result = await handleCommand(db, chatId, '/calls', null, null, client);
    return result;
  }

  if (data === 'quick_pause') {
    await db.query('UPDATE clients SET ai_enabled = 0 WHERE id = $1', [client.id]);
    return '⏸️ AI paused.';
  }

  if (data === 'quick_resume') {
    await db.query('UPDATE clients SET ai_enabled = 1 WHERE id = $1', [client.id]);
    return '▶️ AI resumed.';
  }

  return null;
}

module.exports = { handleCallback };
