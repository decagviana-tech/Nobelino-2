
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

  const loadData = async () => {
    const today = new Date().toISOString().split('T')[0];
    const metrics: UsageMetrics = await db.get('nobel_usage_metrics');
    if (metrics && metrics.lastResetDate === today) {
      setUsage(metrics.dailyRequests);
      setLimit(metrics.usageLimit || 1500);
    }
    const inv = await db.get('nobel_inventory');
    const knw = await db.get('nobel_knowledge_base');
    setInventory(inv || []);
    setKnowledge(knw || []);
  };

  useEffect(() => {
    loadData();
    window.addEventListener('nobel_usage_updated', loadData);
    return () => window.removeEventListener('nobel_usage_updated', loadData);
  }, []);

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden">
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
          <NavItem icon="📈" label="Metas" active={view === 'dashboard'} onClick={() => setView('dashboard')} collapsed={!isSidebarOpen} />
          <NavItem icon="📚" label="Estoque" active={view === 'inventory'} onClick={() => setView('inventory')} collapsed={!isSidebarOpen} />
          <NavItem icon="🧠" label="Regras" active={view === 'knowledge'} onClick={() => setView('knowledge')} collapsed={!isSidebarOpen} />
        </nav>

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
