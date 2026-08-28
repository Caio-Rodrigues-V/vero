const dotenv = require('dotenv');
const { SYSTEM_PROMPT_TEMPLATE, FIRST_MESSAGE_TEMPLATE } = require('../config/agentPrompt.js');
const { get } = require('../db.js');

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
 * Converte valor float em BRL para extenso em Português (Regra rígida de voz da Verô)
 */
function numberToWordsBRL(amount) {
  const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "dez", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function convertGroup(n) {
    if (n === 100) return "cem";
    let words = [];
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;

    if (h > 0) words.push(hundreds[h]);
    if (t === 1) {
      words.push(teens[u]);
    } else {
      if (t > 0) words.push(tens[t]);
      if (u > 0) words.push(units[u]);
    }
    return words.filter(Boolean).join(" e ");
  }

  const parts = parseFloat(amount).toFixed(2).split(".");
  const reais = parseInt(parts[0]);
  const centavos = parseInt(parts[1]);

  let reaisStr = "";
  if (reais === 0) {
    reaisStr = "zero reais";
  } else if (reais === 1) {
    reaisStr = "um real";
  } else {
    const thousands = Math.floor(reais / 1000);
    const remainder = reais % 1000;
    let partsStr = [];
    if (thousands > 0) {
      partsStr.push(thousands === 1 ? "mil" : convertGroup(thousands) + " mil");
    }
    if (remainder > 0) {
      partsStr.push(convertGroup(remainder));
    }
    reaisStr = partsStr.join(" e ") + " reais";
  }

  let centavosStr = "";
  if (centavos > 0) {
    if (centavos === 1) {
      centavosStr = "um centavo";
    } else {
      centavosStr = convertGroup(centavos) + " centavos";
    }
  }

  if (reaisStr && centavosStr) {
    return `${reaisStr} e ${centavosStr}`;
  }
  return reaisStr || centavosStr;
}

/**
 * Converte quantidade de dias/faturas por extenso (Regra rígida de voz da Verô)
 */
function daysToWords(days) {
  const units = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "dez", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function convertGroup(n) {
    if (n === 100) return "cem";
    let words = [];
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;

    if (h > 0) words.push(hundreds[h]);
    if (t === 1) {
      words.push(teens[u]);
    } else {
      if (t > 0) words.push(tens[t]);
      if (u > 0) words.push(units[u]);
    }
    return words.filter(Boolean).join(" e ");
  }

  if (days <= 9) return units[days];
  return convertGroup(days);
}

/**
 * Dispara uma chamada de voz conversacional real usando a VAPI.ai
 * 
 * @param {object} lead - O lead contendo telefone, nome, valor e vencimento
 * @returns {Promise<{success: boolean, log: string, callId?: string}>}
 */
