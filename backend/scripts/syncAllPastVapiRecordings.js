const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config();

const { all, run } = require('../db.js');
const { fetchVapiCallDetails } = require('../services/vapi.js');

async function syncAllPastVapiRecordings() {
  console.log('=== VARREDURA COMPLETA DE ÁUDIOS E TRANSCRIÇÕES DA VAPI ===\n');

  const leadsWithCallId = all(
    `SELECT id, name, phone, call_id, recording_url, transcript FROM leads WHERE call_id IS NOT NULL AND call_id != ''`
  );

  console.log(`Encontrados ${leadsWithCallId.length} leads com ID de chamada da Vapi no banco.\n`);

  let updatedCount = 0;
  let missingCount = 0;

  for (let i = 0; i < leadsWithCallId.length; i++) {
    const lead = leadsWithCallId[i];
    process.stdout.write(`[${i + 1}/${leadsWithCallId.length}] Verificando Lead #${lead.id} (${lead.name}) - CallId: ${lead.call_id}... `);

    const details = await fetchVapiCallDetails(lead.call_id);

    if (details && (details.recordingUrl || details.transcript)) {
      run(
        `UPDATE leads SET 
          recording_url = COALESCE(?, recording_url),
          transcript = COALESCE(?, transcript)
         WHERE id = ?`,
        [details.recordingUrl, details.transcript, lead.id]
      );
      console.log(`✅ ATUALIZADO! Áudio: ${details.recordingUrl ? 'SIM' : 'NÃO'} | Transcrição: ${details.transcript ? 'SIM' : 'NÃO'}`);
      updatedCount++;
    } else {
      console.log(`⚠️ VAPI não possui gravação/transcrição gerada.`);
      missingCount++;
    }
  }

  console.log(`\n=== VARREDURA CONCLUÍDA ===`);
  console.log(`Total de Leads Atualizados: ${updatedCount}`);
  console.log(`Total de Leads sem Gravação na Vapi: ${missingCount}`);
}

if (require.main === module) {
  syncAllPastVapiRecordings().catch(console.error);
}

module.exports = { syncAllPastVapiRecordings };
