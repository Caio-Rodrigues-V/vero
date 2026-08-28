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
    const maxConcurrentCalls = process.env.MAX_CONCURRENT_CALLS ? parseInt(process.env.MAX_CONCURRENT_CALLS) : 10;
    const paceDelayMs = process.env.WORKER_DELAY_BETWEEN_CALLS_MS ? parseInt(process.env.WORKER_DELAY_BETWEEN_CALLS_MS) : 500;

    console.log(`[EXECUTOR] Iniciando discador cadenciado para Campanha #${campaignId} (Máx Simultâneo: ${maxConcurrentCalls} canais, Intervalo entre disparos: ${paceDelayMs}ms)`);

    while (true) {
      // 1. Verificar se a campanha ainda está ativa
      const campaign = get("SELECT * FROM campaigns WHERE id = ?", [campaignId]);
      if (!campaign || campaign.status !== 'processing') {
        console.log(`[EXECUTOR] Campanha #${campaignId} não está mais em processamento.`);
        break;
      }

      // 2. Verificar chamadas em andamento no momento ('calling')
      const activeCallsRow = get("SELECT COUNT(id) as count FROM leads WHERE campaign_id = ? AND call_status = 'calling'", [campaignId]);
      const activeCalls = activeCallsRow ? activeCallsRow.count : 0;

      if (activeCalls >= maxConcurrentCalls) {
        // Todos os canais estão ocupados falando no momento. Aguarda 2 segundos para liberar vaga
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      // 3. Buscar o próximo lead pendente na fila
      const lead = get(
        "SELECT * FROM leads WHERE campaign_id = ? AND call_status = 'pending' AND sms_status = 'pending' ORDER BY id ASC LIMIT 1",
        [campaignId]
      );

      if (!lead) {
        // Verificar se ainda restam ligações ativas rodando antes de concluir
        if (activeCalls === 0) {
          console.log(`[EXECUTOR] Todos os leads da campanha #${campaignId} foram finalizados com sucesso.`);
        }
        break;
      }

      // 4. Marcar o lead como 'calling' no banco temporariamente
      run(
        `UPDATE leads 
         SET call_status = 'calling', sms_status = 'pending', email_status = 'pending', call_log = 'Iniciando discagem VAPI...' 
         WHERE id = ?`,
        [lead.id]
      );

      // 5. Disparar a chamada para a VAPI (AWAIT para respeitar a fila de canais)
      try {
        const callResult = await makeVapiCall(lead);

        if (!callResult.success) {
          const isConcurrencyError = callResult.log && (
            callResult.log.toLowerCase().includes('concurrency') ||
            callResult.log.toLowerCase().includes('rate limit') ||
            callResult.log.toLowerCase().includes('too many') ||
            callResult.log.includes('429')
          );

          if (isConcurrencyError) {
            // Tronco ou VAPI com canais cheios: Devolve o lead para pending e aguarda 5 segundos
            console.log(`[EXECUTOR CONCORRÊNCIA] Limite da VAPI atingido. Devolvendo lead #${lead.id} para fila e pausando 5s para liberar canal...`);
            run(
              `UPDATE leads SET call_status = 'pending', call_log = 'Aguardando liberação de canais VAPI...' WHERE id = ?`,
              [lead.id]
            );
            await new Promise((resolve) => setTimeout(resolve, 5000));
            continue;
          }

          // Falha permanente no número/discagem
          run(
            `UPDATE leads 
             SET call_status = 'failed', call_log = ?, sms_status = 'failed', sms_log = 'Cancelado: Falha na chamada.', email_status = 'failed', email_log = 'Cancelado: Falha na chamada.', call_attempts = call_attempts + 1 
             WHERE id = ?`,
            [callResult.log, lead.id]
          );
          run(
            `UPDATE campaigns 
             SET processed_leads = processed_leads + 1, failed_calls = failed_calls + 1, failed_sms = failed_sms + 1 
             WHERE id = ?`,
            [campaignId]
          );
        } else {
          // Chamada iniciada na VAPI com sucesso, aguardando webhook de finalização
          run(
            `UPDATE leads 
             SET call_log = ?, call_attempts = call_attempts + 1 
             WHERE id = ?`,
            [callResult.log, lead.id]
          );
        }
      } catch (err) {
        console.error(`[EXECUTOR ERROR] Falha no disparo do lead #${lead.id}:`, err.message);
        run(
          `UPDATE leads SET call_status = 'failed', call_log = ? WHERE id = ?`,
          [`Erro de execução: ${err.message}`, lead.id]
        );
      }

      // 6. Intervalo entre cada chamada para manter fluxo constante e estável
      await new Promise((resolve) => setTimeout(resolve, paceDelayMs));
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
