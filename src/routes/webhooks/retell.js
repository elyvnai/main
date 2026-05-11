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
 * 
 * This endpoint receives tool calls from Retell's AI agent and executes
 * the appropriate service methods, returning formatted results.
 */
router.post('/tools', async (req, res) => {
    try {
        const { interaction_type, tool_call_id, name, arguments: toolArguments, call_id } = req.body;

        // Validate interaction type
        if (interaction_type !== 'tool_call') {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid interaction type. Expected: tool_call' 
            });
        }

        console.log(`🛠️ Retell Tool Call [${name}] for call ${call_id}`);
        console.log(`   Arguments:`, toolArguments);

        // Parse tool arguments
        let args;
        try {
            args = typeof toolArguments === 'string' ? JSON.parse(toolArguments) : toolArguments || {};
        } catch (e) {
            console.error('❌ Failed to parse tool arguments:', toolArguments);
            return res.status(400).json({ 
                success: false,
                error: 'Invalid tool arguments format. Expected JSON object.' 
            });
        }

        let result;
        let resultType = 'text';

        // Handle tool execution based on tool name
        switch (name) {
            case 'check_availability': {
                // Validate date parameter
                if (!args.date) {
                    result = 'Please provide a date in YYYY-MM-DD format (e.g., 2024-12-15) to check availability.';
                } else {
                    // Validate date format
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    if (!dateRegex.test(args.date)) {
                        result = 'Please provide the date in YYYY-MM-DD format (e.g., 2024-12-15).';
                    } else {
                        result = await CalComService.checkAvailability(args.date);
                    }
                }
                break;
            }

            case 'book_appointment': {
                // Validate required parameters
                const missingFields = [];
                if (!args.name) missingFields.push('name');
                if (!args.email) missingFields.push('email');
                if (!args.date) missingFields.push('date');
                if (!args.time) missingFields.push('time');

                if (missingFields.length > 0) {
                    result = `To book an appointment, I need the following information: ${missingFields.join(', ')}. Please provide these details.`;
                } else {
                    // Get call and client info for additional context
                    const call = Call.findByCallId(call_id);
                    const client = call ? Client.findById(call.client_id) : null;
                    
                    // Book appointment via Cal.com
                    const bookingResult = await CalComService.bookAppointment({
                        name: args.name,
                        email: args.email,
                        date: args.date,
                        time: args.time,
                        phoneNumber: client?.phone_number || args.phoneNumber || null
                    });

                    if (bookingResult.success) {
                        // Update client info if needed
                        if (client) {
                            const updateData = {};
                            if (!client.first_name && args.name) {
                                updateData.first_name = args.name;
                            }
                            if (!client.email && args.email) {
                                updateData.email = args.email;
                            }
                            
                            if (Object.keys(updateData).length > 0) {
                                Client.update(client.id, updateData);
                            }

                            // Create local appointment record
                            Appointment.create({
                                client_id: client.id,
                                title: `Appointment: ${args.name}`,
                                scheduled_at: bookingResult.scheduledAt,
                                duration_minutes: 30,
                                status: 'confirmed',
                                external_id: bookingResult.confirmationId?.toString()
                            });
                        }
                        
                        // Send Telegram notification about new booking
                        await TelegramService.sendAppointmentNotification({
                            name: args.name,
                            email: args.email,
                            date: args.date,
                            time: args.time,
                            confirmationId: bookingResult.confirmationId
                        }, client);

                        result = `Great news! Your appointment is confirmed for ${args.date} at ${args.time}. A confirmation has been sent to ${args.email}. We look forward to speaking with you!`;
                        resultType = 'text';
                    } else {
                        // Booking failed - provide helpful error message
                        const bookingLink = process.env.BOOKING_LINK || '';
                        result = `I apologize, but I couldn't complete the booking: ${bookingResult.message}. Please try using our booking link ${bookingLink} or request a callback and we'll call you back within the hour.`;
                    }
                }
                break;
            }

            case 'transfer_to_human': {
                console.log(`📞 Transfer to human requested for call ${call_id}`);
                
                const call = Call.findByCallId(call_id);
                const client = call ? Client.findById(call.client_id) : null;
                
                // Get reason for transfer if provided
                const reason = args.reason || args.description || 'Caller requested human assistance';
                
                // Send Telegram notification about transfer request
                await TelegramService.sendTransferNotification(call_id, client, reason);

                // For transfer_to_human, we return a message that will be spoken to the caller
                // The actual transfer is handled by Retell using the transfer_call tool type
                result = "Please hold on. I'm transferring you to a team member who can better assist you.";
                break;
            }

            default: {
                console.warn(`⚠️ Unknown tool requested: ${name}`);
                return res.status(404).json({ 
                    success: false,
                    error: `Unknown tool: ${name}. Available tools are: check_availability, book_appointment, transfer_to_human` 
                });
            }
        }

        // Return successful tool execution result
        res.status(200).json({
            success: true,
            interaction_type: 'tool_call_result',
            tool_call_id,
            result: result,
            result_type: resultType
        });
    } catch (error) {
        console.error('❌ Retell tools webhook error:', error);
        
        // Return graceful error message to AI so it can explain to caller
        res.status(200).json({
            success: true,
            interaction_type: 'tool_call_result',
            tool_call_id: req.body.tool_call_id,
            result: `I encountered an error while processing your request. Please try again or request to speak with a human representative.`,
            result_type: 'text'
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
                // Send "Live Call" notification for started calls
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

                // Send "Call Ended" notification
                await TelegramService.sendCallNotification(call, client, 'ended');

                // Send recording if available
                if (callData.recordingUrl) {
                    await TelegramService.sendAudio(callData.recordingUrl, `🎙️ Recording for call ${callData.callId}`);
                }

                // Handle Speed-to-Lead for missed calls
                if (isMissed) {
                    await SpeedToLeadService.handleMissedCall(callData);
                }
                break;

            case 'call_analyzed':
                if (call) {
                    // Extract outcome from call analysis data
                    const outcome = event.call?.call_analysis?.outcome || 
                                   event.call?.outcome ||
                                   null;
                    
                    call = Call.update(call.id, {
                        transcript: callData.transcript,
                        call_summary: callData.summary,
                        outcome: outcome
                    });
                    
                    // Send call analysis notification
                    if (callData.summary || callData.transcript) {
                        let text = `📝 <b>Call Analyzed</b>\n\n`;
                        if (callData.summary) text += `<b>Summary:</b> ${callData.summary}\n\n`;
                        if (callData.transcript) text += `<b>Transcript:</b> <i>${callData.transcript.substring(0, 500)}...</i>`;
                        if (outcome) text += `\n🎯 <b>Outcome:</b> ${outcome}`;
                        await TelegramService.sendMessage(text);
                    }
                }
                break;

            default:
                console.log(`📡 Unhandled Retell event: ${event.event}`);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('❌ Retell webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
