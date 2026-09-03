const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');

// API DDM Acordos do Jair
const DDM_SHORT_SMS_URL = 'https://ddmacordos.com/ddm_api/Envia_SMS/enviaShort.php';

// Caminho padrão da planilha na pasta Downloads
const DEFAULT_PLANILHA_DOWNLOADS = 'C:\\Users\\caio.vicente\\Downloads\\linha digitavel.csv';
const AUDIT_LEADS_FILE = path.join(__dirname, '../../outputs/relatorio_reenvio_sms_ddm_1788446202569.csv');

function limitSmsMessage(text) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 160);
}

function buildDdmShortMessage(debtValue, barcode) {
  const parsedValue = typeof debtValue === 'number' ? debtValue : parseFloat(String(debtValue).replace(',', '.'));
  const valorFormatado = isNaN(parsedValue) 
    ? 'R$ 0,00' 
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parsedValue);
  return limitSmsMessage(`Vero: fatura em aberto ${valorFormatado}. Linha digitavel: ${barcode}`);
}

async function sendSingleSms(phone, messageText) {
  let cleanedPhone = String(phone).replace(/\D/g, '');
  if (cleanedPhone.startsWith('55') && cleanedPhone.length > 11) {
    cleanedPhone = cleanedPhone.slice(2);
  }

  const url = `${DDM_SHORT_SMS_URL}?tel_envio=${encodeURIComponent(cleanedPhone)}&msg_envio=${encodeURIComponent(messageText)}`;
  
  try {
    const res = await fetch(url, { method: 'GET' });
    const responseText = await res.text();
    return {
      success: res.ok,
      status: res.status,
      response: responseText || 'OK'
    };
  } catch (err) {
    return {
      success: false,
      status: 500,
      response: err.message
    };
  }
}

