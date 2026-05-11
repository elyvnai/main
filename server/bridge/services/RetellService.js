const fetch = require('node-fetch');
const { generateSystemPrompt } = require('../prompts/systemPrompt');

class RetellService {
  constructor() {
    this.apiKey = process.env.RETELL_API_KEY;
    this.agentId = process.env.RETELL_AGENT_ID;
    this.baseUrl = 'https://api.retell.ai/v1';
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  getToolDefinitions() {
    const tools = [
      {
        type: 'function',
        name: 'check_availability',
        description: 'Check available appointment slots for a specific date. Use this when a caller wants to schedule an appointment and you need to find open time slots. Ask for the date in YYYY-MM-DD format before calling this tool.',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'The date to check availability for, in YYYY-MM-DD format (e.g., 2024-12-15).'
            }
          },
          required: ['date']
        }
      },
      {
        type: 'function',
        name: 'book_appointment',
        description: 'Book an appointment for a customer. ONLY use this after confirming an available time slot with the caller. Collect all required information (name, email, date, time) before calling this tool.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Full name of the person booking the appointment.' },
            email: { type: 'string', description: 'Email address for confirmation and reminders.' },
            date: { type: 'string', description: 'The date of the appointment in YYYY-MM-DD format.' },
            time: { type: 'string', description: 'The time of the appointment in HH:mm format, 24-hour clock.' }
          },
          required: ['name', 'email', 'date', 'time']
        }
      }
    ];

    if (process.env.TRANSFER_PHONE_NUMBER) {
      tools.push({
        type: 'transfer_call',
        name: 'transfer_to_human',
        description: 'Transfer the call to a human agent. Use this when the caller explicitly requests to speak with a person, the issue is complex, or you cannot resolve their request.',
        number: process.env.TRANSFER_PHONE_NUMBER
      });
    }

    return tools;
  }

  async updateAgent(agentId, updateData) {
    try {
      if (!this.apiKey) {
        console.warn('⚠️ RETELL_API_KEY not set. Skipping agent update.');
        return null;
      }
      const response = await fetch(`${this.baseUrl}/update-agent/${agentId}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(updateData)
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('❌ Retell updateAgent error:', data);
        return null;
      }
      return data;
    } catch (error) {
      console.error('❌ Retell updateAgent exception:', error.message);
      return null;
    }
  }

  async syncAgentPrompt() {
    try {
      if (!this.agentId) {
        console.warn('⚠️ RETELL_AGENT_ID not set. Skipping prompt sync.');
        return;
      }
      const businessConfig = {
        businessName: process.env.BUSINESS_NAME || 'Elyvn',
        businessHours: process.env.BUSINESS_HOURS || 'Not specified',
        bookingLink: process.env.BOOKING_LINK || 'Not specified',
        phoneNumber: process.env.BUSINESS_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER || 'Not specified',
        transferNumber: process.env.TRANSFER_PHONE_NUMBER || null
      };
      const systemPrompt = generateSystemPrompt(businessConfig);
      const tools = this.getToolDefinitions();
      console.log(`🔄 Syncing Retell Agent Prompt for ${this.agentId}...`);
      const result = await this.updateAgent(this.agentId, { system_prompt: systemPrompt, tools });
      if (result) console.log('✅ Retell Agent synced.');
      else console.warn('⚠️ Failed to sync Retell Agent.');
    } catch (error) {
      console.error('❌ syncAgentPrompt error:', error.message);
    }
  }

  parseCallEvent(eventData) {
    const call = eventData.call || eventData;
    return {
      callId: call.call_id,
      agentId: call.agent_id,
      phoneNumber: call.from_number || call.to_number || call.phone_number,
      direction: call.direction,
      status: call.call_status,
      duration: call.duration_ms ? Math.round(call.duration_ms / 1000) : 0,
      transcript: call.transcript,
      summary: call.call_analysis?.call_summary,
      recordingUrl: call.recording_url,
      disconnectReason: call.disconnection_reason,
      startedAt: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
      endedAt: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null
    };
  }
}

module.exports = new RetellService();
