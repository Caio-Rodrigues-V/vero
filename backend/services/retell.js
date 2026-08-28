const { run, get } = require('../db.js');
const { triggerN8NSmsWebhook } = require('./communication.js');

/**
 * Disparar ligação de cobrança via Retell AI API
 * @param {Object} lead - Dados do lead
 * @returns {Promise<Object>} Resultado da chamada
 */
async function makeRetellCall(lead) {
  const apiKey = process.env.RETELL_API_KEY || 'key_a5dbdb38e3718d2aaa70862d1ad8';
  const agentId = process.env.RETELL_AGENT_ID || 'agent_7bc0f8110f1a29b6f4c0151320';
  const fromNumber = process.env.RETELL_FROM_NUMBER || '551153301578';

  // Buscar assistente selecionado na campanha se houver
  let campaignAgentId = agentId;
  try {
    const campaign = get('SELECT vapi_assistant_id FROM campaigns WHERE id = ?', [lead.campaign_id]);
    if (campaign && campaign.vapi_assistant_id && campaign.vapi_assistant_id.startsWith('agent_')) {
      campaignAgentId = campaign.vapi_assistant_id;
    }
  } catch (err) {
    console.error('Erro ao buscar agent_id da campanha para Retell:', err.message);
  }

  // Garantir número formatado em E.164
  let phone = (lead.phone || '').trim().replace(/\D/g, '');
  if (!phone.startsWith('55')) {
    phone = '55' + phone;
  }
  phone = '+' + phone;

  console.log(`[RETELL] Disparando chamada para Lead #${lead.id} (${lead.name}) -> ${phone}`);

  try {
    const response = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from_number: fromNumber,
        to_number: phone,
        override_agent_id: campaignAgentId,
        retell_llm_dynamic_variables: {
          nome: lead.name || 'Cliente',
          valor: lead.debt_amount ? `R$ ${lead.debt_amount}` : 'seu débito pendente',
          vencimento: lead.due_date || 'data recente',
          contrato: lead.contract_number || 'N/A'
        }
      })
    });

    const data = await response.json();

    if (data && data.call_id) {
      console.log(`[RETELL] Chamada registrada com sucesso! Call ID: ${data.call_id}`);
      
      // Atualizar lead no banco local com o call_id da Retell
      run(
        `UPDATE leads SET 
          call_id = ?, 
          call_status = 'in_progress', 
          updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?`,
        [data.call_id, lead.id]
      );

      return { success: true, callId: data.call_id, log: `Chamada Retell iniciada com sucesso. ID: ${data.call_id}` };
    } else {
      const errMsg = data.message || data.error || JSON.stringify(data);
      console.error(`[RETELL] Erro no retorno da API Retell:`, errMsg);
      return { success: false, log: `Erro Retell API: ${errMsg}` };
    }

  } catch (error) {
    console.error(`[RETELL] Exceção ao chamar API da Retell:`, error.message);
    return { success: false, log: `Exceção Retell API: ${error.message}` };
  }
}

/**
 * Processar Webhook enviado pela Retell AI (call_ended, call_analyzed, etc.)
 */
async function handleRetellWebhook(eventData) {
  const event = eventData.event;
  const call = eventData.call || eventData;

  if (!call || !call.call_id) {
    return { status: 'ignored', reason: 'Payload sem call_id' };
  }

  console.log(`[RETELL WEBHOOK] Evento: ${event} | Call ID: ${call.call_id} | Status: ${call.call_status}`);

  // Buscar o lead correspondente a essa chamada no banco
  const lead = get('SELECT * FROM leads WHERE call_id = ?', [call.call_id]);
  if (!lead) {
    console.log(`[RETELL WEBHOOK] Lead não encontrado no banco local para Call ID: ${call.call_id}`);
    return { status: 'ignored', reason: 'Lead não encontrado' };
  }

  // Se o evento for de encerramento de chamada
  if (event === 'call_ended' || event === 'call_analyzed' || call.call_status === 'ended') {
    const disconnectionReason = call.disconnection_reason || 'call_ended';
    const transcript = call.transcript || (call.transcript_object ? call.transcript_object.map(t => `${t.role.toUpperCase()}: ${t.content}`).join('\n') : '');
    const durationSeconds = Math.round((call.end_timestamp - call.start_timestamp) / 1000) || 0;
    
    // Mapear resultado
    let finalCallStatus = 'completed';
    let occurrenceText = 'ATENDIMENTO CONCLUÍDO';

    if (disconnectionReason.includes('no_answer') || disconnectionReason.includes('user_busy') || disconnectionReason.includes('voicemail')) {
      finalCallStatus = 'failed';
      occurrenceText = 'NÃO ATENDIDO / OCUPADO';
    } else if (disconnectionReason.includes('dial_failed') || disconnectionReason.includes('error')) {
      finalCallStatus = 'failed';
      occurrenceText = `ERRO SIP (${disconnectionReason})`;
    }

    // Gravar no banco de dados local
    run(
      `UPDATE leads SET 
        call_status = ?, 
        call_duration = ?, 
        transcript = ?, 
        occurrence = ?, 
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?`,
      [finalCallStatus, durationSeconds, transcript, occurrenceText, lead.id]
    );

    // Se a chamada foi concluída e com diálogo ativo, verificar e enviar Smart RCS se necessário
    if (finalCallStatus === 'completed' && transcript.length > 20) {
      console.log(`[RETELL WEBHOOK] Processando envio de Smart RCS para Lead #${lead.id}...`);
      await triggerN8NSmsWebhook(lead).catch(err => console.error('[RETELL SMS ERROR]', err.message));
    }

    // Recalcular estatísticas da campanha
    try {
      const { updateCampaignStats } = require('../app');
      if (updateCampaignStats) updateCampaignStats(lead.campaign_id);
    } catch (e) {}

    return { status: 'success', leadId: lead.id, callStatus: finalCallStatus };
  }

  return { status: 'received' };
}

module.exports = {
  makeRetellCall,
  handleRetellWebhook
};