async function readCsvFile(filePath, separator = ',') {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath, { encoding: 'utf8' })
      .pipe(csvParser({ separator }))
      .on('data', (row) => results.push(row))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function runOfflineDispatch(planilhaPath = null, isDryRun = true, limit = null) {
  const planilhaFile = planilhaPath || DEFAULT_PLANILHA_DOWNLOADS;

  console.log(`================================================================================`);
  console.log(`🛡️  DISPARADOR DE SMS 100% OFFLINE (API DDM JAIR)`);
  console.log(`Modo: ${isDryRun ? '🔍 SIMULAÇÃO / TESTE (Nenhum SMS real enviado)' : '🔥 DISPARO REAL EM MASSA'}`);
  console.log(`Planilha com Linhas Digitáveis: "${planilhaFile}"`);
  console.log(`================================================================================\n`);

  if (!fs.existsSync(planilhaFile)) {
    console.error(`❌ Planilha não encontrada no caminho: ${planilhaFile}`);
    return;
  }

  // 1. Ler a planilha de Downloads (12.215 leads com linhas digitáveis corretas)
  console.log(`[1/3] Lendo a planilha com linhas digitáveis corretas...`);
  const sheetRows = await readCsvFile(planilhaFile, ';');
  console.log(`   -> Total de ${sheetRows.length} registros carregados da planilha.\n`);

  const mapByCpf = new Map();
  const mapByPhone = new Map();

  sheetRows.forEach(r => {
    const cpf = String(r.CPFCGC_PES || '').replace(/\D/g, '');
    if (cpf) mapByCpf.set(cpf, r);

    for (let i = 1; i <= 10; i++) {
      const foneKey = `FONE${i}`;
      const fone = String(r[foneKey] || '').replace(/\D/g, '').slice(-8);
      if (fone) mapByPhone.set(fone, r);
    }
  });

  // 2. Ler os 514 destinatários que atenderam e precisam receber o SMS correto
  console.log(`[2/3] Carregando a lista dos 514 destinatários que atenderam hoje...`);
  const targetLeads = await readCsvFile(AUDIT_LEADS_FILE, ',');
  console.log(`   -> Total de ${targetLeads.length} destinatários na lista.\n`);

  const matched = [];
  const unmatched = [];

  targetLeads.forEach(lead => {
    const rawName = lead.Nome || lead['\uFEFFNome'] || lead.name || '';
    const cleanCpf = String(lead.CPF || lead.cpf || '').replace(/\D/g, '');
    const cleanPhone = String(lead.Telefone || lead.phone || '').replace(/\D/g, '').slice(-8);

    let match = null;
    if (cleanCpf && mapByCpf.has(cleanCpf)) {
      match = mapByCpf.get(cleanCpf);
    } else if (cleanPhone && mapByPhone.has(cleanPhone)) {
      match = mapByPhone.get(cleanPhone);
    }

    if (match && match.LINHA_DIGITAVEL) {
      matched.push({
        name: match.NOME_DEV || rawName,
        phone: lead.Telefone || lead.phone,
        cpf: cleanCpf,
        debtValue: match.VAL_ATUALIZADO_AVISTA || lead.Valor,
        correctBarcode: match.LINHA_DIGITAVEL.trim()
      });
    } else {
      unmatched.push(lead);
    }
  });

  console.log(`============================================================`);
  console.log(`[3/3] BATIMENTO CONCLUÍDO: ${matched.length} de ${targetLeads.length} ENCONTRADOS NA PLANILHA!`);
  if (unmatched.length > 0) {
    console.log(`NÃO LOCALIZADOS: ${unmatched.length}`);
  }
  console.log(`============================================================\n`);

  const results = [];
  let successCount = 0;
  let failCount = 0;

  const listToProcess = limit ? matched.slice(0, limit) : matched;

  // 3. Execução dos disparos
  for (let i = 0; i < listToProcess.length; i++) {
    const item = listToProcess[i];
    const messageText = buildDdmShortMessage(item.debtValue, item.correctBarcode);

    if (isDryRun) {
      console.log(`[SIMULAÇÃO ${i + 1}/${matched.length}] ${item.name} (${item.phone})`);
      console.log(`   SMS: "${messageText}"`);
      results.push({ ...item, status: 'SIMULADO', response: 'N/A' });
      successCount++;
    } else {
      process.stdout.write(`[ENVIO ${i + 1}/${matched.length}] ${item.name} (${item.phone})... `);
      const res = await sendSingleSms(item.phone, messageText);
      if (res.success) {
        console.log(`✅ SUCESSO: ${res.response}`);
        successCount++;
      } else {
        console.log(`❌ FALHA: ${res.response}`);
        failCount++;
      }
      results.push({ ...item, status: res.success ? 'ENVIADO' : 'FALHA', response: res.response });

      // Delay de proteção de 2000ms (2 segundos) entre envios para a API DDM
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Salvar relatório final
  const outputsDir = path.join(__dirname, '../../outputs');
  if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

  const outputFilename = `resultado_envio_ddm_offline_${Date.now()}.csv`;
  const outputPath = path.join(outputsDir, outputFilename);

  let csvContent = '\uFEFFNome,Telefone,CPF,Valor,Codigo Enviado,Status,Resposta API\r\n';
  results.forEach(res => {
    csvContent += `"${res.name}","${res.phone}","${res.cpf}",${res.debtValue},"${res.correctBarcode}","${res.status}","${(res.response || '').replace(/"/g, '""')}"\r\n`;
  });

  fs.writeFileSync(outputPath, csvContent, 'utf-8');

  console.log(`\n========================================`);
  console.log(`RELATÓRIO CONCLUÍDO:`);
  console.log(`- Total de Destinatários: ${matched.length}`);
  console.log(`- Sucessos: ${successCount}`);
  console.log(`- Falhas: ${failCount}`);
  console.log(`- Log de Auditoria Salvo em: ${outputPath}`);
  console.log(`========================================\n`);
}

const args = process.argv.slice(2);
const isReal = args.includes('--real');
const fileArg = args.find(a => !a.startsWith('--'));
const limitArgIdx = args.indexOf('--limit');
const limitVal = limitArgIdx !== -1 && args[limitArgIdx + 1] ? parseInt(args[limitArgIdx + 1], 10) : null;

runOfflineDispatch(fileArg || null, !isReal, limitVal).catch(console.error);

module.exports = { runOfflineDispatch };
