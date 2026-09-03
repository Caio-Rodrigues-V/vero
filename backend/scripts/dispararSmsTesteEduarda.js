const DDM_SHORT_SMS_URL = 'https://ddmacordos.com/ddm_api/Envia_SMS/enviaShort.php';

const leadTeste = {
  nome: 'EDUARDA DE OLIVEIRA RIBEIRO',
  telefone: '11976909745',
  valor: 241.88,
  linhaDigitavel: '34191091494179091293985306370009115360000024188'
};

function buildDdmShortMessage(debtValue, barcode) {
  const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(debtValue);
  return `Vero: fatura em aberto ${valorFormatado}. Linha digitavel:\n${barcode}`;
}

async function sendTestSms() {
  console.log(`================================================================================`);
  console.log(`🧪 DISPARO DE TESTE UNITÁRIO - EDUARDA DE OLIVEIRA RIBEIRO`);
  console.log(`================================================================================\n`);

  let cleanedPhone = leadTeste.telefone.replace(/\D/g, '');
  if (cleanedPhone.startsWith('55') && cleanedPhone.length > 11) {
    cleanedPhone = cleanedPhone.slice(2);
  }

  const messageText = buildDdmShortMessage(leadTeste.valor, leadTeste.linhaDigitavel);
  const url = `${DDM_SHORT_SMS_URL}?tel_envio=${encodeURIComponent(cleanedPhone)}&msg_envio=${encodeURIComponent(messageText)}`;

  console.log(`Destinatário: ${leadTeste.nome}`);
  console.log(`Telefone: ${cleanedPhone}`);
  console.log(`Valor: R$ ${leadTeste.valor.toFixed(2)}`);
  console.log(`Linha Digitável: ${leadTeste.linhaDigitavel}`);
  console.log(`\n💬 Mensagem a ser enviada:`);
  console.log(`"${messageText}"\n`);
  console.log(`URL da API DDM: ${url}\n`);

  console.log(`Enviando para a API da DDM...`);
  try {
    const res = await fetch(url, { method: 'GET' });
    const responseText = await res.text();
    if (res.ok) {
      console.log(`\n✅ SUCESSO NO ENVIO!`);
      console.log(`Status HTTP: ${res.status}`);
      console.log(`Resposta da API DDM: ${responseText || 'OK'}`);
    } else {
      console.log(`\n❌ ERRO NO ENVIO:`);
      console.log(`Status HTTP: ${res.status}`);
      console.log(`Resposta: ${responseText}`);
    }
  } catch (err) {
    console.error(`\n❌ FALHA NA CONEXÃO:`, err.message);
  }
  console.log(`================================================================================\n`);
}

sendTestSms().catch(console.error);
