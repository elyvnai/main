require('dotenv').config();
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const dbPath = process.env.DATABASE_URL || './elyvn.db';
let db = null;
async function initDatabase() {
    const SQL = await initSqlJs();
    let fileBuffer = null;
    if (fs.existsSync(dbPath)) {
        fileBuffer = fs.readFileSync(dbPath);
    }
    db = new SQL.Database(fileBuffer);
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.run(schema);
    const buf = db.export();
    const buffer = Buffer.from(buf);
    fs.writeFileSync(dbPath, buffer);
    console.log('🏗️  Elyvn Database initialized');
    return db;
}
function getDatabase() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}
function closeDatabase() {
    if (db) {
        const buf = db.export();
        const buffer = Buffer.from(buf);
        fs.writeFileSync(dbPath, buffer);
        db.close();
        db = null;
    }
}
module.exports = { initDatabase, getDatabase, closeDatabase };