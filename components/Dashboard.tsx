
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
    const normalizedValue = quickSaleValue.replace(',', '.');
    const amount = parseFloat(normalizedValue);

    if (!isNaN(amount) && amount > 0) {
      await db.updateDailySales(amount);
      setQuickSaleValue('');
      setIsQuickSelling(false);
      setShowSuccess(true);
      load();
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  return (
    <div className="p-8 bg-zinc-950 h-full overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Painel da Loja</h2>
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest italic">Gestão de Performance Nobel</p>
        </div>
        <div className="flex items-center gap-3">
           {isQuickSelling ? (
             <div className="flex items-center gap-2 bg-zinc-900 border border-yellow-400/50 p-1 rounded-xl animate-in fade-in zoom-in duration-200">
               <span className="text-zinc-500 text-[10px] font-black uppercase ml-3">R$</span>
               <input 
                 autoFocus
                 placeholder="0,00"
                 value={quickSaleValue}
                 onChange={e => setQuickSaleValue(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleQuickSaleSubmit()}
                 className="bg-transparent text-white text-sm font-bold w-24 outline-none px-2"
               />
               <button onClick={handleQuickSaleSubmit} className="bg-yellow-400 text-black px-3 py-1.5 rounded-lg text-[10px] font-black uppercase">OK</button>
               <button onClick={() => setIsQuickSelling(false)} className="text-zinc-500 px-3 text-xs">✕</button>
             </div>
           ) : (
             <button 
               onClick={() => setIsQuickSelling(true)}
               className={`px-6 py-3 rounded-xl font-black uppercase text-xs transition-all active:scale-95 shadow-lg ${showSuccess ? 'bg-green-500 text-white' : 'bg-yellow-400 text-black hover:bg-yellow-300'}`}
             >
               {showSuccess ? '✓ Lançado!' : '+ Lançar Venda'}
             </button>
           )}
           <button onClick={() => setIsEditingGoal(!isEditingGoal)} className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-4 py-3 rounded-xl text-[10px] font-black uppercase">Metas</button>
        </div>
      </div>

      {isEditingGoal && (
        <div className="mb-8 bg-zinc-900 border border-yellow-400/30 p-6 rounded-[24px] animate-in slide-in-from-top duration-300">
           <h3 className="text-white font-bold text-xs uppercase mb-4 tracking-widest">Configurar Metas de Hoje</h3>
           <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] text-zinc-500 uppercase font-black block mb-1">Meta Mínima (R$)</label>
                <input type="number" value={newMin} onChange={e => setNewMin(Number(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white outline-none focus:border-yellow-400" />
              </div>
              <div>
                <label className="text-[9px] text-zinc-500 uppercase font-black block mb-1">Super Meta (R$)</label>
                <input type="number" value={newSuper} onChange={e => setNewSuper(Number(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white outline-none focus:border-yellow-400" />
              </div>
           </div>
           <button onClick={handleSaveGoal} className="mt-4 w-full bg-zinc-800 text-yellow-400 py-4 rounded-xl font-black uppercase text-[10px]">Confirmar Metas</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800 relative overflow-hidden group">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Vendas Hoje</p>
            <p className="text-6xl font-black text-white tabular-nums">
              <span className="text-2xl text-zinc-600 mr-2">R$</span>
              {currentGoal.actualSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-10">
              <div className="flex justify-between mb-2">
                <p className="text-[10px] font-bold text-zinc-500 uppercase">Progresso: {percent.toFixed(1)}%</p>
                <p className="text-[10px] font-black text-yellow-400 uppercase">Alvo: R$ {currentGoal.minGoal}</p>
              </div>
              <div className="h-4 bg-zinc-950 rounded-full p-1 border border-zinc-800">
                 <div className="h-full bg-yellow-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, percent)}%` }}></div>
              </div>
            </div>
         </div>
         <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Estoque Total</p>
            <p className="text-6xl font-black text-white tabular-nums">{inventory.length.toLocaleString('pt-BR')}</p>
            <p className="text-[10px] text-zinc-500 font-bold uppercase mt-6 italic">Livros cadastrados em memória</p>
         </div>
      </div>
    </div>
  );
};
export default Dashboard;
