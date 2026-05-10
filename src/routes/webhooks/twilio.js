const express = require('express');
const router = express.Router();
const Call = require('../../models/Call');
const Client = require('../../models/Client');
const Message = require('../../models/Message');
const SmsOptOut = require('../../models/SmsOptOut');
const TwilioService = require('../../services/TwilioService');
const SpeedToLeadService = require('../../services/SpeedToLeadService');
const TelegramService = require('../../services/TelegramService');

router.post('/call-status', express.urlencoded({ extended: false }), (req, res) => {
    try {
        const { CallSid, CallStatus, From, To, CallDuration, CallSegment } = req.body;
        if (!CallSid) return res.status(400).json({ error: 'Missing CallSid' });
        let phone = TwilioService.normalizePhoneNumber(From || To);
        let existingCall = Call.findByCallId(CallSid);
        if (!existingCall) {
            let client = Client.findByPhone(phone);
            if (!client) {
                client = Client.create({ phone_number: phone, source: 'twilio' });
            }
            existingCall = Call.create({
                call_id: CallSid,
                client_id: client.id,
                direction: CallSegment === '1' ? 'inbound' : 'outbound',
                status: CallStatus,
                duration: CallDuration ? parseInt(CallDuration) : 0,
                started_at: new Date().toISOString()
            });
        } else {
            Call.update(existingCall.id, {
                status: CallStatus,
                duration: CallDuration ? parseInt(CallDuration) : existingCall.duration,
                ended_at: new Date().toISOString()
            });
        }
        if (CallStatus === 'completed' || CallStatus === 'no-answer' || CallStatus === 'busy' || CallStatus === 'failed') {
            const callData = {
                callId: CallSid,
                phoneNumber: phone,
                direction: CallSegment === '1' ? 'inbound' : 'outbound',
                duration: CallDuration ? parseInt(CallDuration) : 0,
                disconnectReason: CallStatus
            };
            if (SpeedToLeadService.shouldSendSpeedToLead(callData)) {
                SpeedToLeadService.handleMissedCall(callData).catch(err => console.error('SpeedToLead error:', err));
            }
        }
        res.status(200).send();
    } catch (error) {
        console.error('❌ Twilio call-status error:', error);
        res.status(500).json({ error: 'Internal error' });
    }
});

router.post('/incoming-sms', express.urlencoded({ extended: false }), async (req, res) => {
    try {
        const { From, To, Body, MessageSid } = req.body;
        if (!From || !Body) return res.status(400).json({ error: 'Missing From or Body' });
        const phone = TwilioService.normalizePhoneNumber(From);
        const body = Body.trim().toUpperCase();
        if (body === 'STOP' || body === 'UNSUBSCRIBE' || body === 'CANCEL' || body === 'REMOVE') {
            SmsOptOut.add(phone, 'Keyword opt-out', 'twilio_incoming');
            return res.status(200).send();
        }
        let client = Client.findByPhone(phone);
        if (!client) {
            client = Client.create({ phone_number: phone, source: 'sms_reply' });
        }
        Message.create({
            client_id: client.id,
            direction: 'inbound',
            content: Body,
            status: 'received',
            twilio_sid: MessageSid
        });
        if (body === 'CALLBACK') {
            await TelegramService.sendMessage(`📞 <b>Callback Requested</b>\nFrom: ${phone}`);
        } else if (body === 'URGENT') {
            await TelegramService.sendMessage(`🚨 <b>URGENT Priority Lead</b>\nFrom: ${phone}`);
        }
        res.status(200).send();
    } catch (error) {
        console.error('❌ Twilio incoming-sms error:', error);
        res.status(500).json({ error: 'Internal error' });
    }
});

module.exports = router;