const express = require('express');
const router = express.Router();
const Client = require('../../models/Client');
const Message = require('../../models/Message');
const SmsOptOut = require('../../models/SmsOptOut');
const TwilioService = require('../../services/TwilioService');
const TelegramService = require('../../services/TelegramService');

router.post('/', async (req, res) => {
    try {
        const { MessageSid, From, Body, MessageStatus } = req.body;

        if (MessageSid && Body) {
            const phone = TwilioService.normalizePhoneNumber(From);
            const body = Body.trim().toUpperCase();

            if (['STOP', 'UNSUBSCRIBE', 'CANCEL'].includes(body)) {
                SmsOptOut.create({ phone_number: phone, reason: 'STOP', source: 'reply_stop' });
            } else if (['START', 'YES'].includes(body)) {
                SmsOptOut.remove(phone);
            }

            let client = Client.findByPhone(phone);
            if (!client) {
                client = Client.create({ phone_number: phone, source: 'inbound_sms' });
            }

            if (body === 'URGENT') {
                const Lead = require('../../models/Lead');
                let lead = Lead.findByClientId(client.id);
                if (lead) {
                    Lead.update(lead.id, { priority: 10, notes: (lead.notes ? lead.notes + '\n' : '') + 'Client replied URGENT' });
                } else {
                    Lead.create({ client_id: client.id, status: 'new', priority: 10, notes: 'Client replied URGENT' });
                }
                await TelegramService.sendMessage(`🚨 🚨 🚨 <b>URGENT REPLY</b> from <b>${phone}</b>\n\n<i>Client has requested immediate attention.</i>`);
                await TwilioService.sendSMS(phone, "We have received your URGENT request. A team member will prioritize your call and contact you shortly.");
            } else if (body === 'CALLBACK') {
                await TelegramService.sendMessage(`📞 <b>CALLBACK REQUESTED</b> from <b>${phone}</b>`);
                await TwilioService.sendSMS(phone, "Thanks! We've scheduled a callback for you. A team member will call you as soon as possible.");
            }

            const message = Message.create({
                client_id: client.id,
                direction: 'inbound',
                content: Body,
                status: 'delivered',
                twilio_sid: MessageSid
            });

            await TelegramService.sendSMSNotification(message, client);
        } else if (MessageSid && MessageStatus) {
            const message = Message.findByTwilioSid(MessageSid);
            if (message) {
                Message.update(message.id, { status: MessageStatus });
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('❌ Twilio error:', error);
        res.status(500).send('Error');
    }
});

module.exports = router;
