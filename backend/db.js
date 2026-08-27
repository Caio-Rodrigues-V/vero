import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'vero_recovery.db');
const db = new DatabaseSync(dbPath);

// Inicializar as tabelas do banco de dados
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL, -- 'processing', 'completed', 'failed'
      vapi_assistant_id TEXT,
      total_leads INTEGER DEFAULT 0,
      processed_leads INTEGER DEFAULT 0,
      successful_calls INTEGER DEFAULT 0,
      failed_calls INTEGER DEFAULT 0,
      successful_sms INTEGER DEFAULT 0,
      failed_sms INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    db.exec('ALTER TABLE campaigns ADD COLUMN vapi_assistant_id TEXT;');
  } catch (e) {
    // Ignorar se a coluna já existir
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      debt_value REAL NOT NULL,
      due_date TEXT,
      call_status TEXT DEFAULT 'pending', -- 'pending', 'calling', 'completed', 'failed'
      call_attempts INTEGER DEFAULT 0,
      call_log TEXT,
      sms_status TEXT DEFAULT 'pending', -- 'pending', 'sending', 'completed', 'failed'
      sms_log TEXT,
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );
  `);
}

// Helper para executar queries que não retornam dados
export function run(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}

// Helper para obter um único registro
export function get(sql, params = []) {
  const stmt = db.prepare(sql);
  const results = stmt.all(...params);
  return results.length > 0 ? results[0] : null;
}

// Helper para obter múltiplos registros
export function all(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

export default db;
