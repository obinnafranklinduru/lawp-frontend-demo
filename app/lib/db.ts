import Database from 'better-sqlite3';
import path from 'path';

// Define the path to the SQLite database file
const dbPath = path.resolve(process.cwd(), 'lawp.db');

// Initialize the database connection
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS payloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poolId INTEGER NOT NULL,
    amount TEXT NOT NULL,
    type TEXT NOT NULL,
    required INTEGER NOT NULL,
    deadline INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING'
  );

  CREATE TABLE IF NOT EXISTS signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payloadId INTEGER NOT NULL,
    signerAddress TEXT NOT NULL,
    signatureHash TEXT NOT NULL,
    FOREIGN KEY (payloadId) REFERENCES payloads (id) ON DELETE CASCADE,
    UNIQUE(payloadId, signerAddress)
  );

  CREATE TABLE IF NOT EXISTS pools (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    goal TEXT NOT NULL,
    startTime INTEGER NOT NULL,
    endTime INTEGER NOT NULL,
    status TEXT DEFAULT 'Open'
  );
`);

export default db;
