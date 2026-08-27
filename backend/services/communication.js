import dotenv from 'dotenv';
dotenv.config();

/**
 * Dispara o Webhook do n8n para enviar o SMS/RCS do lead.
 * 
 * @param {object} lead - O objeto do lead
 * @returns {Promise<{success: boolean, log: string}>}
 */
export async function triggerN8NSmsWebhook(lead) {
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  
  if (!n8nUrl) {
    console.log(`[n8n SMS MOCK] Webhook do n8n não configurado. Simulando envio de SMS/RCS para ${lead.name}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      success: true,
      log: `[SIMULATED] SMS/RCS mock enviado com sucesso.`
    };
  }

  try {
    const response = await fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lead_id: lead.id,
        campaign_id: lead.campaign_id,
        name: lead.name,
        phone: lead.phone,
        debt_value: lead.debt_value,
        due_date: lead.due_date,
        type: 'sms_rcs'
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    return {
      success: true,
      log: `Webhook n8n SMS/RCS disparado. Status: ${response.status}`
    };
  } catch (error) {
    console.error(`[n8n SMS ERROR] Falha no webhook para lead #${lead.id}:`, error.message);
    return {
      success: false,
      log: `Erro no n8n SMS/RCS: ${error.message}`
    };
  }
}
