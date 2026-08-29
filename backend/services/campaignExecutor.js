const { run, get, all } = require('../db.js');
const { triggerN8NSmsWebhook } = require('./communication.js');
const { makeVapiCall } = require('./vapi.js');

const activeJobs = new Set();

/**
 * Processa o envio de leads: Ligação pela VAPI ou Retell AI
 */
async function processCampaign(campaignId) {
  if (activeJobs.has(campaignId)) return;
  activeJobs.add(campaignId);

  const paceDelayMs = parseInt(process.env.WORKER_DELAY_BETWEEN_CALLS_MS || process.env.CALL_PACE_DELAY_MS || '5000', 10);
  const safePaceDelay = isNaN(paceDelayMs) || paceDelayMs < 100 ? 5000 : paceDelayMs;

  console.log(`[EXECUTOR] Iniciando processamento da campanha #${campaignId} (Delay entre chamadas: ${safePaceDelay}ms)`);

  try {
    while (activeJobs.has(campaignId)) {
      // 1. Verificar se a campanha ainda está 'processing'
      const campaign = get('SELECT status, concurrency_limit, dialer_provider FROM campaigns WHERE id = ?', [campaignId]);
      if (!campaign || campaign.status !== 'processing') {
        console.log(`[EXECUTOR] Campanha #${campaignId} foi pausada ou finalizada. Interrompendo robô.`);
        activeJobs.delete(campaignId);
        break;
      }

      const provider = (campaign.dialer_provider || process.env.DIALER_PROVIDER || 'vapi').toLowerCase();

      // Auto-limpeza de segurança: resetar ou falhar chamadas presas em 'calling'/'in_progress' há mais de 3 minutos
      run(
        `UPDATE leads 
         SET call_status = 'failed', occurrence = '999 - TIMEOUT_DISCAGEM', call_log = 'Timeout: Chamada sem callback do provedor por mais de 3 minutos', updated_at = CURRENT_TIMESTAMP 
         WHERE campaign_id = ? AND call_status IN ('calling', 'in_progress') AND (created_at IS NULL OR datetime(created_at) < datetime('now', '-3 minutes'))`,
        [campaignId]
      );

      // 2. Verificar limite de chamadas ativas simultâneas (concorrência - Padrão 10 para Retell AI)
      const defaultLimit = provider === 'retell' ? 10 : 2;
      const concurrencyLimit = (campaign.concurrency_limit && campaign.concurrency_limit > 2) ? campaign.concurrency_limit : defaultLimit;

      const activeCallsObj = get(
        `SELECT COUNT(*) as count FROM leads WHERE campaign_id = ? AND call_status IN ('calling', 'in_progress')`,
        [campaignId]
      );
      const activeCalls = activeCallsObj ? activeCallsObj.count : 0;

      if (activeCalls >= concurrencyLimit) {
        // Aguarda 500ms antes de checar novamente a fila de concorrência
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      // 3. Pegar o próximo lead pendente de ligação
      const lead = get(
        `SELECT * FROM leads 
         WHERE campaign_id = ? 
           AND call_status = 'pending'
         ORDER BY id ASC 
         LIMIT 1`,
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
         SET call_status = 'calling', sms_status = 'pending', email_status = 'pending', call_log = 'Iniciando discagem ${provider.toUpperCase()}...' 
         WHERE id = ?`,
        [lead.id]
      );

      // 5. Disparar a chamada para a VAPI ou RETELL AI (Lazy-load para proteger a VAPI)
      try {
        let callResult;
        if (provider === 'retell') {
          const { makeRetellCall } = require('./retell.js');
          callResult = await makeRetellCall(lead);
        } else {
          callResult = await makeVapiCall(lead);
        }

        if (!callResult.success) {
          const isConcurrencyError = callResult.log && (
            callResult.log.toLowerCase().includes('concurrency') ||
            callResult.log.toLowerCase().includes('rate limit') ||
            callResult.log.toLowerCase().includes('too many') ||
            callResult.log.toLowerCase().includes('quota') ||
            callResult.log.includes('429')
          );

          if (isConcurrencyError) {
            console.log(`[EXECUTOR CONCORRÊNCIA] Limite de concorrência/rate limit (${provider.toUpperCase()}) atingido. Devolvendo lead #${lead.id} para a fila e aguardando 3s...`);
            run(
              `UPDATE leads SET call_status = 'pending', call_log = 'Aguardando liberação de vaga no canal...' WHERE id = ?`,
              [lead.id]
            );
            await new Promise((resolve) => setTimeout(resolve, 3000));
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
      await new Promise((resolve) => setTimeout(resolve, safePaceDelay));
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
