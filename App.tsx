
import React, { useState, useEffect } from 'react';
import Mascot from './components/Mascot';
import ChatView from './components/ChatView';
import InventoryManager from './components/InventoryManager';
import Dashboard from './components/Dashboard';
import KnowledgeManager from './components/KnowledgeManager';
import InvoiceProcessor from './components/InvoiceProcessor';
import MemoryManager from './components/MemoryManager';
import { db } from './services/db';
import { UsageMetrics } from './types';

type ViewMode = 'chat' | 'dashboard' | 'inventory' | 'knowledge' | 'invoices' | 'memory';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>('chat');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [usage, setUsage] = useState<number>(0);
  const [limit, setLimit] = useState<number>(1500);
  const [isPaidPlan, setIsPaidPlan] = useState(false);

  const loadUsage = async () => {
    const today = new Date().toISOString().split('T')[0];
    const metrics: UsageMetrics = await db.get('nobel_usage_metrics');
    if (metrics) {
      if (metrics.lastResetDate === today) {
        setUsage(metrics.dailyRequests);
      } else {
        setUsage(0);
      }
      setLimit(metrics.usageLimit || 1500);
    }
    // Verificação simples: se o limite for muito alto, assumimos que é pago ou configurado para tal
    setIsPaidPlan((metrics?.usageLimit || 0) > 5000);
  };

  useEffect(() => {
    loadUsage();
    window.addEventListener('nobel_usage_updated', loadUsage);
    return () => window.removeEventListener('nobel_usage_updated', loadUsage);
  }, []);

  const usagePercent = Math.min(100, (usage / limit) * 100);
  const isOverLimit = usage >= limit;

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden">
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} glass border-r border-zinc-800 transition-all duration-300 flex flex-col z-50`}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 shrink-0">
            <Mascot animated mood={isOverLimit ? 'tired' : 'happy'} />
          </div>
          {isSidebarOpen && (
            <div className="animate-in fade-in duration-500">
              <h1 className="font-black text-lg tracking-tighter">NOBEL<span className="text-yellow-400">.</span></h1>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isPaidPlan ? 'bg-blue-500' : 'bg-green-500 animate-pulse'}`}></span>
                <p className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">{isPaidPlan ? 'Plano Profissional' : 'Plano Gratuito'}</p>
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-2 mt-4 overflow-y-auto custom-scrollbar">
          <NavItem icon="🦉" label="Consultoria Balcão" active={view === 'chat'} onClick={() => setView('chat')} collapsed={!isSidebarOpen} />
          <NavItem icon="📈" label="Painel de Metas" active={view === 'dashboard'} onClick={() => setView('dashboard')} collapsed={!isSidebarOpen} />
          <NavItem icon="📚" label="Acervo Real" active={view === 'inventory'} onClick={() => setView('inventory')} collapsed={!isSidebarOpen} />
          <NavItem icon="🧠" label="Regras Comerciais" active={view === 'knowledge'} onClick={() => setView('knowledge')} collapsed={!isSidebarOpen} />
          <NavItem icon="📉" label="Baixa de Vendas" active={view === 'invoices'} onClick={() => setView('invoices')} collapsed={!isSidebarOpen} />
          <NavItem icon="💾" label="Sinc. Cérebro" active={view === 'memory'} onClick={() => setView('memory')} collapsed={!isSidebarOpen} />
        </nav>

        {isSidebarOpen && (
          <div className="mx-4 mb-4 p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800">
             <div className="flex justify-between items-end mb-1">
                <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Saúde da API</p>
                <p className="text-[9px] font-black text-zinc-400">{usagePercent.toFixed(0)}%</p>
             </div>
             <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${isOverLimit ? 'bg-red-500' : 'bg-yellow-400'}`} 
                  style={{ width: `${usagePercent}%` }}
                ></div>
             </div>
             <p className="text-[7px] text-zinc-700 font-bold uppercase mt-2 leading-tight">
               {isPaidPlan ? 'Uso Ilimitado Ativo' : 'Limite diário de segurança.'}
             </p>
          </div>
        )}

        <div className="p-4 border-t border-zinc-800">
          <button 
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="w-full py-2 bg-zinc-900 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors"
          >
            {isSidebarOpen ? 'Recolher Menu' : '→'}
          </button>
        </div>
      </aside>

      <main className="flex-1 relative overflow-hidden flex flex-col">
        {view === 'chat' && <ChatView />}
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
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all ${
      active ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'text-zinc-400 hover:bg-zinc-900'
    }`}
  >
    <span className="text-xl">{icon}</span>
    {!collapsed && <span className="font-bold text-sm whitespace-nowrap">{label}</span>}
  </button>
);

export default App;
