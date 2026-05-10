const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;
let dbPath = null;

async function initDatabase() {
    const SQL = await initSqlJs();
    
    dbPath = process.env.DATABASE_URL || './elyvn.sqlite';
    const schemaPath = path.join(__dirname, 'schema.sql');
    
    console.log('🏗️  Initializing Elyvn Database...');
    
    try {
        if (fs.existsSync(dbPath)) {
            const fileBuffer = fs.readFileSync(dbPath);
            db = new SQL.Database(fileBuffer);
            console.log('📁 Loaded existing database');
        } else {
            db = new SQL.Database();
            console.log('📁 Created new database');
        }
        
        db.run('PRAGMA foreign_keys = ON');
        
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        const statements = schema
            .split(/;\s*[\r\n]+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
        
        for (const statement of statements) {
            if (statement.length > 0) {
                try {
                    db.run(statement);
                } catch (e) {
                    console.error('Schema statement error:', e.message);
                }
            }
        }
        
        saveDatabase();
        
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
        const tableNames = tables[0]?.values.map(v => v[0]).filter(t => t !== 'sqlite_sequence') || [];
        console.log('📋 Tables created:', tableNames.join(', '));
        
        console.log('✅ Database initialized successfully!');
        console.log(`📁 Database location: ${path.resolve(dbPath)}`);
        
        return db;
    } catch (error) {
        console.error('❌ Failed to initialize database:', error.message);
        throw error;
    }
}

function saveDatabase() {
    if (db && dbPath) {
        try {
            const data = db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(dbPath, buffer);
        } catch (e) {
            console.error('Failed to save database:', e.message);
        }
    }
}

function getDatabase() {
    return db;
}

function closeDatabase() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
    }
}

function run(sql, params = []) {
    try {
        db.run(sql, params);
        saveDatabase();
        return { lastInsertRowid: getLastInsertRowId(), changes: db.getRowsModified() };
    } catch (error) {
        throw error;
    }
}

function get(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return undefined;
}

function all(sql, params = []) {
    const results = [];
    const stmt = db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function getLastInsertRowId() {
    const result = db.exec('SELECT last_insert_rowid()');
    return result[0]?.values[0]?.[0] || 0;
}

module.exports = { 
    initDatabase, 
    getDatabase, 
    closeDatabase, 
    saveDatabase,
    run,
    get,
    all,
    getLastInsertRowId
};