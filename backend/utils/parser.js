const xlsx = require('xlsx');
const fs = require('fs');
const csvParser = require('csv-parser');

/**
 * Normaliza os cabeçalhos das planilhas para mapear aos campos do banco
 */
function normalizeHeader(header) {
  const h = header.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9_]/g, '_'); // substitui espaços por _

  if (['nome', 'name', 'cliente', 'lead', 'usuario'].includes(h)) return 'name';
  if (['telefone', 'phone', 'celular', 'contato', 'numero', 'tel', 'num'].includes(h)) return 'phone';
  if (['valor', 'value', 'divida', 'valor_divida', 'debito', 'saldo'].includes(h)) return 'debt_value';
  if (['vencimento', 'due_date', 'data', 'data_vencimento', 'venc'].includes(h)) return 'due_date';
  
  return h;
}

/**
 * Normaliza e limpa um número de telefone brasileiro
 */
function cleanPhone(phone) {
  if (!phone) return '';
  // Remover tudo que não for dígito
  let cleaned = String(phone).replace(/\D/g, '');
  
  // Tratar formato brasileiro
  if (cleaned.length === 10 || cleaned.length === 11) {
    // Adiciona código do país 55 se faltar
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
}

/**
 * Converte valor de texto para float
 */
function cleanDebtValue(val) {
  if (val === null || val === undefined) return 0.0;
  if (typeof val === 'number') return val;
  
  // Limpar formatações de moeda como R$, pontos e vírgulas
  let str = String(val).replace(/R\$\s?/i, '').trim();
  
  // Se tiver formato brasileiro (ex: 1.250,50)
  if (str.indexOf(',') > -1 && str.indexOf('.') > -1) {
    if (str.indexOf('.') < str.indexOf(',')) {
      str = str.replace(/\./g, '').replace(',', '.');
    }
  } else if (str.indexOf(',') > -1) {
    // Se tiver apenas vírgula (ex: 1250,50)
    str = str.replace(',', '.');
  }
  
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0.0 : parsed;
}

/**
 * Converte data da planilha para string formatada DD/MM/AAAA
 */
function cleanDueDate(dateVal) {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    return dateVal.toLocaleDateString('pt-BR');
  }
  
  // Se for número serial do Excel
  if (typeof dateVal === 'number' && dateVal > 20000) {
    try {
      const date = xlsx.SSF.parse_date_code(dateVal);
      const day = String(date.d).padStart(2, '0');
      const month = String(date.m).padStart(2, '0');
      return `${day}/${month}/${date.y}`;
    } catch (e) {
      // ignorar e tratar como texto
    }
  }

  return String(dateVal).trim();
}

/**
 * Lê e analisa arquivos Excel (.xlsx, .xls)
 */
function parseExcel(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Converter para array de objetos mantendo chaves brutas
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  
  return rawRows.map(row => {
    const normalizedRow = {};
    for (const key of Object.keys(row)) {
      const normKey = normalizeHeader(key);
      normalizedRow[normKey] = row[key];
    }

    return {
      name: String(normalizedRow.name || 'Sem Nome').trim(),
      phone: cleanPhone(normalizedRow.phone),
      debt_value: cleanDebtValue(normalizedRow.debt_value),
      due_date: cleanDueDate(normalizedRow.due_date)
    };
  }).filter(lead => lead.phone.length >= 8); // Filtrar números inválidos mínimos
}

/**
 * Lê e analisa arquivos CSV
 */
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        const normalizedRow = {};
        for (const key of Object.keys(row)) {
          const normKey = normalizeHeader(key);
          normalizedRow[normKey] = row[key];
        }
        
        results.push({
          name: String(normalizedRow.name || 'Sem Nome').trim(),
          phone: cleanPhone(normalizedRow.phone),
          debt_value: cleanDebtValue(normalizedRow.debt_value),
          due_date: cleanDueDate(normalizedRow.due_date)
        });
      })
      .on('end', () => {
        // Filtrar números inválidos mínimos
        const filtered = results.filter(lead => lead.phone.length >= 8);
        resolve(filtered);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

/**
 * Função principal para analisar a planilha baseada na extensão
 */
async function parseSpreadsheet(filePath, originalFilename) {
  const ext = originalFilename.toLowerCase().split('.').pop();
  
  if (ext === 'csv') {
    return await parseCSV(filePath);
  } else if (['xlsx', 'xls'].includes(ext)) {
    return parseExcel(filePath);
  } else {
    throw new Error('Formato de arquivo não suportado. Envie CSV ou Excel (.xlsx, .xls)');
  }
}

module.exports = { parseSpreadsheet };
