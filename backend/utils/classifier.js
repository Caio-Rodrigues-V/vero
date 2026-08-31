/**
 * Lista de ocorrências qualificadas de CPC (Contato com a Pessoa Certa) que justificam
 * o envio automático de SMS / e-mail.
 */
const validCpcOccurrences = [
  'PROMESSA BOLETO',
  'PROMESSA PIX',
  'PROMESSA CARTÃO',
  'ALEGA PAGAMENTO - SEM COMPROVANTE',
  'ROBO SOLICITA ATENDIMENTO HUMANO',
  'NAO PAGARA - DESEMPREGADO',
  'NÃO PAGARÁ - SOLICITOU O CANCELAMENTO',
  'NÃO PAGARÁ - PROBLEMA FINANCEIRO',
  'RETORNO AGENDADO COM CLIENTE'
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
  const lines = transcript.split('\n');
  const customerLines = [];

  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    if (lower.startsWith('vero:') || lower.startsWith('vêro:') || lower.startsWith('assistant:') || lower.startsWith('bot:')) {
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
 * Classifica a ocorrência de uma chamada telefônica com base nas regras de negócio da Vero.
 * 
 * @param {object} params
 * @param {string} params.endedReason - Motivo de encerramento da chamada
 * @param {string} params.summary - Resumo da conversa
 * @param {string} params.transcript - Transcrição da conversa
 * @param {number} params.duration - Duração da chamada em segundos
 * @returns {string} Ocorrência classificada
 */
function classifyCallOccurrence({ endedReason, summary, transcript, duration }) {
  const reason = endedReason;
  const dur = duration || 0;

  // 1. Falhas e tentativas automáticas da operadora
  if (reason === 'voicemail') {
    return 'TENTATIVA - MAQUINA MENSAGEM AUTOMATICA';
  }
  if (reason === 'no-answer' || reason === 'no_answer') {
    return 'TENTATIVA - NÃO ATENDE';
  }
  if (reason === 'busy' || reason === 'user_busy') {
    return 'TENTATIVA - OCUPADO';
  }
  if (reason === 'network-error' || reason === 'error' || reason === 'dial_failed') {
    return 'TENTATIVA - ERRO DISCAGEM';
  }

  // 2. Quedas e abandonos rápidos
  if (reason === 'customer-hung-up' && dur < 8) {
    return 'TENTATIVA - ABANDONO';
  }

  // Extrair apenas falas do cliente e normalizar sem acentos para comparações 100% precisas
  const customerSpeech = normalizeText(extractCustomerSpeech(transcript));
  const summaryNormalized = normalizeText(summary);
  const combinedText = `${summaryNormalized} ${customerSpeech}`;

  // 3. Classificações com base na fala do cliente (CPC)
  if (combinedText.includes('faleceu') || combinedText.includes('falecimento') || combinedText.includes('morreu') || combinedText.includes('obito')) {
    return 'FALECIDO';
  }

  if (
    combinedText.includes('nao conhece') || 
    combinedText.includes('nao conheco') || 
    combinedText.includes('numero errado') || 
    combinedText.includes('nao e ele') || 
    combinedText.includes('nao e ela') || 
    combinedText.includes('desconhecido') || 
    combinedText.includes('desconhece') ||
    combinedText.includes('nao mora')
  ) {
    return 'CLIENTE DESCONHECIDO';
  }

  if (
    combinedText.includes('ja pagou') || 
    combinedText.includes('pagamento feito') || 
    combinedText.includes('pago o boleto') || 
    /\bpago\b/.test(combinedText)
  ) {
    return 'ALEGA PAGAMENTO - SEM COMPROVANTE';
  }

  if (
    combinedText.includes('promessa') || 
    combinedText.includes('vou pagar') || 
    combinedText.includes('pago amanha') || 
    combinedText.includes('aceitou boleto') || 
    combinedText.includes('envia o boleto') || 
    combinedText.includes('envia o sms') || 
    combinedText.includes('mandar o sms') || 
    combinedText.includes('enviar o boleto')
  ) {
    if (combinedText.includes('pix')) return 'PROMESSA PIX';
    if (combinedText.includes('cartao')) return 'PROMESSA CARTÃO';
    return 'PROMESSA BOLETO';
  }

  if (combinedText.includes('desempregado') || combinedText.includes('desempregada') || combinedText.includes('sem emprego')) {
    return 'NAO PAGARA - DESEMPREGADO';
  }

  if (combinedText.includes('cancelamento') || combinedText.includes('cancelar') || combinedText.includes('cancela')) {
    return 'NÃO PAGARÁ - SOLICITOU O CANCELAMENTO';
  }

  if (
    combinedText.includes('atendente') || 
    combinedText.includes('humano') || 
    combinedText.includes('falar com alguem') || 
    combinedText.includes('falar com pessoa') || 
    combinedText.includes('atendimento humano')
  ) {
    return 'ROBO SOLICITA ATENDIMENTO HUMANO';
  }

  if (
    combinedText.includes('nao vai pagar') || 
    combinedText.includes('nao vou pagar') || 
    combinedText.includes('nao irei pagar') || 
    combinedText.includes('financeiro') || 
    combinedText.includes('sem dinheiro') || 
    combinedText.includes('problema financeiro')
  ) {
    return 'NÃO PAGARÁ - PROBLEMA FINANCEIRO';
  }

  if (
    combinedText.includes('ligar mais tarde') || 
    combinedText.includes('retornar') || 
    combinedText.includes('outro horario') || 
    combinedText.includes('ligue depois')
  ) {
    return 'RETORNO AGENDADO COM CLIENTE';
  }

  // Se o cliente confirmou ("sim", "sou eu", "correto", "pode falar") e durou mais de 8s
  const isAffirmative = /\b(sim|sou eu|correto|pode falar|e ele|e ela)\b/.test(customerSpeech);
  if (isAffirmative || dur >= 8) {
    if (combinedText.includes('pix')) return 'PROMESSA PIX';
    if (combinedText.includes('cartao')) return 'PROMESSA CARTÃO';
    return 'PROMESSA BOLETO';
  }

  // 4. Quedas durante a chamada qualificada
  if (dur >= 8 && (reason === 'customer-hung-up' || reason === 'assistant-hung-up')) {
    return 'LIGAÇÃO DESLIGOU / CAIU COM O CLIENTE';
  }

  // Fallback geral se atendido
  return 'TENTATIVA - ATENDIMENTO NÃO TABULADO';
}

module.exports = {
  validCpcOccurrences,
  classifyCallOccurrence
};
