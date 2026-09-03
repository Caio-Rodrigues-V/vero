const VPS_API_URL = 'https://verolembrete.grupoddm.ia.br/api/leads/send-test-sms';
const DDM_SHORT_SMS_URL = 'https://ddmacordos.com/ddm_api/Envia_SMS/enviaShort.php';

const phoneArg = process.argv[2];

if (!phoneArg) {
  console.log('\n❌ Por favor, informe o seu número de telefone!');
  console.log('Exemplo: node backend/scripts/dispararSmsMeuNumero.js 21981811077\n');
  process.exit(1);
}

let cleanedPhone = phoneArg.replace(/\D/g, '');
if (cleanedPhone.startsWith('55') && cleanedPhone.length > 11) {
  cleanedPhone = cleanedPhone.slice(2);
}

const valorTeste = 81.73;
const linhaDigitavelTeste = '34191090166648265854015103950000115320000008440';
const messagePreview = `Vero: fatura em aberto R$ 81,73. Linha digitavel:\n${linhaDigitavelTeste}`;

async function sendTest() {
  console.log(`================================================================================`);
  console.log(`📱 DISPARO DE TESTE DIRETO NO SEU CELULAR`);
  console.log(`================================================================================\n`);
  console.log(`Destinatário: Faraó das Cobranças`);
  console.log(`Telefone: ${cleanedPhone}`);
  console.log(`\n💬 Mensagem que chegará no seu aparelho:`);
  console.log(`----------------------------------------`);
  console.log(messagePreview);
  console.log(`----------------------------------------\n`);

  console.log(`Enviando via Servidor VPS (verolembrete.grupoddm.ia.br)...`);

  try {
    const res = await fetch(VPS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: cleanedPhone,
        value: valorTeste,
        barcode: linhaDigitavelTeste
      })
    });

    const data = await res.json();
    if (data.success) {
      console.log(`\n✅ SMS ENVIADO COM SUCESSO!`);
      console.log(`Log do Servidor: ${data.log}`);
      console.log(`\nVerifique as mensagens do seu celular agora! 📲✨`);
    } else {
      console.log(`\n⚠️ Resposta do Servidor:`, data.log || data.error);
    }
  } catch (err) {
    console.log(`\nTentando rota direta alternativa...`);
    try {
      const url = `${DDM_SHORT_SMS_URL}?tel_envio=${encodeURIComponent(cleanedPhone)}&msg_envio=${encodeURIComponent(messagePreview)}`;
      const resDirect = await fetch(url, { method: 'GET' });
      const respText = await resDirect.text();
      console.log(`Status Direto: ${resDirect.status} - Resposta: ${respText}`);
    } catch (e2) {
      console.error(`❌ Falha:`, err.message);
    }
  }
  console.log(`================================================================================\n`);
}

sendTest().catch(console.error);
