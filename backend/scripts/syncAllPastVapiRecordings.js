const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config();

const { all, run } = require('../db.js');
const { fetchVapiCallDetails } = require('../services/vapi.js');

async function syncAllPastVapiRecordings() {
  console.log('=== VARREDURA OTIMIZADA DE ÁUDIOS E TRANSCRIÇÕES DA VAPI ===\n');

  // Selecionar APENAS os leads que possuem call_id mas ainda estão sem áudio ou sem transcrição
  const leadsToSync = all(
    `SELECT id, name, phone, call_id, recording_url, transcript 
     FROM leads 
     WHERE call_id IS NOT NULL 
       AND call_id != '' 
       AND (recording_url IS NULL OR recording_url = '' OR transcript IS NULL OR transcript = '')`
  );

  console.log(`Encontrados ${leadsToSync.length} leads pendentes de sincronização de áudio/transcrição.\n`);

  if (leadsToSync.length === 0) {
    console.log('🎉 Todos os leads com chamada já possuem áudio e transcrição sincronizados!');
    return;
  }

  let updatedCount = 0;
  let missingCount = 0;

  // Processar em lotes de 10 chamadas em paralelo para extrema velocidade
  const BATCH_SIZE = 10;
  for (let i = 0; i < leadsToSync.length; i += BATCH_SIZE) {
    const batch = leadsToSync.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (lead) => {
      console.log(`[Lead #${lead.id}] Sincronizando (${lead.name}) - CallId: ${lead.call_id}...`);
      const details = await fetchVapiCallDetails(lead.call_id);

      if (details && (details.recordingUrl || details.transcript)) {
        run(
          `UPDATE leads SET 
            recording_url = COALESCE(?, recording_url),
            transcript = COALESCE(?, transcript)
           WHERE id = ?`,
          [details.recordingUrl, details.transcript, lead.id]
        );
        console.log(`✅ [Lead #${lead.id}] ATUALIZADO! Áudio: ${details.recordingUrl ? 'SIM' : 'NÃO'} | Transcrição: ${details.transcript ? 'SIM' : 'NÃO'}`);
        updatedCount++;
      } else {
        console.log(`⚠️ [Lead #${lead.id}] VAPI não possui gravação/transcrição disponível.`);
        missingCount++;
      }
    }));
  }

  console.log(`\n=== VARREDURA CONCLUÍDA ===`);
  console.log(`Total de Leads Atualizados: ${updatedCount}`);
  console.log(`Total Sem Gravação na Vapi: ${missingCount}`);
}

if (require.main === module) {
  syncAllPastVapiRecordings().catch(console.error);
}

module.exports = { syncAllPastVapiRecordings };
