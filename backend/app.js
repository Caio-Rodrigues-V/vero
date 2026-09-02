const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const { initDb, run, get, all, db } = require('./db.js');
const { parseSpreadsheet } = require('./utils/parser.js');
const { triggerCampaignProcessor, startMonitorLoop } = require('./services/campaignExecutor.js');
const { updateCampaignStats } = require('./services/stats.js');
const xlsx = require('xlsx');
const { classifyCallOccurrence, extractCustomerSpeech, normalizeText, validCpcOccurrences } = require('./utils/classifier.js');

dotenv.config();

// Garantir que a pasta de uploads existe
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuração do Multer para Uploads temporários
const upload = multer({ dest: 'uploads/' });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Endpoint de diagnóstico do sistema
app.get('/api/system-info', (req, res) => {
  const configuredDialerProvider = (process.env.DIALER_PROVIDER || 'vapi').toLowerCase();
  const defaultUploadDialerProvider = (process.env.DEFAULT_UPLOAD_DIALER_PROVIDER || 'vapi').toLowerCase() === 'retell' ? 'retell' : 'vapi';
  res.json({
    domain: 'verolembrete.grupoddm.ia.br',
    serverIp: '129.121.42.250',
    dialerProvider: defaultUploadDialerProvider,
    defaultUploadDialerProvider,
    configuredDialerProvider,
    providerName: defaultUploadDialerProvider === 'retell' ? 'Retell AI' : 'VAPI.ai',
    cwd: process.cwd(),
    dirname: __dirname,
    nodeVersion: process.version,
    uptimeSeconds: process.uptime(),
    vapiAssistantId: process.env.VAPI_ASSISTANT_ID,
    vapiPhoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    retellAgentId: process.env.RETELL_AGENT_ID,
    appBaseUrl: process.env.APP_BASE_URL
  });
});

// Servir arquivos estáticos do frontend (pasta public)
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Inicializar Banco de Dados e Fila
initDb();
startMonitorLoop();

function recalculateActiveCampaigns() {
  const activeCampaigns = all("SELECT id FROM campaigns WHERE status IN ('processing', 'paused')");
  for (const campaign of activeCampaigns) {
    updateCampaignStats(campaign.id);
  }
}

/**
 * Rota para obter estatísticas resumidas da Dashboard
 */
