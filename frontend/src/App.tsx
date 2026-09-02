import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Megaphone, 
  Users, 
  FileSpreadsheet, 
  UploadCloud, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  RefreshCw, 
  Trash2, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  MessageSquare,
  X,
  Filter,
  Zap
} from 'lucide-react';

// Interfaces para os tipos de dados
interface Campaign {
  id: number;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
  total_leads: number;
  processed_leads: number;
  successful_calls: number;
  failed_calls: number;
  successful_sms: number;
  failed_sms: number;
  created_at: string;
}

interface Lead {
  id: number;
  campaign_id: number;
  name: string;
  phone: string;
  email?: string;
  debt_value: number;
  due_date: string;
  occurrence?: string;
  call_status: 'pending' | 'processing' | 'calling' | 'completed' | 'failed';
  call_attempts: number;
  call_duration?: number;
  call_log: string;
  sms_status: 'pending' | 'processing' | 'sending' | 'completed' | 'failed';
  sms_log: string;
  email_status?: 'pending' | 'processing' | 'sending' | 'completed' | 'failed';
  email_log?: string;
  transcript?: string;
  recording_url?: string;
  call_id?: string;
}

interface DashboardStats {
  total_campaigns: number;
  total_leads: number;
  total_processed: number;
  total_successful_calls: number;
  total_failed_calls: number;
  total_successful_sms: number;
  total_failed_sms: number;
}

