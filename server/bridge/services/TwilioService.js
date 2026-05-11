const twilio = require('twilio');
const { getDb } = require('../utils/dbAdapter');

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this._client = null;
  }

  get client() {
    if (!this._client && this.accountSid && this.authToken) {
      this._client = twilio(this.accountSid, this.authToken);
    }
    return this._client;
  }

  async sendSMS(to, body, clientId = null) {
    // Check opt-out if clientId provided
    if (clientId) {
      const db = getDb();
      const { rows } = await db.query('SELECT 1 FROM sms_opt_outs WHERE phone = $1 AND client_id = $2', [to, clientId]);
      if (rows.length > 0) {
        console.log(`[SMS] Blocked: ${to} is opted out for client ${clientId}`);
        return { success: false, error: 'Opted out' };
      }
    }

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

  async sendFullMenuSMS(to, clientId = null) {
    const body = `Hi! 👋\n\nWe missed you! Here's how to connect:\n\n📅 BOOK APPOINTMENT\n${process.env.BOOKING_LINK || 'Not configured'}\n\n⏰ OUR HOURS\n${process.env.BUSINESS_HOURS || 'Not configured'}\n\n📞 REQUEST CALLBACK\nReply CALLBACK - we'll call you within 1hr\n\n⚡ URGENT?\nReply URGENT - we'll prioritize you\n\n💬 GENERAL QUESTION?\nJust reply and we'll respond\n\nDirect: ${this.phoneNumber || 'Not configured'}\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body, clientId);
  }

  async sendCallbackConfirmation(to, clientId = null) {
    const body = `Thanks! A team member will call you back within the next hour.\n\nIf you need immediate assistance, call us at ${this.phoneNumber || 'Not configured'}.\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body, clientId);
  }

  async sendUrgentAcknowledgment(to, clientId = null) {
    const body = `Your request has been marked URGENT. A team member will prioritize your call and reach out immediately.\n\nFor instant help, call us at ${this.phoneNumber || 'Not configured'}.\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body, clientId);
  }

  async sendAppointmentConfirmation(to, { date, time, confirmationId }, clientId = null) {
    const body = `📅 Appointment Confirmed!\n\nDate: ${date}\nTime: ${time}\n${confirmationId ? `Confirmation: ${confirmationId}\n` : ''}Need to reschedule? Visit: ${process.env.BOOKING_LINK || 'Not configured'}\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body, clientId);
  }

  async sendWelcomeSMS(to, clientId = null) {
    const body = `Welcome! 🎉\n\nThank you for reaching out. We're here to help!\n\n📅 Book online: ${process.env.BOOKING_LINK || 'Not configured'}\n⏰ Hours: ${process.env.BUSINESS_HOURS || 'Not configured'}\n📞 Call/Text: ${this.phoneNumber || 'Not configured'}\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body, clientId);
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
