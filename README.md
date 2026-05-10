# Elyvn
Speed-to-Lead SMS and Call Management System.

## Features
- **6-Table SQLite Schema**: Managed tracking of clients, calls, leads, messages, appointments, and SMS opt-outs.
- **Webhooks**: Integrated with Retell, Twilio, and Telegram.
- **Speed-to-Lead**: Automatic SMS response to missed calls within 60 seconds.
- **Telegram Notifications**: Real-time alerts for all system activities.

## Setup
1. Copy `.env.example` to `.env` and fill in the required environment variables.
2. Install dependencies: `npm install`
3. Initialize the database: `npm run init-db`
4. Start the server: `npm start`