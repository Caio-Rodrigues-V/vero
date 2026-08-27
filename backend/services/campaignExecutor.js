const { run, get, all } = require('../db.js');
const { triggerN8NSmsWebhook } = require('./communication.js');
const { makeVapiCall } = require('./vapi.js');

const activeJobs = new Set();

/**
 * Processa o envio de leads: Ligação pela VAPI (API direta) e SMS pelo n8n (Webhook)
 */
async function processCampaign(campaignId) {
  if (activeJobs.has(campaignId)) return;
  activeJobs.add(campaignId);

  console.log(`[EXECUTOR] Iniciando processamento da campanha #${campaignId}`);

  try {
    const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 100;
    const intervalMs = process.env.BATCH_INTERVAL_MS ? parseInt(process.env.BATCH_INTERVAL_MS) : 50;
    const maxConcurrentCalls = process.env.MAX_CONCURRENT_CALLS ? parseInt(process.env.MAX_CONCURRENT_CALLS) : 50;

    while (true) {
      // Obter campanha
      const campaign = get("SELECT * FROM campaigns WHERE id = ?", [campaignId]);
      if (!campaign || campaign.status !== 'processing') {
        break;
      }

      // Limitar concorrência ativa baseada nas chamadas em andamento ('calling')
      const activeCallsRow = get("SELECT COUNT(id) as count FROM leads WHERE call_status = 'calling'");
      const activeCalls = activeCallsRow ? activeCallsRow.count : 0;
      
      const availableSlots = maxConcurrentCalls - activeCalls;
      if (availableSlots <= 0) {
        // Canais congestionados. Aguarda 1 segundo e tenta de novo
        console.log(`[EXECUTOR] Limite de concorrência atingido (${activeCalls}/${maxConcurrentCalls} ativas). Aguardando canais livres...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const limit = Math.min(batchSize, availableSlots);

      // Buscar leads pendentes de disparo inicial limitando pelos canais disponíveis
      const leads = all(
        "SELECT * FROM leads WHERE campaign_id = ? AND call_status = 'pending' AND sms_status = 'pending' LIMIT ?",
        [campaignId, limit]
      );

      if (leads.length === 0) {
        console.log(`[EXECUTOR] Todos os leads da campanha #${campaignId} foram despachados.`);
        break;
      }

      // Despachar lote
      const promises = leads.map(async (lead) => {
        // 1. Atualizar para status temporário de envio
        run(
          `UPDATE leads 
           SET call_status = 'calling', sms_status = 'pending', email_status = 'pending', call_log = 'Iniciando discagem VAPI...', sms_log = 'Aguardando resultado da ligação...', email_log = 'Aguardando resultado da ligação...'
           WHERE id = ?`,
          [lead.id]
        );

        // 2. Disparar Chamada de voz via VAPI (direto pelo backend)
        const callResult = await makeVapiCall(lead);

        // 3. Atualizar com os status e logs de disparo iniciais
        // O SMS e Email permanecem como 'pending' aguardando o fim da ligação para decidir se envia ou não.
        const finalCallStatus = callResult.success ? 'calling' : 'failed';
        const finalSmsStatus = callResult.success ? 'pending' : 'failed';
        const finalSmsLog = callResult.success ? 'Aguardando resultado da ligação...' : 'Cancelado: Falha ao iniciar chamada.';
        const finalEmailStatus = callResult.success ? 'pending' : 'failed';
        const finalEmailLog = callResult.success ? 'Aguardando resultado da ligação...' : 'Cancelado: Falha ao iniciar chamada.';

        run(
          `UPDATE leads 
           SET call_status = ?, call_log = ?, sms_status = ?, sms_log = ?, email_status = ?, email_log = ?, call_attempts = call_attempts + 1 
           WHERE id = ?`,
          [
            finalCallStatus,
            callResult.log,
            finalSmsStatus,
            finalSmsLog,
            finalEmailStatus,
            finalEmailLog,
            lead.id
          ]
        );

        // Se houver falha imediata no disparo da chamada, já atualiza as falhas da campanha
        if (!callResult.success) {
          run(
            `UPDATE campaigns 
             SET processed_leads = processed_leads + 1,
                 failed_calls = failed_calls + 1,
                 failed_sms = failed_sms + 1
             WHERE id = ?`,
            [campaignId]
          );
        }
      });

      await Promise.all(promises);

      // Intervalo curto entre lotes para não sobrecarregar
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  } catch (error) {
    console.error(`[EXECUTOR] Erro ao processar campanha #${campaignId}:`, error);
  } finally {
    activeJobs.delete(campaignId);
  }
}

/**
 * Aciona o processador para verificar se há campanhas com leads pendentes
 */
function triggerCampaignProcessor() {
  const processingCampaigns = all("SELECT id FROM campaigns WHERE status = 'processing'");
  for (const row of processingCampaigns) {
    const pendingCount = get("SELECT COUNT(id) as count FROM leads WHERE campaign_id = ? AND call_status = 'pending'", [row.id]);
    if (pendingCount && pendingCount.count > 0) {
      processCampaign(row.id);
    }
  }
}

/**
 * Inicia o loop de monitoramento
 */
function startMonitorLoop() {
  setInterval(() => {
    triggerCampaignProcessor();
  }, 5000);
}

module.exports = { triggerCampaignProcessor, startMonitorLoop };
