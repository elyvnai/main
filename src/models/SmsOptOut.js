const { get, run, all } = require('../database');

class SmsOptOut {
    static create(data) {
        const sql = `
            INSERT OR REPLACE INTO sms_opt_outs (phone_number, reason, source)
            VALUES (?, ?, ?)
        `;
        const params = [
            data.phone_number,
            data.reason || null,
            data.source || 'manual'
        ];
        
        run(sql, params);
        return this.findByPhone(data.phone_number);
    }

    static findById(id) {
        return get('SELECT * FROM sms_opt_outs WHERE id = ?', [id]);
    }

    static findByPhone(phoneNumber) {
        return get('SELECT * FROM sms_opt_outs WHERE phone_number = ?', [phoneNumber]);
    }

    static isOptedOut(phoneNumber) {
        const record = this.findByPhone(phoneNumber);
        return !!record;
    }

    static remove(phoneNumber) {
        run('DELETE FROM sms_opt_outs WHERE phone_number = ?', [phoneNumber]);
    }

    static findAll(limit = 100) {
        return all('SELECT * FROM sms_opt_outs ORDER BY opted_out_at DESC LIMIT ?', [limit]);
    }

    static count() {
        const result = get('SELECT COUNT(*) as count FROM sms_opt_outs', []);
        return result?.count || 0;
    }
}

module.exports = SmsOptOut;