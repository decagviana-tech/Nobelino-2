
import React, { useState, useEffect } from 'react';
import Mascot from './componentes/Mascot';
import ChatView from './componentes/ChatView';
import InventoryManager from './componentes/InventoryManager';
import Dashboard from './componentes/Dashboard';
import KnowledgeManager from './componentes/KnowledgeManager';
import InvoiceProcessor from './componentes/InvoiceProcessor';
import MemoryManager from './componentes/MemoryManager';
import { db } from './services/db';
import { UsageMetrics } from './types';

type ViewMode = 'chat' | 'dashboard' | 'inventory' | 'knowledge' | 'invoices' | 'memory';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>('chat');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [hasNewKnowledge, setHasNewKnowledge] = useState(false);
  const [usage, setUsage] = useState<number>(0);
  const [limit, setLimit] = useState<number>(1500);

  const loadData = async () => {
    const today = new Date().toISOString().split('T')[0];
    let metrics: UsageMetrics = await db.get('nobel_usage_metrics');
    
    if (!metrics || metrics.lastResetDate !== today) {
      metrics = {
        dailyRequests: 0,
        dailyEnrichments: 0,
        lastResetDate: today,
        totalTokensEstimate: 0,
        usageLimit: 1500,
        estimatedTotalCost: 0,
        localResolutionsCount: 0
      };
      await db.save('nobel_usage_metrics', metrics);
    }
    
    setUsage(metrics.dailyRequests || 0);
    setLimit(metrics.usageLimit || 1500);
  };

  useEffect(() => {
    loadData();
    const handleNewRule = () => setHasNewKnowledge(true);
    window.addEventListener('nobel_rule_saved', handleNewRule);
    return () => window.removeEventListener('nobel_rule_saved', handleNewRule);
  }, []);

  const handleNavigate = (newView: ViewMode) => {
    setView(newView);
    if (newView === 'knowledge') {
      setHasNewKnowledge(false);
    }
  };

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
          <NavItem icon="🦉" label="Vender" active={view === 'chat'} onClick={() => handleNavigate('chat')} collapsed={!isSidebarOpen} />
          <NavItem icon="📊" label="Metas" active={view === 'dashboard'} onClick={() => handleNavigate('dashboard')} collapsed={!isSidebarOpen} />
          <NavItem icon="📚" label="Estoque" active={view === 'inventory'} onClick={() => handleNavigate('inventory')} collapsed={!isSidebarOpen} />
          <NavItem 
            icon="🧠" 
            label="Treinar" 
            active={view === 'knowledge'} 
            onClick={() => handleNavigate('knowledge')} 
            collapsed={!isSidebarOpen} 
            hasNotification={hasNewKnowledge}
          />
          <NavItem icon="💾" label="Sincronia" active={view === 'memory'} onClick={() => handleNavigate('memory')} collapsed={!isSidebarOpen} />
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="w-full py-2 bg-zinc-900 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors text-zinc-500">
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

const NavItem = ({ icon, label, active, onClick, collapsed, hasNotification }: any) => (
  <button onClick={onClick} className={`relative w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all ${active ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'text-zinc-400 hover:bg-zinc-900'}`}>
    <span className="text-xl">{icon}</span>
    {!collapsed && <span className="font-bold text-sm whitespace-nowrap">{label}</span>}
    {hasNotification && (
      <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-yellow-400 border-2 border-[#09090b] rounded-full animate-bounce"></span>
    )}
  </button>
);

export default App;
