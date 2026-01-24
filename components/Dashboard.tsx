import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { SalesGoal, KnowledgeEntry } from '../types';
import Mascot from './Mascot';

const Dashboard: React.FC = () => {
  const [salesData, setSalesData] = useState<SalesGoal[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  const getTodayStr = () => {
    const now = new Date();
    return new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  };

  const [viewingDate, setViewingDate] = useState(getTodayStr());
  const [targetDate, setTargetDate] = useState(getTodayStr());
  const [minGoal, setMinGoal] = useState('');
  const [externalSearch, setExternalSearch] = useState('');

  const loadData = async () => {
    const data = await db.get('nobel_sales_goals') || [];
    const savedKnowledge = await db.get('nobel_knowledge_base') || [];
    const sorted = [...data].sort((a: any, b: any) => b.date.localeCompare(a.date));
    setSalesData(sorted);
    setKnowledge(savedKnowledge);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    window.addEventListener('nobel_usage_updated', loadData);
    return () => window.removeEventListener('nobel_usage_updated', loadData);
  }, []);

  const handleClearGoals = async () => {
    if (!confirm("⚠️ Isso irá resetar os valores de meta (R$) de todos os dias no histórico. As vendas reais não serão afetadas. Confirmar?")) return;
    const currentGoals = await db.get('nobel_sales_goals') || [];
    const resetGoals = currentGoals.map((g: any) => ({ ...g, minGoal: 0, superGoal: 0 }));
    await db.save('nobel_sales_goals', resetGoals);
    alert("Metas zeradas com sucesso!");
    loadData();
    window.dispatchEvent(new CustomEvent('nobel_usage_updated'));
  };

  const handleExternalDeepSearch = () => {
    if (!externalSearch.trim()) return;
    const term = externalSearch.trim();
    window.open(`https://www.cataventobr.com.br/busca?q=${encodeURIComponent(term)}`, '_blank');
    window.open(`https://www.ramalivros.com.br/busca?q=${encodeURIComponent(term)}`, '_blank');
    setExternalSearch('');
  };

  const handleSaveGoal = async () => {
    const goals = await db.get('nobel_sales_goals') || [];
    const index = goals.findIndex((g: any) => g.date === targetDate);
    const existing = index !== -1 ? goals[index] : { actualSales: 0 };

    const val = parseFloat(minGoal) || 0;
    const newEntry: SalesGoal = {
      id: index !== -1 ? goals[index].id : Date.now().toString(),
      date: targetDate,
      minGoal: val,
      superGoal: val * 1.2,
      actualSales: existing.actualSales || 0
    };

    const newGoals = [...goals];
    if (index !== -1) newGoals[index] = newEntry;
    else newGoals.push(newEntry);

    await db.save('nobel_sales_goals', newGoals);
    alert(`🎯 Meta de R$ ${val.toLocaleString('pt-BR')} gravada para ${new Date(targetDate + 'T12:00:00').toLocaleDateString()}! Nobelino já foi notificado.`);
    loadData();
    setMinGoal('');
    window.dispatchEvent(new CustomEvent('nobel_usage_updated'));
  };

  const currentDay = salesData.find(g => g.date === viewingDate) || { actualSales: 0, minGoal: 0, superGoal: 0, date: viewingDate };
  const percent = currentDay.minGoal > 0 ? (currentDay.actualSales / currentDay.minGoal) * 100 : 0;
  
  if (loading) return <div className="p-8 text-zinc-500 font-black uppercase text-[10px] animate-pulse">Carregando Balcão Nobel...</div>;

  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-zinc-950">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tighter text-white uppercase">Painel de Metas<span className="text-yellow-400">.</span></h2>
          <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Performance em tempo real</p>
        </div>
        
        <div className="flex flex-col gap-2 items-end">
           <div className="bg-zinc-900/50 p-4 rounded-3xl border border-zinc-800 flex items-center gap-4 shadow-2xl">
             <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Data:</p>
             <input type="date" value={viewingDate} onChange={e => setViewingDate(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-xs text-white outline-none font-bold focus:border-yellow-400 transition-colors" />
           </div>
           <button onClick={handleClearGoals} className="text-[8px] font-black text-zinc-800 hover:text-red-500 uppercase tracking-widest px-4 transition-colors">🗑️ Resetar Histórico de Metas</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="glass p-8 rounded-[40px] border border-zinc-800 relative overflow-hidden group">
          <div className={`absolute top-0 right-0 p-6 text-4xl opacity-10 ${percent >= 100 ? 'text-green-500' : 'text-zinc-500'}`}>🏆</div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Venda Realizada (Planilha)</p>
          <p className="text-3xl font-black text-white tracking-tight break-words">R$ {currentDay.actualSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <div className="mt-6 w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-1000 ${percent >= 100 ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-yellow-400'}`} style={{ width: `${Math.min(100, percent)}%` }}></div>
          </div>
          <p className="text-[9px] font-bold text-zinc-600 mt-3 uppercase tracking-widest">{percent.toFixed(1)}% atingida</p>
        </div>

        <div className="glass p-8 rounded-[40px] border border-zinc-800 bg-zinc-900/40">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Meta do Dia (Definida)</p>
          <p className="text-3xl font-black text-zinc-100 tracking-tight break-words">R$ {currentDay.minGoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className={`text-[9px] font-bold mt-3 uppercase tracking-widest ${currentDay.actualSales >= currentDay.minGoal ? 'text-green-500' : 'text-zinc-600'}`}>
            {currentDay.actualSales >= currentDay.minGoal ? 'META BATIDA! 🎉' : `Faltam: R$ ${Math.max(0, currentDay.minGoal - currentDay.actualSales).toLocaleString('pt-BR')}`}
          </p>
        </div>

        <div className="glass p-8 rounded-[40px] border border-zinc-800 bg-zinc-900/40">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Super Meta (120%)</p>
          <p className="text-3xl font-black text-blue-400 tracking-tight break-words">R$ {(currentDay.minGoal * 1.2).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-[9px] font-bold text-zinc-600 mt-3 uppercase tracking-widest italic opacity-60">Alvo de superação</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
           <div className="glass p-10 rounded-[56px] border border-zinc-800">
              <h3 className="font-black text-xl mb-8 flex items-center gap-3">
                 <span className="w-10 h-10 bg-yellow-400 text-black rounded-2xl flex items-center justify-center text-sm">🎯</span>
                 Definir Nova Meta
              </h3>
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-600 uppercase">Selecione o Dia de Trabalho</label>
                    <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-6 py-4 text-sm text-white focus:border-yellow-400 outline-none font-bold" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-600 uppercase">Valor da Meta de Vendas (R$)</label>
                    <input type="number" placeholder="Ex: 7500" value={minGoal} onChange={e => setMinGoal(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-6 py-4 text-sm text-white focus:border-yellow-400 outline-none font-bold" />
                 </div>
                 <button onClick={handleSaveGoal} className="w-full bg-white text-black py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-yellow-400 transition-all shadow-xl shadow-white/5 active:scale-95">
                    GRAVAR META NO NOBELINO
                 </button>
              </div>
           </div>
        </div>

        <div className="space-y-6">
           <div className="p-8 bg-yellow-400/5 border border-yellow-400/20 rounded-[48px] flex flex-col items-center justify-center gap-6 shadow-xl text-center">
              <div className="w-24 h-24"><Mascot mood="success" /></div>
              <div>
                <p className="text-[11px] font-black text-yellow-400 uppercase tracking-widest mb-2">O Nobelino está de olho!</p>
                <p className="text-xs text-zinc-400 leading-relaxed italic max-w-sm">
                  "Deca, eu já gravei na minha memória os valores que você definiu. Se me perguntar no chat, eu já sei exatamente quanto falta para batermos o recorde!"
                </p>
              </div>
           </div>
           
           <div className="glass p-8 rounded-[48px] border border-zinc-800 bg-blue-500/[0.03]">
              <h3 className="font-black text-sm mb-4 flex items-center gap-3 uppercase tracking-widest text-blue-400">
                 Busca Rápida de ISBN
              </h3>
              <div className="flex gap-3">
                 <input 
                   type="text" 
                   value={externalSearch}
                   onChange={e => setExternalSearch(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && handleExternalDeepSearch()}
                   placeholder="Consultar Distribuidor..." 
                   className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl px-6 py-3 text-xs text-white focus:border-blue-500 outline-none font-bold"
                 />
                 <button onClick={handleExternalDeepSearch} className="bg-blue-500 text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-400 transition-all">
                    BUSCAR
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;