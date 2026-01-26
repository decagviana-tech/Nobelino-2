
import React, { useState, useEffect } from 'react';
import Mascot from './components/Mascot';
import ChatView from './components/ChatView';
import InventoryManager from './components/InventoryManager';
import KnowledgeManager from './components/KnowledgeManager';
import MemoryManager from './components/MemoryManager';
import EstimateManager from './components/EstimateManager';
import Dashboard from './components/Dashboard';
import { db } from './services/db';

type ViewMode = 'chat' | 'inventory' | 'knowledge' | 'memory' | 'estimates' | 'dashboard';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>('chat');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isApiActive, setIsApiActive] = useState(false);

  const checkApiKey = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setIsApiActive(hasKey);
    }
  };

  const handleOpenKeyDialog = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      await window.aistudio.openSelectKey();
      setIsApiActive(true);
    }
  };

  useEffect(() => {
    checkApiKey();
  }, []);

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} glass border-r border-zinc-800 transition-all duration-300 flex flex-col z-50`}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 shrink-0">
            <Mascot animated mood={isApiActive ? 'happy' : 'thinking'} />
          </div>
          {isSidebarOpen && (
            <div className="animate-in fade-in duration-500">
              <h1 className="font-black text-lg tracking-tighter text-white">NOBEL<span className="text-yellow-400">.</span></h1>
              <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Vendedor Digital</p>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-2 mt-4 overflow-y-auto custom-scrollbar">
          <NavItem icon="🦉" label="Balcão" active={view === 'chat'} onClick={() => setView('chat')} collapsed={!isSidebarOpen} />
          <NavItem icon="📊" label="Painel" active={view === 'dashboard'} onClick={() => setView('dashboard')} collapsed={!isSidebarOpen} />
          <NavItem icon="📝" label="Orçamentos" active={view === 'estimates'} onClick={() => setView('estimates')} collapsed={!isSidebarOpen} />
          <NavItem icon="📚" label="Estoque" active={view === 'inventory'} onClick={() => setView('inventory')} collapsed={!isSidebarOpen} />
          <NavItem icon="🧠" label="Treinar" active={view === 'knowledge'} onClick={() => setView('knowledge')} collapsed={!isSidebarOpen} />
          <NavItem icon="💾" label="Backup" active={view === 'memory'} onClick={() => setView('memory')} collapsed={!isSidebarOpen} />
        </nav>

        <div className="p-4 border-t border-zinc-800 space-y-3">
          {!isApiActive && isSidebarOpen && (
            <button 
              onClick={handleOpenKeyDialog}
              className="w-full py-3 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-xl text-[10px] font-black uppercase hover:bg-zinc-700 transition-all"
            >
              🔑 Conectar Chave
            </button>
          )}
          <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="w-full py-2 bg-zinc-900 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors text-zinc-500">
            {isSidebarOpen ? 'Recolher' : '→'}
          </button>
        </div>
      </aside>

      <main className="flex-1 relative overflow-hidden flex flex-col">
        {view === 'chat' && <ChatView />}
        {view === 'dashboard' && <Dashboard />}
        {view === 'estimates' && <EstimateManager />}
        {view === 'inventory' && <InventoryManager />}
        {view === 'knowledge' && <KnowledgeManager />}
        {view === 'memory' && <MemoryManager />}
      </main>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick, collapsed }: any) => (
  <button onClick={onClick} className={`relative w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all ${active ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'text-zinc-400 hover:bg-zinc-900'}`}>
    <span className="text-xl">{icon}</span>
    {!collapsed && <span className="font-bold text-sm whitespace-nowrap">{label}</span>}
  </button>
);

export default App;
