const express = require('express');
const router = express.Router();
const Call = require('../../models/Call');
const Client = require('../../models/Client');
const Appointment = require('../../models/Appointment');
const Lead = require('../../models/Lead');
const SpeedToLeadService = require('../../services/SpeedToLeadService');
const TelegramService = require('../../services/TelegramService');
const RetellService = require('../../services/RetellService');
const CalComService = require('../../services/CalComService');
const TwilioService = require('../../services/TwilioService');

/**
 * POST /webhooks/retell/tools
 * Handles tool execution calls from Retell AI agent
 * Tools: check_availability, book_appointment, transfer_to_human
 */
router.post('/tools', async (req, res) => {
    try {
        const { interaction_type, tool_call_id, name, arguments: toolArguments, call_id } = req.body;

        if (interaction_type !== 'tool_call') {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid interaction type. Expected: tool_call' 
            });
        }

        console.log(`🛠️ Retell Tool Call [${name}] for call ${call_id}`);
        console.log(`   Arguments:`, toolArguments);

        let args;
        try {
            args = typeof toolArguments === 'string' ? JSON.parse(toolArguments) : toolArguments;
        } catch (e) {
            console.error('❌ Failed to parse tool arguments:', toolArguments);
            return res.status(400).json({ 
                success: false,
                error: 'Invalid tool arguments format' 
            });
        }

        let result;
        let resultType = 'text';

        switch (name) {
            case 'check_availability': {
                if (!args.date) {
                    result = 'Please provide a date in YYYY-MM-DD format to check availability.';
                } else {
                    result = await CalComService.checkAvailability(args.date);
                }
                break;
            }

            case 'book_appointment': {
                if (!args.name || !args.email || !args.date || !args.time) {
                    result = 'To book an appointment, I need: your name, email, preferred date (YYYY-MM-DD), and time (HH:mm).';
                } else {
                    const call = Call.findByCallId(call_id);
                    const client = call ? Client.findById(call.client_id) : null;
                    
                    const bookingResult = await CalComService.bookAppointment({
                        name: args.name,
                        email: args.email,
                        date: args.date,
                        time: args.time,
                        phoneNumber: client?.phone_number || args.phoneNumber || null
                    });

                    if (bookingResult.success) {
                        if (client) {
                            const updateData = {};
                            if (!client.first_name && args.name) updateData.first_name = args.name;
                            if (!client.email && args.email) updateData.email = args.email;
                            
                            if (Object.keys(updateData).length > 0) {
                                Client.update(client.id, updateData);
                            }

                            Appointment.create({
                                client_id: client.id,
                                title: `Appointment: ${args.name}`,
                                scheduled_at: bookingResult.scheduledAt,
                                duration_minutes: 30,
                                status: 'confirmed',
                                external_id: bookingResult.confirmationId?.toString()
                            });
                        }
                        
                        await TelegramService.sendMessage(
                            `📅 <b>New Appointment Booked</b>\n\n` +
                            `👤 Name: ${args.name}\n` +
                            `📧 Email: ${args.email}\n` +
                            `📆 Date: ${args.date}\n` +
                            `🕐 Time: ${args.time}\n` +
                            `📱 Call ID: ${call_id}`
                        );

                        result = `Great news! Your appointment is confirmed for ${args.date} at ${args.time}. A confirmation has been sent to ${args.email}. We look forward to speaking with you!`;
                        resultType = 'text';
                    } else {
                        result = `I'm sorry, but I couldn't complete the booking: ${bookingResult.message}. Please try using our booking link or request a callback.`;
                    }
                }
                break;
            }

            case 'transfer_to_human': {
                console.log(`📞 Transfer requested for call ${call_id}`);
                
                const call = Call.findByCallId(call_id);
                const client = call ? Client.findById(call.client_id) : null;
                
                await TelegramService.sendMessage(
                    `📞 <b>Transfer Requested</b>\n\n` +
                    `Call ID: ${call_id}\n` +
                    `Client: ${client?.first_name || 'Unknown'}\n` +
                    `Phone: ${client?.phone_number || 'Unknown'}\n\n` +
                    `Transfer number: ${process.env.TRANSFER_PHONE_NUMBER || 'Not configured'}`
                );

                result = "Please hold on. I'm transferring you to a team member who can better assist you.";
                break;
            }

            default: {
                console.warn(`⚠️ Unknown tool: ${name}`);
                return res.status(404).json({ 
                    success: false,
                    error: `Unknown tool: ${name}` 
                });
            }
        }

        res.status(200).json({
            success: true,
            interaction_type: 'tool_call_result',
            tool_call_id,
            result: result,
            result_type: resultType
        });
    } catch (error) {
        console.error('❌ Retell tools webhook error:', error);
        res.status(500).json({ 
            success: false,
            error: `Tool execution failed: ${error.message}` 
        });
    }
});

/**
 * POST /webhooks/retell
 * Main webhook handler for Retell events (call_started, call_ended, call_analyzed)
 */
router.post('/', async (req, res) => {
    try {
        const event = req.body;
        console.log(`📡 Retell [${event.event}]`);

        const callData = RetellService.parseCallEvent(event);
        let client = Client.findByPhone(callData.phoneNumber);
        if (!client && callData.phoneNumber) {
            client = Client.create({ phone_number: callData.phoneNumber, source: 'retell' });
        }

        let call = Call.findByCallId(callData.callId);

        switch (event.event) {
            case 'call_started':
                if (!call) {
                    call = Call.create({
                        call_id: callData.callId,
                        client_id: client?.id,
                        direction: callData.direction,
                        status: 'in_progress',
                        started_at: callData.startedAt
                    });
                }
                await TelegramService.sendCallNotification(call, client, 'started');
                break;

            case 'call_ended':
                const isMissed = SpeedToLeadService.shouldSendSpeedToLead(callData);
                const status = isMissed ? 'missed' : 'completed';
                
                if (call) {
                    call = Call.update(call.id, {
                        status: status,
                        duration: callData.duration,
                        recording_url: callData.recordingUrl,
                        disconnect_reason: callData.disconnectReason,
                        ended_at: callData.endedAt
                    });
                } else {
                    call = Call.create({
                        call_id: callData.callId,
                        client_id: client?.id,
                        direction: callData.direction,
                        status: status,
                        duration: callData.duration,
                        recording_url: callData.recordingUrl,
                        disconnect_reason: callData.disconnectReason,
                        started_at: callData.startedAt,
                        ended_at: callData.endedAt
                    });
                }

                await TelegramService.sendCallNotification(call, client, 'ended');

                if (callData.recordingUrl) {
                    await TelegramService.sendAudio(callData.recordingUrl, `🎙️ Recording for call ${callData.callId}`);
                }

                if (isMissed) {
                    await SpeedToLeadService.handleMissedCall(callData);
                }
                break;

            case 'call_analyzed':
                if (call) {
                    call = Call.update(call.id, {
                        transcript: callData.transcript,
                        call_summary: callData.summary
                    });
                    
                    if (callData.summary || callData.transcript) {
                        let text = `📝 <b>Call Analyzed</b>\n\n`;
                        if (callData.summary) text += `<b>Summary:</b> ${callData.summary}\n\n`;
                        if (callData.transcript) text += `<b>Transcript:</b> <i>${callData.transcript.substring(0, 500)}...</i>`;
                        await TelegramService.sendMessage(text);
                    }
                }
                break;
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('❌ Retell webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;