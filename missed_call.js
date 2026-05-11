function formatMissedCall(call, client) {
  const phone = call.caller_phone || 'Unknown';
  const duration = call.duration || 0;
  
  let text = `\ud83d\udcf5 **Missed Call**\n\n`;
  text += `\ud83d\udc64 From: ${phone}\n`;
  text += `\u23f1 Duration: ${duration}s (hung up)\n`;
  text += `\ud83d\ude80 Speed-to-Lead: Instant SMS sent!\n\n`;
  text += `\ud83d\udce4 SMS sent: "Sorry we missed your call! Book instantly: ${client.calcom_booking_link || '[link]'}... Reply URGENT for a callback."`;
  
  const buttons = [
    [{ text: '\ud83d\udcde Call Back Now', callback_data: `call_back:${phone}` }],
    [{ text: '\ud83d\udcac Send Custom Text', callback_data: `reply_prompt:${phone}` }]
  ];
  
  return { text, buttons };
}
