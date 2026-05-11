function formatInboundSMS(message, client) {
  const phone = message.phone || 'Unknown';
  const body = message.body || '';
  
  let text = `\ud83d\udcac **New Message from ${phone}**\n\n`;
  text += `"${body}"\n\n`;
  text += `_Reply to this message to text them back._`;
  
  const buttons = [
    [{ text: '\ud83d\udcde Call them', callback_data: `call_back:${phone}` }],
    [{ text: '\u2705 Mark booked', callback_data: `mark_booked:${phone}` }]
  ];
  
  return { text, buttons };
}
