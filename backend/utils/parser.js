const xlsx = require('xlsx');
const fs = require('fs');
const csvParser = require('csv-parser');

/**
  * Detecta se o separador do CSV é vírgula ou ponto e vírgula
  */
function detectSeparator(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split('\n')[0] || '';
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    return semicolons > commas ? ';' : ',';
  } catch (err) {
    return ';'; // default fallback
  }
}

/**
 * Normaliza e limpa um número de telefone brasileiro
 */
function cleanPhone(phone) {
  if (!phone) return '';
  let str = String(phone).trim();

  // Tratar notação científica (ex: 6,79E+10 ou 1,29e10)
  if (/e/i.test(str)) {
    const normalized = str.replace(',', '.');
    const num = Number(normalized);
    if (!isNaN(num)) {
      str = num.toFixed(0);
    }
  }

  // Remover tudo que não for dígito
  let cleaned = str.replace(/\D/g, '');
  
  // Tratar formato brasileiro (se tiver 10 ou 11 dígitos, adiciona o DDI 55)
  if (cleaned.length === 10 || cleaned.length === 11) {
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
 * Mapeia dinamicamente uma linha genérica para os campos do lead
 */
function parseRow(row) {
  // 1. Encontrar o nome (prioriza 'name', 'nome', depois chaves contendo nome/devedor/cliente)
  let name = 'Sem Nome';
  const nameKey = Object.keys(row).find(k => {
    const hk = k.toLowerCase().trim();
    return hk === 'name' || hk === 'nome' || hk.includes('nome') || hk.includes('devedor') || hk.includes('cliente');
  });
  if (nameKey && row[nameKey]) {
    name = String(row[nameKey]).trim();
  }

  // 2. Encontrar o valor do débito (saldo/valor/divida/debito/nominal)
  let debt_value = 0.0;
  const debtKey = Object.keys(row).find(k => {
    const hk = k.toLowerCase().trim();
    return hk === 'saldo' || hk === 'valor' || hk === 'debt_value' || hk === 'divida' || hk === 'debito' || hk === 'val_nominal' || hk === 'val_atualizado_avista' || hk.includes('nominal');
  }) || Object.keys(row).find(k => {
    const hk = k.toLowerCase().trim();
    return hk.includes('saldo') || hk.includes('valor') || hk.includes('divida') || hk.includes('debito') || hk.includes('nominal') || hk.startsWith('val_');
  });
  if (debtKey && row[debtKey]) {
    debt_value = cleanDebtValue(row[debtKey]);
  }

  // 3. Encontrar a data de vencimento
  let due_date = '';
  const dateKey = Object.keys(row).find(k => {
    const hk = k.toLowerCase().trim();
    return hk === 'vencimento' || hk === 'due_date' || hk === 'venc' || hk === 'data';
  }) || Object.keys(row).find(k => {
    const hk = k.toLowerCase().trim();
    return hk.includes('vencimento') || hk.includes('due_date') || hk.includes('venc');
  });
  if (dateKey && row[dateKey]) {
    due_date = cleanDueDate(row[dateKey]);
  }

  // 4. Encontrar telefone (varre fone1, fone2... fone20 e pega o primeiro válido)
  let phone = '';
  const phoneKeys = Object.keys(row).filter(k => {
    const hk = k.toLowerCase().trim();
    return hk.includes('fone') || hk.includes('phone') || hk.includes('tel') || hk.includes('celular') || hk.includes('contato');
  });

  // Ordenar numericamentes as chaves (fone1, fone2, fone10...)
  phoneKeys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  for (const k of phoneKeys) {
    if (row[k]) {
      const cleaned = cleanPhone(row[k]);
      if (cleaned.length >= 8) {
        phone = cleaned;
        break; // Encontrou o primeiro número de telefone válido, para aqui
      }
    }
  }

  // 5. Encontrar linha digitável (barcode)
  let barcode = '';
  const barcodeKey = Object.keys(row).find(k => {
    const hk = k.toLowerCase().trim();
    return hk === 'linha_digitavel' || hk === 'barcode' || hk === 'codigo_barras' || hk === 'linha' || hk === 'digitavel';
  }) || Object.keys(row).find(k => {
    const hk = k.toLowerCase().trim();
    return hk.includes('digitavel') || hk.includes('barras') || hk.includes('barcode');
  });
  if (barcodeKey && row[barcodeKey]) {
    barcode = String(row[barcodeKey]).trim();
  }

  // 6. Encontrar dias de atraso
  let dias_atraso = 0;
  const atrasoKey = Object.keys(row).find(k => {
    const hk = k.toLowerCase().trim();
    return hk === 'dias_em_atraso' || hk === 'dias_atraso' || hk.includes('atraso');
  });
  if (atrasoKey && row[atrasoKey]) {
    dias_atraso = parseInt(row[atrasoKey]) || 0;
  }

  // 7. Encontrar status da internet
  let status_internet = '';
  const statusKey = Object.keys(row).find(k => {
    const hk = k.toLowerCase().trim();
    return hk === 'status_contrato' || hk === 'status_internet' || hk === 'status' || hk.includes('status');
  });
  if (statusKey && row[statusKey]) {
    status_internet = String(row[statusKey]).trim();
  }

  return { name, phone, debt_value, due_date, barcode, dias_atraso, status_internet };
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
  
  return rawRows.map(row => parseRow(row)).filter(lead => lead.phone.length >= 8);
}

/**
 * Lê e analisa arquivos CSV
 */
function parseCSV(filePath) {
  const separator = detectSeparator(filePath);
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csvParser({ separator }))
      .on('data', (row) => {
        const parsed = parseRow(row);
        results.push(parsed);
      })
      .on('end', () => {
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
