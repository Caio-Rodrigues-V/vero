const dotenv = require('dotenv');
dotenv.config();

/**
 * Dispara a mensagem SMS/RCS diretamente usando a API da Smart RCS.
 * 
 * @param {object} lead - O objeto do lead
 * @returns {Promise<{success: boolean, log: string}>}
 */
async function triggerSmartRcs(lead) {
  const apiKey = process.env.SMART_RCS_API_KEY;
  const sender = process.env.SMART_RCS_SENDER || 'rcs_grupoddm';
  const apiUrl = 'https://developer.smartrcs.com.br/api/Message/text';

  // Se a chave não estiver configurada no .env, roda no modo simulado (Mock)
  if (!apiKey) {
    console.log(`[Smart RCS MOCK] API Key não configurada. Simulando envio para ${lead.phone}`);
    return {
      success: true,
      log: `[SIMULATED Smart RCS] Mensagem simulada enviada com sucesso para ${lead.phone}.`
    };
  }

  // Limpar telefone (apenas dígitos e com prefixo DDI 55)
  let cleanedPhone = String(lead.phone).replace(/\D/g, '');
  if (!cleanedPhone.startsWith('55') && cleanedPhone.length >= 10) {
    cleanedPhone = '55' + cleanedPhone;
  }

  // Se não houver código de barras, gera aviso para não tentar enviar SMS vazio
  if (!lead.barcode) {
    console.log(`[Smart RCS] Lead #${lead.id} não possui linha digitável. Abortando envio.`);
    return {
      success: false,
      log: 'Cancelado: Lead não possui linha digitável.'
    };
  }

  const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.debt_value);
  
  // Mensagem padronizada da Vero para envio de boleto
  const messageText = `Vero: Olá ${lead.name}, segue a Linha Digitável para pagamento da sua fatura em atraso no valor de ${valorFormatado}:\n\n${lead.barcode}`;

  try {
    console.log(`[Smart RCS] Enviando mensagem para ${cleanedPhone}...`);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify({
        sender: sender,
        destinations: [
          {
            to: cleanedPhone,
            messageid: String(lead.id)
          }
        ],
        text: messageText,
        fallback: true
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Erro API Smart RCS: ${response.status} - ${responseText}`);
    }

    console.log(`[Smart RCS] Mensagem enviada com sucesso para ${cleanedPhone}. Resposta: ${responseText}`);
    return {
      success: true,
      log: `[Smart RCS] Enviado via gateway. ID da Mensagem: ${lead.id}`
    };
  } catch (error) {
    console.error(`[Smart RCS ERROR] Falha ao enviar para lead #${lead.id}:`, error.message);
    return {
      success: false,
      log: `[Smart RCS] Falha no envio: ${error.message}`
    };
  }
}

module.exports = { triggerN8NSmsWebhook: triggerSmartRcs };