const BACKEND_URL = window.location.origin.includes('localhost:5173') ? 'http://localhost:3001' : window.location.origin;

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'campaigns' | 'leads' | 'reports'>('dashboard');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    total_campaigns: 0,
    total_leads: 0,
    total_processed: 0,
    total_successful_calls: 0,
    total_failed_calls: 0,
    total_successful_sms: 0,
    total_failed_sms: 0,
  });

  // Upload state
  const [campaignName, setCampaignName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [vapiAssistants, setVapiAssistants] = useState<{ id: string, name: string }[]>([]);
  const [selectedVapiAssistantId, setSelectedVapiAssistantId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected Campaign for Leads view
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | 'all' | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsTotalPages, setLeadsTotalPages] = useState(1);
  const [leadsTotalCount, setLeadsTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTranscriptLead, setSelectedTranscriptLead] = useState<Lead | null>(null);

  // Ocorrências / Tabulações DDM
  const [occurrences, setOccurrences] = useState<{ occurrence: string; count: number }[]>([]);
  const [exportOccurrenceFilter, setExportOccurrenceFilter] = useState<string>('all');
  
  // Dialer Provider (VAPI vs Retell AI)
  const [dialerProvider, setDialerProvider] = useState<'vapi' | 'retell'>('vapi');
  const [retellAgents, setRetellAgents] = useState<{ id: string; name: string }[]>([]);
  const [retellPhoneNumbers, setRetellPhoneNumbers] = useState<{ id: string; name: string }[]>([]);

  // Phone Numbers / Troncos SIP VAPI
  const [vapiPhoneNumbers, setVapiPhoneNumbers] = useState<{ id: string; name: string }[]>([]);
  const [selectedVapiPhoneNumberId, setSelectedVapiPhoneNumberId] = useState<string>('');

  // Simulation state
  const [simulating, setSimulating] = useState(false);

  const [systemInfo, setSystemInfo] = useState<{ providerName?: string; dialerProvider?: string; defaultUploadDialerProvider?: 'vapi' | 'retell' } | null>(null);

  // Fetch initial data
  useEffect(() => {
    fetchStats();
    fetchCampaigns();
    fetchVapiAssistants();
    fetchVapiPhoneNumbers();
    fetchRetellAgents();
    fetchRetellPhoneNumbers();
    fetchOccurrences('all');
    fetchSystemInfo();
  }, []);

  const fetchSystemInfo = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/system-info`);
      if (res.ok) {
        const data = await res.json();
        setSystemInfo(data);
        if (data.defaultUploadDialerProvider === 'vapi' || data.defaultUploadDialerProvider === 'retell') {
          setDialerProvider(data.defaultUploadDialerProvider);
        }
      }
    } catch (err) {
      console.error('Error fetching system info:', err);
    }
  };

  const fetchRetellAgents = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/retell/agents`);
      if (res.ok) {
        const data = await res.json();
        setRetellAgents(data);
      }
    } catch (err) {
      console.error('Error fetching Retell agents:', err);
    }
  };

  const fetchRetellPhoneNumbers = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/retell/phone-numbers`);
      if (res.ok) {
        const data = await res.json();
        setRetellPhoneNumbers(data);
      }
    } catch (err) {
      console.error('Error fetching Retell phone numbers:', err);
    }
  };

  const fetchVapiPhoneNumbers = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/vapi/phone-numbers`);
      if (res.ok) {
        const data = await res.json();
        setVapiPhoneNumbers(data);
        if (data.length > 0 && !selectedVapiPhoneNumberId) {
          setSelectedVapiPhoneNumberId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching VAPI Phone Numbers:', err);
    }
  };

  const fetchOccurrences = async (campaignId: number | 'all' = 'all') => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/dashboard/occurrences?campaignId=${campaignId}`);
      if (res.ok) {
        const data = await res.json();
        setOccurrences(data);
      }
    } catch (err) {
      console.error('Error fetching occurrences:', err);
    }
  };

  const fetchVapiAssistants = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/vapi/assistants`);
      if (res.ok) {
        const data = await res.json();
        setVapiAssistants(data);
        if (data.length > 0) {
          setSelectedVapiAssistantId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching VAPI assistants:', err);
    }
  };

  const handleOpenTranscriptModal = (lead: Lead) => {
    setSelectedTranscriptLead(lead);
    fetch(`${BACKEND_URL}/api/leads/${lead.id}/details`)
      .then(res => res.json())
      .then(data => {
        if (data && data.lead) {
          setSelectedTranscriptLead(data.lead);
          setLeads(prev => prev.map(item => item.id === data.lead.id ? data.lead : item));
        }
      })
      .catch(err => console.error('Error fetching live lead details:', err));
  };

  // Auto-refresh contínuo do dashboard a cada 3 segundos para acompanhar todas as chamadas da Vapi ao vivo
  useEffect(() => {
    fetchStats();
    fetchCampaigns();

    const interval = setInterval(() => {
      fetchStats();
      fetchCampaigns();
      fetchOccurrences(selectedCampaignId || 'all');
      if (selectedCampaignId) {
        fetchLeads(selectedCampaignId, leadsPage);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedCampaignId, leadsPage]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/dashboard/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/campaigns`);
      if (res.ok) {
        const data: Campaign[] = await res.json();
        setCampaigns(data);
        if (data.length > 0) {
          const currentId = selectedCampaignId;
          const isValidId = currentId === 'all' || (typeof currentId === 'number' && data.some(c => c.id === currentId));
          const targetId = isValidId && currentId !== null ? currentId : data[0].id;
          setSelectedCampaignId(targetId);
          fetchLeads(targetId, leadsPage);
        }
      }
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    }
  };

  const handleSync = async () => {
    fetchStats();
    fetchCampaigns();
    try {
      await fetch(`${BACKEND_URL}/api/leads/sync-recordings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: selectedCampaignId })
      });
      if (selectedCampaignId) {
        fetchLeads(selectedCampaignId, leadsPage);
      }
    } catch (e) {
      console.error('Error syncing recordings:', e);
    }
  };

  const fetchLeads = async (campaignId: number | 'all', page: number, currentStatusFilter: string = statusFilter, currentSearchTerm: string = searchTerm) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/campaigns/${campaignId}/leads?page=${page}&limit=10&statusFilter=${currentStatusFilter}&search=${encodeURIComponent(currentSearchTerm)}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads);
        setLeadsTotalPages(data.pagination.totalPages);
        setLeadsTotalCount(data.pagination.totalLeads);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    }
  };

  const handleCampaignSelect = (id: number | 'all') => {
    setSelectedCampaignId(id);
    setLeadsPage(1);
    fetchLeads(id, 1);
    fetchOccurrences(id);
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setUploadError('Por favor, selecione uma planilha.');
      return;
    }
    if (!campaignName.trim()) {
      setUploadError('Por favor, digite o nome da campanha.');
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadSuccess('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('campaignName', campaignName);
    formData.append('dialerProvider', dialerProvider);
    formData.append('vapiAssistantId', selectedVapiAssistantId);
    formData.append('vapiPhoneNumberId', selectedVapiPhoneNumberId);

    try {
      const res = await fetch(`${BACKEND_URL}/api/campaigns/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao enviar planilha');
      }

      setUploadSuccess(data.message);
      setCampaignName('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      fetchCampaigns();
      fetchStats();
      if (data.campaignId) {
        setSelectedCampaignId(data.campaignId);
        fetchLeads(data.campaignId, 1);
      }
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleStartCampaign = async (id: number) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/campaigns/${id}/start`, {
        method: 'POST'
      });
      if (res.ok) {
        fetchCampaigns();
        fetchStats();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao iniciar campanha');
      }
    } catch (err) {
      console.error('Error starting campaign:', err);
    }
  };

  const handleRetryFailedCampaign = async (id: number) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/campaigns/${id}/retry-failed`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || 'Leads reenfileirados para discagem com sucesso!');
        fetchCampaigns();
        fetchStats();
        if (selectedCampaignId) fetchLeads(selectedCampaignId, 1);
      }
    } catch (err) {
      console.error('Error retrying campaign:', err);
    }
  };

  const handleResyncVapi = async (id: number) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/campaigns/${id}/resync-vapi`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || 'Ressincronização com Vapi concluída com sucesso!');
        fetchCampaigns();
        fetchStats();
        if (selectedCampaignId) fetchLeads(selectedCampaignId, leadsPage, statusFilter, searchTerm);
      } else {
        alert('A API da Vapi está processando chamadas no momento. Aguarde alguns segundos e tente novamente.');
      }
    } catch (err: any) {
      alert('Servidor ocupado. Tente novamente em instantes.');
    }
  };

  const handleForceUnlock = async (id: number) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/campaigns/${id}/force-unlock`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || 'Campanha destravada com sucesso! Discagem retomada.');
        fetchCampaigns();
        fetchStats();
        if (selectedCampaignId) fetchLeads(selectedCampaignId, leadsPage, statusFilter, searchTerm);
      } else {
        handleRetryFailedCampaign(id);
      }
    } catch (err: any) {
      alert(`Falha na conexão: ${err.message}`);
    }
  };

  const handleCancelCampaign = async (id: number) => {
    if (!confirm('Deseja realmente cancelar/pausar esta campanha?')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/campaigns/${id}/cancel`, {
        method: 'POST'
      });
      if (res.ok) {
        fetchCampaigns();
      }
    } catch (err) {
      console.error('Error cancelling campaign:', err);
    }
  };

  const handleDeleteCampaign = async (id: number) => {
    if (!confirm('Deseja excluir esta campanha e todos os seus leads?')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/campaigns/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSelectedCampaignId(null);
        setLeads([]);
        fetchCampaigns();
        fetchStats();
      }
    } catch (err) {
      console.error('Error deleting campaign:', err);
    }
  };

  // Simular retorno do webhook do n8n para fins de teste sem webhook real
  const handleSimulateWebhook = async () => {
    if (!selectedCampaignId) return;
    setSimulating(true);
    
    try {
      // Obter leads da campanha selecionada que ainda estão marcados como 'processing' ou 'pending'
      const res = await fetch(`${BACKEND_URL}/api/campaigns/${selectedCampaignId}/leads?page=1&limit=100`);
      if (res.ok) {
        const data = await res.json();
        const pendingOrProcessing = data.leads.filter((l: Lead) => 
          l.call_status === 'processing' || l.call_status === 'pending'
        );

        if (pendingOrProcessing.length === 0) {
          alert('Não há leads pendentes nesta campanha para simular.');
          setSimulating(false);
          return;
        }

        alert(`Simulando resposta do n8n para ${pendingOrProcessing.length} leads. Isso atualizará os status para Concluído/Falha em lotes...`);

        // Disparar atualizações em paralelo para os leads simulados
        const promises = pendingOrProcessing.map(async (l: Lead) => {
          const callSuccess = Math.random() > 0.20; // 80% de sucesso
          const smsSuccess = Math.random() > 0.05;  // 95% de sucesso

          // Mapear ocorrências simuladas com base no sucesso da chamada
          let occurrence = 'TENTATIVA - NÃO ATENDE';
          if (callSuccess) {
            const rand = Math.random();
            if (rand < 0.4) occurrence = 'PROMESSA BOLETO';
            else if (rand < 0.7) occurrence = 'ALEGA PAGAMENTO - SEM COMPROVANTE';
            else if (rand < 0.85) occurrence = 'ROBO SOLICITA ATENDIMENTO HUMANO ';
            else occurrence = 'CLIENTE DESCONHECIDO';
          } else {
            const rand = Math.random();
            if (rand < 0.5) occurrence = 'TENTATIVA - MAQUINA MENSAGEM AUTOMATICA';
            else if (rand < 0.8) occurrence = 'TENTATIVA - ABANDONO';
            else occurrence = 'TENTATIVA - NÃO ATENDE';
          }

          await fetch(`${BACKEND_URL}/api/leads/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lead_id: l.id,
              call_status: callSuccess ? 'completed' : 'failed',
              call_log: callSuccess 
                ? `[SIMULADOR] Chamada atendida. Ocorrência: ${occurrence}.` 
                : `[SIMULADOR] Chamada não completada. Ocorrência: ${occurrence}.`,
              sms_status: smsSuccess ? 'completed' : 'failed',
              sms_log: smsSuccess 
                ? '[SIMULADOR] SMS Entregue e Lido' 
                : '[SIMULADOR] Falha na rede SMS / Operadora.',
              occurrence: occurrence
            })
          });
        });

        await Promise.all(promises);
        fetchCampaigns();
        fetchStats();
        fetchLeads(selectedCampaignId, leadsPage);
      }
    } catch (err) {
      console.error('Erro na simulação do webhook:', err);
    } finally {
      setSimulating(false);
    }
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Filtrar leads na memória para pesquisa rápida por nome/telefone
  const filteredLeads = leads.filter(l => 
    l.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.phone.includes(searchTerm)
  );



  return (
    <div className="flex min-h-screen bg-vero-bg">
      {/* Sidebar Lateral */}
      <aside className="w-64 bg-vero-darker text-white flex flex-col justify-between shrink-0">
        <div>
          {/* Logo Vero */}
          <div className="p-6 border-b border-slate-800 flex flex-col items-start gap-1">
            <img 
              src="/logo_vero.svg" 
              alt="Logo Vero" 
              className="h-6 w-auto object-contain"
            />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
              Debt Recovery
            </span>
          </div>

          {/* Menus */}
          <nav className="p-4 space-y-1">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${
                activeTab === 'dashboard' ? 'bg-vero-magenta text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard size={18} />
              Painel de Controle
            </button>
            <button 
              onClick={() => setActiveTab('campaigns')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${
                activeTab === 'campaigns' ? 'bg-vero-magenta text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Megaphone size={18} />
              Campanhas
            </button>
            <button 
              onClick={() => setActiveTab('leads')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${
                activeTab === 'leads' ? 'bg-vero-magenta text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Users size={18} />
              Visualizador de Leads
            </button>
            <button 
              onClick={() => setActiveTab('reports')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${
                activeTab === 'reports' ? 'bg-vero-magenta text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <FileSpreadsheet size={18} />
              Relatórios
            </button>
          </nav>
        </div>

      </aside>

      {/* Conteúdo Principal */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 shrink-0">
          <h2 className="text-xl font-bold text-slate-800">
            {activeTab === 'dashboard' && 'Painel de Controle - Recuperação de Dívidas'}
            {activeTab === 'campaigns' && 'Gerenciamento de Campanhas'}
            {activeTab === 'leads' && 'Leads Importados'}
            {activeTab === 'reports' && 'Exportação de Relatórios'}
          </h2>
          <div className="flex items-center gap-4">
            <button 
              onClick={handleSync}
              className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              <RefreshCw size={14} />
              Sincronizar
            </button>
            <span className="text-xs text-slate-400">Status da API: <strong className="text-green-500">Conectado</strong></span>
          </div>
        </header>

        {/* Área de Visualização */}
        <div className="p-8 flex-1 space-y-8">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <>
              {/* Cards de Métricas */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Campanhas Criadas</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-extrabold text-slate-800">{stats.total_campaigns}</span>
                    <span className="bg-vero-magenta/10 text-vero-magenta text-xs font-bold px-2 py-0.5 rounded">Ativas</span>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Leads Carregados</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-extrabold text-slate-800">{stats.total_leads ? stats.total_leads.toLocaleString() : 0}</span>
                    <span className="text-slate-400 text-xs">Total acumulado</span>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                    Ligações por {systemInfo?.providerName || 'VAPI'}
                  </span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-extrabold text-slate-800">
                      {stats.total_successful_calls ? stats.total_successful_calls.toLocaleString() : 0}
                    </span>
                    <span className="text-green-500 text-xs font-bold flex items-center gap-0.5">
                      ✓ {stats.total_processed ? Math.round((stats.total_successful_calls / stats.total_processed) * 100 || 0) : 0}%
                    </span>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">SMS Enviados</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-extrabold text-slate-800">
                      {stats.total_successful_sms ? stats.total_successful_sms.toLocaleString() : 0}
                    </span>
                    <span className="text-green-500 text-xs font-bold flex items-center gap-0.5">
                      ✓ {stats.total_processed ? Math.round((stats.total_successful_sms / stats.total_processed) * 100 || 0) : 0}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Grid Principal do Painel */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Tabela de Campanhas Recentes (Lado Esquerdo - 2/3) */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 lg:col-span-2">
                  <h3 className="text-base font-bold text-slate-800">Campanhas Recentes</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                          <th className="py-3 px-4">Nome da Campanha</th>
                          <th className="py-3 px-4">Data de Criação</th>
                          <th className="py-3 px-4 text-center">Total Leads</th>
                          <th className="py-3 px-4">Progresso Geral</th>
                          <th className="py-3 px-4 text-center">Ligações</th>
                          <th className="py-3 px-4 text-center">SMS</th>
                          <th className="py-3 px-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {campaigns.length > 0 ? (
                          campaigns.map(c => {
                            const pct = c.total_leads > 0 ? Math.round((c.processed_leads / c.total_leads) * 100) : 0;
                            return (
                              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                <td className="py-3.5 px-4 font-semibold text-slate-700">{c.name}</td>
                                <td className="py-3.5 px-4">{new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
                                <td className="py-3.5 px-4 text-center font-medium">{c.total_leads.toLocaleString()}</td>
                                <td className="py-3.5 px-4 w-1/5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                      <div 
                                        className="bg-vero-magenta h-2 rounded-full" 
                                        style={{ width: `${pct}%` }}
                                      ></div>
                                    </div>
                                    <span className="text-xs font-bold text-slate-700">{pct}%</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-center text-xs">
                                  <span className="text-green-600 font-semibold">{c.successful_calls}</span>
                                  <span className="text-slate-300 mx-1">/</span>
                                  <span className="text-red-500 font-semibold">{c.failed_calls}</span>
                                </td>
                                <td className="py-3.5 px-4 text-center text-xs">
                                  <span className="text-green-600 font-semibold">{c.successful_sms}</span>
                                  <span className="text-slate-300 mx-1">/</span>
                                  <span className="text-red-500 font-semibold">{c.failed_sms}</span>
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                    c.status === 'completed' && 'bg-green-50 text-green-700'
                                  } ${
                                    c.status === 'processing' && 'bg-amber-50 text-amber-700 animate-pulse'
                                  } ${
                                    c.status === 'failed' && 'bg-red-50 text-red-700'
                                  } ${
                                    c.status === 'pending' && 'bg-slate-100 text-slate-700 border border-slate-300'
                                  }`}>
                                    {c.status === 'completed' && 'Concluído'}
                                    {c.status === 'processing' && 'Processando'}
                                    {c.status === 'failed' && 'Pausada'}
                                    {c.status === 'pending' && 'Pendente'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-400">
                              Nenhuma campanha encontrada no banco de dados.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Resumo da Campanha Ativa (Lado Direito - 1/3) */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between lg:col-span-1">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 mb-4">Campanha Ativa</h3>
                    {(() => {
                      const activeCampaign = campaigns.find(c => c.id === selectedCampaignId) || campaigns.find(c => c.status === 'processing') || campaigns[0];
                      if (!activeCampaign) {
                        return (
                          <div className="text-center py-8 text-slate-400 text-xs">
                            Nenhuma campanha encontrada. Suba uma planilha para começar.
                          </div>
                        );
                      }
                      const c = activeCampaign;
                      const pct = Math.round((c.processed_leads / c.total_leads) * 100);
                      return (
                        <div key={c.id} className="space-y-4">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-semibold text-slate-700">{c.name}</span>
                              <span className="font-bold text-vero-magenta">{pct}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-3">
                              <div 
                                className="bg-vero-magenta h-3 rounded-full transition-all duration-500" 
                                style={{ width: `${pct}%` }}
                              ></div>
                            </div>
                            <span className="text-xs text-slate-400 mt-1 block">
                              {c.processed_leads.toLocaleString()} de {c.total_leads.toLocaleString()} leads enviados
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                            <div>
                              <span className="text-slate-400 block">Ligações Atendidas</span>
                              <strong className="text-emerald-600 text-base">{c.successful_calls}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Ligações Não Atendidas</span>
                              <strong className="text-slate-500 text-base">{c.failed_calls}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400 block">SMS Enviados</span>
                              <strong className="text-emerald-600 text-base">{c.successful_sms}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400 block">SMS Não Enviados</span>
                              <strong className="text-slate-500 text-base">{c.failed_sms}</strong>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            {c.status === 'processing' ? (
                              <button 
                                onClick={() => handleCancelCampaign(c.id)}
                                className="flex-1 py-2 border border-amber-300 text-amber-700 bg-amber-50 rounded-lg text-xs font-semibold hover:bg-amber-100 transition flex items-center justify-center gap-1 font-bold"
                              >
                                ⏸️ Pausar
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleStartCampaign(c.id)}
                                className="flex-1 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition flex items-center justify-center gap-1 font-bold"
                              >
                                <Play size={14} />
                                {c.status === 'pending' ? 'Disparar' : 'Continuar'}
                              </button>
                            )}
                            <button 
                              onClick={() => handleForceUnlock(c.id)}
                              className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-1 shadow-sm font-bold"
                            >
                              <Zap size={14} />
                              Destravar
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Painel do Simulador de n8n no Dashboard */}
                  {campaigns.some(c => c.status === 'processing') && (
                    <div className="mt-6 border-t border-slate-100 pt-4 bg-purple-50/50 p-3 rounded-lg border border-purple-100">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-purple-700 mb-2">
                        <Sparkles size={14} />
                        Simulador de Teste Rápido
                      </div>
                      <p className="text-[11px] text-purple-600/90 mb-3 leading-relaxed">
                        Seu backend está configurado para mandar leads ao n8n. Clique abaixo para simular que o n8n concluiu as ligações.
                      </p>
                      <button 
                        onClick={handleSimulateWebhook}
                        disabled={simulating}
                        className="w-full py-2 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {simulating ? 'Processando simulação...' : 'Simular Retorno do n8n (Webhook)'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Ocorrências e Tabulações da Operação */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mt-8 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Distribuição de Ocorrências (Tabulações DDM)</h3>
                    <p className="text-xs text-slate-400">Classificação em tempo real com base nos retornos da VAPI e SMS</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Filtrar por Campanha:</span>
                    <select
                      value={selectedCampaignId || 'all'}
                      onChange={(e) => {
                        const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                        if (val === 'all') {
                          setSelectedCampaignId(null);
                          fetchOccurrences('all');
                        } else {
                          setSelectedCampaignId(val);
                          fetchOccurrences(val);
                        }
                      }}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:border-vero-magenta"
                    >
                      <option value="all">Todas as Campanhas</option>
                      {campaigns.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {occurrences.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                    {occurrences.map(o => {
                      const totalCount = occurrences.reduce((acc, curr) => acc + curr.count, 0);
                      const pct = totalCount > 0 ? Math.round((o.count / totalCount) * 100) : 0;
                      return (
                        <div key={o.occurrence} className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex flex-col justify-between">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-bold text-vero-magenta leading-tight line-clamp-2" title={o.occurrence}>
                              {o.occurrence}
                            </span>
                            <span className="bg-rose-50 text-vero-magenta border border-rose-100 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                              {o.count}
                            </span>
                          </div>
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                              <span>Proporção na Operação</span>
                              <span className="font-semibold">{pct}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-1.5">
                              <div
                                className="bg-vero-magenta h-1.5 rounded-full"
                                style={{ width: `${pct}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 text-slate-400 text-sm">
                    Nenhuma ocorrência tabulada nas campanhas até o momento.
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: CAMPANHAS (Upload e Controle) */}
          {activeTab === 'campaigns' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Card de Envio */}
              <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm h-fit">
                <h3 className="text-base font-bold text-slate-800 mb-6">Importar Leads de Cobrança</h3>
                <form onSubmit={handleFileUpload} className="space-y-6">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Nome da Campanha
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ex: Cobrança Residencial Vencimento Agosto"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-vero-magenta"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Plataforma de Discagem
                    </label>
                    <select 
                      value={dialerProvider} 
                      onChange={(e) => setDialerProvider(e.target.value as 'vapi' | 'retell')}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-vero-magenta font-semibold text-slate-700"
                    >
                      <option value="vapi">VAPI.ai (Plataforma VAPI)</option>
                      <option value="retell">Retell AI (Plataforma Retell)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Agente de Voz {dialerProvider === 'retell' ? 'Retell AI' : 'VAPI'}
                    </label>
                    <select 
                      value={selectedVapiAssistantId} 
                      onChange={(e) => setSelectedVapiAssistantId(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-vero-magenta font-semibold text-slate-700"
                    >
                      {dialerProvider === 'retell' ? (
                        retellAgents.map(ast => (
                          <option key={ast.id} value={ast.id}>
                            {ast.name}
                          </option>
                        ))
                      ) : (
                        vapiAssistants.map(ast => (
                          <option key={ast.id} value={ast.id}>
                            {ast.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Linha / Tronco Telefônico (BINA {dialerProvider === 'retell' ? 'Retell' : 'VAPI'})
                    </label>
                    <select 
                      value={selectedVapiPhoneNumberId} 
                      onChange={(e) => setSelectedVapiPhoneNumberId(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-vero-magenta font-semibold text-slate-700"
                    >
                      {dialerProvider === 'retell' ? (
                        retellPhoneNumbers.map(pn => (
                          <option key={pn.id} value={pn.id}>
                            {pn.name}
                          </option>
                        ))
                      ) : (
                        vapiPhoneNumbers.map(pn => (
                          <option key={pn.id} value={pn.id}>
                            {pn.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Planilha (.XLSX, .XLS, .CSV)
                    </label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-vero-magenta transition cursor-pointer bg-slate-50 flex flex-col items-center justify-center space-y-2"
                    >
                      <UploadCloud size={32} className="text-slate-400" />
                      <span className="text-xs text-slate-600 font-semibold block">
                        {file ? file.name : 'Arraste ou clique para selecionar o arquivo'}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        Colunas sugeridas: Nome, Telefone, Valor, Vencimento
                      </span>
                      <input 
                        ref={fileInputRef}
                        type="file" 
                        accept=".xlsx,.xls,.csv"
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            setFile(e.target.files[0]);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {uploadError && (
                    <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-100 flex items-start gap-2">
                      <AlertTriangle size={16} className="shrink-0" />
                      <span>{uploadError}</span>
                    </div>
                  )}

                  {uploadSuccess && (
                    <div className="bg-green-50 text-green-700 text-xs p-3 rounded-lg border border-green-100 flex items-start gap-2">
                      <CheckCircle2 size={16} className="shrink-0" />
                      <span>{uploadSuccess}</span>
                    </div>
                  )}

                  <button 
                    type="submit"
                    disabled={uploading}
                    className="w-full bg-vero-magenta text-white py-3 rounded-lg text-sm font-semibold hover:bg-rose-700 disabled:bg-rose-400 transition flex items-center justify-center gap-2"
                  >
                    <UploadCloud size={16} />
                    {uploading ? 'Importando Leads...' : 'Criar Campanha e Importar'}
                  </button>
                </form>

                <div className="mt-6 border-t border-slate-100 pt-4 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Quer testar agora?</span>
                  <a 
                    href={`${BACKEND_URL}/api/sample-file`}
                    className="text-vero-magenta font-semibold hover:underline flex items-center gap-1"
                  >
                    <Download size={12} />
                    Baixar planilha modelo
                  </a>
                </div>
              </div>

              {/* Lista Completa das Campanhas */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
                <h3 className="text-base font-bold text-slate-800">Listagem de Campanhas</h3>
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {campaigns.length > 0 ? (
                    campaigns.map(c => {
                      const pct = c.total_leads > 0 ? Math.round((c.processed_leads / c.total_leads) * 100) : 0;
                      const isSelected = selectedCampaignId === c.id;
                      return (
                        <div 
                          key={c.id} 
                          className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between md:flex-row md:items-center gap-4 ${
                            isSelected ? 'border-vero-magenta bg-rose-50/10' : 'border-slate-200 hover:bg-slate-50'
                          }`}
                          onClick={() => handleCampaignSelect(c.id)}
                        >
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-3">
                              <h4 className="font-bold text-sm text-slate-700">{c.name}</h4>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                c.status === 'completed' && 'bg-green-50 text-green-700 border border-green-200'
                              } ${
                                c.status === 'processing' && 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                              } ${
                                c.status === 'failed' && 'bg-red-50 text-red-700 border border-red-200'
                              } ${
                                c.status === 'pending' && 'bg-slate-50 text-slate-600 border border-slate-200'
                              }`}>
                                {c.status === 'completed' && 'Concluído'}
                                {c.status === 'processing' && 'Disparando'}
                                {c.status === 'failed' && 'Pausada'}
                                {c.status === 'pending' && 'Pendente'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                              <span>Total: <strong>{c.total_leads} leads</strong></span>
                              <span>Data: <strong>{new Date(c.created_at).toLocaleString('pt-BR')}</strong></span>
                            </div>
                            <div className="flex items-center gap-2 max-w-sm pt-1">
                              <div className="w-full bg-slate-100 rounded-full h-1.5">
                                <div 
                                  className="bg-vero-magenta h-1.5 rounded-full" 
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                              <span className="text-[10px] font-bold text-slate-500">{pct}%</span>
                            </div>
                          </div>

                          {/* Ações */}
                          <div className="flex items-center gap-2">
                            {(c.status === 'pending' || c.status === 'failed' || c.status === 'paused') && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleStartCampaign(c.id); }}
                                className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-semibold hover:bg-green-700 transition flex items-center gap-1"
                                title="Continuar discando os leads pendentes de onde parou"
                              >
                                <Play size={12} />
                                {c.status === 'pending' ? 'Disparar' : 'Continuar'}
                              </button>
                            )}
                            {c.status === 'processing' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleCancelCampaign(c.id); }}
                                className="px-3 py-1.5 border border-amber-300 text-amber-700 bg-amber-50 rounded-md text-xs font-semibold hover:bg-amber-100 transition"
                              >
                                Pausar
                              </button>
                            )}
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleForceUnlock(c.id); }}
                              className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-700 transition flex items-center gap-1 shadow-sm"
                              title="Destravar e retomar discagem de todos os leads não atendidos da lista"
                            >
                              <Zap size={12} />
                              Destravar
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleResyncVapi(c.id); }}
                              className="px-2 py-1.5 border border-purple-200 text-purple-700 bg-purple-50 rounded-md text-xs font-semibold hover:bg-purple-100 transition flex items-center gap-1"
                              title="Sincronizar chamadas com a API Vapi em tempo real"
                            >
                              <RefreshCw size={12} />
                              Sincronizar Vapi
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(c.id); }}
                              className="p-1.5 text-slate-400 hover:text-red-500 transition hover:bg-red-50 rounded"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      Nenhuma campanha cadastrada no banco.
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: LEADS (Visualização Detalhada) */}
          {activeTab === 'leads' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
              
              {/* Seletor de Campanha no Topo */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Campanha Selecionada</span>
                  <select 
                    value={selectedCampaignId || 'all'} 
                    onChange={(e) => {
                      const val = e.target.value;
                      handleCampaignSelect(val === 'all' ? 'all' : Number(val));
                    }}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:border-vero-magenta"
                  >
                    <option value="all">🔍 Todas as Campanhas (Busca Global)</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.total_leads} leads)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Pesquisa e Filtros */}
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  {/* Filtro de Status */}
                  <div className="flex items-center gap-2">
                    <Filter size={16} className="text-slate-400" />
                    <select 
                      value={statusFilter}
                      onChange={(e) => {
                        const newFilter = e.target.value;
                        setStatusFilter(newFilter);
                        setLeadsPage(1);
                        if (selectedCampaignId) fetchLeads(selectedCampaignId, 1, newFilter);
                      }}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:border-vero-magenta"
                    >
                      <option value="all">Todos os Leads</option>
                      <option value="delivered">🟢 Somente Ligações Atendidas</option>
                      <option value="sms_delivered">📲 Somente SMS Entregues</option>
                      <option value="failed">🩶 Não Atendidas</option>
                      <option value="pending">⏳ Pendentes</option>
                    </select>
                  </div>

                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Buscar por Nome ou Telefone..."
                      value={searchTerm}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSearchTerm(val);
                        setLeadsPage(1);
                        if (selectedCampaignId) fetchLeads(selectedCampaignId, 1, statusFilter, val);
                      }}
                      className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full sm:w-64 focus:outline-none focus:border-vero-magenta"
                    />
                  </div>
                </div>
              </div>

              {/* Tabela dos Leads */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                      <th className="py-3 px-4">Nome do Cliente</th>
                      <th className="py-3 px-4">Telefone</th>
                      <th className="py-3 px-4">E-mail</th>
                      <th className="py-3 px-4">Valor</th>
                      <th className="py-3 px-4">Vencimento</th>
                      <th className="py-3 px-4">Ocorrência (Tabulação)</th>
                      <th className="py-3 px-4">Status VAPI (Ligação)</th>
                      <th className="py-3 px-4">Transcrição</th>
                      <th className="py-3 px-4">Log de Voz VAPI</th>
                      <th className="py-3 px-4">Status SMS</th>
                      <th className="py-3 px-4">Log do SMS</th>
                      <th className="py-3 px-4">Status E-mail</th>
                      <th className="py-3 px-4">Log de E-mail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredLeads.length > 0 ? (
                      filteredLeads.map(l => (
                        <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-700">{l.name}</td>
                          <td className="py-3 px-4">{l.phone}</td>
                          <td className="py-3 px-4 truncate max-w-[150px] text-slate-400" title={l.email}>{l.email || 'Nenhum'}</td>
                          <td className="py-3 px-4 font-bold text-slate-700">{formatBRL(l.debt_value)}</td>
                          <td className="py-3 px-4">{l.due_date}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded border font-bold text-[10px] ${
                              (l.occurrence?.includes('PROMESSA') || l.occurrence?.includes('PAGAMENTO')) 
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : (l.occurrence?.includes('DESCONHECIDO') || l.occurrence?.includes('FALECIDO'))
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : (l.occurrence?.includes('TENTATIVA') || l.occurrence?.includes('MUDA') || l.occurrence?.includes('NÃO ATENDE'))
                                ? 'bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-rose-50 text-vero-magenta border-rose-100'
                            }`}>
                              {l.occurrence || 'AGUARDANDO CONTATO'}
                            </span>
                          </td>
                          
                          {/* Status Ligação */}
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              l.call_status === 'completed' && 'bg-green-50 text-green-700'
                            } ${
                              l.call_status === 'processing' && 'bg-amber-50 text-amber-700'
                            } ${
                              l.call_status === 'calling' && 'bg-sky-50 text-sky-700 animate-pulse'
                            } ${
                              l.call_status === 'failed' && 'bg-slate-100 text-slate-600'
                            } ${
                              l.call_status === 'pending' && 'bg-slate-100 text-slate-600'
                            }`}>
                              {l.call_status === 'completed' && 'Atendida'}
                              {l.call_status === 'processing' && 'Fila n8n'}
                              {l.call_status === 'calling' && 'Discando...'}
                              {l.call_status === 'failed' && 'Não Atendida'}
                              {l.call_status === 'pending' && 'Aguardando'}
                            </span>
                          </td>

                          {/* Transcrição */}
                          <td className="py-3 px-4">
                            {(l.call_id || l.transcript) ? (
                              <button
                                onClick={() => handleOpenTranscriptModal(l)}
                                className="px-2 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[10px] font-bold hover:bg-purple-100 transition flex items-center gap-1"
                              >
                                <MessageSquare size={12} />
                                Ver Diálogo
                              </button>
                            ) : (
                              <span className="text-slate-300 text-[10px] italic">Sem texto</span>
                            )}
                          </td>

                          <td className="py-3 px-4 max-w-[200px] truncate text-[10px] text-slate-400" title={l.call_log}>
                            {l.call_log || 'Nenhum registro'}
                          </td>

                          {/* Status SMS */}
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              l.sms_status === 'completed' && 'bg-green-50 text-green-700'
                            } ${
                              l.sms_status === 'processing' && 'bg-amber-50 text-amber-700'
                            } ${
                              l.sms_status === 'sending' && 'bg-sky-50 text-sky-700 animate-pulse'
                            } ${
                              l.sms_status === 'failed' && 'bg-slate-100 text-slate-600'
                            } ${
                              l.sms_status === 'pending' && 'bg-slate-100 text-slate-600'
                            }`}>
                              {l.sms_status === 'completed' && 'Entregue'}
                              {l.sms_status === 'processing' && 'Fila n8n'}
                              {l.sms_status === 'sending' && 'Enviando...'}
                              {l.sms_status === 'failed' && 'Não Enviado'}
                              {l.sms_status === 'pending' && 'Aguardando'}
                            </span>
                          </td>
                          <td className="py-3 px-4 max-w-[200px] truncate text-[10px] text-slate-400" title={l.sms_log}>
                            {l.sms_log || 'Nenhum registro'}
                          </td>

                          {/* Status E-mail */}
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              l.email_status === 'completed' && 'bg-green-50 text-green-700'
                            } ${
                              l.email_status === 'processing' && 'bg-amber-50 text-amber-700'
                            } ${
                              l.email_status === 'sending' && 'bg-sky-50 text-sky-700 animate-pulse'
                            } ${
                              l.email_status === 'failed' && 'bg-slate-100 text-slate-600'
                            } ${
                              l.email_status === 'pending' && 'bg-slate-100 text-slate-600'
                            }`}>
                              {l.email_status === 'completed' && 'Enviado'}
                              {l.email_status === 'processing' && 'Fila n8n'}
                              {l.email_status === 'sending' && 'Enviando...'}
                              {l.email_status === 'failed' && 'Não Enviado'}
                              {l.email_status === 'pending' && 'Aguardando'}
                            </span>
                          </td>
                          <td className="py-3 px-4 max-w-[200px] truncate text-[10px] text-slate-400" title={l.email_log}>
                            {l.email_log || 'Nenhum registro'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={13} className="py-8 text-center text-slate-400">
                          Nenhum lead encontrado para esta busca/campanha.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
                <span className="text-slate-400">
                  Mostrando leads do lote (Total: <strong>{leadsTotalCount}</strong>)
                </span>
                <div className="flex items-center gap-2">
                  <button 
                    disabled={leadsPage === 1}
                    onClick={() => { setLeadsPage(p => p - 1); fetchLeads(selectedCampaignId!, leadsPage - 1); }}
                    className="p-1 border border-slate-200 rounded disabled:opacity-50 hover:bg-slate-50 transition"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="font-semibold text-slate-700">Página {leadsPage} de {leadsTotalPages}</span>
                  <button 
                    disabled={leadsPage === leadsTotalPages}
                    onClick={() => { setLeadsPage(p => p + 1); fetchLeads(selectedCampaignId!, leadsPage + 1); }}
                    className="p-1 border border-slate-200 rounded disabled:opacity-50 hover:bg-slate-50 transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: RELATÓRIOS */}
          {activeTab === 'reports' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Exportar Campanhas de Recuperação</h3>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                    Baixe o resultado completo das ligações VAPI e envios de SMS. O relatório contém as transcrições das chamadas e logs de SMS.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Filtrar Exportação:</span>
                  <select
                    value={exportOccurrenceFilter}
                    onChange={(e) => setExportOccurrenceFilter(e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:border-vero-magenta"
                  >
                    <option value="all">Todas as Ocorrências</option>
                    <option value="PROMESSA BOLETO">PROMESSA BOLETO</option>
                    <option value="PROMESSA PIX">PROMESSA PIX</option>
                    <option value="ALEGA PAGAMENTO - SEM COMPROVANTE">ALEGA PAGAMENTO - SEM COMPROVANTE</option>
                    <option value="FALECIDO">FALECIDO</option>
                    <option value="CLIENTE DESCONHECIDO">CLIENTE DESCONHECIDO</option>
                    <option value="ROBO SOLICITA ATENDIMENTO HUMANO ">ROBO SOLICITA ATENDIMENTO HUMANO</option>
                    <option value="TENTATIVA - MAQUINA MENSAGEM AUTOMATICA">TENTATIVA - CAIXA POSTAL</option>
                    <option value="TENTATIVA - ABANDONO">TENTATIVA - ABANDONO</option>
                    <option value="TENTATIVA - NÃO ATENDE">TENTATIVA - NÃO ATENDE</option>
                  </select>
                </div>
              </div>
              
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden mt-6">
                {campaigns.map(c => (
                  <div key={c.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                    <div>
                      <h4 className="font-bold text-sm text-slate-700">{c.name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Criada em {new Date(c.created_at).toLocaleString('pt-BR')} • {c.total_leads} leads processados
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a 
                        href={`${BACKEND_URL}/api/campaigns/${c.id}/export?filter=answered`}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition shadow-sm"
                        title="Baixar lista formatada para Excel com os leads efetivamente atendidos para envio no Gmail"
                      >
                        <Download size={14} />
                        📥 Apenas Atendidas ({c.successful_calls})
                      </a>
                      <a 
                        href={`${BACKEND_URL}/api/campaigns/${c.id}/export?occurrence=${exportOccurrenceFilter !== 'all' ? encodeURIComponent(exportOccurrenceFilter) : ''}`}
                        className="flex items-center gap-1.5 px-3 py-2 bg-vero-magenta text-white text-xs font-semibold rounded-lg hover:bg-rose-700 transition"
                      >
                        <Download size={14} />
                        Exportar Todos
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Modal de Transcrição */}
      {selectedTranscriptLead && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base">{selectedTranscriptLead.name}</h3>
                <span className="text-xs text-slate-400">{selectedTranscriptLead.phone} | {formatBRL(selectedTranscriptLead.debt_value)}</span>
              </div>
              <button 
                onClick={() => setSelectedTranscriptLead(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 p-3 bg-slate-50 rounded-xl text-xs">
              {(selectedTranscriptLead.recording_url || (selectedTranscriptLead.call_id && (Number(selectedTranscriptLead.call_duration || 0) > 0 || (selectedTranscriptLead.call_log && !selectedTranscriptLead.call_log.includes('Duração: 0s'))))) ? (
                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gravação do Áudio da Chamada</span>
                  <audio controls src={`${BACKEND_URL}/api/leads/${selectedTranscriptLead.id}/audio?t=${Date.now()}`} className="w-full h-8" />
                </div>
              ) : (
                <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-amber-800 text-[11px] font-medium flex items-center gap-1.5">
                  <span>ℹ️ Gravação indisponível: O cliente não atendeu a ligação (Duração: 0s).</span>
                </div>
              )}
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Transcrição / Histórico da Ligação</span>
              <div className="whitespace-pre-wrap font-mono text-slate-700 leading-relaxed bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                {selectedTranscriptLead.transcript || selectedTranscriptLead.call_log || 'Nenhuma transcrição ou registro gravado para esta chamada.'}
              </div>
            </div>

            <div className="pt-2 text-right">
              <button 
                onClick={() => setSelectedTranscriptLead(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
