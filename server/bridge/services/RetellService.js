const fetch = require('node-fetch');
const { generateSystemPrompt } = require('../prompts/systemPrompt');
const logger = require('../utils/logger');

class RetellService {
  constructor() {
    this.apiKey = process.env.RETELL_API_KEY;
    this.baseUrl = 'https://api.retell.ai/v1';
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  getToolDefinitions(client) {
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

    const transferPhone = client?.transfer_phone || process.env.TRANSFER_PHONE_NUMBER;
    if (transferPhone) {
      tools.push({
        type: 'transfer_call',
        name: 'transfer_to_human',
        description: 'Transfer the call to a human agent. Use this when the caller explicitly requests to speak with a person, the issue is complex, or you cannot resolve their request.',
        number: transferPhone
      });
    }

    return tools;
  }

  async updateAgent(agentId, updateData) {
    try {
      if (!this.apiKey) {
        logger.warn('RETELL_API_KEY not set. Skipping agent update.');
        return null;
      }
      const response = await fetch(`${this.baseUrl}/update-agent/${agentId}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(updateData)
      });
      const data = await response.json();
      if (!response.ok) {
        logger.error('Retell updateAgent error:', { data, agentId });
        return null;
      }
      return data;
    } catch (error) {
      logger.error('Retell updateAgent exception:', { error: error.message, agentId });
      return null;
    }
  }

  async syncAgentPrompt(client = null) {
    if (client) {
      return this.syncClientAgent(client);
    }

    try {
      const { getDb } = require('../utils/dbAdapter');
      const db = getDb();
      const { rows: clients } = await db.query('SELECT * FROM clients WHERE retell_agent_id IS NOT NULL');
      
      logger.info(`🔄 Syncing Retell Agents for ${clients.length} clients...`);
      for (const c of clients) {
        await this.syncClientAgent(c);
      }
    } catch (error) {
      logger.error('syncAgentPrompt error:', { error: error.message });
    }
  }

  async syncClientAgent(client) {
    if (!client.retell_agent_id) return;

    try {
      const businessConfig = {
        businessName: client.business_name,
        businessHours: client.business_hours || 'Not specified',
        bookingLink: client.calcom_booking_link || 'Not specified',
        phoneNumber: client.phone_number,
        transferNumber: client.transfer_phone || process.env.TRANSFER_PHONE_NUMBER || null
      };
      const systemPrompt = generateSystemPrompt(businessConfig);
      const tools = this.getToolDefinitions(client);
      
      logger.info(`Syncing agent ${client.retell_agent_id} for ${client.business_name}`);
      const result = await this.updateAgent(client.retell_agent_id, { system_prompt: systemPrompt, tools });
      if (result) logger.info(`✅ Agent synced: ${client.business_name}`);
      else logger.warn(`⚠️ Failed to sync agent: ${client.business_name}`);
    } catch (err) {
      logger.error(`Error syncing client agent: ${client.id}`, { error: err.message });
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
