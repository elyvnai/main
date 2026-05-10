const { getDatabase } = require('../database');
class Appointment {
    static create(data) {
        const db = getDatabase();
        db.run(
            `INSERT INTO appointments (client_id, title, scheduled_at, duration_minutes, status) VALUES (?, ?, ?, ?, ?)`,
            [data.client_id || null, data.title || null, data.scheduled_at || null,
             data.duration_minutes || 30, data.status || 'scheduled']
        );
        const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
        return Appointment.findById(id);
    }
    static findById(id) {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM appointments WHERE id = ?');
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
            `UPDATE appointments SET title = ?, scheduled_at = ?, duration_minutes = ?, status = ? WHERE id = ?`,
            [data.title || null, data.scheduled_at || null, data.duration_minutes || 30, data.status || null, id]
        );
    }
}
module.exports = Appointment;