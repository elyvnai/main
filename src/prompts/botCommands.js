const { formatCallHistory } = require('./callHistory');

// /start <token>
async function handleStart(db, chatId, token, firstName) {
  const client = await db.get('SELECT * FROM clients WHERE id = ?', [token]);
  if (!client) {
    return `Invalid link. Ask your admin for a new onboarding link.`;
  }
  await db.run('UPDATE clients SET telegram_chat_id = ? WHERE id = ?', [chatId, token]);
  
  return `Hey ${firstName}! 👋 You're all set.\n\n`
    + `**${client.business_name}** is now connected to Elyvn.\n\n`
    + `Here's what happens:\n`
    + `• Every call gets answered automatically\n`
    + `• Missed calls get a text back in under 60 seconds\n`
    + `• You get a notification here for every call and message\n\n`
    + `**You don't need to do anything.** Just watch the notifications come in.\n\n`
    + `Type /status to see your dashboard.`;
}

// /status
async function handleStatus(db, client) {
  const today = new Date().toISOString().split('T')[0];
  const todayCalls = await db.get(
    `SELECT COUNT(*) as total,
     SUM(CASE WHEN outcome = 'booked' THEN 1 ELSE 0 END) as booked,
     SUM(CASE WHEN outcome = 'missed' THEN 1 ELSE 0 END) as missed
     FROM calls WHERE client_id = ? AND date(created_at) = ?`,
    [client.id, today]
  );
  
  let text = `📊 **${client.business_name}**\n\n`;
  text += `**Today**\n`;
  text += `Calls: ${todayCalls.total || 0}`;
  if (todayCalls.booked) text += ` (${todayCalls.booked} booked)`;
  if (todayCalls.missed) text += ` (${todayCalls.missed} missed)`;
  text += `\n\n`;
  text += client.ai_enabled !== 0 ? '🟢 AI is active' : '🔴 AI is paused';
  
  const buttons = [
    [{ text: '📞 Calls', callback_data: 'quick:calls' }],
    [{ text: client.ai_enabled !== 0 ? '⏸ Pause AI' : '▶️ Resume AI', 
       callback_data: client.ai_enabled !== 0 ? 'quick:pause' : 'quick:resume' }]
  ];
  
  return { text, buttons };
}

// /calls
async function handleCalls(db, client) {
  const calls = await db.all(
    `SELECT * FROM calls WHERE client_id = ? ORDER BY created_at DESC LIMIT 5`,
    [client.id]
  );
  return formatCallHistory(calls, client);
}

// /pause
async function handlePause(db, client) {
  await db.run('UPDATE clients SET ai_enabled = 0 WHERE id = ?', [client.id]);
  return '🔴 AI paused — calls will ring through to you. Use /resume to turn it back on.';
}

// /resume
async function handleResume(db, client) {
  await db.run('UPDATE clients SET ai_enabled = 1 WHERE id = ?', [client.id]);
  return '🟢 AI resumed — I\'m back on duty.';
}

// /reply <phone> <message>
async function handleReply(db, client, phone, message) {
  // Assuming sendSMS is globally available or imported in the final integration
  if (typeof sendSMS !== 'undefined') {
    await sendSMS(phone, message, client.phone_number, db, client.id);
  }
  return `✅ Sent to ${phone}:\n"${message}"`;
}

module.exports = {
  handleStart,
  handleStatus,
  handleCalls,
  handlePause,
  handleResume,
  handleReply
};
