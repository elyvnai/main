function formatCallHistory(calls, client) {
  if (!calls || calls.length === 0) {
    return '📜 No calls yet.';
  }
  
  let text = '📜 **Recent Calls**\n\n';
  
  for (const c of calls) {
    const phone = c.caller_phone || 'Unknown';
    const duration = c.duration ? `${Math.floor(c.duration/60)}m ${c.duration%60}s` : '0s';
    const outcome = c.outcome || 'unknown';
    const emoji = outcome === 'booked' ? '✅' : outcome === 'missed' ? '❌' : outcome === 'voicemail' ? '📩' : '📞';
    const date = c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Unknown';
    
    text += `${emoji} ${date} | ${phone} | ${duration} | ${outcome.toUpperCase()}\n`;
  }
  
  const buttons = calls
    .filter(c => c.call_id)
    .map(c => [{
      text: `📄 ${c.caller_phone?.slice(-4) || '????'} — ${c.outcome}`,
      callback_data: `transcript:${c.call_id}`
    }]);
  
  return { text, buttons };
}

module.exports = { formatCallHistory };
