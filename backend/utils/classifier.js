/**
 * Lista de ocorrências qualificadas de CPC (Contato com a Pessoa Certa) que justificam
 * o envio automático de SMS / e-mail.
 */
const validCpcOccurrences = [
  'ATENDEU - SMS ENVIADO',
  'CONFIRMOU CONTATO - ENVIO SMS'
];

/**
 * Normaliza o texto removendo acentos e caracteres especiais para comparação insensível
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Extrai apenas as falas do cliente a partir da transcrição completa
 */
function extractCustomerSpeech(transcript) {
  if (!transcript) return '';
  if (transcript.includes('# PERSONA') || transcript.includes('# REGRAS')) {
    transcript = transcript.replace(/# PERSONA[\s\S]*?(?=(Vero:|Cliente:|$))/i, '');
  }
  const lines = transcript.split('\n');
  const customerLines = [];

  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    if (lower.startsWith('vero:') || lower.startsWith('vêro:') || lower.startsWith('assistant:') || lower.startsWith('bot:') || lower.startsWith('ai:')) {
      continue;
    }
    if (lower.startsWith('#') || lower.startsWith('**') || lower.includes('end_call') || lower.includes('voicemail_tool')) {
      continue;
    }
    if (lower.startsWith('user:') || lower.startsWith('customer:') || lower.startsWith('cliente:')) {
      customerLines.push(line.replace(/^(user|customer|cliente):/i, '').trim());
    } else {
      customerLines.push(line.trim());
    }
  }

  return customerLines.join(' ');
}

/**
 * Classifica a ocorrência de uma chamada telefônica em apenas 3 tabulações simples:
 * 1. 'ATENDEU - SMS ENVIADO'
 * 2. 'NÃO ATENDEU'
 * 3. 'SMS ENVIADO 3 DIAS' (atribuído quando pulado pelo discador)
 */
function classifyCallOccurrence({ endedReason, summary, transcript, duration }) {
  const reason = endedReason;
  const dur = duration || 0;

  // Falhas e não atendimento da operadora
  if (
    reason === 'voicemail' || 
    reason === 'no-answer' || 
    reason === 'no_answer' || 
    reason === 'customer-did-not-answer' ||
    reason === 'busy' || 
    reason === 'user_busy' ||
    reason === 'customer-busy' ||
    reason === 'network-error' || 
    reason === 'error' || 
    reason === 'dial_failed' ||
    dur === 0
  ) {
    return 'NÃO ATENDEU';
  }

  // Qualquer chamada conectada/atendida
  return 'ATENDEU - SMS ENVIADO';
}

module.exports = {
  validCpcOccurrences,
  normalizeText,
  extractCustomerSpeech,
  classifyCallOccurrence
};
