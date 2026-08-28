const xlsx = require('./backend/node_modules/xlsx');
const fs = require('fs');
const path = require('path');

const headers = [
  'IDCRM', 'CARTEIRA', 'CPFCGC_PES', 'NOME_DEV', 'MATRICULA', 'UF', 'CIDADE', 'CEP',
  'Tipofone1', 'FONE1', 'Tipofone2', 'FONE2', 'FONE3', 'FONE4', 'FONE5', 'FONE6', 'FONE7', 'FONE8', 'FONE9', 'FONE10',
  'PARCELAS', 'VAL_NOMINAL', 'VAL_ATUALIZADO_AVISTA', 'UltimoEmAtraso', 'Segmentacao',
  'PROCESSO_MAILING', 'CodStatusCT', 'NomeStatusCT', 'FILIAL', 'CONTRATO', 'SISTEMA', 'SEGMENTO_VERO', 'ALO', 'BSC', 'DATA', 'LINHA_DIGITAVEL'
];

const testRows = [
  {
    IDCRM: '992214',
    CARTEIRA: '529',
    CPFCGC_PES: '04795023158',
    NOME_DEV: 'CAIO RODRIGUES (TESTE PROD)',
    MATRICULA: '14',
    UF: 'RJ',
    CIDADE: 'RIO DE JANEIRO',
    CEP: '22000000',
    Tipofone1: 'CELULAR',
    FONE1: '21995367414',
    Tipofone2: '',
    FONE2: '',
    FONE3: '',
    FONE4: '',
    FONE5: '',
    FONE6: '',
    FONE7: '',
    FONE8: '',
    FONE9: '',
    FONE10: '',
    PARCELAS: '1',
    VAL_NOMINAL: '149.90',
    VAL_ATUALIZADO_AVISTA: '149.90',
    UltimoEmAtraso: '15',
    Segmentacao: 'SP CO - Faixa 76 a 120',
    PROCESSO_MAILING: 'LIGACAO_VOZ',
    CodStatusCT: '',
    NomeStatusCT: 'PREVENTIVO',
    FILIAL: 'SP CO',
    CONTRATO: '201738918',
    SISTEMA: 'NG',
    SEGMENTO_VERO: 'PRE_CHURN',
    ALO: 'SIM',
    BSC: '0',
    DATA: '27/08/2026',
    LINHA_DIGITAVEL: '23793.38128 60007.827136 15000.633303 1 98450000014990'
  },
  {
    IDCRM: '992243',
    CARTEIRA: '529',
    CPFCGC_PES: '02798040167',
    NOME_DEV: 'CAIO VICENTE (TESTE PROD 2)',
    MATRICULA: '43',
    UF: 'RJ',
    CIDADE: 'RIO DE JANEIRO',
    CEP: '22000000',
    Tipofone1: 'CELULAR',
    FONE1: '21984354821',
    Tipofone2: '',
    FONE2: '',
    FONE3: '',
    FONE4: '',
    FONE5: '',
    FONE6: '',
    FONE7: '',
    FONE8: '',
    FONE9: '',
    FONE10: '',
    PARCELAS: '1',
    VAL_NOMINAL: '89.90',
    VAL_ATUALIZADO_AVISTA: '89.90',
    UltimoEmAtraso: '10',
    Segmentacao: 'SP CO - Faixa 45 a 75',
    PROCESSO_MAILING: 'LIGACAO_VOZ',
    CodStatusCT: '',
    NomeStatusCT: 'PREVENTIVO',
    FILIAL: 'SP CO',
    CONTRATO: '201669520',
    SISTEMA: 'NG',
    SEGMENTO_VERO: 'PRE_CHURN',
    ALO: 'SIM',
    BSC: '0',
    DATA: '27/08/2026',
    LINHA_DIGITAVEL: '23793.38128 60007.827136 15000.633303 1 98450000014990'
  }
];

// 1. Criar Excel (.xlsx)
const wb = xlsx.utils.book_new();
const ws = xlsx.utils.json_to_sheet(testRows, { header: headers });
xlsx.utils.book_append_sheet(wb, ws, 'Mailing Vero');
const excelPath = path.join(__dirname, 'planilha_oficial_vero_teste.xlsx');
xlsx.writeFile(wb, excelPath);

// 2. Criar CSV (.csv com separador ponto e vírgula ';')
let csv = headers.join(';') + '\r\n';
for (const row of testRows) {
  const line = headers.map(h => row[h] || '').join(';');
  csv += line + '\r\n';
}
const csvPath = path.join(__dirname, 'planilha_oficial_vero_teste.csv');
fs.writeFileSync(csvPath, '\uFEFF' + csv, 'utf8');

console.log('--- PLANILHA NO FORMATO DA VERO CRIADA COM SUCESSO ---');
console.log('1. ' + excelPath);
console.log('2. ' + csvPath);
