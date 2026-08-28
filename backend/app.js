const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const { initDb, run, get, all, db } = require('./db.js');
const { parseSpreadsheet } = require('./utils/parser.js');
const { triggerCampaignProcessor, startMonitorLoop } = require('./services/campaignExecutor.js');
const xlsx = require('xlsx');

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

// Servir arquivos estáticos do frontend (pasta public)
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Inicializar Banco de Dados e Fila
initDb();
startMonitorLoop();

/**
 * Rota para obter estatísticas resumidas da Dashboard
 */
app.get('/api/dashboard/stats', (req, res) => {
  try {
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
app.get('/api/campaigns/:id/leads', (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  try {
    const campaign = get('SELECT id FROM campaigns WHERE id = ?', [id]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    const leads = all(
      'SELECT * FROM leads WHERE campaign_id = ? ORDER BY id ASC LIMIT ? OFFSET ?',
      [id, limit, offset]
    );

    const totalLeadsRow = get('SELECT COUNT(id) as total FROM leads WHERE campaign_id = ?', [id]);
    const totalLeads = totalLeadsRow ? totalLeadsRow.total : 0;

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
 * Exportar resultados da campanha em formato CSV (suporta filtro por ocorrência)
 */
app.get('/api/campaigns/:id/export', (req, res) => {
  const { id } = req.params;
  const { occurrence } = req.query;
  try {
    const campaign = get('SELECT name FROM campaigns WHERE id = ?', [id]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    let query = 'SELECT name, phone, email, debt_value, due_date, barcode, dias_atraso, status_internet, occurrence, call_status, call_log, sms_status, sms_log, email_status, email_log FROM leads WHERE campaign_id = ?';
    const params = [id];
    if (occurrence && occurrence !== 'all') {
      query += ' AND occurrence = ?';
      params.push(occurrence);
    }
    const leads = all(query, params);

    let csvContent = 'Nome,Telefone,Email,Valor Divida,Data Vencimento,Linha Digitavel,Dias Atraso,Status Internet,Ocorrencia,Status Chamada,Log Chamada,Status SMS,Log SMS,Status Email,Log Email\r\n';
    
    for (const lead of leads) {
      const row = [
        `"${lead.name.replace(/"/g, '""')}"`,
        `"${lead.phone}"`,
        `"${lead.email || ''}"`,
        lead.debt_value,
        `"${lead.due_date || ''}"`,
        `"${lead.barcode || ''}"`,
        lead.dias_atraso || 0,
        `"${lead.status_internet || ''}"`,
        `"${lead.occurrence || 'TENTATIVA - NÃO TABULADO'}"`,
        `"${lead.call_status}"`,
        `"${(lead.call_log || '').replace(/"/g, '""')}"`,
        `"${lead.sms_status}"`,
        `"${(lead.sms_log || '').replace(/"/g, '""')}"`,
        `"${lead.email_status}"`,
        `"${(lead.email_log || '').replace(/"/g, '""')}"`
      ];
      csvContent += row.join(',') + '\r\n';
    }

    const filename = `resultado_campanha_${id}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(Buffer.from('\uFEFF' + csvContent, 'utf-8')); // Adiciona BOM para abrir corretamente no Excel
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Cancelar ou Pausar uma campanha ativa
 */
app.post('/api/campaigns/:id/cancel', (req, res) => {
  const { id } = req.params;
  try {
    const campaign = get('SELECT status FROM campaigns WHERE id = ?', [id]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    if (campaign.status === 'processing') {
      run('UPDATE campaigns SET status = "failed" WHERE id = ?', [id]);
      res.json({ success: true, message: 'Campanha cancelada/interrompida com sucesso.' });
    } else {
      res.status(400).json({ error: 'Apenas campanhas em processamento podem ser canceladas.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Iniciar ou Retomar disparos de uma campanha
 */
app.post('/api/campaigns/:id/start', (req, res) => {
  const { id } = req.params;
  try {
    const campaign = get('SELECT status FROM campaigns WHERE id = ?', [id]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    if (campaign.status === 'pending' || campaign.status === 'failed' || campaign.status === 'processing') {
      // Destravar leads que ficaram como 'calling' em campanhas anteriores
      run("UPDATE leads SET call_status = 'pending', sms_status = 'pending', email_status = 'pending' WHERE campaign_id = ? AND call_status = 'calling'", [id]);
      run("UPDATE campaigns SET status = 'processing' WHERE id = ?", [id]);
      // Executa a função assíncrona de processamento em background
      const { triggerCampaignProcessor } = require('./services/campaignExecutor.js');
      triggerCampaignProcessor();
      res.json({ success: true, message: 'Disparos da campanha iniciados com sucesso.' });
    } else {
      res.status(400).json({ error: 'Apenas campanhas pendentes ou pausadas podem ser iniciadas.' });
    }
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
    console.error('[VAPI ASSISTANTS FETCH ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Subir planilha e iniciar disparo de campanha
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

    const { vapiAssistantId } = req.body;

    // 2. Inserir campanha no banco (status inicial como 'pending')
    const campaignResult = run(
      'INSERT INTO campaigns (name, status, vapi_assistant_id, total_leads) VALUES (?, ?, ?, ?)',
      [campaignName.trim(), 'pending', vapiAssistantId || null, leads.length]
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
    
    console.log(`[SERVER] Inserção concluída em ${Date.now() - startTime}ms.`);

    res.json({
      success: true,
      campaignId,
      totalLeads: leads.length,
      message: `Campanha criada com sucesso. Clique em "Disparar" para iniciar os envios.`
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
 * Recalcula e atualiza as estatísticas acumuladas de uma campanha no banco de dados.
 */
function updateCampaignStats(campaignId) {
  try {
    const stats = get(`
      SELECT 
        COUNT(id) as total,
        SUM(CASE WHEN call_status = 'completed' THEN 1 ELSE 0 END) as successful_calls,
        SUM(CASE WHEN call_status = 'failed' THEN 1 ELSE 0 END) as failed_calls,
        SUM(CASE WHEN sms_status = 'completed' THEN 1 ELSE 0 END) as successful_sms,
        SUM(CASE WHEN sms_status = 'failed' THEN 1 ELSE 0 END) as failed_sms,
        SUM(CASE WHEN call_status IN ('completed', 'failed') AND sms_status IN ('completed', 'failed') AND email_status IN ('completed', 'failed') THEN 1 ELSE 0 END) as processed
      FROM leads
      WHERE campaign_id = ?
    `, [campaignId]);

    run(`
      UPDATE campaigns 
      SET processed_leads = ?,
          successful_calls = ?,
          failed_calls = ?,
          successful_sms = ?,
          failed_sms = ?
      WHERE id = ?
    `, [
      stats.processed || 0,
      stats.successful_calls || 0,
      stats.failed_calls || 0,
      stats.successful_sms || 0,
      stats.failed_sms || 0,
      campaignId
    ]);

    // Verificar se todos os leads desta campanha foram finalizados
    const pendingLeads = get(`
      SELECT COUNT(id) as count 
      FROM leads 
      WHERE campaign_id = ? 
        AND (call_status IN ('pending', 'processing', 'calling') 
             OR sms_status IN ('pending', 'processing', 'sending')
             OR email_status IN ('pending', 'processing', 'sending'))
    `, [campaignId]);

    if (pendingLeads && pendingLeads.count === 0) {
      run("UPDATE campaigns SET status = 'completed' WHERE id = ?", [campaignId]);
      console.log(`[SERVER] Campanha #${campaignId} marcada como CONCLUÍDA.`);
    }
  } catch (err) {
    console.error('[STATS UPDATE ERROR]', err);
  }
}

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
       SET call_status = ?, call_log = ?, sms_status = ?, sms_log = ?, occurrence = ? 
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

/**
 * Analisador inteligente de conversações para classificar ocorrências baseadas nas regras da Vero
 */
function classifyOccurrence(call) {
  const reason = call.endedReason;
  const summary = (call.summary || '').toLowerCase();
  const transcript = (call.transcript || '').toLowerCase();
  const duration = call.duration || 0;

  // 1. Falhas e tentativas automáticas da operadora
  if (reason === 'voicemail') {
    return 'TENTATIVA - MAQUINA MENSAGEM AUTOMATICA';
  }
  if (reason === 'no-answer') {
    return 'TENTATIVA - NÃO ATENDE';
  }
  if (reason === 'busy') {
    return 'TENTATIVA - OCUPADO';
  }
  if (reason === 'network-error' || reason === 'error') {
    return 'TENTATIVA - ERRO DISCAGEM';
  }

  // 2. Quedas e abandonos rápidos
  if (reason === 'customer-hung-up' && duration < 8) {
    return 'TENTATIVA - ABANDONO';
  }

  const combinedText = `${summary} ${transcript}`;

  // 3. Classificações com base na fala do cliente (CPC)
  if (combinedText.includes('faleceu') || combinedText.includes('falecimento') || combinedText.includes('morreu') || combinedText.includes('óbito') || combinedText.includes('obito')) {
    return 'FALECIDO';
  }
  if (combinedText.includes('não conhece') || combinedText.includes('numero errado') || combinedText.includes('número errado') || combinedText.includes('não é ele') || combinedText.includes('não é ela') || combinedText.includes('desconhecido') || combinedText.includes('desconhece a pessoa')) {
    return 'CLIENTE DESCONHECIDO';
  }
  if (combinedText.includes('já pagou') || combinedText.includes('ja pagou') || combinedText.includes('pagamento feito') || combinedText.includes('pago')) {
    return 'ALEGA PAGAMENTO - SEM COMPROVANTE';
  }
  if (combinedText.includes('promessa') || combinedText.includes('vou pagar') || combinedText.includes('pago amanhã') || combinedText.includes('pago amanha') || combinedText.includes('aceitou boleto') || combinedText.includes('envia o boleto') || combinedText.includes('envia o sms') || combinedText.includes('mandar o sms') || combinedText.includes('enviar o boleto')) {
    if (combinedText.includes('pix')) return 'PROMESSA PIX';
    if (combinedText.includes('cartão') || combinedText.includes('cartao')) return 'PROMESSA CARTÃO';
    return 'PROMESSA BOLETO';
  }
  if (combinedText.includes('desempregado') || combinedText.includes('desempregada') || combinedText.includes('sem emprego')) {
    return 'NAO PAGARA - DESEMPREGADO';
  }
  if (combinedText.includes('cancelamento') || combinedText.includes('cancelar') || combinedText.includes('cancela')) {
    return 'NÃO PAGARÁ - SOLICITOU O CANCELAMENTO ';
  }
  if (combinedText.includes('atendente') || combinedText.includes('humano') || combinedText.includes('pessoa') || combinedText.includes('humana') || combinedText.includes('falar com alguém') || combinedText.includes('falar com alguem')) {
    return 'ROBO SOLICITA ATENDIMENTO HUMANO ';
  }
  if (combinedText.includes('não vai pagar') || combinedText.includes('não vou pagar') || combinedText.includes('não irei pagar') || combinedText.includes('financeiro') || combinedText.includes('sem dinheiro') || combinedText.includes('problema financeiro')) {
    return 'NÃO PAGARÁ - PROBLEMA FINANCEIRO';
  }
  if (combinedText.includes('ligar mais tarde') || combinedText.includes('retornar') || combinedText.includes('outro horário') || combinedText.includes('outro horario') || combinedText.includes('ligue depois')) {
    return 'RETORNO AGENDADO COM CLIENTE';
  }

  // 4. Quedas durante a chamada qualificada
  if (duration >= 8 && (reason === 'customer-hung-up' || reason === 'assistant-hung-up')) {
    return 'LIGAÇÃO DESLIGOU / CAIU COM O CLIENTE';
  }

  // Fallback geral se atendido
  return 'TENTATIVA - ATENDIMENTO NÃO TABULADO';
}

/**
 * Endpoint de webhook para receber relatórios da VAPI.ai
 */
app.post('/api/vapi-webhook', async (req, res) => {
  try {
    const { message } = req.body;

    // Se a VAPI consultar o Server URL pedindo o assistente, retorna 200 OK para usar o assistente da chamada
    if (message?.type === 'assistant-request') {
      return res.status(200).json({});
    }

    if (!message || message.type !== 'end-of-call-report') {
      return res.status(200).json({});
    }

    const call = message.call;
    const metadata = call?.metadata;
    const leadId = metadata?.lead_id;
    const campaignId = metadata?.campaign_id;

    if (!leadId) {
      return res.json({ received: true, status: 'missing_lead_id_in_metadata' });
    }

    const endedReason = call?.endedReason || call?.ended_reason || 'erro_sintetizacao_voz';

    console.log(`[VAPI WEBHOOK] Recebido fim de chamada para o Lead #${leadId}. Motivo: ${endedReason}`);

    // Determinar se a chamada foi atendida / bem-sucedida
    const successReasons = [
      'assistant-completed-task', 
      'customer-ended-call', 
      'assistant-ended-call', 
      'customer-hung-up', 
      'assistant-hung-up'
    ];
    
    const isSuccess = successReasons.includes(endedReason) || (call?.duration > 5);
    const callStatus = isSuccess ? 'completed' : 'failed';
    
    const logText = `[VAPI] Chamada encerrada. Motivo: ${endedReason}. Duração: ${call?.duration || 0}s. Resumo: ${call?.summary || 'Sem resumo fornecido.'}`;
    
    // Classificar ocorrência
    const occurrence = classifyOccurrence(call);

    // Atualizar o lead com o status, log e ocorrência da ligação
    run(
      `UPDATE leads 
       SET call_status = ?, call_log = ?, occurrence = ? 
       WHERE id = ?`,
      [callStatus, logText, occurrence, leadId]
    );

    // Decidir se envia a mensagem de acordo/boleto via Smart RCS e E-mail
    const isPromise = occurrence === 'PROMESSA BOLETO' || occurrence === 'PROMESSA PIX';
    if (isPromise) {
      const lead = get('SELECT * FROM leads WHERE id = ?', [leadId]);
      if (lead) {
        const { triggerN8NSmsWebhook, sendLocawebEmail } = require('./services/communication.js');
        
        // 1. Disparar Smart RCS de forma síncrona
        const smsResult = await triggerN8NSmsWebhook(lead);
        const smsStatus = smsResult.success ? 'completed' : 'failed';
        
        // 2. Disparar E-mail se houver e-mail cadastrado ou se houver e-mail de teste (.env)
        let emailStatus = 'completed';
        let emailLog = 'Não enviado: Lead sem e-mail cadastrado.';
        if ((lead.email && lead.email.includes('@')) || process.env.TEST_EMAIL) {
          const emailResult = await sendLocawebEmail(lead);
          emailStatus = emailResult.success ? 'completed' : 'failed';
          emailLog = emailResult.log;
        }
        
        run(
          `UPDATE leads 
           SET sms_status = ?, sms_log = ?, email_status = ?, email_log = ? 
           WHERE id = ?`,
          [smsStatus, smsResult.log, emailStatus, emailLog, leadId]
        );
      }
    } else {
      // Se não houver formalização, não dispara SMS/E-mail e atualiza status para concluir o fluxo
      const finalSmsStatus = callStatus === 'failed' ? 'failed' : 'completed';
      const finalSmsLog = callStatus === 'failed' ? 'Cancelado: Ligação de voz falhou.' : 'Não enviado: Ocorrência não gerou formalização.';
      const finalEmailStatus = callStatus === 'failed' ? 'failed' : 'completed';
      const finalEmailLog = callStatus === 'failed' ? 'Cancelado: Ligação de voz falhou.' : 'Não enviado: Ocorrência não gerou formalização.';
      
      run(
        `UPDATE leads 
         SET sms_status = ?, sms_log = ?, email_status = ?, email_log = ? 
         WHERE id = ?`,
        [finalSmsStatus, finalSmsLog, finalEmailStatus, finalEmailLog, leadId]
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
});
