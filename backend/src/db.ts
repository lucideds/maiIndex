import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbDir = process.env.DATA_DB_DIR || path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'maimai.db');
export const db = new Database(dbPath);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shortid TEXT UNIQUE,
    title TEXT NOT NULL,
    artist TEXT,
    bpm TEXT,
    genre TEXT,
    version TEXT,
    cabinet TEXT,
    zip_file TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    cover_file TEXT,
    audio_file TEXT,
    lv_1 TEXT,
    lv_2 TEXT,
    lv_3 TEXT,
    lv_4 TEXT,
    lv_5 TEXT,
    lv_6 TEXT,
    lv_7 TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
  CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
  CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre);
  CREATE INDEX IF NOT EXISTS idx_songs_version ON songs(version);
  CREATE INDEX IF NOT EXISTS idx_songs_shortid ON songs(shortid);

  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log(`Database initialized at: ${dbPath}`);
