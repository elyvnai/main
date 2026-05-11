const fetch = require('node-fetch');

class CalComService {
    constructor() {
        this.apiKey = process.env.CALCOM_API_KEY;
        this.eventTypeId = process.env.CALCOM_EVENT_TYPE_ID;
        this.baseUrl = 'https://api.cal.com/v1';
    }

    /**
     * Check available appointment slots for a specific date
     * @param {string} date - Date in YYYY-MM-DD format
     * @returns {Promise<string>} Available slots or error message
     */
    async checkAvailability(date) {
        try {
            if (!this.apiKey || !this.eventTypeId) {
                console.warn('⚠️ CALCOM_API_KEY or CALCOM_EVENT_TYPE_ID is not set.');
                return 'Availability check is currently unavailable. Please try again later or use our booking link.';
            }

            const startTime = `${date}T00:00:00Z`;
            const endTime = `${date}T23:59:59Z`;
            
            const url = `${this.baseUrl}/slots?apiKey=${this.apiKey}&eventTypeId=${this.eventTypeId}&startTime=${startTime}&endTime=${endTime}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();

            if (!response.ok) {
                console.error('❌ Cal.com checkAvailability error:', data);
                return `Unable to check availability at this time. Please try our booking link or request a callback.`;
            }

            if (data.error) {
                console.error('❌ Cal.com checkAvailability API error:', data.error);
                return `Error: ${data.error.message || 'Unknown error occurred'}`;
            }

            const slots = data.slots?.[date] || [];
            
            if (slots.length === 0) {
                return `No available slots for ${date}. Please try another date or use our booking link.`;
            }

            const availableTimes = slots.map(slot => {
                const timeDate = new Date(slot.time);
                return timeDate.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                });
            });

            return `We have ${slots.length} available slot${slots.length > 1 ? 's' : ''} on ${date}: ${availableTimes.join(', ')}. Which time works best for you?`;
        } catch (error) {
            console.error('❌ Cal.com checkAvailability exception:', error.message);
            return 'Failed to check availability due to a technical issue. Please try our booking link or request a callback.';
        }
    }

    /**
     * Book an appointment for a customer
     * @param {Object} bookingData - Booking details
     * @param {string} bookingData.name - Customer name
     * @param {string} bookingData.email - Customer email
     * @param {string} bookingData.date - Date in YYYY-MM-DD format
     * @param {string} bookingData.time - Time in HH:mm format
     * @param {string} [bookingData.phoneNumber] - Customer phone number
     * @returns {Promise<{success: boolean, message?: string, booking?: Object, scheduledAt?: string}>}
     */
    async bookAppointment(bookingData) {
        try {
            if (!this.apiKey || !this.eventTypeId) {
                console.warn('⚠️ CALCOM_API_KEY or CALCOM_EVENT_TYPE_ID is not set.');
                return { success: false, message: 'Booking is currently unavailable. Please use our booking link.' };
            }

            if (!bookingData.name || !bookingData.email || !bookingData.date || !bookingData.time) {
                return { success: false, message: 'Missing required booking information: name, email, date, and time are required.' };
            }

            const dateTime = new Date(`${bookingData.date}T${bookingData.time}:00Z`);
            if (isNaN(dateTime.getTime())) {
                return { success: false, message: 'Invalid date or time format. Please provide date in YYYY-MM-DD and time in HH:mm format.' };
            }

            const response = await fetch(`${this.baseUrl}/bookings?apiKey=${this.apiKey}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    eventTypeId: parseInt(this.eventTypeId),
                    start: dateTime.toISOString(),
                    responses: {
                        name: bookingData.name,
                        email: bookingData.email,
                        location: {
                            type: 'phone',
                            value: bookingData.phoneNumber || ''
                        }
                    },
                    metadata: {
                        source: 'ai-assistant',
                        phoneNumber: bookingData.phoneNumber || ''
                    },
                    timeZone: 'UTC'
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('❌ Cal.com bookAppointment error:', data);
                const errorMessage = data.message || data.error?.message || 'Failed to book appointment. Please try using our booking link.';
                return { success: false, message: errorMessage };
            }

            const scheduledAt = new Date(data.start || dateTime).toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZoneName: 'short'
            });

            return { 
                success: true, 
                booking: data,
                scheduledAt: scheduledAt,
                confirmationId: data.id
            };
        } catch (error) {
            console.error('❌ Cal.com bookAppointment exception:', error.message);
            return { success: false, message: 'Failed to book appointment due to a technical error. Please try our booking link.' };
        }
    }

    /**
     * Cancel an existing booking
     * @param {string} bookingId - The booking ID to cancel
     * @returns {Promise<{success: boolean, message?: string}>}
     */
    async cancelBooking(bookingId) {
        try {
            if (!this.apiKey) {
                return { success: false, message: 'Booking cancellation is unavailable.' };
            }

            const response = await fetch(`${this.baseUrl}/bookings/${bookingId}?apiKey=${this.apiKey}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const data = await response.json();
                return { success: false, message: data.message || 'Failed to cancel booking.' };
            }

            return { success: true, message: 'Booking cancelled successfully.' };
        } catch (error) {
            console.error('❌ Cal.com cancelBooking exception:', error.message);
            return { success: false, message: 'Failed to cancel booking due to a technical error.' };
        }
    }
}

module.exports = new CalComService();