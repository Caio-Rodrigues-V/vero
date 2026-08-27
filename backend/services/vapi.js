import dotenv from 'dotenv';
import { SYSTEM_PROMPT_TEMPLATE, FIRST_MESSAGE_TEMPLATE } from '../config/agentPrompt.js';
import { get } from '../db.js';

dotenv.config();

/**
 * Formata o valor de débito para Real (R$)
 */
function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/**
 * Normaliza o telefone para formato E.164 (ex: +5511999998888)
 */
function formatE164(phone) {
  let cleaned = String(phone).replace(/\D/g, '');
  if (!cleaned.startsWith('55') && cleaned.length >= 10) {
    cleaned = '55' + cleaned;
  }
  return '+' + cleaned;
}

/**
 * Dispara uma chamada de voz conversacional real usando a VAPI.ai
 * 
 * @param {object} lead - O lead contendo telefone, nome, valor e vencimento
 * @returns {Promise<{success: boolean, log: string, callId?: string}>}
 */
export async function makeVapiCall(lead) {
  const apiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  // Buscar o assistente selecionado nesta campanha no banco
  let campaignAssistantId = null;
  try {
    const campaign = get('SELECT vapi_assistant_id FROM campaigns WHERE id = ?', [lead.campaign_id]);
    campaignAssistantId = campaign?.vapi_assistant_id;
  } catch (err) {
    console.error('[VAPI] Erro ao buscar vapi_assistant_id da campanha no banco:', err.message);
  }

  const finalAssistantId = campaignAssistantId || assistantId;

  const phoneE164 = formatE164(lead.phone);
  const formattedDebt = formatBRL(lead.debt_value);
  const dueDateStr = lead.due_date || 'data não especificada';

  // Compilar os prompts substituindo as variáveis
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace(/\{\{name\}\}/g, lead.name)
    .replace(/\{\{debt_value\}\}/g, formattedDebt)
    .replace(/\{\{due_date\}\}/g, dueDateStr);

  const firstMessage = FIRST_MESSAGE_TEMPLATE
    .replace(/\{\{name\}\}/g, lead.name)
    .replace(/\{\{debt_value\}\}/g, formattedDebt);

  // Se não houver chave de API VAPI configurada, roda no modo Mock/Simulado
  if (!apiKey) {
    console.log(`[VAPI MOCK] Ligando para ${phoneE164} usando Assistente: ${finalAssistantId || 'Inline-Helena'}`);
    console.log(`[VAPI MOCK] Prompt Inicial: "${firstMessage}"`);
    return {
      success: true,
      log: `[SIMULATED VAPI] Ligação efetuada em modo de teste para assistente ${finalAssistantId || 'Helena'}.`
    };
  }

  // Montar o corpo da requisição para a VAPI
  let body = {
    customer: {
      number: phoneE164,
      name: lead.name
    },
    metadata: {
      lead_id: lead.id,
      campaign_id: lead.campaign_id
    }
  };

  // Se o usuário especificou um ID de número da VAPI para fazer a chamada externa
  if (phoneNumberId) {
    body.phoneNumberId = phoneNumberId;
  }

  // Decidir se usamos um ID existente com os prompts do nosso backend de override ou se criamos inline
  if (finalAssistantId) {
    body.assistantId = finalAssistantId;
    body.assistantOverrides = {
      recordingEnabled: true,
      firstMessage: firstMessage,
      model: {
        messages: [
          {
            role: "system",
            content: systemPrompt
          }
        ]
      },
      variableValues: {
        name: lead.name,
        debt_value: formattedDebt,
        due_date: dueDateStr
      }
    };
  } else {
    // Assistente inline - Totalmente definido no nosso backend!
    body.assistant = {
      name: "Helena - Vero Cobrança",
      firstMessage: firstMessage,
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt
          }
        ]
      },
      voice: {
        provider: "playht",
        voiceId: "susan" // Voz feminina em pt-BR recomendada
      },
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 300 // Limite de 5 minutos
    };
  }

  try {
    const response = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Erro VAPI HTTP: ${response.status}`);
    }

    return {
      success: true,
      callId: data.id,
      log: `Chamada VAPI iniciada com sucesso. ID: ${data.id}`
    };

  } catch (error) {
    console.error(`[VAPI ERROR] Falha ao disparar chamada para o lead #${lead.id}:`, error.message);
    return {
      success: false,
      log: `Erro na API VAPI: ${error.message}`
    };
  }
}
