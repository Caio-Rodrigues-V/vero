const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config();
const { all, run, get } = require('../db.js');
const { triggerN8NSmsWebhook } = require('../services/communication.js');
const { updateCampaignStats } = require('../services/stats.js');

const targetList = [
  { name: 'AGNALDO PEDRO DE ALCANTARA', phone: '5519997827034' },
  { name: 'MARCILAINE ANDREA DOS SANTOS', phone: '5514998623415' },
  { name: 'CELIA DOS SANTOS ROCHA FERREIRA', phone: '5511978746987' },
  { name: 'ROSINEI REGINA BORTOLOTTI SILVA', phone: '5514996335244' },
  { name: 'CARLA ISABELLE ANTUNES SOARES', phone: '5548991877517' },
  { name: 'DANIEL ELIDIO DE OLIVEIRA', phone: '5548988559789' },
  { name: 'GRACYANNE DE BRITO OLIVEIRA', phone: '5531999295249' }
];

async function runManualSend() {
  console.log('=== DISPARO MANUAL DE SMS PARA LEADS DA CAMPANHA ===\n');

  for (const item of targetList) {
    const cleanPhoneDigits = item.phone.replace(/\D/g, '').slice(-8);
    const firstName = item.name.split(' ')[0];

    // Buscar no banco pelo telefone ou primeiro nome
    const lead = get(
      `SELECT * FROM leads WHERE phone LIKE ? OR name LIKE ? ORDER BY id DESC LIMIT 1`,
      [`%${cleanPhoneDigits}%`, `%${firstName}%`]
    );

    if (!lead) {
      console.log(`[AVISO] Lead não encontrado no banco: ${item.name} (${item.phone})`);
      continue;
    }

    console.log(`\n[LEAD ENCONTRADO #${lead.id}] ${lead.name} | Tel: ${lead.phone} | Valor: R$ ${lead.debt_value}`);
    
    if (!lead.barcode) {
      console.log(`[PULADO] Lead #${lead.id} não possui linha digitável cadastrada.`);
      continue;
    }

    // Disparar SMS via Smart RCS
    const result = await triggerN8NSmsWebhook(lead);
    console.log(`[RESULTADO ENVIO] ${lead.name}:`, result);

    if (result.success) {
      run(
        `UPDATE leads SET sms_status = 'completed', sms_log = ? WHERE id = ?`,
        [result.log, lead.id]
      );
    } else {
      run(
        `UPDATE leads SET sms_status = 'failed', sms_log = ? WHERE id = ?`,
        [result.log, lead.id]
      );
    }

    // Recalcular e sincronizar as estatísticas da campanha para atualizar o Dashboard em tempo real
    if (lead.campaign_id) {
      updateCampaignStats(lead.campaign_id);
    }
  }

  console.log('\n=== DISPARO MANUAL CONCLUÍDO E DASHBOARD SINCRONIZADO ===');
}

if (require.main === module) {
  runManualSend().catch(console.error);
}

module.exports = { runManualSend };
