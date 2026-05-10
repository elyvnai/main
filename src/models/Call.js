const { getDatabase } = require('../database');
class Call {
    static findByCallId(callId) {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM calls WHERE call_id = ?');
        stmt.bind([callId]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
        }
        stmt.free();
        return null;
    }
    static create(data) {
        const db = getDatabase();
        db.run(
            `INSERT INTO calls (call_id, client_id, direction, status, duration, recording_url, transcript, call_summary, disconnect_reason, sms_sent, started_at, ended_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.call_id, data.client_id || null, data.direction || null, data.status || null, data.duration || 0,
             data.recording_url || null, data.transcript || null, data.call_summary || null, data.disconnect_reason || null,
             data.sms_sent || 0, data.started_at || null, data.ended_at || null]
        );
        const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
        return Call.findById(id);
    }
    static findById(id) {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM calls WHERE id = ?');
        stmt.bind([id]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
        }
        stmt.free();
        return null;
    }
    static update(id, data) {
        const db = getDatabase();
        db.run(
            `UPDATE calls SET status = ?, duration = ?, recording_url = ?, transcript = ?, call_summary = ?, disconnect_reason = ?, sms_sent = ?, ended_at = ? WHERE id = ?`,
            [data.status, data.duration, data.recording_url || null, data.transcript || null, data.call_summary || null,
             data.disconnect_reason || null, data.sms_sent || 0, data.ended_at || null, id]
        );
    }
    static getRecent(limit = 10) {
        const db = getDatabase();
        const results = db.exec(`SELECT * FROM calls ORDER BY created_at DESC LIMIT ${parseInt(limit)}`);
        if (!results.length) return [];
        const columns = results[0].columns;
        return results[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => { obj[col] = row[i]; });
            return obj;
        });
    }
}
module.exports = Call;