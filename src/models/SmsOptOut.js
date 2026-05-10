const { getDatabase } = require('../database');
class SmsOptOut {
    static isOptedOut(phone) {
        const db = getDatabase();
        const stmt = db.prepare('SELECT id FROM sms_opt_outs WHERE phone_number = ?');
        stmt.bind([phone]);
        const exists = stmt.step();
        stmt.free();
        return exists;
    }
    static add(phone, reason = null, source = null) {
        const db = getDatabase();
        try {
            db.run(
                'INSERT INTO sms_opt_outs (phone_number, reason, source) VALUES (?, ?, ?)',
                [phone, reason || null, source || null]
            );
        } catch (e) { }
    }
    static remove(phone) {
        const db = getDatabase();
        db.run('DELETE FROM sms_opt_outs WHERE phone_number = ?', [phone]);
    }
}
module.exports = SmsOptOut;