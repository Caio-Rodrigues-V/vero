const dotenv = require('dotenv');
dotenv.config();

const { triggerN8NSmsWebhook, sendLocawebEmail } = require('./services/communication.js');

async function runTest() {
  console.log('--- INICIANDO TESTE DE DISPARO SMS E E-MAIL ---');
  
  const mockLead = {
    id: 8888,
    name: 'Caio Rodrigues',
    phone: '5521995367414',
    email: process.env.TEST_EMAIL || 'caiovicenteti@gmail.com',
    debt_value: 149.90,
    due_date: '10/09/2026',
    barcode: '23793.38128 60007.827136 15000.633303 1 98450000014990',
    dias_atraso: 5,
    status_internet: 'Sinal em Risco'
  };

  console.log(`Lead de Teste: ${mockLead.name}`);
  console.log(`Telefone Alvo: ${mockLead.phone}`);
  console.log(`E-mail Alvo: ${mockLead.email}`);
  console.log('--------------------------------------------------\n');

  console.log('1. Disparando E-mail via Locaweb...');
  const emailRes = await sendLocawebEmail(mockLead);
  console.log('Resultado E-mail:', emailRes);

  console.log('\n2. Disparando SMS via Unipix...');
  const smsRes = await triggerN8NSmsWebhook(mockLead);
  console.log('Resultado SMS:', smsRes);

  console.log('\n--- FIM DO TESTE DE DISPARO ---');
}

runTest();