app.get('/api/dashboard/stats', (req, res) => {
  try {
    recalculateActiveCampaigns();

    const stats = get(`
      SELECT 
        COUNT(id) as total_campaigns,
        SUM(total_leads) as total_leads,
        SUM(processed_leads) as total_processed,
        SUM(successful_calls) as total_successful_calls,
        SUM(failed_calls) as total_failed_calls,
        SUM(successful_sms) as total_successful_sms,
        SUM(failed_sms) as total_failed_sms
      FROM campaigns
    `);

    // Valores padrão se o banco estiver vazio
    const response = {
      total_campaigns: stats.total_campaigns || 0,
      total_leads: stats.total_leads || 0,
      total_processed: stats.total_processed || 0,
      total_successful_calls: stats.total_successful_calls || 0,
      total_failed_calls: stats.total_failed_calls || 0,
      total_successful_sms: stats.total_successful_sms || 0,
      total_failed_sms: stats.total_failed_sms || 0,
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Rota para obter o resumo de ocorrências agrupadas para a dashboard
 */
app.get('/api/dashboard/occurrences', (req, res) => {
  const { campaignId } = req.query;
  try {
    let query = `
      SELECT occurrence, COUNT(id) as count
      FROM leads
      WHERE occurrence IS NOT NULL
    `;
    const params = [];
    if (campaignId && campaignId !== 'all') {
      query += ' AND campaign_id = ?';
      params.push(campaignId);
    }
    query += ' GROUP BY occurrence ORDER BY count DESC';

    const occurrences = all(query, params);
    res.json(occurrences);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Listar todas as campanhas
 */
app.get('/api/campaigns', (req, res) => {
  try {
    recalculateActiveCampaigns();

    const campaigns = all('SELECT * FROM campaigns ORDER BY created_at DESC');
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Obter uma campanha específica e suas estatísticas
 */
app.get('/api/campaigns/:id', (req, res) => {
  const { id } = req.params;
  try {
    const campaign = get('SELECT * FROM campaigns WHERE id = ?', [id]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Obter leads de uma campanha específica (paginado)
 */
app.get('/api/campaigns/:id/leads', async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const statusFilter = req.query.statusFilter || 'all';
  const search = (req.query.search || '').trim();

  try {
    const isAll = id === 'all' || id === '0';
    const numericId = isAll ? 'all' : parseInt(id, 10);
    let whereClause = isAll ? 'WHERE 1=1' : 'WHERE campaign_id = ?';
    const params = isAll ? [] : [numericId];

    if (statusFilter === 'delivered' || statusFilter === 'completed') {
      whereClause += " AND call_status = 'completed'";
    } else if (statusFilter === 'sms_delivered') {
      whereClause += " AND sms_status = 'completed'";
    } else if (statusFilter === 'failed') {
      whereClause += " AND call_status = 'failed'";
    } else if (statusFilter === 'pending') {
      whereClause += " AND call_status = 'pending'";
    }

    if (search) {
      whereClause += " AND (name LIKE ? OR phone LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    const leadsQuery = `SELECT * FROM leads ${whereClause} ORDER BY id ASC LIMIT ? OFFSET ?`;
    const leads = all(leadsQuery, [...params, limit, offset]);

    const countQuery = `SELECT COUNT(id) as total FROM leads ${whereClause}`;
    const totalLeadsRow = get(countQuery, params);
    const totalLeads = totalLeadsRow ? totalLeadsRow.total : 0;

    // Resgate instantâneo em tempo real de áudios e transcrições da API Vapi para os leads visíveis
    const { fetchVapiCallDetails } = require('./services/vapi.js');
    await Promise.all(leads.map(async (lead) => {
      if (lead.call_id && (!lead.recording_url || !lead.transcript)) {
        try {
          const details = await fetchVapiCallDetails(lead.call_id);
          if (details) {
            if (details.recordingUrl) lead.recording_url = details.recordingUrl;
            if (details.transcript) lead.transcript = details.transcript;
            run(
              'UPDATE leads SET recording_url = COALESCE(?, recording_url), transcript = COALESCE(?, transcript) WHERE id = ?',
              [details.recordingUrl, details.transcript, lead.id]
            );
          }
        } catch (e) {}
      }
    }));

    res.json({
      leads,
      pagination: {
        page,
        limit,
        totalLeads,
        totalPages: Math.ceil(totalLeads / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Rota para forçar sincronização de gravações e transcrições com a API REST da Vapi (GET /call/{id})
 */
app.post('/api/leads/sync-recordings', async (req, res) => {
  try {
    const { campaignId } = req.body || {};
    const { syncMissingVapiRecordings } = require('./services/vapi.js');
    await syncMissingVapiRecordings(campaignId || null);
    res.json({ success: true, message: 'Gravações e transcrições sincronizadas com a API da Vapi.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Exportar resultados da campanha em formato CSV (suporta filtro por ocorrência)
 */
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

app.get('/api/campaigns/:id/export', (req, res) => {
  const { id } = req.params;
  const { occurrence, filter, callStatus } = req.query;
  try {
    const campaign = get('SELECT name FROM campaigns WHERE id = ?', [id]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    let whereClause = 'WHERE campaign_id = ?';
    const params = [id];

    if (occurrence && occurrence !== 'all') {
      whereClause += ' AND occurrence = ?';
      params.push(occurrence);
    }

    if (filter === 'answered' || callStatus === 'completed') {
      whereClause += " AND call_status = 'completed'";
    }

    const query = `SELECT name, phone, email, debt_value, due_date, barcode, dias_atraso, status_internet, occurrence, call_log FROM leads ${whereClause}`;
    const leads = all(query, params);

    let csvContent = '\uFEFFNome,Telefone,Email,Valor Divida,Data Vencimento,Linha Digitavel,Dias Atraso,Status Contrato,Status Ligacao\r\n';
    
    for (const lead of leads) {
      const cleanOccurrence = formatOccurrenceLabel(lead.occurrence, lead.call_log);
      const row = [
        `"${(lead.name || '').replace(/"/g, '""')}"`,
        `"${lead.phone}"`,
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

    const isAnsweredOnly = filter === 'answered' || callStatus === 'completed';
    const filename = isAnsweredOnly ? `atendidos_953_campanha_${id}.csv` : `resultado_campanha_${id}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(csvContent, 'utf-8'));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Pausar ou Interromper uma campanha ativa
 */
function handlePauseCampaign(req, res) {
  const { id } = req.params;
  try {
    const campaign = get('SELECT status FROM campaigns WHERE id = ?', [id]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    // Marca como pausada no banco
    run("UPDATE campaigns SET status = 'paused' WHERE id = ?", [id]);
    // Libera os leads que estavam calling de volta para pending para não ficarem travados
    run("UPDATE leads SET call_status = 'pending' WHERE campaign_id = ? AND call_status = 'calling'", [id]);
    
    console.log(`[SERVER] Campanha #${id} foi PAUSADA com sucesso.`);
    res.json({ success: true, message: 'Campanha pausada com sucesso.' });
  } catch (error) {
    console.error('[SERVER PAUSE ERROR]', error);
    res.status(500).json({ error: error.message });
  }
}

app.post('/api/campaigns/:id/pause', handlePauseCampaign);
app.post('/api/campaigns/:id/cancel', handlePauseCampaign);

/**
 * Iniciar ou Retomar disparos de uma campanha
 */
app.post('/api/campaigns/:id/start', (req, res) => {
  const { id } = req.params;
  try {
    const campaign = get('SELECT id, status FROM campaigns WHERE id = ?', [id]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    // Se não houver nenhum lead pendente, reenfileira os leads que falharam ou travaram para continuar o lote completo
    const pendingCount = get("SELECT COUNT(id) as count FROM leads WHERE campaign_id = ? AND call_status = 'pending'", [id]);
    if (!pendingCount || pendingCount.count === 0) {
      console.log(`[SERVER START] Nenhum lead pendente encontrado para a campanha #${id}. Reenfileirando leads não atendidos/falhados para continuar...`);
      run("UPDATE leads SET call_status = 'pending', call_log = 'Reenfileirado para discagem' WHERE campaign_id = ? AND (call_status = 'failed' OR call_status = 'calling')", [id]);
    } else {
      run("UPDATE leads SET call_status = 'pending' WHERE campaign_id = ? AND call_status = 'calling'", [id]);
    }

    run("UPDATE campaigns SET status = 'processing' WHERE id = ?", [id]);

    const { triggerCampaignProcessor } = require('./services/campaignExecutor.js');
    triggerCampaignProcessor(Number(id));
    res.json({ success: true, message: 'Disparos da campanha iniciados/retomados com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Resetar e rediscar chamadas com falha de uma campanha
 */
app.post('/api/campaigns/:id/retry-failed', (req, res) => {
  const { id } = req.params;
  try {
    run("UPDATE leads SET call_status = 'pending', call_log = 'Reenfileirado para discagem' WHERE campaign_id = ? AND (call_status = 'failed' OR call_status = 'calling')", [id]);
    run("UPDATE campaigns SET status = 'processing' WHERE id = ?", [id]);

    const { triggerCampaignProcessor } = require('./services/campaignExecutor.js');
    triggerCampaignProcessor(Number(id));
    res.json({ success: true, message: 'Leads com falha reenfileirados para discagem com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Destravar Campanha Instantaneamente (Reenfileira todos os leads não atendidos)
 */
app.post('/api/campaigns/:id/force-unlock', (req, res) => {
  const { id } = req.params;
  try {
    run("UPDATE leads SET call_status = 'pending', call_log = 'Destravado para discagem continuada' WHERE campaign_id = ? AND (call_status IS NULL OR call_status != 'completed')", [id]);
    run("UPDATE campaigns SET status = 'processing' WHERE id = ?", [id]);

    const { triggerCampaignProcessor } = require('./services/campaignExecutor.js');
    triggerCampaignProcessor(Number(id));
    res.json({ success: true, message: 'Campanha destravada com sucesso! Discagem retomada a todo vapor.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function getVapiTranscript(call) {
  let transcript =
    call?.transcript ||
    call?.artifact?.transcript ||
    call?.analysis?.transcript ||
    call?.callAnalysis?.transcript ||
    '';

  const messages = call?.artifact?.messages || call?.messages || call?.artifact?.messagesOpenAIFormatted;
  if (!transcript && Array.isArray(messages)) {
    transcript = messages
      .filter(m => m && m.role !== 'system' && (m.message || m.content || m.text))
      .map(m => {
        const sender = m.role === 'assistant' || m.role === 'bot' ? 'Vero' : 'Cliente';
        return `${sender}: ${m.message || m.content || m.text || ''}`;
      })
      .filter(str => !str.endsWith(': '))
      .join('\n');
  }

  return transcript || '';
}

function getVapiRecordingUrl(call) {
  return (
    call?.recordingUrl ||
    call?.stereoRecordingUrl ||
    call?.monoRecordingUrl ||
    call?.artifact?.recordingUrl ||
    call?.artifact?.stereoRecordingUrl ||
    call?.artifact?.monoRecordingUrl ||
    call?.recording?.url ||
    call?.artifact?.recording?.url ||
    null
  );
}

function getVapiDurationSeconds(call) {
  if (Number(call?.duration) > 0) return Number(call.duration);
  if (call?.endedAt) {
    const startedAt = call.startedAt || call.createdAt;
    if (startedAt) {
      const durationMs = new Date(call.endedAt) - new Date(startedAt);
      if (!Number.isNaN(durationMs) && durationMs > 0) {
        return Math.round(durationMs / 1000);
      }
    }
  }
  return 0;
}

function getVapiEndedReason(call, message = null) {
  return (
    message?.endedReason ||
    message?.ended_reason ||
    message?.call?.endedReason ||
    message?.call?.ended_reason ||
    call?.endedReason ||
    call?.ended_reason ||
    'sem_motivo'
  );
}

function getVapiMessages(call) {
  return call?.artifact?.messages || call?.messages || call?.artifact?.messagesOpenAIFormatted || [];
}

function hasVapiCustomerSpeech(call, transcript = '') {
  const messages = getVapiMessages(call);
  if (Array.isArray(messages) && messages.length > 0) {
    return messages.some(m => {
      const role = String(m?.role || '').toLowerCase();
      const text = String(m?.message || m?.content || m?.text || '').trim();
      return (role === 'user' || role === 'customer' || role === 'cliente') && text.length > 0;
    });
  }

  return String(transcript || '')
    .split('\n')
    .some(line => /^(user|customer|cliente)\s*:/i.test(line.trim()) && line.replace(/^[^:]+:/, '').trim().length > 0);
}

function isVapiExplicitFailure(endedReason) {
  const reason = String(endedReason || '').toLowerCase();
  return reason.includes('voicemail') ||
    reason.includes('customer-did-not-answer') ||
    reason.includes('customer-busy') ||
    reason.includes('no-answer') ||
    reason.includes('busy') ||
    reason.includes('failed-to-connect') ||
    reason.includes('providerfault') ||
    reason.includes('request-timeout') ||
    reason.includes('sip-outbound-call-failed');
}

function isVapiAnsweredCall(call, transcript, duration) {
  const reason = String(getVapiEndedReason(call) || '').toLowerCase();
  const isConnectedEnd = reason.includes('silence') ||
    (reason.includes('customer') && !reason.includes('did-not-answer') && !reason.includes('busy')) ||
    reason.includes('assistant-completed-task') ||
    reason.includes('assistant-ended-call') ||
    reason.includes('sip-completed-call');

  return !isVapiExplicitFailure(reason) && (isConnectedEnd || duration > 0 || hasVapiCustomerSpeech(call, transcript));
}

function vapiCallBelongsToCampaign(call, campaign, campaignId) {
  const metadataCampaignId = call?.metadata?.campaign_id;
  if (String(metadataCampaignId || '') !== String(campaignId)) return false;

  if (campaign.vapi_assistant_id && call?.assistantId && call.assistantId !== campaign.vapi_assistant_id) {
    return false;
  }

  if (campaign.vapi_phone_number_id && call?.phoneNumberId && call.phoneNumberId !== campaign.vapi_phone_number_id) {
    return false;
  }

  return true;
}

async function fetchVapiCallsPage(apiKey, params) {
  let lastBody = '';
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(`https://api.vapi.ai/call?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    lastBody = await response.text();

    if (response.status === 429) {
      const delayMs = Math.min(1500 * attempt * attempt, 12000);
      console.log(`[VAPI SYNC] Rate limit 429. Tentativa ${attempt}/5. Aguardando ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }

    let data;
    try {
      data = JSON.parse(lastBody);
    } catch (e) {
      data = [];
    }

    if (!response.ok) {
      const errorMessage = data?.message || data?.error || lastBody || `HTTP ${response.status}`;
      throw new Error(`Vapi retornou ${response.status}: ${errorMessage}`);
    }

    return Array.isArray(data) ? data : (data.results || data.data || data.calls || []);
  }

  throw new Error(`Vapi retornou 429 Rate Limit após retentativas: ${lastBody || 'sem corpo'}`);
}

/**
 * Rota para ressincronizar chamadas da Vapi diretamente pela REST API.
 */
app.post('/api/campaigns/:id/resync-vapi', async (req, res) => {
  const campaignId = Number(req.params.id);
  const apiKey = process.env.VAPI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: 'VAPI_API_KEY não configurada no servidor.' });
  }

  try {
    const campaign = get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada.' });
    }

    const limit = Math.min(parseInt(req.body?.limit || req.query.limit || '500', 10) || 500, 500);
    const maxPages = Math.min(parseInt(req.body?.maxPages || req.query.maxPages || '12', 10) || 12, 50);
    const sendMessages = req.body?.sendMessages !== false && req.query.sendMessages !== 'false';

    let createdAtLt = null;
    const summary = {
      fetched: 0,
      matched: 0,
      updated: 0,
      completed: 0,
      failed: 0,
      withCustomerSpeech: 0,
      connectedWithoutCustomerSpeech: 0,
      skippedOpen: 0,
      skippedNoLead: 0,
      byEndedReason: {},
      pages: 0,
      stoppedAt: null
    };

    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({ limit: String(limit) });
      if (campaign.vapi_assistant_id) params.set('assistantId', campaign.vapi_assistant_id);
      if (campaign.vapi_phone_number_id) params.set('phoneNumberId', campaign.vapi_phone_number_id);
      if (createdAtLt) params.set('createdAtLt', createdAtLt);

      const calls = await fetchVapiCallsPage(apiKey, params);
      summary.pages++;
      summary.fetched += calls.length;

      if (!calls.length) break;

      let matchedInPage = 0;

      for (const c of calls) {
        if (!vapiCallBelongsToCampaign(c, campaign, campaignId)) continue;
        matchedInPage++;
        summary.matched++;

        if (c.status && c.status !== 'ended' && !c.endedAt && !c.endedReason && !c.ended_reason) {
          summary.skippedOpen++;
          continue;
        }

        const metadataLeadId = c.metadata?.lead_id;
        let targetLead = null;

        if (metadataLeadId) {
          targetLead = get('SELECT * FROM leads WHERE id = ? AND campaign_id = ?', [metadataLeadId, campaignId]);
        }

        if (!targetLead && c.id) {
          targetLead = get('SELECT * FROM leads WHERE call_id = ? AND campaign_id = ?', [c.id, campaignId]);
        }

        if (!targetLead) {
          summary.skippedNoLead++;
          continue;
        }

        const callId = c.id;
        const endedReason = getVapiEndedReason(c);
        const transcript = getVapiTranscript(c);
        const recordingUrl = getVapiRecordingUrl(c);
        const duration = getVapiDurationSeconds(c);
        const callStatus = isVapiAnsweredCall(c, transcript, duration) ? 'completed' : 'failed';
        const customerSpoke = hasVapiCustomerSpeech(c, transcript);
        const occurrence = classifyCallOccurrence({
          endedReason,
          summary: c.summary || c.analysis?.summary || c.artifact?.summary,
          transcript,
          duration
        });

        run(
          `UPDATE leads SET 
            call_id = COALESCE(?, call_id),
            call_status = ?,
            call_duration = ?,
            occurrence = ?,
            transcript = COALESCE(NULLIF(?, ''), transcript),
            recording_url = COALESCE(?, recording_url),
            call_log = ?,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            callId,
            callStatus,
            duration,
            occurrence,
            transcript,
            recordingUrl,
            `[VAPI SYNC] Chamada encerrada. Motivo: ${endedReason}. Duração: ${duration}s.`,
            targetLead.id
          ]
        );

        summary.updated++;
        if (callStatus === 'completed') summary.completed++;
        if (callStatus === 'failed') summary.failed++;
        if (customerSpoke) summary.withCustomerSpeech++;
        if (callStatus === 'completed' && !customerSpoke) summary.connectedWithoutCustomerSpeech++;
        summary.byEndedReason[endedReason] = (summary.byEndedReason[endedReason] || 0) + 1;

        const customerSpeech = normalizeText(extractCustomerSpeech(transcript));
        const isAffirmativeCpc = /\b(sim|sou eu|correto|pode falar|alo|isso|confirmo|exato|esta|e ela|e ele|eu mesma|eu mesmo|palestine|posso ajudar)\b/i.test(customerSpeech);
        const hasSmsToolCallInMessages = Array.isArray(c.artifact?.messages) && c.artifact.messages.some(m => {
          const funcName = m.toolCalls?.[0]?.function?.name || m.name || '';
          return String(funcName).toLowerCase().includes('sms');
        });
        const shouldSendSms = callStatus === 'completed';
        const smsReason = validCpcOccurrences.includes(occurrence) || (isAffirmativeCpc && customerSpeech.trim().length > 0) || hasSmsToolCallInMessages
          ? 'confirmação/CPC'
          : 'chamada atendida';

        if (shouldSendSms && sendMessages) {
          const lead = get('SELECT * FROM leads WHERE id = ?', [targetLead.id]);
          if (lead && lead.sms_status !== 'completed') {
            console.log(`[SMS TRIGGER] Disparando SMS para Lead #${targetLead.id} (${lead.phone}) por ${smsReason}...`);
            const { triggerN8NSmsWebhook } = require('./services/communication.js');
            triggerN8NSmsWebhook(lead)
              .then(smsResult => {
                const smsStatus = smsResult.success ? 'completed' : 'failed';
                const smsLog = smsResult.success ? `[SMS] Enviado com sucesso via n8n/Unipix.` : smsResult.log;
                run('UPDATE leads SET sms_status = ?, sms_log = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [smsStatus, smsLog, targetLead.id]);
                updateCampaignStats(campaignId);
              })
              .catch(err => console.error('[SMS TRIGGER ERROR]', err.message));
          }
        } else if (!shouldSendSms) {
          const cancelReason = 'Cancelado: Ligação não atendida.';

          run(
            `UPDATE leads
             SET sms_status = 'failed',
                 sms_log = ?,
                 email_status = 'failed',
                 email_log = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND (sms_status IS NULL OR sms_status = 'pending' OR email_status IS NULL OR email_status = 'pending')`,
            [cancelReason, cancelReason, targetLead.id]
          );
        }
      }

      const oldestCall = calls[calls.length - 1];
      createdAtLt = oldestCall?.createdAt || null;
      summary.stoppedAt = createdAtLt;

      if (!createdAtLt || (matchedInPage === 0 && summary.matched > 0)) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    updateCampaignStats(campaignId);
    const updatedCampaign = get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
    res.json({
      success: true,
      restoredCount: summary.updated,
      completedCount: summary.completed,
      failedCount: summary.failed,
      summary,
      campaign: updatedCampaign,
      message: `Ressincronização Vapi concluída: ${summary.updated} leads atualizados (${summary.completed} atendidas, ${summary.failed} não atendidas).`
    });
  } catch (error) {
    console.error('[VAPI RESYNC ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Recalcular estatísticas e alinhar envios reais de SMS da campanha ativa
 */
app.post('/api/admin/recalculate-stats', (req, res) => {
  try {
    const c = get('SELECT id FROM campaigns ORDER BY id DESC LIMIT 1');
    if (c) {
      // Garante que leads pendentes tenham sms_status = 'pending'
      run(
        "UPDATE leads SET sms_status = 'pending', sms_log = NULL WHERE campaign_id = ? AND call_status = 'pending'", 
        [c.id]
      );
      // Força o reset de qualquer SMS de teste anterior de chamadas encerradas sem Transaction ID
      run(
        "UPDATE leads SET sms_status = 'failed', sms_log = 'Não enviado: Chamada encerrada antes da confirmação.' WHERE campaign_id = ? AND call_status IN ('completed', 'failed') AND (sms_log IS NULL OR sms_log NOT LIKE '%Transaction ID%')", 
        [c.id]
      );
      updateCampaignStats(c.id);
    }
    res.json({ success: true, message: 'Leads antigos de teste resetados e estatísticas atualizadas com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Recalcular estatísticas de uma campanha específica sem alterar status/logs dos leads.
 */
app.post('/api/campaigns/:id/recalculate-stats', (req, res) => {
  const { id } = req.params;
  try {
    const campaign = get('SELECT id FROM campaigns WHERE id = ?', [id]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada.' });
    }

    updateCampaignStats(Number(id));
    const updatedCampaign = get('SELECT * FROM campaigns WHERE id = ?', [id]);
    res.json({
      success: true,
      message: 'Métricas da campanha recalculadas com sucesso.',
      campaign: updatedCampaign
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Excluir uma campanha e seus leads
 */
app.delete('/api/campaigns/:id', (req, res) => {
  const { id } = req.params;
  try {
    run('DELETE FROM campaigns WHERE id = ?', [id]);
    res.json({ success: true, message: 'Campanha excluída com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Rota para buscar os assistentes cadastrados na VAPI
 */
app.get('/api/vapi/assistants', async (req, res) => {
  const apiKey = process.env.VAPI_API_KEY;

  if (!apiKey) {
    // Retorna opções de teste se não houver chave no .env
    return res.json([
      { id: 'vapi_residencia_cobrança', name: 'Vero Residencial - Cobrança Padrão' },
      { id: 'vapi_empresa_cobrança', name: 'Vero PME - Cobrança Empresas' }
    ]);
  }

  try {
    const response = await fetch('https://api.vapi.ai/assistant', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Erro VAPI HTTP: ${response.status}`);
    }

    const assistants = await response.json();
    let mapped = assistants.map(ast => ({
      id: ast.id,
      name: ast.name || `Assistente (${ast.id})`
    }));

    // Se houver VAPI_ASSISTANT_ID definido no .env, exibe apenas ele no dropdown
    const configAssistantId = process.env.VAPI_ASSISTANT_ID;
    if (configAssistantId) {
      const found = mapped.find(ast => ast.id === configAssistantId);
      if (found) {
        mapped = [found];
      } else {
        mapped = [{ id: configAssistantId, name: `Assistente Configurado (${configAssistantId})` }];
      }
    }

    res.json(mapped);
  } catch (error) {
    console.error('Erro ao buscar assistentes VAPI:', error);
    res.json([
      { id: 'vapi_residencia_cobrança', name: 'Vero Residencial - Cobrança Padrão' }
    ]);
  }
});

/**
 * Listar troncos SIP / Phone Numbers cadastrados na VAPI.ai
 */
app.get('/api/vapi/phone-numbers', async (req, res) => {
  const apiKey = process.env.VAPI_API_KEY;

  if (!apiKey) {
    return res.json([
      { id: '992eb80b-c46a-4d61-9087-37ec21c22333', name: 'New Voice NV (+5521989510033)' }
    ]);
  }

  try {
    const response = await fetch('https://api.vapi.ai/phone-number', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Erro VAPI HTTP: ${response.status}`);
    }

    const phoneNumbers = await response.json();
    const mapped = phoneNumbers.map(pn => ({
      id: pn.id,
      name: `${pn.name || 'Linha'} (${pn.number || pn.id.slice(0, 8)})`
    }));

    res.json(mapped);
  } catch (error) {
    console.error('Erro ao buscar phone numbers VAPI:', error);
    res.json([
      { id: '992eb80b-c46a-4d61-9087-37ec21c22333', name: 'New Voice NV (+5521989510033)' },
      { id: '8a2d13db-2d28-4cd6-a745-031af5fd5305', name: 'NV BINA LOC (+5521987710179)' },
      { id: '7150a15e-7ada-4441-b10e-9dc475398405', name: 'OKTOR VERO (+5521984354821)' }
    ]);
  }
});

/**
 * Listar Agentes cadastrados na Retell AI
 */
app.get('/api/retell/agents', async (req, res) => {
  const apiKey = process.env.RETELL_API_KEY || 'key_a5dbdb38e3718d2aaa70862d1ad8';

  try {
    const response = await fetch('https://api.retellai.com/list-agents', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Erro Retell HTTP: ${response.status}`);
    }

    const agents = await response.json();
    const mapped = agents.map(ast => ({
      id: ast.agent_id,
      name: `${ast.agent_name || 'Agente Retell'} (${ast.agent_id.slice(0, 10)})`
    }));

    res.json(mapped);
  } catch (error) {
    console.error('Erro ao buscar agentes Retell:', error);
    res.json([
      { id: 'agent_7bc0f8110f1a29b6f4c0151320', name: 'Julia Agent (agent_7bc0f8)' }
    ]);
  }
});

/**
 * Listar Telefones / Troncos SIP cadastrados na Retell AI
 */
app.get('/api/retell/phone-numbers', async (req, res) => {
  const apiKey = process.env.RETELL_API_KEY || 'key_a5dbdb38e3718d2aaa70862d1ad8';

  try {
    const response = await fetch('https://api.retellai.com/list-phone-numbers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Erro Retell HTTP: ${response.status}`);
    }

    const phoneNumbers = await response.json();
    const mapped = phoneNumbers.map(pn => ({
      id: pn.phone_number,
      name: `${pn.nickname || 'Linha Retell'} (${pn.phone_number_pretty || pn.phone_number})`
    }));

    res.json(mapped);
  } catch (error) {
    console.error('Erro ao buscar phone numbers Retell:', error);
    res.json([
      { id: '551153301578', name: 'Oktor (551153301578)' },
      { id: '+5521984354821', name: 'Caio (+5521984354821)' }
    ]);
  }
});

/**
 * Upload de planilha e criação de nova campanha
 */
app.post('/api/campaigns/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const { campaignName } = req.body;
  if (!campaignName || campaignName.trim() === '') {
    return res.status(400).json({ error: 'O nome da campanha é obrigatório.' });
  }

  const filePath = req.file.path;

  try {
    // 1. Processar a planilha
    const leads = await parseSpreadsheet(filePath, req.file.originalname);
    
    if (leads.length === 0) {
      return res.status(400).json({ error: 'A planilha não contém leads válidos com números de telefone.' });
    }

    const { dialerProvider, vapiAssistantId, vapiPhoneNumberId } = req.body;
    const requestedProvider = String(dialerProvider || 'vapi').toLowerCase();
    const provider = requestedProvider === 'retell' ? 'retell' : 'vapi';

    const activeCampaign = get(
      `SELECT id, name
       FROM campaigns
       WHERE status = 'processing'
       ORDER BY id DESC
       LIMIT 1`
    );

    if (activeCampaign) {
      return res.status(409).json({
        error: `Já existe uma campanha em processamento (#${activeCampaign.id} - ${activeCampaign.name}). Pause essa campanha antes de importar uma nova planilha.`
      });
    }

    // 2. Inserir campanha no banco (status inicial como 'processing' para iniciar disparos imediatamente)
    const campaignResult = run(
      'INSERT INTO campaigns (name, status, dialer_provider, vapi_assistant_id, vapi_phone_number_id, concurrency_limit, total_leads) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [campaignName.trim(), 'processing', provider, vapiAssistantId || null, vapiPhoneNumberId || null, 20, leads.length]
    );
    const campaignId = campaignResult.lastInsertRowid;

    // 3. Inserir os leads em lote usando transação nativa para alta performance (suporta 20k+ facilmente)
    const insertLeadStmt = db.prepare(`
      INSERT INTO leads (campaign_id, name, phone, debt_value, due_date, barcode, dias_atraso, status_internet, email) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    console.log(`[SERVER] Inserindo ${leads.length} leads no banco de dados para a campanha #${campaignId}...`);
    const startTime = Date.now();

    run('BEGIN TRANSACTION');
    try {
      for (const lead of leads) {
        insertLeadStmt.run(
          campaignId, 
          lead.name, 
          lead.phone, 
          lead.debt_value, 
          lead.due_date, 
          lead.barcode || null,
          lead.dias_atraso || 0,
          lead.status_internet || null,
          lead.email || null
        );
      }
      run('COMMIT');
    } catch (err) {
      run('ROLLBACK');
      throw err;
    }
    
    console.log(`[SERVER] Inserção concluída em ${Date.now() - startTime}ms. Iniciando discador para a campanha #${campaignId}...`);

    // Acionar robô de discagem automaticamente
    const { triggerCampaignProcessor } = require('./services/campaignExecutor.js');
    triggerCampaignProcessor(campaignId);

    res.json({
      success: true,
      campaignId,
      totalLeads: leads.length,
      message: `Campanha criada com sucesso! Discagem iniciada automaticamente.`
    });

  } catch (error) {
    console.error('[UPLOAD ERROR]', error);
    res.status(500).json({ error: `Falha ao processar arquivo: ${error.message}` });
  } finally {
    // Remover o arquivo temporário
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

/**
 * Rota para baixar planilha modelo (Exemplo de teste)
 */
app.get('/api/sample-file', (req, res) => {
  const sampleData = [
    { Nome: 'Carlos Silva', Telefone: '11999998888', Valor: 150.90, Vencimento: '10/08/2026' },
    { Nome: 'Mariana Souza', Telefone: '21988887777', Valor: 220.00, Vencimento: '15/08/2026' },
    { Nome: 'Joao Oliveira', Telefone: '31977776666', Valor: 89.90, Vencimento: '05/08/2026' },
    { Nome: 'Beatriz Costa', Telefone: '11966665555', Valor: 450.50, Vencimento: '20/08/2026' },
    { Nome: 'Pedro Santos', Telefone: '11955554444', Valor: 120.00, Vencimento: '12/08/2026' }
  ];

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(sampleData);
  xlsx.utils.book_append_sheet(wb, ws, 'Leads Exemplo');

  const tempFilePath = path.join(uploadDir, 'modelo_leads.xlsx');
  xlsx.writeFile(wb, tempFilePath);

  res.download(tempFilePath, 'modelo_leads.xlsx', () => {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  });
});

/**
 * Endpoint de callback para o n8n atualizar o status do lead
 */
app.post('/api/leads/update', (req, res) => {
  const { lead_id, call_status, call_log, sms_status, sms_log, occurrence } = req.body;

  if (!lead_id) {
    return res.status(400).json({ error: 'lead_id é obrigatório.' });
  }

  try {
    const lead = get('SELECT * FROM leads WHERE id = ?', [lead_id]);
    if (!lead) {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }

    const campaignId = lead.campaign_id;

    // Valores novos ou mantidos
    const newCallStatus = call_status || lead.call_status;
    const newCallLog = call_log !== undefined ? call_log : lead.call_log;
    const newSmsStatus = sms_status || lead.sms_status;
    const newSmsLog = sms_log !== undefined ? sms_log : lead.sms_log;
    const newOccurrence = occurrence !== undefined ? occurrence : lead.occurrence;

    run(
      `UPDATE leads 
       SET call_status = ?, call_log = ?, sms_status = ?, sms_log = ?, occurrence = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [newCallStatus, newCallLog, newSmsStatus, newSmsLog, newOccurrence, lead_id]
    );

    // Recalcular as estatísticas totais da campanha no banco usando a função centralizada
    updateCampaignStats(campaignId);

    res.json({ success: true, message: 'Status do lead atualizado e métricas recalculadas.' });
  } catch (error) {
    console.error('[UPDATE LEAD ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// A classificação de ocorrências agora é importada do utilitário compartilhado backend/utils/classifier.js

const { handleRetellWebhook } = require('./services/retell.js');

/**
 * Endpoint de webhook para receber eventos da Retell AI
 */
app.post('/api/retell-webhook', async (req, res) => {
  try {
    const result = await handleRetellWebhook(req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[RETELL WEBHOOK ERROR]', error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint de webhook para receber relatórios da VAPI.ai
 */
app.post('/api/vapi-webhook', async (req, res) => {
  try {
    const { message } = req.body;

    // Se a VAPI consultar o Server URL pedindo o assistente, retorna 200 OK para usar o assistente da chamada
    // Suporte a Tool Calls em tempo real durante a ligação (Disparo instantâneo do SMS)
    if (message?.type === 'tool-calls' || message?.type === 'function-call') {
      const call = message.call;
      const leadId = call?.metadata?.lead_id;
      const toolCalls = message.toolCalls || message.tool_calls || [];

      // Verificar se algum dos tool calls é para enviar o SMS
      const hasSmsToolCall = toolCalls.some(tc => {
        const funcName = tc.function?.name || tc.name || '';
        const normFunc = String(funcName).toLowerCase().replace(/[\s_-]+/g, '');
        return normFunc.includes('enviarsms') || normFunc.includes('sms');
      });

      if (hasSmsToolCall && leadId) {
        const lead = get('SELECT * FROM leads WHERE id = ?', [leadId]);
        if (lead) {
          console.log(`[REAL-TIME SMS] Disparando SMS em tempo real para o Lead #${leadId} durante a ligação!`);
          const { triggerN8NSmsWebhook } = require('./services/communication.js');
          triggerN8NSmsWebhook(lead)
            .then(smsResult => {
              const smsStatus = smsResult.success ? 'completed' : 'failed';
              const smsLog = smsResult.success ? `[SMS] Enviado em tempo real durante a ligação.` : smsResult.log;
              run('UPDATE leads SET sms_status = ?, sms_log = ? WHERE id = ?', [smsStatus, smsLog, leadId]);
            })
            .catch(err => console.error('[REAL-TIME SMS ERROR]', err.message));
        }
      }

      return res.status(200).json({
        results: toolCalls.map(tc => {
          const funcName = tc.function?.name || tc.name || '';
          const normFunc = String(funcName).toLowerCase().replace(/[\s_-]+/g, '');
          let resultMessage = 'Tool executada com sucesso.';
          if (normFunc.includes('enviarsms') || normFunc.includes('sms')) {
            resultMessage = 'SMS enviado com sucesso para o celular do cliente.';
          } else if (normFunc.includes('voicemail')) {
            resultMessage = 'Caixa postal detectada.';
          }
          return {
            toolCallId: tc.id,
            result: resultMessage
          };
        })
      });
    }

    if (!message || message.type !== 'end-of-call-report') {
      return res.status(200).json({});
    }

    const call = message.call;
    const metadata = call?.metadata;
    let leadId = metadata?.lead_id;
    let targetLead = null;

    if (leadId) {
      targetLead = get('SELECT * FROM leads WHERE id = ?', [leadId]);
    }

    if (!targetLead && call?.id) {
      targetLead = get('SELECT * FROM leads WHERE call_id = ?', [call.id]);
    }

    if (!targetLead && call?.customer?.number) {
      const phoneDigits = call.customer.number.replace(/\D/g, '').slice(-8);
      targetLead = get('SELECT * FROM leads WHERE phone LIKE ? ORDER BY id DESC LIMIT 1', [`%${phoneDigits}%`]);
    }

    if (!targetLead) {
      console.log(`[VAPI WEBHOOK] Lead não encontrado no banco para a chamada ${call?.id} (${call?.customer?.number}).`);
      return res.json({ received: true, status: 'lead_not_found' });
    }

    leadId = targetLead.id;
    const campaignId = targetLead.campaign_id || metadata?.campaign_id;

    const endedReason = getVapiEndedReason(call, message);

    console.log(`[VAPI WEBHOOK] Recebido fim de chamada para o Lead #${leadId} (Campanha #${campaignId}). Motivo: ${endedReason}`);

    // Regra: classificar como atendida somente quando a Vapi indicar chamada conectada.
    const duration = getVapiDurationSeconds({
      ...(call || {}),
      duration: call?.duration || message?.duration,
      startedAt: call?.startedAt || message?.startedAt,
      endedAt: call?.endedAt || message?.endedAt
    });

    let transcriptText = 
      message?.transcript || 
      call?.transcript || 
      message?.artifact?.transcript || 
      call?.artifact?.transcript || 
      message?.analysis?.transcript || 
      call?.analysis?.transcript || 
      '';

    if (!transcriptText && Array.isArray(message?.artifact?.messages)) {
      transcriptText = message.artifact.messages
        .filter(m => m.role && (m.message || m.content))
        .map(m => `${m.role === 'assistant' || m.role === 'bot' ? 'Vero' : 'Cliente'}: ${m.message || m.content}`)
        .join('\n');
    }

    const recordingUrl = 
      message?.recordingUrl || 
      message?.stereoRecordingUrl || 
      message?.artifact?.recordingUrl || 
      call?.recordingUrl || 
      call?.stereoRecordingUrl || 
      call?.artifact?.recordingUrl || 
      null;

    const isSuccess = isVapiAnsweredCall({ ...(call || {}), endedReason }, transcriptText, duration);
    const callStatus = isSuccess ? 'completed' : 'failed';
    const logText = `[VAPI] Chamada encerrada. Motivo: ${endedReason}. Duração: ${duration}s. Resumo: ${call?.summary || 'Sem resumo fornecido.'}`;
    
    // Classificar ocorrência
    const occurrence = classifyCallOccurrence({
      endedReason: call?.endedReason || call?.ended_reason,
      summary: call?.summary,
      transcript: transcriptText,
      duration: duration
    });

    // Atualizar o lead com o status, log, ocorrência, transcrição e áudio da ligação
    run(
      `UPDATE leads 
       SET call_id = COALESCE(?, call_id),
           call_status = ?,
           call_log = ?,
           occurrence = ?,
           call_duration = ?,
           transcript = ?,
           recording_url = COALESCE(?, recording_url),
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [call?.id || null, callStatus, logText, occurrence, duration, transcriptText, recordingUrl, leadId]
    );

    // Regra de Negócio: se a pessoa atendeu, envia SMS mesmo sem confirmação CPC.
    const customerSpeechOnly = normalizeText(extractCustomerSpeech(transcriptText));
    const isAffirmativeCpc = /\b(sim|sou eu|correto|pode falar|alô|alo|isso|confirmo|exato|esta|é ela|e ela|é ele|e ele|eu mesma|eu mesmo|palestine|posso ajudar)\b/i.test(customerSpeechOnly);
    const hasSmsToolCallInMessages = Array.isArray(message?.artifact?.messages) && message.artifact.messages.some(m => {
      const funcName = m.toolCalls?.[0]?.function?.name || m.name || '';
      return String(funcName).toLowerCase().includes('sms');
    });
    const isCpcConfirmed = validCpcOccurrences.includes(occurrence) || (isAffirmativeCpc && customerSpeechOnly.trim().length > 0) || hasSmsToolCallInMessages;
    const shouldSendSms = callStatus === 'completed';

    if (shouldSendSms) {
      const lead = get('SELECT * FROM leads WHERE id = ?', [leadId]);
      if (lead) {
        const { triggerN8NSmsWebhook, sendLocawebEmail } = require('./services/communication.js');
        
        // 1. Disparar SMS se ainda não tiver sido enviado com sucesso em tempo real
        let smsStatus = lead.sms_status;
        let smsLogText = lead.sms_log;
        
        if (lead.sms_status !== 'completed') {
          const smsResult = await triggerN8NSmsWebhook(lead);
          smsStatus = smsResult.success ? 'completed' : 'failed';
          smsLogText = smsResult.success
            ? `[SMS] Enviado com sucesso: chamada atendida${isCpcConfirmed ? ' com confirmação/CPC' : ''}.`
            : smsResult.log;
        } else {
          console.log(`[VAPI WEBHOOK] SMS do Lead #${leadId} já foi enviado em tempo real. Ignorando reenvio.`);
        }
        
        // 2. E-mail segue restrito a CPC/ocorrências qualificadas; a regra nova é apenas SMS.
        let emailStatus = lead.email_status || 'pending';
        let emailLog = lead.email_log || null;
        if (isCpcConfirmed && ((lead.email && lead.email.includes('@')) || process.env.TEST_EMAIL)) {
          const emailResult = await sendLocawebEmail(lead);
          emailStatus = emailResult.success ? 'completed' : 'failed';
          emailLog = emailResult.log;
        } else if (!isCpcConfirmed) {
          emailStatus = 'failed';
          emailLog = `Não enviado: chamada atendida sem confirmação CPC (${occurrence}).`;
        } else {
          emailStatus = 'completed';
          emailLog = 'Não enviado: Lead sem e-mail cadastrado.';
        }
        
        run(
          `UPDATE leads 
           SET sms_status = ?, sms_log = ?, email_status = ?, email_log = ?, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [
            smsStatus, 
            smsLogText, 
            emailStatus, 
            emailLog, 
            leadId
          ]
        );
      }
    } else {
      const cancelReason = 'Cancelado: Ligação não atendida.';

      run(
        `UPDATE leads 
         SET sms_status = 'failed', sms_log = ?, email_status = 'failed', email_log = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [cancelReason, cancelReason, leadId]
      );
    }

    // Recalcular as estatísticas totais da campanha no banco usando a função centralizada
    updateCampaignStats(campaignId);

    res.json({ success: true, message: 'Webhook VAPI processado com sucesso.' });

  } catch (error) {
    console.error('[VAPI WEBHOOK ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Rota para disparo manual imediato de SMS para a lista de leads selecionada
 */
app.post('/api/leads/trigger-manual-sms', async (req, res) => {
  try {
    const { runManualSend } = require('./scripts/manualSmsTrigger.js');
    runManualSend().catch(err => console.error('[MANUAL SMS ERROR]', err.message));
    res.json({ success: true, message: 'Disparo manual de SMS iniciado com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Rota para buscar os detalhes em tempo real de um lead (incluindo sincronização com a Vapi REST API)
 */
app.get('/api/leads/:id/details', async (req, res) => {
  const { id } = req.params;
  try {
    let lead = get('SELECT * FROM leads WHERE id = ?', [id]);
    if (!lead) {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }

    if (lead.call_id) {
      const { fetchVapiCallDetails } = require('./services/vapi.js');
      const details = await fetchVapiCallDetails(lead.call_id);
      if (details) {
        let updated = false;
        if (details.recordingUrl && details.recordingUrl !== lead.recording_url) {
          run('UPDATE leads SET recording_url = ? WHERE id = ?', [details.recordingUrl, lead.id]);
          updated = true;
        }
        if (details.transcript && details.transcript !== lead.transcript) {
          run('UPDATE leads SET transcript = ? WHERE id = ?', [details.transcript, lead.id]);
          updated = true;
        }
        if (updated) {
          lead = get('SELECT * FROM leads WHERE id = ?', [id]);
        }
      }
    }

    res.json({ success: true, lead });
  } catch (error) {
    console.error(`[LEAD DETAILS ERROR] Lead #${id}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Rota Proxy de Áudio da Chamada: Autentica com a API da Vapi/S3 e transmite o streaming de áudio diretamente para o navegador sem erros de permissão do S3
 */
app.get('/api/leads/:id/audio', async (req, res) => {
  const { id } = req.params;
  try {
    const lead = get('SELECT * FROM leads WHERE id = ?', [id]);
    if (!lead) {
      return res.status(404).send('Lead não encontrado.');
    }

    const { fetchVapiCallDetails } = require('./services/vapi.js');
    let audioUrl = lead.recording_url;

    // 1. Buscar a URL de gravação atualizada diretamente da API REST da Vapi
    if (lead.call_id) {
      const details = await fetchVapiCallDetails(lead.call_id);
      if (details?.recordingUrl) {
        audioUrl = details.recordingUrl;
        run('UPDATE leads SET recording_url = ? WHERE id = ?', [audioUrl, lead.id]);
      }
    }

    // 2. Se ainda não achou, faz requisição raw na Vapi para checar stereoRecordingUrl/monoRecordingUrl/artifact
    if (!audioUrl && lead.call_id) {
      const apiKey = process.env.VAPI_API_KEY;
      if (apiKey) {
        try {
          const vapiRes = await fetch(`https://api.vapi.ai/call/${lead.call_id}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          if (vapiRes.ok) {
            const raw = await vapiRes.json();
            audioUrl = raw.recordingUrl || raw.stereoRecordingUrl || raw.monoRecordingUrl || raw.artifact?.recordingUrl || raw.artifact?.stereoRecordingUrl || raw.artifact?.monoRecordingUrl || raw.recording || null;
            if (audioUrl) {
              run('UPDATE leads SET recording_url = ? WHERE id = ?', [audioUrl, lead.id]);
            }
          }
        } catch (e) {}
      }
    }

    if (!audioUrl) {
      if (!lead.call_id) {
        return res.status(404).send(`Lead #${id} (${lead.name}) não possui ID de chamada registrado no banco.`);
      }
      return res.status(404).send(`A Vapi não encontrou gravação de áudio para a chamada ${lead.call_id}.`);
    }

    // Se for URL pública presigned de S3 ou Google Cloud, redireciona diretamente
    if (audioUrl.includes('s3.amazonaws.com') || audioUrl.includes('storage.googleapis.com')) {
      return res.redirect(audioUrl);
    }

    const apiKey = process.env.VAPI_API_KEY;
    const headers = {};
    if (apiKey && audioUrl.includes('vapi')) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    let audioRes = await fetch(audioUrl, { headers });

    if (!audioRes.ok) {
      audioRes = await fetch(audioUrl);
    }

    if (!audioRes.ok) {
      return res.redirect(audioUrl);
    }

    const buffer = Buffer.from(await audioRes.arrayBuffer());
    res.setHeader('Content-Type', audioRes.headers.get('content-type') || 'audio/wav');
    return res.send(buffer);
  } catch (error) {
    console.error(`[AUDIO PROXY ERROR] Lead #${id}:`, error.message);
    res.status(500).send(`Exceção ao transmitir áudio: ${error.message}`);
  }
});

/**
 * Rota Debug da Vapi API: Consulta a chamada bruta na API da Vapi e retorna a estrutura JSON completa
 */
app.get('/api/vapi/call-debug/:call_id', async (req, res) => {
  let callId = req.params.call_id;
  const apiKey = process.env.VAPI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'VAPI_API_KEY não configurada no servidor.' });
  }

  // Se o parâmetro for 'latest', retorna os últimos 10 leads registrados no banco com seus IDs e Call IDs
  if (callId === 'latest' || callId === 'recentes') {
    const recentLeads = all('SELECT id, name, phone, call_status, occurrence, call_id, recording_url, transcript FROM leads ORDER BY id DESC LIMIT 10');
    return res.json({
      message: 'Últimos 10 leads registrados no banco.',
      totalFound: recentLeads.length,
      leads: recentLeads
    });
  }

  // Se o parâmetro for numérico, buscar o lead no banco para obter o call_id real da Vapi
  let leadInfo = null;
  if (!isNaN(callId)) {
    const lead = get('SELECT * FROM leads WHERE id = ?', [callId]);
    if (lead) {
      leadInfo = { id: lead.id, name: lead.name, phone: lead.phone, db_call_id: lead.call_id, db_recording_url: lead.recording_url };
      callId = lead.call_id;
    } else {
      // Se o ID numérico específico não foi encontrado, tenta buscar por parte do nome ou telefone
      const leadBySearch = get('SELECT * FROM leads WHERE name LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 1', [`%${req.params.call_id}%`, `%${req.params.call_id}%`]);
      if (leadBySearch) {
        leadInfo = { id: leadBySearch.id, name: leadBySearch.name, phone: leadBySearch.phone, db_call_id: leadBySearch.call_id, db_recording_url: leadBySearch.recording_url };
        callId = leadBySearch.call_id;
      }
    }
  }

  if (!callId) {
    const recentLeads = all('SELECT id, name, phone, call_status, occurrence, call_id FROM leads ORDER BY id DESC LIMIT 5');
    return res.status(404).json({ 
      error: `Lead ou Call ID '${req.params.call_id}' não foi encontrado no banco local.`, 
      leadInfo,
      dica: 'Você pode passar o ID numérico correto do lead (ex: /api/vapi/call-debug/1) ou o Call ID UUID da Vapi.',
      ultimosLeadsRegistrados: recentLeads
    });
  }

  try {
    const vapiRes = await fetch(`https://api.vapi.ai/call/${callId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await vapiRes.json();
    res.json({
      queryId: req.params.call_id,
      leadInfo,
      vapiStatus: vapiRes.status,
      keysFound: Object.keys(data),
      extractedRecordingUrl: data.recordingUrl || data.stereoRecordingUrl || data.artifact?.recordingUrl || data.artifact?.stereoRecordingUrl || data.artifactUrl || null,
      extractedTranscript: data.transcript || data.artifact?.transcript || null,
      fullVapiResponse: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Fallback para qualquer rota que não seja da API (Servir o Single Page Application)
 */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(publicPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('Vero Recovery API is running. Frontend build not found in public/.');
  }
});

app.listen(PORT, () => {
  console.log(`[SERVER] Vero Debt Recovery rodando em http://localhost:${PORT}`);
  
  // Auto-retomar somente campanhas que já estavam em processamento quando o servidor reiniciou.
  try {
    const activeCampaigns = all("SELECT id FROM campaigns WHERE status = 'processing' ORDER BY id DESC LIMIT 1");
    if (activeCampaigns && activeCampaigns.length > 0) {
      const { triggerCampaignProcessor } = require('./services/campaignExecutor.js');
      console.log(`[AUTO-RESUME] Retomando discagem da campanha #${activeCampaigns[0].id} automaticamente...`);
      run("UPDATE leads SET call_status = 'pending' WHERE campaign_id = ? AND call_status IN ('calling', 'in_progress')", [activeCampaigns[0].id]);
      run("UPDATE campaigns SET status = 'processing' WHERE id = ?", [activeCampaigns[0].id]);
      triggerCampaignProcessor(activeCampaigns[0].id);
    }
  } catch (e) {
    console.error('[AUTO-RESUME WARN]', e.message);
  }
});
