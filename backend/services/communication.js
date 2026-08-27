const dotenv = require('dotenv');
dotenv.config();

/**
 * Dispara a mensagem SMS diretamente usando a API da Unipix.
 * 
 * @param {object} lead - O objeto do lead
 * @returns {Promise<{success: boolean, log: string}>}
 */
async function triggerUnipixSms(lead) {
  const username = process.env.UNIPIX_USERNAME;
  const password = process.env.UNIPIX_PASSWORD;
  const centroCustoId = process.env.UNIPIX_CENTRO_CUSTO_ID || '123';
  const produtoId = process.env.UNIPIX_PRODUTO_ID || '34';
  const apiUrl = 'https://api-sms-cliente.unipix.com.br/v2/api/campanha/simples';

  // Implementar Modo de Teste: Redireciona para o número de teste se TEST_PHONE estiver no .env
  const targetPhone = process.env.TEST_PHONE || lead.phone;
  if (process.env.TEST_PHONE) {
    console.log(`[Unipix SMS - MODO TESTE] Redirecionando mensagem do Lead #${lead.id} (${lead.phone}) para o número de teste: ${targetPhone}`);
  }

  // Se o usuário/senha não estiver configurado no .env, roda no modo simulado (Mock)
  if (!username || !password) {
    console.log(`[Unipix SMS MOCK] Usuário/Senha não configurados. Simulando envio para ${targetPhone}`);
    return {
      success: true,
      log: `[SIMULATED Unipix SMS] Mensagem simulada enviada com sucesso para ${targetPhone}.`
    };
  }

  // Limpar telefone (apenas dígitos e com prefixo DDI 55)
  let cleanedPhone = String(targetPhone).replace(/\D/g, '');
  if (!cleanedPhone.startsWith('55') && cleanedPhone.length >= 10) {
    cleanedPhone = '55' + cleanedPhone;
  }

  // Se não houver código de barras, gera aviso para não tentar enviar SMS vazio
  if (!lead.barcode) {
    console.log(`[Unipix SMS] Lead #${lead.id} não possui linha digitável. Abortando envio.`);
    return {
      success: false,
      log: 'Cancelado: Lead não possui linha digitável.'
    };
  }

  const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.debt_value);
  
  // Mensagem padronizada da Vero para envio de boleto
  const messageText = `Vero: Olá ${lead.name}, segue a Linha Digitável para pagamento da sua fatura em atraso no valor de ${valorFormatado}:\n\n${lead.barcode}`;

  try {
    console.log(`[Unipix SMS] Enviando mensagem para ${cleanedPhone}...`);
    
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        centroCustoId: parseInt(centroCustoId, 10),
        envios: [
          {
            mensagemNumero: messageText,
            numero: cleanedPhone,
            smsClienteId: String(lead.id)
          }
        ],
        mensagemCampanha: "",
        nome: "Vero Cobrança",
        produtoId: parseInt(produtoId, 10),
        telefones: ""
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Erro API Unipix: ${response.status} - ${responseText}`);
    }

    const data = JSON.parse(responseText);
    const smsId = data.smsEnvios && data.smsEnvios[0] ? data.smsEnvios[0].smsId : (data.id || 'N/A');

    console.log(`[Unipix SMS] Mensagem enviada com sucesso para ${cleanedPhone}. ID: ${smsId}`);
    return {
      success: true,
      log: `[Unipix SMS] Enviado com sucesso. ID: ${smsId}`
    };
  } catch (error) {
    console.error(`[Unipix SMS ERROR] Falha ao enviar para lead #${lead.id}:`, error.message);
    return {
      success: false,
      log: `[Unipix SMS] Falha no envio: ${error.message}`
    };
  }
}

/**
 * Envia um e-mail com o boleto/acordo usando a API da Locaweb SMTPlw.
 * 
 * @param {object} lead - O objeto do lead
 * @returns {Promise<{success: boolean, log: string}>}
 */
