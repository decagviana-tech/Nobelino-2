
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { SalesGoal, Book } from '../types';

const Dashboard: React.FC = () => {
  const [goals, setGoals] = useState<SalesGoal[]>([]);
  const [inventory, setInventory] = useState<Book[]>([]);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [isQuickSelling, setIsQuickSelling] = useState(false);
  const [quickSaleValue, setQuickSaleValue] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  
  const [newMin, setNewMin] = useState(0);
  const [newSuper, setNewSuper] = useState(0);
  
  const load = async () => {
    const g = await db.get('nobel_sales_goals') || [];
    const inv = await db.get('nobel_inventory') || [];
    setGoals(g);
    setInventory(inv);

    const today = new Date().toISOString().split('T')[0];
    const todayGoal = g.find((goal: any) => goal.date === today);
    if (todayGoal) {
      setNewMin(todayGoal.minGoal);
      setNewSuper(todayGoal.superGoal);
    }
  };

  useEffect(() => { load(); }, []);

  const today = new Date().toISOString().split('T')[0];
  const currentGoal = goals.find(g => g.date === today) || { actualSales: 0, minGoal: 0, superGoal: 0 };
  const percent = currentGoal.minGoal > 0 ? (currentGoal.actualSales / currentGoal.minGoal) * 100 : 0;

  const handleSaveGoal = async () => {
    await db.setDailyGoal(newMin, newSuper);
    setIsEditingGoal(false);
    load();
  };

  const handleQuickSaleSubmit = async () => {
    const amount = parseFloat(quickSaleValue.replace(',', '.'));
    if (!isNaN(amount) && amount > 0) {
      await db.updateDailySales(amount);
      setQuickSaleValue('');
      setIsQuickSelling(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      load();
    }
  };

  return (
    <div className="p-8 bg-zinc-950 h-full overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-start mb-10 border-b border-white/5 pb-8">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">Painel de Vendas</h2>
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest italic tracking-[0.2em]">Gestão de Performance Livraria Nobel</p>
        </div>
        <div className="flex items-center gap-3">
           {isQuickSelling ? (
             <div className="flex items-center gap-2 bg-zinc-900 border border-yellow-400/50 p-1.5 rounded-2xl animate-in fade-in zoom-in duration-200 shadow-2xl">
               <span className="text-zinc-600 text-[10px] font-black uppercase ml-4">R$</span>
               <input 
                 autoFocus
                 placeholder="0,00"
                 value={quickSaleValue}
                 onChange={e => setQuickSaleValue(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleQuickSaleSubmit()}
                 className="bg-transparent text-white text-base font-black w-28 outline-none px-2"
               />
               <button onClick={handleQuickSaleSubmit} className="bg-yellow-400 text-black px-5 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-yellow-300 transition-all shadow-lg">Confirmar</button>
               <button onClick={() => setIsQuickSelling(false)} className="text-zinc-500 px-4 text-xs hover:text-white transition-colors">✕</button>
             </div>
           ) : (
             <button 
               onClick={() => setIsQuickSelling(true)}
               className={`px-8 py-4 rounded-2xl font-black uppercase text-[10px] transition-all active:scale-95 shadow-xl flex items-center gap-3 ${showSuccess ? 'bg-green-500 text-white shadow-green-500/20' : 'bg-yellow-400 text-black hover:bg-yellow-300 shadow-yellow-400/10'}`}
             >
               {showSuccess ? '✓ Venda Registrada!' : '🚀 Lançar Venda'}
             </button>
           )}
           <button onClick={() => setIsEditingGoal(!isEditingGoal)} className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-6 py-4 rounded-2xl text-[10px] font-black uppercase hover:border-zinc-500 transition-all">Definir Metas</button>
        </div>
      </div>

      {isEditingGoal && (
        <div className="mb-10 bg-zinc-900/40 border border-yellow-400/20 p-8 rounded-[40px] animate-in slide-in-from-top duration-400 shadow-2xl">
           <h3 className="text-white font-bold text-[10px] uppercase mb-8 tracking-[0.3em] flex items-center gap-3">
             <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse"></span>
             Metas do Dia • {new Date().toLocaleDateString('pt-BR')}
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-[10px] text-zinc-600 uppercase font-black tracking-widest block ml-2">Meta Mínima Esperada</label>
                <input type="number" value={newMin} onChange={e => setNewMin(Number(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 p-5 rounded-2xl text-white outline-none focus:border-yellow-400 font-black text-lg" />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] text-zinc-600 uppercase font-black tracking-widest block ml-2">Super Meta Nobel</label>
                <input type="number" value={newSuper} onChange={e => setNewSuper(Number(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 p-5 rounded-2xl text-white outline-none focus:border-yellow-400 font-black text-lg" />
              </div>
           </div>
           <button onClick={handleSaveGoal} className="mt-10 w-full bg-zinc-800 text-yellow-400 py-5 rounded-[24px] font-black uppercase text-[10px] hover:bg-zinc-700 transition-all border border-zinc-700 tracking-widest">Salvar Objetivos Diários</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="bg-zinc-900/50 p-10 rounded-[48px] border border-zinc-800 lg:col-span-2 relative overflow-hidden group shadow-2xl shadow-black/40">
            <div className="absolute -right-20 -top-20 w-80 h-80 bg-yellow-400/5 rounded-full blur-[100px] group-hover:bg-yellow-400/10 transition-all duration-1000"></div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em] mb-6 italic">Faturamento Consolidado Hoje</p>
            <div className="flex items-baseline gap-4">
              <span className="text-3xl text-zinc-700 font-black italic">R$</span>
              <p className="text-8xl font-black text-white tabular-nums tracking-tighter leading-none">
                {currentGoal.actualSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            
            <div className="mt-16">
              <div className="flex justify-between mb-4 px-2">
                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Meta: {percent.toFixed(1)}%</p>
                <p className="text-[10px] font-black text-yellow-400 uppercase tracking-widest">Faltam R$ {Math.max(0, currentGoal.minGoal - currentGoal.actualSales).toLocaleString('pt-BR')}</p>
              </div>
              <div className="h-5 bg-zinc-950 rounded-full p-1.5 border border-zinc-800 shadow-inner">
                 <div className="h-full bg-yellow-400 rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(250,204,21,0.3)] relative overflow-hidden" style={{ width: `${Math.min(100, percent)}%` }}>
                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                 </div>
              </div>
            </div>
         </div>
         
         <div className="bg-zinc-900/50 p-10 rounded-[48px] border border-zinc-800 flex flex-col justify-center items-center text-center shadow-2xl">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em] mb-4 italic">Acervo Ativo</p>
            <p className="text-8xl font-black text-white tabular-nums tracking-tighter leading-none">{inventory.length.toLocaleString('pt-BR')}</p>
            <div className="mt-10 p-5 bg-zinc-950/50 rounded-3xl border border-zinc-800 w-full">
               <p className="text-[9px] text-zinc-500 font-black uppercase leading-relaxed tracking-widest">Nobelino Intel v1.5</p>
            </div>
         </div>
      </div>
    </div>
  );
};
export default Dashboard;
