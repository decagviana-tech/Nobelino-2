
import React, { useState, useEffect } from 'react';
import Mascot from './componentes/Mascot';
import ChatView from './componentes/ChatView';
import InventoryManager from './componentes/InventoryManager';
import Dashboard from './componentes/Dashboard';
import KnowledgeManager from './componentes/KnowledgeManager';
import InvoiceProcessor from './componentes/InvoiceProcessor';
import MemoryManager from './componentes/MemoryManager';
import VoiceConsultant from './componentes/VoiceConsultant';
import { db } from './services/db';
import { UsageMetrics } from './types';

type ViewMode = 'chat' | 'dashboard' | 'inventory' | 'knowledge' | 'invoices' | 'memory' | 'voice';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>('chat');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [usage, setUsage] = useState<number>(0);
  const [limit, setLimit] = useState<number>(1500);
  const [inventory, setInventory] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  const checkKey = async () => {
    try {
      // @ts-ignore
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        // Se estiver fora do ambiente que suporta o seletor (ex: site direto no Netlify), 
        // assume true para carregar o app usando a variável de ambiente process.env.API_KEY
        setHasKey(true);
      }
    } catch (e) {
      console.warn("Seletor de chaves não disponível, usando chave padrão.");
      setHasKey(true);
    }
  };

  const handleSelectKey = async () => {
    try {
      // @ts-ignore
      if (window.aistudio && window.aistudio.openSelectKey) {
        await window.aistudio.openSelectKey();
      }
      setHasKey(true);
    } catch (e) {
      setHasKey(true);
    }
  };

  const loadData = async () => {
    const today = new Date().toISOString().split('T')[0];
    let metrics: UsageMetrics = await db.get('nobel_usage_metrics');
    
    if (!metrics || metrics.lastResetDate !== today) {
      metrics = {
        dailyRequests: 0,
        dailyEnrichments: 0,
        lastResetDate: today,
        totalTokensEstimate: 0,
        usageLimit: 1500
      };
      await db.save('nobel_usage_metrics', metrics);
    }
    
    setUsage(metrics.dailyRequests || 0);
    setLimit(metrics.usageLimit || 1500);

    const inv = await db.get('nobel_inventory');
    const knw = await db.get('nobel_knowledge_base');
    setInventory(inv || []);
    setKnowledge(knw || []);
  };

  useEffect(() => {
    checkKey();
    loadData();
    window.addEventListener('nobel_usage_updated', loadData);
    return () => window.removeEventListener('nobel_usage_updated', loadData);
  }, []);

  // Enquanto verifica, não mostra nada (evita flash)
  if (hasKey === null) return <div className="h-screen w-full bg-[#09090b]"></div>;

  if (hasKey === false) {
    return (
      <div className="h-screen w-full bg-[#09090b] flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
          <Mascot className="w-32 h-32 mx-auto" animated />
          <div className="space-y-4">
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Configuração Nobel</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Para o Nobelino trabalhar com velocidade total e sem limites, você precisa conectar sua chave de API do Google.
              <br/><br/>
              <span className="text-yellow-400 font-bold">Dica:</span> Use uma conta com faturamento ativado (Billing) para evitar travamentos.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleSelectKey}
              className="w-full bg-yellow-400 text-black py-4 rounded-2xl font-black uppercase text-sm hover:bg-yellow-300 transition-all shadow-xl shadow-yellow-400/10"
            >
              Conectar Minha Chave
            </button>
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noreferrer"
              className="text-[10px] text-zinc-600 uppercase font-bold hover:text-zinc-400 transition-colors"
            >
              Saiba mais sobre custos e limites
            </a>
          </div>
        </div>
      </div>
    );
  }

  const usagePercent = Math.min(100, (usage / limit) * 100);

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} glass border-r border-zinc-800 transition-all duration-300 flex flex-col z-50`}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 shrink-0">
            <Mascot animated mood={usage >= limit ? 'tired' : 'happy'} />
          </div>
          {isSidebarOpen && (
            <div className="animate-in fade-in duration-500">
              <h1 className="font-black text-lg tracking-tighter text-white">NOBEL<span className="text-yellow-400">.</span></h1>
              <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Digital Vendedor</p>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-2 mt-4 overflow-y-auto custom-scrollbar">
          <NavItem icon="🦉" label="Consultoria" active={view === 'chat'} onClick={() => setView('chat')} collapsed={!isSidebarOpen} />
          <NavItem icon="🎙️" label="Voz Live" active={view === 'voice'} onClick={() => setView('voice')} collapsed={!isSidebarOpen} />
          <NavItem icon="📚" label="Estoque" active={view === 'inventory'} onClick={() => setView('inventory')} collapsed={!isSidebarOpen} />
          <NavItem icon="🧠" label="Regras" active={view === 'knowledge'} onClick={() => setView('knowledge')} collapsed={!isSidebarOpen} />
          <NavItem icon="💾" label="Sincronização" active={view === 'memory'} onClick={() => setView('memory')} collapsed={!isSidebarOpen} />
        </nav>

        <div className="p-4 border-t border-zinc-800 space-y-4">
          {isSidebarOpen && (
            <div className="px-2">
              <div className="flex justify-between text-[10px] font-black uppercase text-zinc-500 mb-1">
                <span>Uso do Dia</span>
                <span className={usage >= limit ? 'text-red-500' : ''}>{usage}/{limit}</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${usagePercent > 80 ? 'bg-red-500' : 'bg-yellow-400'}`} 
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="w-full py-2 bg-zinc-900 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors text-zinc-500">
            {isSidebarOpen ? 'Recolher Menu' : '→'}
          </button>
        </div>
      </aside>

      <main className="flex-1 relative overflow-hidden flex flex-col">
        {view === 'chat' && <ChatView />}
        {view === 'voice' && <VoiceConsultant inventory={inventory} knowledge={knowledge} onClose={() => setView('chat')} />}
        {view === 'dashboard' && <Dashboard />}
        {view === 'inventory' && <InventoryManager />}
        {view === 'knowledge' && <KnowledgeManager />}
        {view === 'invoices' && <InvoiceProcessor />}
        {view === 'memory' && <MemoryManager />}
      </main>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick, collapsed }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all ${active ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'text-zinc-400 hover:bg-zinc-900'}`}>
    <span className="text-xl">{icon}</span>
    {!collapsed && <span className="font-bold text-sm whitespace-nowrap">{label}</span>}
  </button>
);

export default App;
