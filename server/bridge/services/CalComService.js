const fetch = require('node-fetch');

class CalComService {
  constructor() {
    this.apiKey = process.env.CALCOM_API_KEY;
    this.baseUrl = 'https://api.cal.com/v1';
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async checkAvailability(date) {
    try {
      // TODO: Implement real Cal.com availability check
      // This is a stub that returns mock slots
      console.log(`[CalCom] Checking availability for ${date}`);
      return {
        available: true,
        slots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']
      };
    } catch (error) {
      console.error('❌ CalCom checkAvailability error:', error.message);
      return { available: false, error: error.message };
    }
  }

  async bookAppointment({ name, email, date, time, phoneNumber }) {
    try {
      console.log(`[CalCom] Booking appointment for ${name} on ${date} at ${time}`);
      // TODO: Implement real Cal.com booking
      // Return mock success for now
      return {
        success: true,
        confirmationId: `CAL-${Date.now()}`,
        scheduledAt: `${date}T${time}:00Z`,
        message: 'Appointment booked successfully'
      };
    } catch (error) {
      console.error('❌ CalCom bookAppointment error:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

module.exports = new CalComService();
