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
     * @returns {Promise<string>} Human-readable availability info or error message
     */
    async checkAvailability(date) {
        try {
            if (!this.apiKey || !this.eventTypeId) {
                console.warn('⚠️ CALCOM_API_KEY or CALCOM_EVENT_TYPE_ID is not set.');
                return 'Appointment scheduling is currently unavailable. Please try our booking link or request a callback.';
            }

            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date)) {
                return 'Please provide the date in YYYY-MM-DD format (e.g., 2024-12-15).';
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
                return 'Unable to check availability at this time. Please try our booking link or request a callback.';
            }

            if (data.error) {
                console.error('❌ Cal.com checkAvailability API error:', data.error);
                return `Error: ${data.error.message || 'Unknown error occurred'}`;
            }

            // Handle different Cal.com API response formats
            let slots = [];
            if (data.slots) {
                slots = data.slots[date] || data.slots;
            } else if (data.availability) {
                slots = data.availability;
            }
            
            if (!Array.isArray(slots) || slots.length === 0) {
                return `No available slots for ${date}. Please try another date, or I can send you our booking link to schedule at your convenience.`;
            }

            const availableTimes = slots.map(slot => {
                const time = slot.time || slot.start || slot;
                const timeDate = new Date(time);
                if (isNaN(timeDate.getTime())) {
                    return time;
                }
                return timeDate.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                });
            });

            const uniqueTimes = [...new Set(availableTimes)];
            return `Great news! We have ${uniqueTimes.length} available slot${uniqueTimes.length > 1 ? 's' : ''} on ${date}: ${uniqueTimes.join(', ')}. Which time works best for you?`;
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
     * @returns {Promise<{success: boolean, message?: string, booking?: Object, scheduledAt?: string, confirmationId?: string}>}
     */
    async bookAppointment(bookingData) {
        try {
            if (!this.apiKey || !this.eventTypeId) {
                console.warn('⚠️ CALCOM_API_KEY or CALCOM_EVENT_TYPE_ID is not set.');
                return { success: false, message: 'Booking is currently unavailable. Please use our booking link.' };
            }

            // Validate required fields
            if (!bookingData.name || !bookingData.email || !bookingData.date || !bookingData.time) {
                return { success: false, message: 'To book an appointment, I need: your name, email, preferred date (YYYY-MM-DD), and time (HH:mm).' };
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(bookingData.email)) {
                return { success: false, message: 'The email address you provided doesn\'t look right. Could you please double-check it?' };
            }

            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(bookingData.date)) {
                return { success: false, message: 'Please provide the date in YYYY-MM-DD format (e.g., 2024-12-15).' };
            }

            // Parse and validate date
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
                        phoneNumber: bookingData.phoneNumber || '',
                        bookedBy: 'EVA AI Assistant'
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
                confirmationId: data.id?.toString() || data.uid
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

    /**
     * Get available dates within a range
     * @param {string} startDate - Start date in YYYY-MM-DD format
     * @param {string} endDate - End date in YYYY-MM-DD format
     * @returns {Promise<{success: boolean, dates?: string[], message?: string}>}
     */
    async getAvailableDates(startDate, endDate) {
        try {
            if (!this.apiKey || !this.eventTypeId) {
                return { success: false, message: 'Availability check is unavailable.' };
            }

            const startTime = `${startDate}T00:00:00Z`;
            const endTime = `${endDate}T23:59:59Z`;
            
            const url = `${this.baseUrl}/slots?apiKey=${this.apiKey}&eventTypeId=${this.eventTypeId}&startTime=${startTime}&endTime=${endTime}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();

            if (!response.ok) {
                return { success: false, message: 'Failed to check availability.' };
            }

            const dates = Object.keys(data.slots || {}).filter(date => {
                const slots = data.slots[date];
                return Array.isArray(slots) && slots.length > 0;
            });

            return { success: true, dates };
        } catch (error) {
            console.error('❌ Cal.com getAvailableDates exception:', error.message);
            return { success: false, message: 'Failed to check availability.' };
        }
    }
}

module.exports = new CalComService();
