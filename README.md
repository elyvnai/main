# Elyvn Core

Speed-to-Lead SMS and Call Management System.

## System Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  INBOUND CALL to +1-XXX-XXX-XXXX (Twilio Number)            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  TWILIO → SIP Trunk → Retell AI Agent                       │
│  • Answers with system prompt                               │
│  • Books via Cal.com tools                                  │
│  • Transfers to owner if requested                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    Call Ends
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Retell POST /webhooks/retell (call_ended)                  │
│                                                             │
│  IF missed (duration < 10s / voicemail / busy):             │
│    1. Insert call (status='missed')                         │
│    2. Upsert lead (source='missed_call')                    │
│    3. Send SMS (speed-to-lead with full menu)               │
│    4. Log SMS to messages table                             │
│    5. Download recording (10-min window!)                   │
│    6. Telegram owner: "Missed call from X. Auto-text sent." │
│                                                             │
│  ELSE (normal call):                                        │
│    1. Update call (status='completed')                      │
│    2. Store transcript + summary                            │
│    3. Download recording                                    │
│    4. Telegram owner: Summary + transcript + recording      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Customer replies to SMS                                    │
│  Twilio POST /webhooks/twilio (SMS)                         │
│    1. Check opt-out                                         │
│    2. Log message                                           │
│    3. Telegram owner: "Reply from X: [text]"                │
│    4. Owner replies in Telegram → SMS sent to customer      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Telegram Bot (/webhooks/telegram)                          │
│  • /start <token> → Link chat to client                     │
│  • /status → Today's stats                                  │
│  • /calls → Recent calls with inline buttons                │
│  • /pause → Disable AI                                      │
│  • /resume → Enable AI                                      │
│  • Reply-to-message → Two-way SMS                           │
│  • [View Transcript] → Show full text                       │
│  • [Download Recording] → Send audio file                   │
│  • [Mark Booked] → Update lead stage                        │
└─────────────────────────────────────────────────────────────┘
```

## Features
- **Comprehensive Database Schema**: Managed tracking of clients, calls, leads, messages, appointments, and SMS opt-outs.
- **Webhook Integration**: Real-time interaction with Retell, Twilio, and Telegram.
- **Speed-to-Lead**: Automatic SMS response to missed calls with booking links and menu options.
- **Telegram Command Center**: Full control over the system, stats, and two-way communication via a single bot.
- **Admin Dashboard**: Web interface for creating and managing clients.

## Setup
1. Copy `.env.example` to `.env` and fill in your API credentials.
2. Install dependencies: `npm install`
3. Initialize the database: `npm run init-db`
4. Start the server: `npm start`