async function sendLocawebEmail(lead) {
  const token = process.env.LOCAWEB_TOKEN || '45790aba479f30ec65f106995d8e7424';
  const fromName = process.env.LOCAWEB_FROM_NAME || 'Vero Internet';
  const fromEmail = process.env.LOCAWEB_FROM || 'verointernet@grupoddm.com.br';
  const apiUrl = 'https://api.smtplw.com.br/v1/messages';

  if (!lead.email || !lead.email.includes('@')) {
    return { success: false, log: 'Cancelado: Lead sem e-mail cadastrado.' };
  }

  // Se houver TEST_EMAIL no .env, redireciona o e-mail para o teste
  const targetEmail = process.env.TEST_EMAIL || lead.email;
  if (process.env.TEST_EMAIL) {
    console.log(`[Locaweb Email - MODO TESTE] Redirecionando e-mail do Lead #${lead.id} (${lead.email}) para o e-mail de teste: ${targetEmail}`);
  }

  // Se não houver código de barras, gera aviso
  if (!lead.barcode) {
    console.log(`[Locaweb Email] Lead #${lead.id} não possui linha digitável. Abortando envio.`);
    return {
      success: false,
      log: 'Cancelado: Lead não possui linha digitável.'
    };
  }

  const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.debt_value);

  // Template HTML adaptado para a Vero Internet
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Inter:wght@400;500&display=swap');
  </style>
</head>
<body style="margin:0;padding:0;background-color:#FAF7F4;font-family:'Inter',Arial,sans-serif;color:#1F1F1F;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F4;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#ffffff;padding:24px 32px;text-align:left;border-bottom:1px solid #FAF7F4;">
              <img src="https://upload.wikimedia.org/wikipedia/commons/0/0a/Logo-vero-internet-png.png" alt="Vero Internet" height="42" style="display:block;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.7;color:#1F1F1F;">
              <h2 style="color:#5b1f8f;font-family:'Poppins',Arial,sans-serif;margin:0 0 12px 0;font-size:22px;">Aviso de Fatura em Aberto</h2>
              <p style="margin:0 0 16px 0;">Prezado(a) <strong>${lead.name}</strong>,</p>
              <p style="margin:0 0 20px 0;">
                Confirmamos o seu contato com a nossa agente virtual referente à pendência com a <strong>Vero Internet</strong>. Conforme solicitado, segue o código de barras para pagamento da sua fatura:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F4;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
                <tr><td style="padding:6px 0;word-break:break-all;"><strong>Linha Digitável:</strong> ${lead.barcode}</td></tr>
                <tr><td style="padding:6px 0;"><strong>Valor da Fatura:</strong> <span style="color:#5b1f8f;font-size:16px;font-weight:bold;">${valorFormatado}</span></td></tr>
                <tr><td style="padding:6px 0;"><strong>Vencimento Original:</strong> ${lead.due_date || ''}</td></tr>
                <tr><td style="padding:6px 0;"><strong>Dias em Atraso:</strong> ${lead.dias_atraso || 0} dias</td></tr>
              </table>
              <div style="background:#FAF7F4;border-left:4px solid #5b1f8f;padding:20px;margin:24px 0;border-radius:6px;text-align:center;">
                <h3 style="margin:0 0 12px 0;font-family:'Poppins',Arial,sans-serif;color:#1F1F1F;font-size:15px;">Copie a Linha Digitável acima e utilize o aplicativo do seu banco para efetuar o pagamento.</h3>
              </div>
              <p style="margin:20px 0 0 0;font-size:14px;color:#475467;">
                Qualquer dúvida, nossa equipe está à disposição.<br>
                <strong>Equipe de Atendimento — Vero Internet</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  try {
    console.log(`[Locaweb Email] Enviando e-mail para ${targetEmail}...`);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: targetEmail,
        subject: `Fatura em Aberto — Vero Internet`,
        body: htmlBody,
        headers: {
          'content-type': 'text/html'
        }
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Erro API Locaweb: ${response.status} - ${responseText}`);
    }

    console.log(`[Locaweb Email] E-mail enviado com sucesso para ${targetEmail}. Resposta: ${responseText}`);
    return {
      success: true,
      log: `[Locaweb Email] Enviado com sucesso.`
    };
  } catch (error) {
    console.error(`[Locaweb Email ERROR] Falha ao enviar para lead #${lead.id}:`, error.message);
    return {
      success: false,
      log: `[Locaweb Email ERROR] Falha: ${error.message}`
    };
  }
}

module.exports = { 
  triggerN8NSmsWebhook: triggerUnipixSms,
  sendLocawebEmail
};