async function makeVapiCall(lead) {
  const apiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  let phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || '15a2edcc-cec9-4118-8696-26b4c38ccc91'; // Ligação VAPI Oficial (+552123918741)

  // Buscar o assistente selecionado nesta campanha no banco
  let campaignAssistantId = null;
  try {
    const campaign = get('SELECT vapi_assistant_id FROM campaigns WHERE id = ?', [lead.campaign_id]);
    campaignAssistantId = campaign?.vapi_assistant_id;
  } catch (err) {
    console.error('[VAPI] Erro ao buscar vapi_assistant_id da campanha no banco:', err.message);
  }

  const finalAssistantId = campaignAssistantId || assistantId;

  // Implementar Modo de Teste: Redireciona para o número de teste se TEST_PHONE estiver no .env
  const targetPhone = process.env.TEST_PHONE || lead.phone;
  if (process.env.TEST_PHONE) {
    console.log(`[VAPI - MODO TESTE] Redirecionando chamada do Lead #${lead.id} (${lead.phone}) para o número de teste: ${targetPhone}`);
  }

  const phoneE164 = formatE164(targetPhone);
  
  // Compilar as variáveis da Verô conforme as regras rígidas de voz
  const valorFaturaText = numberToWordsBRL(lead.debt_value);
  const statusInternetText = lead.status_internet || '';
  const diasAtrasoText = daysToWords(lead.dias_atraso || 0) + ' dias';

  // Calcular quantidade de faturas deste cliente na campanha (número de ocorrências deste fone)
  let numeroFaturas = 1;
  try {
    const countResult = get('SELECT COUNT(id) as count FROM leads WHERE campaign_id = ? AND phone = ?', [lead.campaign_id, lead.phone]);
    if (countResult && countResult.count > 0) {
      numeroFaturas = countResult.count;
    }
  } catch (err) {
    console.error('[VAPI] Erro ao calcular número de faturas do lead:', err.message);
  }

  const faturasWords = ["zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
  const faturasText = numeroFaturas <= 10 ? faturasWords[numeroFaturas] : String(numeroFaturas);

  // Determinar se o telefone é fixo ou móvel
  const cleanNum = lead.phone.replace(/\D/g, '');
  let isMobile = false;
  if (cleanNum.startsWith('55')) {
    isMobile = cleanNum.length === 13 && cleanNum.charAt(4) === '9';
  } else {
    isMobile = cleanNum.length === 11 && cleanNum.charAt(2) === '9';
  }
  const tipoTelefoneText = isMobile ? 'móvel' : 'fixo';

  // Compilar os prompts substituindo as variáveis da Verô
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace(/\{\{nome_cliente\}\}/g, lead.name)
    .replace(/\{\{valor_fatura\}\}/g, valorFaturaText)
    .replace(/\{\{dias_atraso\}\}/g, diasAtrasoText)
    .replace(/\{\{status_internet\}\}/g, statusInternetText)
    .replace(/\{\{numero_faturas\}\}/g, faturasText)
    .replace(/\{\{tipo_telefone\}\}/g, tipoTelefoneText);

  const firstMessage = FIRST_MESSAGE_TEMPLATE
    .replace(/\{\{nome_cliente\}\}/g, lead.name);

  // Se não houver chave de API VAPI configurada, roda no modo Mock/Simulado
  if (!apiKey) {
    console.log(`[VAPI MOCK] Ligando para ${phoneE164} usando Assistente: ${finalAssistantId || 'Inline-Vero'}`);
    console.log(`[VAPI MOCK] Prompt Inicial: "${firstMessage}"`);
    return {
      success: true,
      log: `[SIMULATED VAPI] Ligação efetuada em modo de teste para assistente ${finalAssistantId || 'Verô'}.`
    };
  }

  const baseUrl = process.env.APP_BASE_URL || 'https://verolembrete.grupoddm.ia.br';
  const webhookUrl = `${baseUrl}/api/vapi-webhook`;

  // Sanitizar o nome do cliente removendo sufixos de teste como (TESTE PROD)
  const cleanName = (lead.name || '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/TESTE PROD/gi, '')
    .trim() || lead.name;

  // Montar o corpo da requisição exatamente igual ao padrao vapi-caio
  const body = {
    assistantId: finalAssistantId,
    phoneNumberId: phoneNumberId,
    customer: {
      number: phoneE164,
      name: cleanName
    },
    metadata: {
      lead_id: lead.id,
      campaign_id: lead.campaign_id
    },
    assistantOverrides: {
      variableValues: {
        NOME_DEV: cleanName,
        nome_cliente: cleanName,
        VAL_NOMINAL: valorFaturaText,
        valor_fatura: valorFaturaText,
        dias_atraso: diasAtrasoText,
        status_internet: statusInternetText,
        numero_faturas: faturasText,
        tipo_telefone: tipoTelefoneText
      }
    }
  };

  try {
    console.log(`[VAPI CALL] Disparando chamada para ${phoneE164} | AssistantId: ${finalAssistantId} | PhoneNumberId: ${phoneNumberId || 'Nenhum'}`);

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

module.exports = { makeVapiCall };
