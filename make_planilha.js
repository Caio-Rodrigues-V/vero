const xlsx = require('./backend/node_modules/xlsx');
const fs = require('fs');
const path = require('path');

const testLeads = [
  {
    'Nome': 'Caio Rodrigues (Teste)',
    'Telefone': '21995367414',
    'Valor': 149.90,
    'Vencimento': '10/09/2026',
    'Linha Digitavel': '23793.38128 60007.827136 15000.633303 1 98450000014990',
    'Dias Atraso': 15,
    'Status Internet': 'Sinal Reduzido',
    'Email': 'caiovicenteti@gmail.com'
  },
  {
    'Nome': 'Caio Vicente (Teste 2)',
    'Telefone': '21984354821',
    'Valor': 89.90,
    'Vencimento': '05/09/2026',
    'Linha Digitavel': '23793.38128 60007.827136 15000.633303 1 98450000014990',
    'Dias Atraso': 10,
    'Status Internet': 'Sinal Suspenso',
    'Email': 'caiovicenteti@gmail.com'
  }
];

// 1. Criar Excel (.xlsx)
const wb = xlsx.utils.book_new();
const ws = xlsx.utils.json_to_sheet(testLeads);
xlsx.utils.book_append_sheet(wb, ws, 'Leads Teste');
const excelPath = path.join(__dirname, 'planilha_teste_vero.xlsx');
xlsx.writeFile(wb, excelPath);

// 2. Criar CSV (.csv)
let csv = 'Nome;Telefone;Valor;Vencimento;Linha Digitavel;Dias Atraso;Status Internet;Email\r\n';
for (const lead of testLeads) {
  csv += `"${lead.Nome}";"${lead.Telefone}";${lead.Valor};"${lead.Vencimento}";"${lead['Linha Digitavel']}";${lead['Dias Atraso']};"${lead['Status Internet']}";"${lead.Email}"\r\n`;
}
const csvPath = path.join(__dirname, 'planilha_teste_vero.csv');
fs.writeFileSync(csvPath, '\uFEFF' + csv, 'utf8');

console.log('--- PLANILHAS CRIADAS COM SUCESSO ---');
console.log('1. ' + excelPath);
console.log('2. ' + csvPath);
