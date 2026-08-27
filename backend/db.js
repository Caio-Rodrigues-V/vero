const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'vero_recovery.db');
const db = new DatabaseSync(dbPath);

// Inicializar as tabelas do banco de dados
function initDb() {
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
      barcode TEXT, -- Linha Digitável / Código de barras / PIX
      dias_atraso INTEGER, -- Dias em atraso
      status_internet TEXT, -- Status da internet / contrato
      occurrence TEXT, -- Tabulação / Ocorrência final
      call_status TEXT DEFAULT 'pending', -- 'pending', 'calling', 'completed', 'failed'
      call_attempts INTEGER DEFAULT 0,
      call_log TEXT,
      sms_status TEXT DEFAULT 'pending', -- 'pending', 'sending', 'completed', 'failed'
      sms_log TEXT,
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );
  `);

  // Executar migração para bancos de dados existentes
  try {
    db.exec("ALTER TABLE leads ADD COLUMN barcode TEXT;");
  } catch (err) {}
  try {
    db.exec("ALTER TABLE leads ADD COLUMN dias_atraso INTEGER;");
  } catch (err) {}
  try {
    db.exec("ALTER TABLE leads ADD COLUMN status_internet TEXT;");
  } catch (err) {}
  try {
    db.exec("ALTER TABLE leads ADD COLUMN occurrence TEXT;");
  } catch (err) {}
}

// Helper para executar queries que não retornam dados
function run(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}

// Helper para obter um único registro
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  const result = stmt.get(...params);
  return result === undefined ? null : result;
}

// Helper para obter múltiplos registros
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

module.exports = {
  initDb,
  run,
  get,
  all,
  db
};
