const { randomUUID } = require('crypto');
const TwilioService = require('../../services/TwilioService');

async function handleCommand(db, chatId, text, firstName, username, client) {
  const parts = text.split(' ');
  const command = parts[0].toLowerCase();
  
  if (!client && command !== '/start') return 'Not linked. Use /start <token>';

  switch (command) {
    case '/start':
      return await handleStart(db, chatId, parts[1], firstName);

    case '/status':
      return await handleStatus(db, client);

    case '/calls':
      return await handleCalls(db, client);

    case '/pause':
      await db.query('UPDATE clients SET ai_enabled = 0 WHERE id = $1', [client.id]);
      return '⏸️ AI paused. Use /resume to turn back on.';

    case '/resume':
      await db.query('UPDATE clients SET ai_enabled = 1 WHERE id = $1', [client.id]);
      return '▶️ AI resumed.';

    case '/reply':
      if (parts.length < 3) return 'Usage: /reply <phone> <message>';
      const phone = TwilioService.normalizePhoneNumber(parts[1]);
      const message = parts.slice(2).join(' ');
      const res = await TwilioService.sendSMS(phone, message, client.id);
      if (res.success) {
        await db.query(`
          INSERT INTO messages (id, client_id, phone, direction, body, status, created_at)
          VALUES ($1, $2, $3, 'outbound', $4, 'sent', $5)
        `, [randomUUID(), client.id, phone, message, new Date().toISOString()]);
        return `✅ Sent to ${phone}:\n"${message}"`;
      }
      return `❌ Failed: ${res.error}`;

    default:
      return 'Unknown command. Available: /start, /status, /calls, /pause, /resume, /reply';
  }
}

async function handleStart(db, chatId, token, firstName) {
  if (!token) return 'Welcome! Please use the link provided by your admin to connect your business.';
  // Using direct pool here because we don't have a client ID yet for context
  const { rows: clients } = await db.query('SELECT * FROM clients WHERE id = $1', [token]);
  const client = clients[0];
  if (!client) return 'Invalid link. Ask your admin for a new onboarding link.';
  await db.query('UPDATE clients SET telegram_chat_id = $1 WHERE id = $2', [chatId, token]);
  return `Hey ${firstName || 'there'}! 👋 You're all set.\n\n<b>${client.business_name}</b> is now connected to Elyvn.`;
}

async function handleStatus(db, client) {
  const today = new Date().toISOString().split('T')[0];
  const { rows } = await db.query(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN outcome = 'booked' THEN 1 ELSE 0 END) as booked,
      SUM(CASE WHEN outcome = 'missed' THEN 1 ELSE 0 END) as missed
    FROM calls WHERE client_id = $1 AND DATE(created_at) = $2
  `, [client.id, today]);
  const stats = rows[0];

  let text = `📊 <b>${client.business_name}</b>\n\n<b>Today</b>\n`;
  text += `Calls: ${stats.total || 0}`;
  if (stats.booked) text += ` (${stats.booked} booked)`;
  if (stats.missed) text += ` (${stats.missed} missed)`;
  text += `\n\n${client.ai_enabled ? '🟢 AI is active' : '🔴 AI is paused'}`;

  const buttons = [
    [{ text: '📞 Calls', callback_data: 'quick_calls' }],
    [{ text: client.ai_enabled ? '⏸️ Pause AI' : '▶️ Resume AI',
       callback_data: client.ai_enabled ? 'quick_pause' : 'quick_resume' }]
  ];

  return { text, buttons };
}

async function handleCalls(db, client) {
  const { rows: calls } = await db.query(`
    SELECT * FROM calls WHERE client_id = $1 ORDER BY created_at DESC LIMIT 5
  `, [client.id]);

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
