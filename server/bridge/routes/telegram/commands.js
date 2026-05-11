const { getDb } = require('../../utils/dbAdapter');
const { sendMessage: sendTelegram } = require('../../utils/telegram');
const { sendSMS } = require('../../utils/sms');
const { randomUUID } = require('crypto');

async function handleCommand(db, chatId, text, firstName, username) {
  const parts = text.split(' ');
  const command = parts[0].toLowerCase();
  
  // Find client by telegram_chat_id
  const client = db.prepare('SELECT * FROM clients WHERE telegram_chat_id = ?').get(chatId);
  
  switch (command) {
    case '/start':
      return handleStart(db, chatId, parts[1], firstName);
    
    case '/status':
      if (!client) return 'Not linked. Use /start <token>';
      return handleStatus(db, client);
    
    case '/calls':
      if (!client) return 'Not linked. Use /start <token>';
      return handleCalls(db, client);
    
    case '/pause':
      if (!client) return 'Not linked. Use /start <token>';
      db.prepare('UPDATE clients SET ai_enabled = 0 WHERE id = ?').run(client.id);
      return '🔴 AI paused — calls will ring through to you. Use /resume to turn it back on.';
    
    case '/resume':
      if (!client) return 'Not linked. Use /start <token>';
      db.prepare('UPDATE clients SET ai_enabled = 1 WHERE id = ?').run(client.id);
      return '🟢 AI resumed — I\'m back on duty.';
    
    case '/reply':
      if (!client) return 'Not linked. Use /start <token>';
      if (parts.length < 3) return 'Usage: /reply <phone> <message>';
      const phone = parts[1];
      const message = parts.slice(2).join(' ');
      await sendSMS(phone, message, client.phone_number, db, client.id);
      return `✅ Sent to ${phone}:\n"${message}"`;
    
    default:
      return 'Unknown command. Available: /start, /status, /calls, /pause, /resume, /reply';
  }
}

async function handleStart(db, chatId, token, firstName) {
  if (!token) {
    return 'Welcome! Please use the link provided by your admin to connect your business.';
  }
  
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(token);
  if (!client) {
    return 'Invalid link. Ask your admin for a new onboarding link.';
  }
  
  db.prepare('UPDATE clients SET telegram_chat_id = ? WHERE id = ?').run(chatId, token);
  
  return `Hey ${firstName || 'there'}! 👋 You're all set.\n\n`
    + `**${client.business_name}** is now connected to Elyvn.\n\n`
    + `Here's what happens:\n`
    + `• Every call gets answered automatically\n`
    + `• Missed calls get a text back in under 60 seconds\n`
    + `• You get a notification here for every call and message\n\n`
    + `**You don't need to do anything.** Just watch the notifications come in.\n\n`
    + `Type /status to see your dashboard.`;
}

async function handleStatus(db, client) {
  const today = new Date().toISOString().split('T')[0];
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN outcome = 'booked' THEN 1 ELSE 0 END) as booked,
      SUM(CASE WHEN outcome = 'missed' THEN 1 ELSE 0 END) as missed
    FROM calls 
    WHERE client_id = ? AND date(created_at) = ?
  `).get(client.id, today);
  
  let text = `📊 **${client.business_name}**\n\n`;
  text += `**Today**\n`;
  text += `Calls: ${stats.total || 0}`;
  if (stats.booked) text += ` (${stats.booked} booked)`;
  if (stats.missed) text += ` (${stats.missed} missed)`;
  text += `\n\n`;
  text += client.ai_enabled !== 0 ? '🟢 AI is active' : '🔴 AI is paused';
  
  const buttons = [
    [{ text: '📞 Calls', callback_data: 'quick:calls' }],
    [{ text: client.ai_enabled !== 0 ? '⏸ Pause AI' : '▶️ Resume AI', 
       callback_data: client.ai_enabled !== 0 ? 'quick:pause' : 'quick:resume' }]
  ];
  
  return { text, buttons };
}

async function handleCalls(db, client) {
  const calls = db.prepare(`
    SELECT * FROM calls 
    WHERE client_id = ? 
    ORDER BY created_at DESC 
    LIMIT 5
  `).all(client.id);
  
  if (!calls || calls.length === 0) {
    return '📜 No calls yet.';
  }
  
  let text = '📜 **Recent Calls**\n\n';
  const buttons = [];
  
  for (const c of calls) {
    const phone = c.caller_phone || 'Unknown';
    const duration = c.duration ? `${Math.floor(c.duration/60)}m ${c.duration%60}s` : '0s';
    const outcome = c.outcome || 'unknown';
    const emoji = outcome === 'booked' ? '✅' : outcome === 'missed' ? '❌' : outcome === 'voicemail' ? '📩' : '📞';
    const date = c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Unknown';
    
    text += `${emoji} ${date} | ${phone} | ${duration} | ${outcome.toUpperCase()}\n`;
    
    if (c.call_id) {
      buttons.push([{ 
        text: `📄 ${phone.slice(-4)} — ${outcome}`, 
        callback_data: `transcript:${c.call_id}` 
      }]);
    }
  }
  
  return { text, buttons };
}

module.exports = { handleCommand };
