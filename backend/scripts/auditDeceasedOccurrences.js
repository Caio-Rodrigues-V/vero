const { all } = require('../db.js');
const { extractCustomerSpeech, normalizeText } = require('../utils/classifier.js');

function mentionsDeath(text) {
  const normalized = normalizeText(text);
  return (
    normalized.includes('faleceu') ||
    normalized.includes('falecimento') ||
    normalized.includes('morreu') ||
    normalized.includes('obito')
  );
}

function auditDeceasedOccurrences() {
  const campaignId = process.argv[2];
  const params = [];
  let where = "WHERE occurrence = 'FALECIDO'";

  if (campaignId) {
    where += ' AND campaign_id = ?';
    params.push(campaignId);
  }

  const leads = all(
    `SELECT id, campaign_id, name, phone, call_id, call_log, transcript, updated_at
     FROM leads
     ${where}
     ORDER BY updated_at DESC`,
    params
  );

  const rows = leads.map(lead => {
    const customerSpeech = extractCustomerSpeech(lead.transcript || '');
    return {
      id: lead.id,
      campaign_id: lead.campaign_id,
      name: lead.name,
      phone: lead.phone,
      call_id: lead.call_id,
      mentions_death: mentionsDeath(customerSpeech) ? 'sim' : 'nao',
      customer_speech: customerSpeech.slice(0, 180),
      call_log: String(lead.call_log || '').slice(0, 140),
      updated_at: lead.updated_at
    };
  });

  console.table(rows);
  console.log(`\nTotal FALECIDO: ${rows.length}`);
  console.log(`Suspeitos sem fala de falecimento: ${rows.filter(row => row.mentions_death === 'nao').length}`);
}

auditDeceasedOccurrences();
