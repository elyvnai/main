const TwilioService = require('./TwilioService');
const TelegramService = require('./TelegramService');

class SpeedToLeadService {
  shouldSendSpeedToLead(callData) {
    const durationSec = callData.duration || 0;
    const reason = callData.disconnectReason || '';
    return (
      durationSec < 10 ||
      reason === 'voicemail_reached' ||
      reason === 'no_answer' ||
      reason === 'busy'
    );
  }

  async handleMissedCall(callData) {
    const phone = callData.phoneNumber;
    if (!phone) return;

    console.log(`[SpeedToLead] Handling missed call from ${phone}`);
    
    // Send speed-to-lead SMS
    await TwilioService.sendFullMenuSMS(phone);
    
    // Notify owner
    await TelegramService.sendMessage(
      `📵 <b>Missed call from ${phone}</b>\n⏱ ${callData.duration}s (hung up)\n📤 Auto-text sent with booking link.\n\n💬 Reply to this message to text them back.`
    );
  }
}

module.exports = new SpeedToLeadService();
