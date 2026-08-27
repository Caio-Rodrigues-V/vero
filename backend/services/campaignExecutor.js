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

    while (true) {
      // Obter campanha
      const campaign = get("SELECT * FROM campaigns WHERE id = ?", [campaignId]);
      if (!campaign || campaign.status !== 'processing') {
        break;
      }

      // Buscar leads pendentes de disparo inicial
      const leads = all(
        "SELECT * FROM leads WHERE campaign_id = ? AND call_status = 'pending' AND sms_status = 'pending' LIMIT ?",
        [campaignId, batchSize]
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
           SET call_status = 'calling', sms_status = 'sending', call_log = 'Iniciando discagem VAPI...', sms_log = 'Enviando via Smart RCS...'
           WHERE id = ?`,
          [lead.id]
        );

        // 2. Disparar Chamada de voz via VAPI (direto pelo backend)
        const callResult = await makeVapiCall(lead);

        // 3. Disparar SMS/RCS diretamente via API da Smart RCS
        const smsResult = await triggerN8NSmsWebhook(lead);

        // 4. Atualizar com os status e logs de disparo iniciais
        // Como o Smart RCS é direto e síncrono, se tiver sucesso já marcamos como 'completed'.
        const finalCallStatus = callResult.success ? 'calling' : 'failed';
        const finalSmsStatus = smsResult.success ? 'completed' : 'failed';

        run(
          `UPDATE leads 
           SET call_status = ?, call_log = ?, sms_status = ?, sms_log = ?, call_attempts = call_attempts + 1 
           WHERE id = ?`,
          [
            finalCallStatus,
            callResult.log,
            finalSmsStatus,
            smsResult.log,
            lead.id
          ]
        );

        // Se houver falha imediata em algum dos canais, atualiza o processed da campanha
        if (!callResult.success || !smsResult.success) {
          run(
            `UPDATE campaigns 
             SET processed_leads = processed_leads + 1,
                 failed_calls = failed_calls + ?,
                 failed_sms = failed_sms + ?
             WHERE id = ?`,
            [
              !callResult.success ? 1 : 0,
              !smsResult.success ? 1 : 0,
              campaignId
            ]
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
