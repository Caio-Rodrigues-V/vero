const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

const { all, get } = require('../db.js');
const fs = require('fs');

function formatOccurrenceLabel(occ, callLog) {
  if (callLog && callLog.includes('customer-busy')) return 'ATENDEU E DESLIGOU / OCUPADO';
  if (callLog && callLog.includes('customer-did-not-answer')) return 'NÃO ATENDEU';
  if (!occ) return 'ATENDEU E DESLIGOU';
  const upper = occ.toUpperCase();
  if (upper.includes('PROMESSA BOLETO')) return 'PROMESSA BOLETO';
  if (upper.includes('PROMESSA PIX')) return 'PROMESSA PIX';
  if (upper.includes('PROMESSA CART')) return 'PROMESSA CARTÃO';
  if (upper.includes('ALEGA PAGAMENTO')) return 'ALEGA PAGAMENTO';
  if (upper.includes('DESEMPREGADO')) return 'DESEMPREGADO';
  if (upper.includes('CANCELAMENTO')) return 'SOLICITOU CANCELAMENTO';
  if (upper.includes('HUMANO') || upper.includes('ATENDENTE')) return 'SOLICITOU ATENDENTE';
  if (upper.includes('FINANCEIRO')) return 'PROBLEMA FINANCEIRO';
  if (upper.includes('RETORNO')) return 'SOLICITOU RETORNO';
  if (upper.includes('FALECIDO')) return 'CLIENTE FALECIDO';
  if (upper.includes('DESCONHECIDO')) return 'NÚMERO ERRADO';
  if (upper.includes('MAQUINA') || upper.includes('VOICEMAIL')) return 'CAIXA POSTAL';
  if (upper.includes('OCUPADO')) return 'LINHA OCUPADA';
  if (upper.includes('NÃO ATENDE')) return 'NÃO ATENDEU';
  if (upper.includes('DESLIGOU') || upper.includes('MUDA')) return 'ATENDEU E DESLIGOU';
  return occ;
}

function generateCleanCsv() {
  const campaign = get("SELECT * FROM campaigns WHERE name LIKE '%29-08%' ORDER BY id DESC LIMIT 1");
  if (!campaign) {
    console.log('Campanha dia 29 não encontrada no banco local');
    return;
  }

  const leads = all(
    "SELECT name, phone, cpf, email, debt_value, due_date, barcode, dias_atraso, status_internet, occurrence, call_log FROM leads WHERE campaign_id = ? AND call_status = 'completed'",
    [campaign.id]
  );

  console.log(`Leads encontrados para campanha #${campaign.id}: ${leads.length}`);

  let csvContent = '\uFEFFNome,Telefone,CPF,Email,Valor Divida,Data Vencimento,Linha Digitavel,Dias Atraso,Status Contrato,Status Ligacao\r\n';

  for (const lead of leads) {
    const cleanOccurrence = formatOccurrenceLabel(lead.occurrence, lead.call_log);
    const row = [
      `"${(lead.name || '').replace(/"/g, '""')}"`,
      `"${lead.phone}"`,
      `"${lead.cpf || ''}"`,
      `"${lead.email || ''}"`,
      lead.debt_value,
      `"${lead.due_date || ''}"`,
      `"${lead.barcode || ''}"`,
      lead.dias_atraso || 0,
      `"${lead.status_internet || ''}"`,
      `"${cleanOccurrence}"`
    ];
    csvContent += row.join(',') + '\r\n';
  }

  const publicDir = path.join(__dirname, '../public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const filePath = path.join(publicDir, 'lista_atendidos_953_formatada.csv');
  fs.writeFileSync(filePath, csvContent, 'utf-8');
  console.log(`Gerado CSV formatado em: ${filePath}`);
}

generateCleanCsv();
