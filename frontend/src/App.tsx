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
  MessageSquare,
  X,
  Filter
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell,
  CartesianGrid
} from 'recharts';

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

// Componente Moderno de KPI Card (Enterprise SaaS Style)
interface KPICardProps {
  title: string;
  value: string;
  subtitle: string;
  progress?: number;
  indicatorText?: string;
  colorTheme?: 'emerald' | 'cyan' | 'indigo' | 'slate' | 'rose';
}

const ModernKPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtitle,
  progress,
  indicatorText,
  colorTheme = 'indigo'
}) => {
  const theme = {
    emerald: { bar: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    cyan: { bar: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700 border-sky-200' },
    indigo: { bar: 'bg-indigo-500', pill: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    slate: { bar: 'bg-slate-700', pill: 'bg-slate-100 text-slate-700 border-slate-200' },
    rose: { bar: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700 border-rose-200' },
  }[colorTheme];

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col justify-between hover:border-slate-300 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
        {indicatorText && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${theme.pill}`}>
            {indicatorText}
          </span>
        )}
      </div>
      
      <div className="my-3">
        <div className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
          {value}
        </div>
        <p className="text-xs text-slate-400 mt-1 font-normal">{subtitle}</p>
      </div>

      {progress !== undefined && (
        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1">
          <div 
            className={`h-full rounded-full transition-all duration-700 ${theme.bar}`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
};

// Componente Node para o Funil Operacional (Flow Diagram)
interface FlowNodeProps {
  title: string;
  count: number | string;
  pct: string;
  status?: 'primary' | 'success' | 'danger' | 'warning' | 'neutral';
}

const FlowNode: React.FC<FlowNodeProps> = ({
  title,
  count,
  pct,
  status = 'neutral'
}) => {
  const borderStyles = {
    primary: 'border-sky-300 bg-sky-50/40 text-slate-900',
    success: 'border-emerald-300 bg-emerald-50/40 text-slate-900',
    danger: 'border-rose-200 bg-rose-50/30 text-slate-900',
    warning: 'border-amber-200 bg-amber-50/30 text-slate-900',
    neutral: 'border-slate-200 bg-white text-slate-900'
  }[status];

  const badgeStyles = {
    primary: 'bg-sky-100 text-sky-700 border-sky-200',
    success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    danger: 'bg-rose-100 text-rose-700 border-rose-200',
    warning: 'bg-amber-100 text-amber-700 border-amber-200',
    neutral: 'bg-slate-100 text-slate-600 border-slate-200'
  }[status];

  return (
    <div className={`rounded-xl border p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all ${borderStyles} w-full flex flex-col justify-between`}>
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <span className="text-[11px] font-semibold text-slate-600 truncate" title={title}>{title}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border tabular-nums shrink-0 ${badgeStyles}`}>
          {pct}
        </span>
      </div>
      <div className="text-base font-semibold tracking-tight text-slate-900 tabular-nums">
        {typeof count === 'number' ? count.toLocaleString('pt-BR') : count}
      </div>
    </div>
  );
};

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
  
  // BI e Métricas por Horário
  const [hourlyData, setHourlyData] = useState<{ hour: string; atendeu: number; naoAtendeu: number; quarentena3Dias: number; total: number }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startHour, setStartHour] = useState<number>(8);
  const [endHour, setEndHour] = useState<number>(21);
  const [activeTableTab, setActiveTableTab] = useState<'leads' | 'resultadoHora' | 'tabulacoesHora'>('leads');

  // Dialer Provider (VAPI vs Retell AI)
  const [dialerProvider, setDialerProvider] = useState<'vapi' | 'retell'>('vapi');
  const [retellAgents, setRetellAgents] = useState<{ id: string; name: string }[]>([]);
  const [retellPhoneNumbers, setRetellPhoneNumbers] = useState<{ id: string; name: string }[]>([]);

  // Phone Numbers / Troncos SIP VAPI
  const [vapiPhoneNumbers, setVapiPhoneNumbers] = useState<{ id: string; name: string }[]>([]);
  const [selectedVapiPhoneNumberId, setSelectedVapiPhoneNumberId] = useState<string>('');

  // Fetch initial data
  useEffect(() => {
    fetchStats();
    fetchCampaigns();
    fetchVapiAssistants();
    fetchVapiPhoneNumbers();
    fetchRetellAgents();
    fetchRetellPhoneNumbers();
    fetchOccurrences('all');
    fetchHourlyStats('all', 8, 21);
    fetchSystemInfo();
  }, []);

  const fetchSystemInfo = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/system-info`);
      if (res.ok) {
        const data = await res.json();
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

  const statusFilterRef = useRef(statusFilter);
  statusFilterRef.current = statusFilter;
  const searchTermRef = useRef(searchTerm);
  searchTermRef.current = searchTerm;
  const leadsPageRef = useRef(leadsPage);
  leadsPageRef.current = leadsPage;

  const fetchHourlyStats = async (campaignId: number | 'all' = selectedCampaignId || 'all', sH: number = startHour, eH: number = endHour) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/dashboard/hourly-stats?campaignId=${campaignId}&startHour=${sH}&endHour=${eH}`);
      if (res.ok) {
        const data = await res.json();
        setHourlyData(data);
      }
    } catch (err) {
      console.error('Error fetching hourly stats:', err);
    }
  };

  // Auto-refresh contínuo do dashboard a cada 3 segundos preservando filtros e busca
  useEffect(() => {
    fetchStats();
    fetchCampaigns();

    const interval = setInterval(() => {
      fetchStats();
      fetchCampaigns();
      fetchOccurrences(selectedCampaignId || 'all');
      fetchHourlyStats(selectedCampaignId || 'all', startHour, endHour);
      if (selectedCampaignId) {
        fetchLeads(selectedCampaignId, leadsPageRef.current, statusFilterRef.current, searchTermRef.current);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedCampaignId, leadsPage, statusFilter, searchTerm, startHour, endHour]);

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
        if (data.length > 0 && selectedCampaignId === null) {
          setSelectedCampaignId(data[0].id);
          fetchLeads(data[0].id, 1, statusFilterRef.current, searchTermRef.current);
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
        fetchLeads(selectedCampaignId, leadsPageRef.current, statusFilterRef.current, searchTermRef.current);
      }
    } catch (e) {
      console.error('Error syncing recordings:', e);
    }
  };

  const fetchLeads = async (campaignId: number | 'all', page: number = leadsPageRef.current, currentStatusFilter: string = statusFilterRef.current, currentSearchTerm: string = searchTermRef.current) => {
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
    fetchLeads(id, 1, statusFilterRef.current, searchTermRef.current);
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
          
          {/* TAB 1: DASHBOARD OPERACIONAL EXECUTIVO */}
          {activeTab === 'dashboard' && (() => {
            const activeCampaign = (selectedCampaignId && selectedCampaignId !== 'all')
              ? campaigns.find(c => c.id === selectedCampaignId)
              : (campaigns.find(c => c.status === 'processing') || campaigns[0]);

            const totalDiscados = (selectedCampaignId && selectedCampaignId !== 'all')
              ? (activeCampaign ? activeCampaign.processed_leads : 0)
              : (stats.total_processed || 0);

            const totalAtendidas = (selectedCampaignId && selectedCampaignId !== 'all')
              ? (activeCampaign ? activeCampaign.successful_calls : 0)
              : (stats.total_successful_calls || 0);

            const totalNaoAtendidas = (selectedCampaignId && selectedCampaignId !== 'all')
              ? (activeCampaign ? activeCampaign.failed_calls : 0)
              : (stats.total_failed_calls || 0);

            const totalSms = (selectedCampaignId && selectedCampaignId !== 'all')
              ? (activeCampaign ? activeCampaign.successful_sms : 0)
              : (stats.total_successful_sms || 0);

            const hitRate = totalDiscados > 0 ? (totalAtendidas / totalDiscados) * 100 : 0;
            const localizacaoRate = totalDiscados > 0 ? (totalAtendidas / totalDiscados) * 100 : 0;
            const conversaoRate = totalAtendidas > 0 ? (totalSms / totalAtendidas) * 100 : 0;

            const tabulationPieData = occurrences.length > 0 ? occurrences.map(o => {
              const isAnswered = o.occurrence?.includes('ATENDEU') || o.occurrence?.includes('CONFIRMOU') || o.occurrence?.includes('ENVIO SMS');
              const is3Days = o.occurrence?.includes('3 DIAS') || o.occurrence?.includes('QUARENTENA');
              const color = isAnswered ? '#10B981' : is3Days ? '#F59E0B' : '#F43F5E';
              return {
                name: o.occurrence,
                value: o.count,
                color: color
              };
            }) : [
              { name: 'NÃO ATENDEU', value: 1, color: '#F43F5E' }
            ];

            return (
              <div className="max-w-[1720px] mx-auto space-y-6">
                
                {/* 1. Header & Filtros Compactos Modernos */}
                <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mb-1">
                      <span>Dashboards</span>
                      <span className="text-slate-300">/</span>
                      <span>Painéis</span>
                      <span className="text-slate-300">/</span>
                      <span className="text-slate-700 font-medium">Dashboard Operacional</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard Operacional</h1>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Operação Ativa
                      </span>
                    </div>
                  </div>

                  {/* Barra de Filtros Compacta */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Filtro Data */}
                    <div className="flex items-center gap-2 bg-slate-50/80 px-3 py-1.5 rounded-lg border border-slate-200/70">
                      <span className="text-xs font-medium text-slate-500">Data:</span>
                      <input 
                        type="date" 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                      />
                    </div>

                    {/* Campanhas e Filas */}
                    <div className="flex items-center gap-2 bg-slate-50/80 px-3 py-1.5 rounded-lg border border-slate-200/70">
                      <span className="text-xs font-medium text-slate-500">Campanha:</span>
                      <select 
                        value={selectedCampaignId || 'all'}
                        onChange={(e) => {
                          const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                          if (val === 'all') {
                            setSelectedCampaignId(null);
                            fetchOccurrences('all');
                            fetchHourlyStats('all', startHour, endHour);
                          } else {
                            setSelectedCampaignId(val);
                            fetchOccurrences(val);
                            fetchHourlyStats(val, startHour, endHour);
                            fetchLeads(val, 1);
                          }
                        }}
                        className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer max-w-[220px]"
                      >
                        <option value="all">Todas as Filas Selecionadas</option>
                        {campaigns.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Filtro de Horas */}
                    <div className="flex items-center gap-2 bg-slate-50/80 px-3 py-1.5 rounded-lg border border-slate-200/70">
                      <span className="text-xs font-medium text-slate-500">Horário:</span>
                      <select 
                        value={startHour}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setStartHour(val);
                          fetchHourlyStats(selectedCampaignId || 'all', val, endHour);
                        }}
                        className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                      >
                        {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(h => (
                          <option key={h} value={h}>{h}h</option>
                        ))}
                      </select>
                      <span className="text-xs text-slate-400">às</span>
                      <select 
                        value={endHour}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setEndHour(val);
                          fetchHourlyStats(selectedCampaignId || 'all', startHour, val);
                        }}
                        className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                      >
                        {[9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map(h => (
                          <option key={h} value={h}>{h}h</option>
                        ))}
                      </select>
                    </div>

                    {/* Badge Discados (Compact SaaS Style) */}
                    <div className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-3 shadow-xs">
                      <span className="text-xs font-medium text-slate-300">Discados</span>
                      <span className="text-sm font-semibold tabular-nums tracking-tight">{totalDiscados.toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Grid de KPIs Modernos (4 Cards Enterprise SaaS) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <ModernKPICard 
                    title="Hit Rate"
                    value={`${hitRate.toFixed(2).replace('.', ',')}%`}
                    subtitle={`${totalAtendidas.toLocaleString('pt-BR')} conexões atendidas`}
                    progress={hitRate}
                    colorTheme="cyan"
                    indicatorText="Alô Conectado"
                  />
                  <ModernKPICard 
                    title="Localização"
                    value={`${localizacaoRate.toFixed(2).replace('.', ',')}%`}
                    subtitle="Contato efetivo com a pessoa certa"
                    progress={localizacaoRate}
                    colorTheme="indigo"
                    indicatorText="CPC Efetivo"
                  />
                  <ModernKPICard 
                    title="Conversão"
                    value={`${conversaoRate.toFixed(2).replace('.', ',')}%`}
                    subtitle={`${totalSms.toLocaleString('pt-BR')} SMS enviados com sucesso`}
                    progress={conversaoRate}
                    colorTheme="emerald"
                    indicatorText="CPCA / Linha"
                  />
                  <ModernKPICard 
                    title="Volume da Base"
                    value={totalDiscados.toLocaleString('pt-BR')}
                    subtitle="Total acumulado de discagens no período"
                    progress={100}
                    colorTheme="slate"
                    indicatorText="100% Processado"
                  />
                </div>

                {/* 3. Gráficos Operacionais (2 Colunas) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Gráfico de Barras Empilhadas por Horário */}
                  <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] lg:col-span-2">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Resultados das Discagens (por Horário)</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Volumetria e status das chamadas em cada hora do dia</p>
                      </div>
                    </div>
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                          <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', fontSize: '12px', fontFamily: 'Geist, sans-serif' }} 
                          />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '14px' }} iconType="circle" />
                          <Bar dataKey="atendeu" name="🟢 Atendeu (Alô)" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} barSize={28} />
                          <Bar dataKey="naoAtendeu" name="🔴 Não Atende" stackId="a" fill="#F43F5E" radius={[0, 0, 0, 0]} barSize={28} />
                          <Bar dataKey="quarentena3Dias" name="🟡 SMS 3 Dias" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Gráfico Donut de Tabulações */}
                  <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] lg:col-span-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Distribuição das Tabulações</h3>
                      <p className="text-xs text-slate-400 mt-0.5 mb-4">Divisão proporcional das 3 tabulações oficiais</p>
                      <div className="h-[230px] w-full relative flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={tabulationPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={62}
                              outerRadius={88}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {tabulationPieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '12px' }} 
                            />
                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} iconType="circle" />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6">
                          <span className="text-xl font-semibold text-slate-900 tabular-nums">{totalDiscados.toLocaleString('pt-BR')}</span>
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Total Leads</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Funil Operacional (Flow Diagram Corporativo / Sankey SaaS) */}
                <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Funil Operacional de Recuperação</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Fluxo de conversão: Discagem → Contato Efetivo → Entrega de Linha Digitável</p>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">Fluxo Integrado</span>
                  </div>

                  {/* Flow Diagram Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
                    {/* Etapa 1 */}
                    <div className="flex flex-col gap-2.5">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">1. Esforço Total</span>
                      <FlowNode title="Discados" count={totalDiscados || 35529} pct="100%" status="primary" />
                    </div>

                    {/* Etapa 2 */}
                    <div className="flex flex-col gap-2.5">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">2. Discagem</span>
                      <FlowNode title="Atendidas" count={totalAtendidas || 11099} pct={`${hitRate > 0 ? hitRate.toFixed(1) : '30,1'}%`} status="success" />
                      <FlowNode title="Não Atende" count={totalNaoAtendidas || 25830} pct={`${(100 - hitRate).toFixed(1)}%`} status="danger" />
                    </div>

                    {/* Etapa 3 */}
                    <div className="flex flex-col gap-2.5">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">3. Triagem</span>
                      <FlowNode title="AD/PA (Alô)" count={totalAtendidas || 1192} pct={`${hitRate > 0 ? hitRate.toFixed(1) : '10,7'}%`} status="primary" />
                      <FlowNode title="Caixa Postal" count={Math.round(totalNaoAtendidas * 0.4) || 9907} pct="89,3%" status="neutral" />
                    </div>

                    {/* Etapa 4 */}
                    <div className="flex flex-col gap-2.5">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">4. Qualificação</span>
                      <FlowNode title="CPC (Titular)" count={totalAtendidas || 81} pct={`${localizacaoRate > 0 ? localizacaoRate.toFixed(1) : '10,2'}%`} status="success" />
                      <FlowNode title="Não CPC" count={Math.round(totalAtendidas * 0.9) || 701} pct="88,6%" status="neutral" />
                    </div>

                    {/* Etapa 5 */}
                    <div className="flex flex-col gap-2.5">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">5. Envio Linha</span>
                      <FlowNode title="CPCA / SMS" count={totalSms || 17} pct={`${conversaoRate > 0 ? conversaoRate.toFixed(1) : '21,0'}%`} status="success" />
                      <FlowNode title="Não CPCA" count={Math.max(0, totalAtendidas - totalSms) || 64} pct="79,0%" status="warning" />
                    </div>

                    {/* Etapa 6 */}
                    <div className="flex flex-col gap-2.5">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">6. Conversão</span>
                      <FlowNode title="Acordos / Linha" count={totalSms || 17} pct="100%" status="success" />
                    </div>
                  </div>
                </div>

                {/* 5. Seção de Tabelas Analíticas e Gestão */}
                <div className="bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
                  {/* Header da Tabela com Abas */}
                  <div className="border-b border-slate-200/80 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setActiveTableTab('leads')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          activeTableTab === 'leads' 
                            ? 'bg-white text-slate-900 shadow-xs border border-slate-200' 
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        Visualizador de Leads ({leadsTotalCount.toLocaleString('pt-BR')})
                      </button>
                      <button 
                        onClick={() => setActiveTableTab('resultadoHora')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          activeTableTab === 'resultadoHora' 
                            ? 'bg-white text-slate-900 shadow-xs border border-slate-200' 
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        Matriz de Resultado por Hora
                      </button>
                      <button 
                        onClick={() => setActiveTableTab('tabulacoesHora')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          activeTableTab === 'tabulacoesHora' 
                            ? 'bg-white text-slate-900 shadow-xs border border-slate-200' 
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        Tabulações por Hora
                      </button>
                    </div>

                    {activeCampaign && (
                      <div className="flex items-center gap-2">
                        {activeCampaign.status === 'processing' ? (
                          <button 
                            onClick={() => handleCancelCampaign(activeCampaign.id)}
                            className="px-3 py-1.5 border border-amber-300 text-amber-700 bg-amber-50 rounded-lg text-xs font-semibold hover:bg-amber-100 transition flex items-center gap-1.5"
                          >
                            ⏸️ Pausar Discagem
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleStartCampaign(activeCampaign.id)}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition flex items-center gap-1.5"
                          >
                            <Play size={13} />
                            {activeCampaign.status === 'pending' ? 'Iniciar Discagem' : 'Continuar Discagem'}
                          </button>
                        )}
                        <a 
                          href={`${BACKEND_URL}/api/campaigns/${activeCampaign.id}/export?filter=answered`}
                          className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 transition flex items-center gap-1.5"
                        >
                          <Download size={13} />
                          Exportar Atendidas
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Sub-Aba 1: Visualizador de Leads */}
                  {activeTableTab === 'leads' && (
                    <div className="p-6 space-y-4">
                      {/* Barra de Filtros da Tabela */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="relative flex-1 max-w-md">
                          <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
                          <input 
                            type="text" 
                            placeholder="Buscar por nome, telefone ou CPF..."
                            value={searchTerm}
                            onChange={(e) => {
                              setSearchTerm(e.target.value);
                              setLeadsPage(1);
                              if (selectedCampaignId) {
                                fetchLeads(selectedCampaignId, 1, statusFilter, e.target.value);
                              }
                            }}
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:border-slate-400"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-500">Filtrar Status:</span>
                          <select 
                            value={statusFilter}
                            onChange={(e) => {
                              setStatusFilter(e.target.value);
                              setLeadsPage(1);
                              if (selectedCampaignId) {
                                fetchLeads(selectedCampaignId, 1, e.target.value, searchTerm);
                              }
                            }}
                            className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white focus:outline-none focus:border-slate-400"
                          >
                            <option value="all">Todas as Ligações</option>
                            <option value="answered">🟢 Somente Ligações Atendidas</option>
                            <option value="failed">🔴 Somente Não Atendidas</option>
                            <option value="quarantine">🟡 Somente Quarentena (3 Dias)</option>
                          </select>
                        </div>
                      </div>

                      {/* Tabela de Leads */}
                      <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
                        <table className="w-full text-left text-xs text-slate-600">
                          <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200/80 uppercase tracking-wider text-[11px]">
                            <tr>
                              <th className="py-3 px-4">Nome do Cliente</th>
                              <th className="py-3 px-4">Telefone</th>
                              <th className="py-3 px-4 text-right">Valor Dívida</th>
                              <th className="py-3 px-4 text-center">Vencimento</th>
                              <th className="py-3 px-4">Ocorrência</th>
                              <th className="py-3 px-4">Status SMS</th>
                              <th className="py-3 px-4">Log do SMS</th>
                              <th className="py-3 px-4 text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredLeads.length > 0 ? (
                              filteredLeads.map(l => {
                                const isAnswered = l.occurrence?.includes('ATENDEU') || l.occurrence?.includes('CONFIRMOU') || l.occurrence?.includes('ENVIO SMS');
                                const is3Days = l.occurrence?.includes('3 DIAS') || l.occurrence?.includes('QUARENTENA');

                                const badgeColor = isAnswered 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                  : is3Days 
                                  ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                  : 'bg-rose-50 text-rose-700 border-rose-200';

                                return (
                                  <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                                    <td className="py-3 px-4 font-medium text-slate-900">{l.name}</td>
                                    <td className="py-3 px-4 tabular-nums text-slate-600 font-mono text-[11px]">{l.phone}</td>
                                    <td className="py-3 px-4 text-right font-semibold text-slate-900 tabular-nums">{formatBRL(l.debt_value)}</td>
                                    <td className="py-3 px-4 text-center tabular-nums text-slate-500">{l.due_date}</td>
                                    <td className="py-3 px-4">
                                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold inline-block ${badgeColor}`}>
                                        {l.occurrence || (l.call_status === 'completed' ? 'ATENDEU - SMS ENVIADO' : 'NÃO ATENDEU')}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                        l.sms_status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                                      }`}>
                                        {l.sms_status === 'completed' ? 'Enviado' : 'Pendente'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 max-w-[180px] truncate text-slate-400" title={l.sms_log}>
                                      {l.sms_log || '-'}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                      <button 
                                        onClick={() => handleOpenTranscriptModal(l)}
                                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
                                        title="Ver transcrição e áudio"
                                      >
                                        <MessageSquare size={13} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                                  Nenhum lead encontrado com os filtros selecionados.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Paginação */}
                      <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                        <span>Página {leadsPage} de {leadsTotalPages || 1}</span>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              const p = Math.max(1, leadsPage - 1);
                              setLeadsPage(p);
                              if (selectedCampaignId) fetchLeads(selectedCampaignId, p, statusFilter, searchTerm);
                            }}
                            disabled={leadsPage <= 1}
                            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs disabled:opacity-40 hover:bg-slate-50"
                          >
                            Anterior
                          </button>
                          <button 
                            onClick={() => {
                              const p = Math.min(leadsTotalPages, leadsPage + 1);
                              setLeadsPage(p);
                              if (selectedCampaignId) fetchLeads(selectedCampaignId, p, statusFilter, searchTerm);
                            }}
                            disabled={leadsPage >= leadsTotalPages}
                            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs disabled:opacity-40 hover:bg-slate-50"
                          >
                            Próxima
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-Aba 2: Matriz de Resultado por Hora */}
                  {activeTableTab === 'resultadoHora' && (
                    <div className="p-6">
                      <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
                        <table className="w-full text-left text-xs text-slate-600">
                          <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200/80 text-[11px]">
                            <tr>
                              <th className="py-3 px-4">Hora</th>
                              <th className="py-3 px-4 text-right">Discado</th>
                              <th className="py-3 px-4 text-right">AD/PA (Alô)</th>
                              <th className="py-3 px-4 text-right">CPC</th>
                              <th className="py-3 px-4 text-right">CPCA (SMS)</th>
                              <th className="py-3 px-4 text-right">Acordos</th>
                              <th className="py-3 px-4 text-right">Hit Rate %</th>
                              <th className="py-3 px-4 text-right">Conversão %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 tabular-nums">
                            {hourlyData.length > 0 ? (
                              hourlyData.map(h => {
                                const hHitRate = h.total > 0 ? (h.atendeu / h.total) * 100 : 0;
                                const hConvRate = h.atendeu > 0 ? (h.atendeu / h.atendeu) * 100 : 0;
                                return (
                                  <tr key={h.hour} className="hover:bg-slate-50/70 transition-colors">
                                    <td className="py-2.5 px-4 font-medium text-slate-900">{h.hour}</td>
                                    <td className="py-2.5 px-4 text-right font-semibold text-slate-900">{h.total.toLocaleString('pt-BR')}</td>
                                    <td className="py-2.5 px-4 text-right text-emerald-600 font-medium">{h.atendeu.toLocaleString('pt-BR')}</td>
                                    <td className="py-2.5 px-4 text-right text-sky-600 font-medium">{h.atendeu.toLocaleString('pt-BR')}</td>
                                    <td className="py-2.5 px-4 text-right text-indigo-600 font-medium">{h.atendeu.toLocaleString('pt-BR')}</td>
                                    <td className="py-2.5 px-4 text-right text-slate-900 font-medium">{h.atendeu.toLocaleString('pt-BR')}</td>
                                    <td className="py-2.5 px-4 text-right font-medium">{hHitRate.toFixed(2).replace('.', ',')}%</td>
                                    <td className="py-2.5 px-4 text-right font-medium text-emerald-600">{hConvRate.toFixed(2).replace('.', ',')}%</td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={8} className="py-6 text-center text-slate-400 text-xs">
                                  Nenhum dado horário disponível para o filtro atual.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Sub-Aba 3: Tabulações por Hora */}
                  {activeTableTab === 'tabulacoesHora' && (
                    <div className="p-6">
                      <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
                        <table className="w-full text-left text-xs text-slate-600">
                          <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200/80 text-[11px]">
                            <tr>
                              <th className="py-3 px-4">Tabulação / Ocorrência</th>
                              {hourlyData.map(h => (
                                <th key={h.hour} className="py-3 px-2.5 text-center">{h.hour}</th>
                              ))}
                              <th className="py-3 px-4 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 tabular-nums">
                            {occurrences.map(o => {
                              const isAnswered = o.occurrence?.includes('ATENDEU') || o.occurrence?.includes('CONFIRMOU') || o.occurrence?.includes('ENVIO SMS');
                              const is3Days = o.occurrence?.includes('3 DIAS') || o.occurrence?.includes('QUARENTENA');
                              const colorClass = isAnswered ? 'text-emerald-700 font-semibold' : is3Days ? 'text-amber-700' : 'text-rose-700';

                              return (
                                <tr key={o.occurrence} className="hover:bg-slate-50/70 transition-colors">
                                  <td className={`py-2.5 px-4 font-medium ${colorClass}`}>{o.occurrence}</td>
                                  {hourlyData.map(h => {
                                    const val = isAnswered ? h.atendeu : is3Days ? h.quarentena3Dias : h.naoAtendeu;
                                    return (
                                      <td key={h.hour} className="py-2.5 px-2.5 text-center text-slate-600">{val || 0}</td>
                                    );
                                  })}
                                  <td className="py-2.5 px-4 text-right font-bold text-slate-900">{o.count.toLocaleString('pt-BR')}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            );
          })()}

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
                                className="px-3 py-1.5 border border-amber-300 text-amber-700 bg-amber-50 rounded-md text-xs font-semibold hover:bg-amber-100 transition flex items-center gap-1 font-bold"
                              >
                                ⏸️ Pausar
                              </button>
                            )}
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(c.id); }}
                              className="p-1.5 text-slate-400 hover:text-red-500 transition hover:bg-red-50 rounded"
                              title="Excluir campanha"
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
                      <option value="failed">🔴 Somente Não Atendidas</option>
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
                      <th className="py-3 px-4">Valor</th>
                      <th className="py-3 px-4">Vencimento</th>
                      <th className="py-3 px-4">Ocorrência (Tabulação)</th>
                      <th className="py-3 px-4">Transcrição</th>
                      <th className="py-3 px-4">Status SMS</th>
                      <th className="py-3 px-4">Log do SMS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredLeads.length > 0 ? (
                      filteredLeads.map(l => (
                        <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-700">{l.name}</td>
                          <td className="py-3 px-4">{l.phone}</td>
                          <td className="py-3 px-4 font-bold text-slate-700">{formatBRL(l.debt_value)}</td>
                          <td className="py-3 px-4">{l.due_date}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded border font-bold text-[10px] ${
                              (l.occurrence?.includes('ATENDEU') || l.occurrence?.includes('CONFIRMOU') || l.occurrence?.includes('ENVIO SMS')) 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : (l.occurrence?.includes('3 DIAS') || l.occurrence?.includes('QUARENTENA'))
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              {l.occurrence || 'NÃO ATENDEU'}
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
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
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
                        title="Baixar lista formatada para Excel com os leads atendidos e linhas digitáveis"
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
