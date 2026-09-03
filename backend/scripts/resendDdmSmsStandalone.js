const fs = require('fs');
const path = require('path');
const { parseSpreadsheet } = require('../utils/parser.js');

// Endpoint oficial da API DDM Acordos do Jair
const DDM_SHORT_SMS_URL = 'https://ddmacordos.com/ddm_api/Envia_SMS/enviaShort.php';

// Limita o SMS para não estourar 160 caracteres
function limitSmsMessage(text) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 160);
}

// Monta a mensagem curta padrão da Vero com a Linha Digitável
function buildDdmShortMessage(name, debtValue, barcode) {
  const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(debtValue);
  return limitSmsMessage(`Vero: fatura em aberto ${valorFormatado}. Linha digitavel: ${barcode}`);
}

// Função de envio individual via GET para a API DDM
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

async function executeResend(spreadsheetPath = null, isDryRun = true, limit = 1000) {
  console.log(`================================================================================`);
  console.log(`🚀 DISPARADOR ISOLADO DE SMS COM LINHA DIGITÁVEL CORRIGIDA (API DDM JAIR)`);
  console.log(`Modo: ${isDryRun ? '🔍 SIMULAÇÃO / TESTE (Nenhum SMS real será enviado)' : '🔥 DISPARO REAL EM MASSA'}`);
  console.log(`================================================================================\n`);

  // 1. Carregar a base de dados com as Linhas Digitáveis corretas (Arquivo local ou Campanha #49)
  let correctLeads = [];
  
  if (spreadsheetPath && fs.existsSync(spreadsheetPath)) {
    console.log(`[PLANILHA] Carregando arquivo local: "${spreadsheetPath}"...`);
    const filename = path.basename(spreadsheetPath);
    correctLeads = await parseSpreadsheet(spreadsheetPath, filename);
    console.log(`[PLANILHA] Total de ${correctLeads.length} linhas lidas com sucesso da planilha!\n`);
  } else {
    console.log(`[API] Nenhuma planilha local informada. Buscando códigos corretos da Campanha #49 em produção...`);
    const res49 = await fetch('https://verolembrete.grupoddm.ia.br/api/campaigns/49/leads?limit=15000');
    const data49 = await res49.json();
    correctLeads = data49.leads || [];
    console.log(`[API] Total de ${correctLeads.length} leads carregados da Campanha #49!\n`);
  }

  // 2. Carregar os leads que atenderam e receberam o SMS anterior na Campanha #48
  console.log(`[AUDITORIA] Buscando os leads que atenderam na Campanha #48 em produção...`);
  const res48 = await fetch('https://verolembrete.grupoddm.ia.br/api/campaigns/48/leads?limit=1000&statusFilter=completed');
  const data48 = await res48.json();
  const leads48 = data48.leads || [];
  console.log(`[AUDITORIA] Total de leads atendidos/SMS enviados na Campanha #48: ${leads48.length}\n`);

  // 3. Criar índice de busca rápida (por CPF e por Telefone)
  const mapByCpf = new Map();
  const mapByPhone = new Map();

  correctLeads.forEach(l => {
    if (l.cpf) {
      const cleanCpf = String(l.cpf).replace(/\D/g, '');
      if (cleanCpf) mapByCpf.set(cleanCpf, l);
    }
    if (l.phone) {
      const cleanPhone = String(l.phone).replace(/\D/g, '').slice(-8);
      if (cleanPhone) mapByPhone.set(cleanPhone, l);
    }
  });

  // 4. Cruzamento exato de cada um dos leads
  const matched = [];
  const unmatched = [];

  leads48.forEach(lead => {
    const cleanCpf = lead.cpf ? String(lead.cpf).replace(/\D/g, '') : '';
    const cleanPhone = lead.phone ? String(lead.phone).replace(/\D/g, '').slice(-8) : '';

    let match = null;
    if (cleanCpf && mapByCpf.has(cleanCpf)) {
      match = mapByCpf.get(cleanCpf);
    } else if (cleanPhone && mapByPhone.has(cleanPhone)) {
      match = mapByPhone.get(cleanPhone);
    }

    if (match && match.barcode && !match.barcode.includes('E+')) {
      matched.push({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        cpf: lead.cpf,
        debt_value: lead.debt_value || match.debt_value,
        old_barcode: lead.barcode,
        correct_barcode: match.barcode
      });
    } else {
      unmatched.push(lead);
    }
  });

  console.log(`========================================`);
  console.log(`LEADS CRUZADOS COM SUCESSO: ${matched.length} de ${leads48.length}`);
  if (unmatched.length > 0) {
    console.log(`LEADS NÃO ENCONTRADOS NA PLANILHA: ${unmatched.length}`);
  }
  console.log(`========================================\n`);

  const listToProcess = matched.slice(0, limit);
  const results = [];
  let successCount = 0;
  let failCount = 0;

  // 5. Execução dos disparos
  for (let i = 0; i < listToProcess.length; i++) {
    const item = listToProcess[i];
    const messageText = buildDdmShortMessage(item.name, item.debt_value, item.correct_barcode);

    if (isDryRun) {
      console.log(`[SIMULAÇÃO ${i + 1}/${listToProcess.length}] ${item.name} (${item.phone})`);
      console.log(`   SMS: "${messageText}"`);
      results.push({ ...item, status: 'SIMULADO', response: 'N/A' });
      successCount++;
    } else {
      process.stdout.write(`[ENVIO ${i + 1}/${listToProcess.length}] ${item.name} (${item.phone})... `);
      const res = await sendSingleSms(item.phone, messageText);
      if (res.success) {
        console.log(`✅ SUCESSO: ${res.response}`);
        successCount++;
      } else {
        console.log(`❌ FALHA: ${res.response}`);
        failCount++;
      }
      results.push({ ...item, status: res.success ? 'ENVIADO' : 'FALHA', response: res.response });

      // Delay de proteção de 150ms entre envios
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // 6. Salvar relatório CSV de auditoria
  const outputsDir = path.join(__dirname, '../../outputs');
  if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

  const filename = `relatorio_reenvio_sms_ddm_${Date.now()}.csv`;
  const filePath = path.join(outputsDir, filename);

  let csvContent = '\uFEFFNome,Telefone,CPF,Valor,Codigo Antigo,Codigo Correto,Status Envio,Resposta API\r\n';
  results.forEach(r => {
    csvContent += `"${r.name}","${r.phone}","${r.cpf || ''}",${r.debt_value},"${r.old_barcode}","${r.correct_barcode}","${r.status}","${(r.response || '').replace(/"/g, '""')}"\r\n`;
  });

  fs.writeFileSync(filePath, csvContent, 'utf-8');

  console.log(`\n========================================`);
  console.log(`RELATÓRIO FINAL DO PROCESSO:`);
  console.log(`- Total Processados: ${listToProcess.length}`);
  console.log(`- Sucessos: ${successCount}`);
  console.log(`- Falhas: ${failCount}`);
  console.log(`- Arquivo CSV Salvo: ${filePath}`);
  console.log(`========================================\n`);
}

// Suporte a argumentos de linha de comando:
// Exemplo 1: node resendDdmSmsStandalone.js
// Exemplo 2: node resendDdmSmsStandalone.js minha_planilha.xlsx
// Exemplo 3: node resendDdmSmsStandalone.js minha_planilha.xlsx --real
const args = process.argv.slice(2);
const isReal = args.includes('--real');
const fileArg = args.find(a => !a.startsWith('--'));

executeResend(fileArg || null, !isReal).catch(console.error);

module.exports = { executeResend };
