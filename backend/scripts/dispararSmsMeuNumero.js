const DDM_SHORT_SMS_URL = 'https://ddmacordos.com/ddm_api/Envia_SMS/enviaShort.php';

const phoneArg = process.argv[2];

if (!phoneArg) {
  console.log('\n❌ Por favor, informe o seu número de telefone!');
  console.log('Exemplo: node backend/scripts/dispararSmsMeuNumero.js 11999999999\n');
  process.exit(1);
}

let cleanedPhone = phoneArg.replace(/\D/g, '');
if (cleanedPhone.startsWith('55') && cleanedPhone.length > 11) {
  cleanedPhone = cleanedPhone.slice(2);
}

const valorTeste = 'R$ 81,73';
const linhaDigitavelTeste = '34191090166648265854015103950000115320000008440';
const messageText = `Vero: fatura em aberto ${valorTeste}. Linha digitavel:\n${linhaDigitavelTeste}`;

async function sendTest() {
  console.log(`================================================================================`);
  console.log(`📱 DISPARO DE TESTE DIRETO NO SEU CELULAR`);
  console.log(`================================================================================\n`);
  console.log(`Destinatário: Faraó das Cobranças`);
  console.log(`Telefone: ${cleanedPhone}`);
  console.log(`\n💬 Mensagem que chegará no seu aparelho:`);
  console.log(`----------------------------------------`);
  console.log(messageText);
  console.log(`----------------------------------------\n`);

  const url = `${DDM_SHORT_SMS_URL}?tel_envio=${encodeURIComponent(cleanedPhone)}&msg_envio=${encodeURIComponent(messageText)}`;
  console.log(`Enviando via API DDM...`);

  try {
    const res = await fetch(url, { method: 'GET' });
    const responseText = await res.text();
    if (res.ok) {
      console.log(`\n✅ SMS ENVIADO COM SUCESSO!`);
      console.log(`Status HTTP: ${res.status}`);
      console.log(`Resposta da API DDM: ${responseText || 'OK'}`);
      console.log(`\nVerifique as mensagens do seu celular em alguns segundos! 📲✨`);
    } else {
      console.log(`\n❌ ERRO NO ENVIO: HTTP ${res.status} - ${responseText}`);
    }
  } catch (err) {
    console.error(`\n❌ FALHA NA CONEXÃO:`, err.message);
  }
  console.log(`================================================================================\n`);
}

sendTest().catch(console.error);
