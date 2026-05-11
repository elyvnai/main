const { getDb } = require('../../utils/dbAdapter');
const TelegramService = require('../../services/TelegramService');
const TwilioService = require('../../services/TwilioService');
const { randomUUID } = require('crypto');

async function handleCommand(db, chatId, text, firstName, username) {
  const parts = text.split(' ');
  const command = parts[0].toLowerCase();

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
      TelegramService.paused = true;
      return '⏸️ Notifications paused. Use /resume to turn back on.';

    case '/resume':
      if (!client) return 'Not linked. Use /start <token>';
      TelegramService.paused = false;
      return '▶️ Notifications resumed.';

    case '/reply':
      if (!client) return 'Not linked. Use /start <token>';
      if (parts.length < 3) return 'Usage: /reply <phone> <message>';
      const phone = TwilioService.normalizePhoneNumber(parts[1]);
      const message = parts.slice(2).join(' ');
      const res = await TwilioService.sendSMS(phone, message);
      if (res.success) {
        db.prepare(`
          INSERT INTO messages (id, client_id, phone, direction, body, status, created_at)
          VALUES (?, ?, ?, 'outbound', ?, 'sent', ?)
        `).run(randomUUID(), client.id, phone, message, new Date().toISOString());
        return `✅ Sent to ${phone}:\n"${message}"`;
      }
      return `❌ Failed: ${res.error}`;

    default:
      return 'Unknown command. Available: /start, /status, /calls, /pause, /resume, /reply';
  }
}

async function handleStart(db, chatId, token, firstName) {
  if (!token) {
    return 'Welcome! Please use the link provided by your admin to connect your business.';
  }
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(token);
  if (!client) return 'Invalid link. Ask your admin for a new onboarding link.';
  
  db.prepare('UPDATE clients SET telegram_chat_id = ? WHERE id = ?').run(chatId, token);
  
  return `Hey ${firstName || 'there'}! 👋 You're all set.\n\n<b>${client.business_name}</b> is now connected to Elyvn.\n\nEvery call gets answered automatically. Missed calls get a text back in under 60 seconds. You get a notification here for every call and message.\n\nType /status to see your dashboard.`;
}

async function handleStatus(db, client) {
  const today = new Date().toISOString().split('T')[0];
  const stats = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN outcome = 'booked' THEN 1 ELSE 0 END) as booked,
      SUM(CASE WHEN outcome = 'missed' THEN 1 ELSE 0 END) as missed
    FROM calls WHERE client_id = ? AND date(created_at) = ?
  `).get(client.id, today);

  let text = `📊 <b>${client.business_name}</b>\n\n<b>Today</b>\n`;
  text += `Calls: ${stats.total || 0}`;
  if (stats.booked) text += ` (${stats.booked} booked)`;
  if (stats.missed) text += ` (${stats.missed} missed)`;
  text += `\n\n${TelegramService.paused ? '🔴 AI is paused' : '🟢 AI is active'}`;

  const buttons = [
    [{ text: '📞 Calls', callback_data: 'quick_calls' }],
    [{ text: TelegramService.paused ? '▶️ Resume AI' : '⏸️ Pause AI',
       callback_data: TelegramService.paused ? 'quick_resume' : 'quick_pause' }]
  ];

  return { text, buttons };
}

async function handleCalls(db, client) {
  const calls = db.prepare(`
    SELECT * FROM calls WHERE client_id = ? ORDER BY created_at DESC LIMIT 5
  `).all(client.id);

  if (!calls || calls.length === 0) return '📜 No calls yet.';

  let text = '📜 <b>Recent Calls</b>\n\n';
  const buttons = [];

  for (const c of calls) {
    const phone = c.caller_phone || 'Unknown';
    const duration = c.duration ? `${Math.floor(c.duration / 60)}m ${c.duration % 60}s` : '0s';
    const outcome = c.outcome || 'unknown';
    const emoji = outcome === 'booked' ? '✅' : outcome === 'missed' ? '❌' : '📞';
    
    text += `${emoji} ${phone} — ${duration} — ${outcome.toUpperCase()}\n`;
    
    if (c.call_id) {
      buttons.push([{ text: `📄 ${phone.slice(-4)} — ${outcome}`,
        callback_data: `transcript_${c.call_id}` }]);
    }
  }

  return { text, buttons };
}

module.exports = { handleCommand };
