/**
 * Lista de ocorrências qualificadas de CPC (Contato com a Pessoa Certa) que justificam
 * o envio automático de SMS / e-mail.
 */
const validCpcOccurrences = [
  'ATENDEU - SMS ENVIADO',
  'CONFIRMOU CONTATO - ENVIO SMS',
  'PROMESSA DE PAGAMENTO - SMS ENVIADO',
  '2ª VIA BOLETO - SMS ENVIADO',
  'ALEGA PAGAMENTO - SMS ENVIADO',
  'ATENDEU E DESLIGOU',
  'LIGAÇÃO MUDA'
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
 * Classifica a ocorrência de uma chamada telefônica, com suporte nativo às
 * tabulações Olos / DDM e VAPI/Retell.
 */
function classifyCallOccurrence({ endedReason, summary, transcript, duration, tabulation, tabulationCode }) {
  const reason = String(endedReason || '').toLowerCase();
  const dur = Number(duration || 0);
  const tab = normalizeText(tabulation || '').toUpperCase().trim();
  const code = (tabulationCode || '').toUpperCase().trim();

  // 1. Falhas e não atendimento absoluto (duração 0 ou não atendeu)
  if (dur === 0 || reason === 'no-answer' || reason === 'no_answer' || reason === 'customer-did-not-answer' || reason === 'busy' || reason === 'user_busy' || reason === 'customer-busy' || reason === 'dial_failed') {
    if (
      tab === 'CAIXA_POSTAL' || 
      tab.includes('CAIXA_POSTAL') || 
      tab.includes('CAIXA POSTAL') || 
      tab.includes('VOICEMAIL') || 
      tab.includes('SECRETARIA') || 
      code === 'VOICEMAIL' || 
      reason.includes('voicemail')
    ) {
      return 'CAIXA POSTAL';
    }
    return 'NÃO ATENDEU';
  }

  // 2. Caixa Postal com qualquer duração
  if (
    tab === 'CAIXA_POSTAL' || 
    tab.includes('CAIXA_POSTAL') || 
    tab.includes('CAIXA POSTAL') || 
    tab.includes('VOICEMAIL') || 
    tab.includes('SECRETARIA') || 
    code === 'VOICEMAIL' || 
    reason.includes('voicemail')
  ) {
    return 'CAIXA POSTAL';
  }

  // 3. Tabulações de sucesso com duração > 0
  if (tab === 'PROMESSA_DE_PAGAMENTO' || tab.includes('PROMESSA')) {
    return 'PROMESSA DE PAGAMENTO - SMS ENVIADO';
  }
  if (tab === '2 VIA DE BOLETO' || tab === '2_VIA_DE_BOLETO' || tab.includes('2 VIA') || tab.includes('BOLETO')) {
    return '2ª VIA BOLETO - SMS ENVIADO';
  }
  if (tab === 'ALEGA_PAGAMENTO' || tab.includes('ALEGA')) {
    return 'ALEGA PAGAMENTO - SMS ENVIADO';
  }
  if (tab === 'DESCONHECE DIVIDA' || tab === 'DESCONHECE_DIVIDA' || tab.includes('DESCONHECE')) {
    return 'DESCONHECE DÍVIDA';
  }
  if (tab === 'RECUSA DE PAGAMENTO' || tab === 'RECUSA_DE_PAGAMENTO' || tab.includes('RECUSA')) {
    return 'RECUSA DE PAGAMENTO';
  }
  if (
    tab.includes('ATENDEU E DESLIGOU') || 
    tab.includes('ATENDEU_E_DESLIGOU') || 
    tab.includes('DESLIGOU') || 
    tab.includes('DESLIGA') || 
    code === 'CALL_DROPPED' ||
    reason === 'customer-ended-call' ||
    reason === 'user_hangup'
  ) {
    return 'ATENDEU E DESLIGOU';
  }
  if (
    tab.includes('LIGACAO_MUDA') || 
    tab.includes('LIGACAO MUDA') || 
    tab.includes('MUD') || 
    tab.includes('SEM SOM') || 
    tab.includes('SEM_SOM') || 
    tab.includes('SILENCIO') || 
    code === 'MUTE_SILENCE' || 
    reason === 'silence-timed-out' || 
    reason === 'silence'
  ) {
    return 'LIGAÇÃO MUDA';
  }
  if (tab === 'ENGANO' || tab === 'NUMERO_DE_ENGANO' || code === 'WRONG_NUMBER') {
    return 'NÚMERO DE ENGANO';
  }

  // 4. Qualquer chamada com duração > 0 conectada/atendida padrão
  return 'ATENDEU - SMS ENVIADO';
}

/**
 * Remove qualquer vazamento de prompt de persona/sistema da transcrição
 */
function cleanTranscript(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  if (
    cleaned.includes('# PERSONA') || 
    cleaned.includes('Você é a Verô') || 
    cleaned.includes('# REGRAS') || 
    cleaned.includes('# ETAPA') || 
    cleaned.includes('# CAIXA POSTAL') || 
    cleaned.includes('# ANTI-ALUCINAÇÃO') || 
    cleaned.includes('# CASUALIDADES')
  ) {
    const lines = cleaned.split(/\r?\n/);
    const realLines = [];
    let isInsidePrompt = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('Cliente: #') || 
        trimmed.startsWith('# ') || 
        trimmed.startsWith('Você é a Verô') || 
        trimmed.includes('Seu objetivo:') || 
        trimmed.includes('ANTI-ALUCINAÇÃO') ||
        trimmed.startsWith('# PERSONA')
      ) {
        isInsidePrompt = true;
      }
      
      if (isInsidePrompt) {
        const isSpeakerLine = (
          trimmed.startsWith('Sofia:') || 
          trimmed.startsWith('Vero:') || 
          trimmed.startsWith('Verô:') || 
          trimmed.startsWith('Cliente:') || 
          trimmed.startsWith('Assistente:') ||
          trimmed.startsWith('Bot:') ||
          trimmed.startsWith('User:')
        );
        const isPromptRule = (
          trimmed.includes('#') || 
          trimmed.includes('PERSONA') || 
          trimmed.includes('REGRAS') || 
          trimmed.includes('ETAPA') || 
          trimmed.includes('CASUALIDADES') || 
          trimmed.includes('CAIXA POSTAL') ||
          trimmed.includes('ANTI-ALUCINAÇÃO') ||
          trimmed.includes('Você é a Verô')
        );

        if (isSpeakerLine && !isPromptRule) {
          isInsidePrompt = false;
          realLines.push(trimmed);
        }
      } else {
        realLines.push(line);
      }
    }
    cleaned = realLines.join('\n').trim();
  }

  // Normalizar nomes de agentes para Vero / Cliente
  cleaned = cleaned
    .replace(/^Sofia:/gm, 'Vero:')
    .replace(/^Verô:/gm, 'Vero:')
    .replace(/^Assistente:/gm, 'Vero:')
    .replace(/^Bot:/gm, 'Vero:')
    .replace(/^User:/gm, 'Cliente:')
    .replace(/^Customer:/gm, 'Cliente:');

  return cleaned.trim();
}

module.exports = {
  validCpcOccurrences,
  normalizeText,
  extractCustomerSpeech,
  classifyCallOccurrence,
  cleanTranscript
};
