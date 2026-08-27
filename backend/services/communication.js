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

  // Implementar Modo de Teste: Redireciona para o número de teste se TEST_PHONE estiver no .env
  const targetPhone = process.env.TEST_PHONE || lead.phone;
  if (process.env.TEST_PHONE) {
    console.log(`[Smart RCS - MODO TESTE] Redirecionando mensagem do Lead #${lead.id} (${lead.phone}) para o número de teste: ${targetPhone}`);
  }

  // Se a chave não estiver configurada no .env, roda no modo simulado (Mock)
  if (!apiKey) {
    console.log(`[Smart RCS MOCK] API Key não configurada. Simulando envio para ${targetPhone}`);
    return {
      success: true,
      log: `[SIMULATED Smart RCS] Mensagem simulada enviada com sucesso para ${targetPhone}.`
    };
  }

  // Limpar telefone (apenas dígitos e com prefixo DDI 55)
  let cleanedPhone = String(targetPhone).replace(/\D/g, '');
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

/**
 * Envia um e-mail com o boleto/acordo usando a API da Locaweb SMTPlw.
 * 
 * @param {object} lead - O objeto do lead
 * @returns {Promise<{success: boolean, log: string}>}
 */
async function sendLocawebEmail(lead) {
  const token = process.env.LOCAWEB_TOKEN || '45790aba479f30ec65f106995d8e7424';
  const fromName = process.env.LOCAWEB_FROM_NAME || 'Grupo DDM';
  const fromEmail = 'comunicado@envios.ddm.adv.br';
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

  // Template HTML adaptado para a Vero Internet / Grupo DDM
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
            <td style="background-color:#1F1F1F;padding:28px 32px;text-align:left;">
              <img src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,h=152,fit=crop/m6L4ppGnqncBWn2J/ativo-16-YZ9a5WVxR2fx79Vd.png" alt="Grupo DDM" height="40" style="display:block;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.7;color:#1F1F1F;">
              <h2 style="color:#1F1F1F;font-family:'Poppins',Arial,sans-serif;margin:0 0 12px 0;font-size:22px;">Aviso de Fatura em Aberto — Vero Internet</h2>
              <p style="margin:0 0 16px 0;">Prezado(a) <strong>${lead.name}</strong>,</p>
              <p style="margin:0 0 20px 0;">
                Confirmamos o seu contato com a nossa assessoria de cobrança referente à pendência com a <strong>Vero Internet</strong>. Conforme solicitado, segue o código de barras para pagamento:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F4;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
                <tr><td style="padding:6px 0;word-break:break-all;"><strong>Linha Digitável:</strong> ${lead.barcode}</td></tr>
                <tr><td style="padding:6px 0;"><strong>Valor da Fatura:</strong> <span style="color:#FF5706;font-size:16px;font-weight:bold;">${valorFormatado}</span></td></tr>
                <tr><td style="padding:6px 0;"><strong>Vencimento Original:</strong> ${lead.due_date || ''}</td></tr>
                <tr><td style="padding:6px 0;"><strong>Dias em Atraso:</strong> ${lead.dias_atraso || 0} dias</td></tr>
              </table>
              <div style="background:#FAF7F4;border-left:4px solid #FF5706;padding:20px;margin:24px 0;border-radius:6px;text-align:center;">
                <h3 style="margin:0 0 12px 0;font-family:'Poppins',Arial,sans-serif;color:#1F1F1F;font-size:15px;">Copie a Linha Digitável acima e utilize o aplicativo do seu banco para efetuar o pagamento.</h3>
              </div>
              <p style="margin:20px 0 0 0;font-size:14px;color:#475467;">
                Qualquer dúvida, nossa equipe está à disposição.<br>
                <strong>Equipe de Atendimento — Grupo DDM</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FF5706;padding:24px 32px;color:#ffffff;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 12px 0;font-family:'Poppins',Arial,sans-serif;font-weight:700;font-size:15px;">Fale Conosco</p>
              <p style="margin:0 0 12px 0;">
                <strong>Telefones:</strong> Rio de Janeiro (21) 3030-9193 &nbsp;|&nbsp; Demais localidades 4020-7740<br>
                Atendimento de segunda a sexta, das 8h às 20h.
              </p>
              <a href="https://bit.ly/ddm-educacional" target="_blank" style="display:inline-block;background-color:#ffffff;color:#FF5706;text-decoration:none;font-family:'Poppins',Arial,sans-serif;font-weight:600;font-size:14px;padding:10px 20px;border-radius:6px;margin-top:4px;">
                Falar no WhatsApp
              </a>
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
  triggerN8NSmsWebhook: triggerSmartRcs,
  sendLocawebEmail
};
