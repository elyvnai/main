const twilio = require('twilio');

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.businessName = process.env.BUSINESS_NAME || 'Elyvn';
    this.bookingLink = process.env.BOOKING_LINK || '';
    this.businessHours = process.env.BUSINESS_HOURS || '';
    this.transferPhoneNumber = process.env.TRANSFER_PHONE_NUMBER || '';
    this._client = null;
  }

  get client() {
    if (!this._client && this.accountSid && this.authToken) {
      this._client = twilio(this.accountSid, this.authToken);
    }
    return this._client;
  }

  async sendSMS(to, body) {
    if (!this.client) {
      console.warn('⚠️ Twilio not configured, SMS not sent');
      return { success: false, error: 'Twilio not configured' };
    }
    try {
      const message = await this.client.messages.create({
        body,
        from: this.phoneNumber,
        to
      });
      console.log(`📤 SMS sent to ${to}: ${message.sid}`);
      return { success: true, sid: message.sid, status: message.status };
    } catch (error) {
      console.error('❌ Twilio sendSMS error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendFullMenuSMS(to) {
    const body = `Hi from ${this.businessName}! 👋\n\nWe missed you! Here's how to connect:\n\n📅 BOOK APPOINTMENT\n${this.bookingLink}\n\n⏰ OUR HOURS\n${this.businessHours}\n\n📞 REQUEST CALLBACK\nReply CALLBACK - we'll call you within 1hr\n\n⚡ URGENT?\nReply URGENT - we'll prioritize you\n\n💬 GENERAL QUESTION?\nJust reply and we'll respond\n\nDirect: ${this.phoneNumber}\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body);
  }

  async sendCallbackConfirmation(to) {
    const body = `Thanks! A team member from ${this.businessName} will call you back within the next hour.\n\nIf you need immediate assistance, call us at ${this.phoneNumber}.\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body);
  }

  async sendUrgentAcknowledgment(to) {
    const body = `Your request has been marked URGENT. A team member from ${this.businessName} will prioritize your call and reach out immediately.\n\nFor instant help, call us at ${this.phoneNumber}.\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body);
  }

  async sendAppointmentConfirmation(to, { date, time, confirmationId }) {
    const body = `📅 Appointment Confirmed with ${this.businessName}!\n\nDate: ${date}\nTime: ${time}\n${confirmationId ? `Confirmation: ${confirmationId}\n` : ''}Need to reschedule? Visit: ${this.bookingLink}\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body);
  }

  async sendWelcomeSMS(to) {
    const body = `Welcome to ${this.businessName}! 🎉\n\nThank you for reaching out. We're here to help!\n\n📅 Book online: ${this.bookingLink}\n⏰ Hours: ${this.businessHours}\n📞 Call/Text: ${this.phoneNumber}\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body);
  }

  normalizePhoneNumber(phone) {
    if (!phone) return null;
    let normalized = phone.replace(/[^\d+]/g, '');
    if (normalized.length === 10) normalized = '+1' + normalized;
    else if (normalized.length === 11 && normalized.startsWith('1')) normalized = '+' + normalized;
    else if (!normalized.startsWith('+')) normalized = '+' + normalized;
    return normalized;
  }
}

module.exports = new TwilioService();
