
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { SalesGoal, KnowledgeEntry } from '../types';
import Mascot from './Mascot';

const Dashboard: React.FC = () => {
  const [salesData, setSalesData] = useState<SalesGoal[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [viewingDate, setViewingDate] = useState(new Date().toISOString().split('T')[0]);
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [minGoal, setMinGoal] = useState('');

  const loadData = async () => {
    const data = await db.get('nobel_sales_goals') || [];
    const savedKnowledge = await db.get('nobel_knowledge_base') || [];
    const sorted = [...data].sort((a: any, b: any) => b.date.localeCompare(a.date));
    
    setSalesData(sorted);
    setKnowledge(savedKnowledge);
    
    if (sorted.length > 0 && !data.find((g: any) => g.date === viewingDate)) {
      setViewingDate(sorted[0].date);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    window.addEventListener('nobel_usage_updated', loadData);
    return () => window.removeEventListener('nobel_usage_updated', loadData);
  }, []);

  const handleSaveGoal = async () => {
    const goals = await db.get('nobel_sales_goals') || [];
    const index = goals.findIndex((g: any) => g.date === targetDate);
    
    const existing = index !== -1 ? goals[index] : { actualSales: 0, superGoal: 0 };

    const newEntry: SalesGoal = {
      id: index !== -1 ? goals[index].id : Date.now().toString(),
      date: targetDate,
      minGoal: parseFloat(minGoal) || 0,
      superGoal: (parseFloat(minGoal) || 0) * 1.2,
      actualSales: existing.actualSales
    };

    const newGoals = [...goals];
    if (index !== -1) newGoals[index] = newEntry;
    else newGoals.push(newEntry);

    await db.save('nobel_sales_goals', newGoals);
    alert(`🎯 Meta de ${new Date(targetDate + 'T12:00:00').toLocaleDateString()} definida!`);
    loadData();
    setMinGoal('');
  };

  const currentDay = salesData.find(g => g.date === viewingDate) || { actualSales: 0, minGoal: 0, superGoal: 0, date: viewingDate };
  const percent = currentDay.minGoal > 0 ? (currentDay.actualSales / currentDay.minGoal) * 100 : 0;
  
  const distributors = knowledge.filter(k => 
    k.content.toLowerCase().includes('http') && 
    (k.topic.toLowerCase().includes('distribuidor') || k.topic.toLowerCase().includes('catavento') || k.topic.toLowerCase().includes('ramalivros'))
  );

  if (loading) return <div className="p-8 text-zinc-500 font-black uppercase text-[10px] animate-pulse">Sincronizando Balcão...</div>;

  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-zinc-950">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tighter text-white uppercase">Painel de Metas<span className="text-yellow-400">.</span></h2>
          <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Gestão de Performance Livraria Nobel</p>
        </div>
        
        <div className="bg-zinc-900/50 p-4 rounded-3xl border border-zinc-800 flex items-center gap-4">
          <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Visualizar Dia:</p>
          <input 
            type="date" 
            value={viewingDate} 
            onChange={e => setViewingDate(e.target.value)}
            className="bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-xs text-white focus:border-yellow-400 outline-none font-bold"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="glass p-10 rounded-[48px] border border-zinc-800 bg-zinc-900/40 relative overflow-hidden">
          <div className={`absolute top-0 right-0 p-6 text-4xl opacity-10 ${percent >= 100 ? 'text-green-500' : 'text-zinc-500'}`}>🏆</div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Venda Realizada</p>
          <p className="text-4xl font-black text-white tracking-tight">R$ {currentDay.actualSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <div className="mt-6 w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-1000 ${percent >= 100 ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-yellow-400'}`} style={{ width: `${Math.min(100, percent)}%` }}></div>
          </div>
          <p className="text-[9px] font-bold text-zinc-600 mt-3 uppercase tracking-widest">{percent.toFixed(1)}% da meta atingida</p>
        </div>

        <div className="glass p-10 rounded-[48px] border border-zinc-800 bg-zinc-900/40">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Meta do Dia</p>
          <p className="text-4xl font-black text-zinc-100 tracking-tight">R$ {currentDay.minGoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-[9px] font-bold text-zinc-600 mt-3 uppercase tracking-widest">Faltam: R$ {Math.max(0, currentDay.minGoal - currentDay.actualSales).toLocaleString('pt-BR')}</p>
        </div>

        <div className="glass p-10 rounded-[48px] border border-zinc-800 bg-zinc-900/40">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Super Meta (120%)</p>
          <p className="text-4xl font-black text-blue-400 tracking-tight">R$ {(currentDay.minGoal * 1.2).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-[9px] font-bold text-zinc-600 mt-3 uppercase tracking-widest">Prêmio por superação</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass p-10 rounded-[56px] border border-zinc-800 bg-zinc-900/20">
           <h3 className="font-black text-xl mb-8 flex items-center gap-3">
              <span className="w-10 h-10 bg-yellow-400 text-black rounded-2xl flex items-center justify-center text-sm">🎯</span>
              Definir Nova Meta
           </h3>
           <div className="space-y-6">
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-zinc-600 uppercase">Selecione o Dia</label>
                 <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-6 py-4 text-sm text-white focus:border-yellow-400 outline-none font-bold" />
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-zinc-600 uppercase">Valor da Meta (R$)</label>
                 <input type="number" placeholder="0,00" value={minGoal} onChange={e => setMinGoal(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-6 py-4 text-sm text-white focus:border-yellow-400 outline-none font-bold" />
              </div>
              <button onClick={handleSaveGoal} className="w-full bg-white text-black py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-yellow-400 transition-all shadow-xl shadow-white/5 active:scale-95">
                 Gravar Meta de Loja
              </button>
           </div>
        </div>

        <div className="space-y-6">
           <div className="glass p-8 rounded-[48px] border border-zinc-800">
              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                <span className="w-8 h-8 bg-zinc-800 rounded-xl flex items-center justify-center text-xs">🔗</span>
                Acesso Rápido Distribuidores
              </h4>
              <div className="grid grid-cols-1 gap-3">
                 {distributors.length === 0 ? (
                   <p className="text-[10px] text-zinc-600 font-bold uppercase p-4 border border-dashed border-zinc-800 rounded-2xl">
                     Nenhum link cadastrado em Regras Comerciais.
                   </p>
                 ) : (
                   distributors.map(d => (
                     <a 
                       key={d.id} 
                       href={d.content.match(/https?:\/\/[^\s]+/)?.[0]} 
                       target="_blank" 
                       rel="noreferrer"
                       className="p-5 bg-zinc-950 border border-zinc-800 rounded-3xl flex justify-between items-center group hover:border-blue-500 transition-all"
                     >
                        <span className="text-[11px] font-black text-zinc-400 group-hover:text-white uppercase">{d.topic}</span>
                        <span className="text-xs group-hover:translate-x-1 transition-transform">↗️</span>
                     </a>
                   ))
                 )}
              </div>
           </div>

           <div className="p-8 bg-yellow-400/5 border border-yellow-400/20 rounded-[48px] flex items-center gap-6">
              <div className="w-20 h-20 shrink-0"><Mascot mood="happy" /></div>
              <div>
                <p className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-1">Dica do Nobelino</p>
                <p className="text-xs text-zinc-400 leading-relaxed italic">
                  "O segredo da super meta está na venda casada! Sempre que um cliente pedir um livro de ficção, eu vou sugerir um clássico Nobel para acompanhar."
                </p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
