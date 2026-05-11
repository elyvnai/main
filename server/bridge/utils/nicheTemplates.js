/**
 * Build the FULL MENU speed-to-lead SMS
 * Includes: booking link, callback number, hours, URGENT option, opt-out
 */
function buildMissedCallSMS(client) {
  const biz = client.business_name || 'us';
  const bookingLink = client.calcom_booking_link || '';
  const transferPhone = client.transfer_phone || '';
  const hours = client.business_hours || 'Mon-Fri 9AM-6PM';
  
  let sms = `Sorry we missed your call from ${biz}!\n\n`;
  
  if (bookingLink) {
    sms += `📅 Book instantly: ${bookingLink}\n`;
  }
  
  if (transferPhone) {
    sms += `📞 Call back: ${transferPhone}\n`;
  }
  
  sms += `⏰ Hours: ${hours}\n\n`;
  sms += `💬 Reply URGENT and we'll call you back within 2 minutes.\n\n`;
  sms += `Reply STOP to opt out.`;
  
  return sms;
}

/**
 * Simple text-back for non-missed calls (voicemail, etc.)
 */
function buildTextBack(client) {
  return `Hi! Sorry we missed your call. How can we help you today? — ${client.business_name || 'Our team'}`;
}

module.exports = {
  buildMissedCallSMS,
  buildTextBack
};
