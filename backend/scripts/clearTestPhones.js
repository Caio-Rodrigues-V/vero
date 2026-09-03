const { run } = require('../db.js');

console.log('[SCRIPT] Limpando números de teste do banco de dados SQLite...');
const result = run(
  DELETE FROM leads 
  WHERE phone LIKE '%981811077%' 
     OR phone LIKE '%966491519%' 
     OR phone LIKE '%988887777%'
);

console.log('[SCRIPT] Sucesso! Registros de teste foram removidos da base.');
process.exit(0);