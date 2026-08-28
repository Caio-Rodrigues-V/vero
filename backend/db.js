const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'vero_recovery.db');
const db = new DatabaseSync(dbPath);

// Habilitar WAL mode e busy_timeout para alta concorrência de escritas paralelas
try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 10000;');
  db.exec('PRAGMA synchronous = NORMAL;');
} catch (e) {
  console.warn('[DB PRAGMA WARN]', e.message);
}

// Inicializar as tabelas do banco de dados
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL, -- 'processing', 'completed', 'failed'
      vapi_assistant_id TEXT,
      concurrency_limit INTEGER DEFAULT 2,
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

  try {
    db.exec('ALTER TABLE campaigns ADD COLUMN concurrency_limit INTEGER DEFAULT 2;');
  } catch (e) {
    // Ignorar se a coluna já existir
  }

  try {
    db.exec('ALTER TABLE leads ADD COLUMN transcript TEXT;');
  } catch (e) {
    // Ignorar se a coluna já existir
  }

  try {
    db.exec('ALTER TABLE leads ADD COLUMN call_id TEXT;');
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
      email TEXT, -- E-mail do cliente
      call_id TEXT, -- ID da chamada na VAPI / Retell
      call_status TEXT DEFAULT 'pending', -- 'pending', 'calling', 'completed', 'failed'
      call_attempts INTEGER DEFAULT 0,
      call_log TEXT,
      sms_status TEXT DEFAULT 'pending', -- 'pending', 'sending', 'completed', 'failed'
      sms_log TEXT,
      email_status TEXT DEFAULT 'pending', -- 'pending', 'sending', 'completed', 'failed'
      email_log TEXT,
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );
  `);

  // Executar migração para bancos de dados existentes
  try { db.exec("ALTER TABLE leads ADD COLUMN barcode TEXT;"); } catch (err) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN dias_atraso INTEGER;"); } catch (err) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN status_internet TEXT;"); } catch (err) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN occurrence TEXT;"); } catch (err) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN email TEXT;"); } catch (err) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN email_status TEXT DEFAULT 'pending';"); } catch (err) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN email_log TEXT;"); } catch (err) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN call_id TEXT;"); } catch (err) {}
}

// Helper para executar queries com auto-retry se o banco estiver ocupado
function run(sql, params = []) {
  let retries = 5;
  while (retries > 0) {
    try {
      const stmt = db.prepare(sql);
      return stmt.run(...params);
    } catch (err) {
      if (err.message && (err.message.includes('locked') || err.message.includes('busy')) && retries > 1) {
        retries--;
        const start = Date.now();
        while (Date.now() - start < 50) {}
      } else {
        throw err;
      }
    }
  }
}

// Helper para obter um único registro com auto-retry
function get(sql, params = []) {
  let retries = 5;
  while (retries > 0) {
    try {
      const stmt = db.prepare(sql);
      const result = stmt.get(...params);
      return result === undefined ? null : result;
    } catch (err) {
      if (err.message && (err.message.includes('locked') || err.message.includes('busy')) && retries > 1) {
        retries--;
        const start = Date.now();
        while (Date.now() - start < 50) {}
      } else {
        throw err;
      }
    }
  }
}

// Helper para obter múltiplos registros com auto-retry
function all(sql, params = []) {
  let retries = 5;
  while (retries > 0) {
    try {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    } catch (err) {
      if (err.message && (err.message.includes('locked') || err.message.includes('busy')) && retries > 1) {
        retries--;
        const start = Date.now();
        while (Date.now() - start < 50) {}
      } else {
        throw err;
      }
    }
  }
}

module.exports = {
  initDb,
  run,
  get,
  all,
  db
};
