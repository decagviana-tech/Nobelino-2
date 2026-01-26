
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

  useEffect(() => {
    load();
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const currentGoal = goals.find(g => g.date === today) || { actualSales: 0, minGoal: 0, superGoal: 0 };
  const percent = currentGoal.minGoal > 0 ? (currentGoal.actualSales / currentGoal.minGoal) * 100 : 0;
  const lowStock = inventory.filter(b => b.stockCount > 0 && b.stockCount <= 3);

  const handleSaveGoal = async () => {
    await db.setDailyGoal(newMin, newSuper);
    setIsEditingGoal(false);
    load();
  };

  const handleQuickSaleSubmit = async () => {
    // Trata vírgula brasileira para ponto decimal
    const normalizedValue = quickSaleValue.replace(',', '.');
    const amount = parseFloat(normalizedValue);

    if (!isNaN(amount) && amount > 0) {
      await db.updateDailySales(amount);
      setQuickSaleValue('');
      setIsQuickSelling(false);
      setShowSuccess(true);
      load();
      setTimeout(() => setShowSuccess(false), 3000);
    } else {
      alert("Por favor, insira um valor válido (ex: 50,00)");
    }
  };

  return (
    <div className="p-8 bg-zinc-950 h-full overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Painel da Loja</h2>
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Acompanhamento de Vendas e Estoque</p>
        </div>
        <div className="flex items-center gap-3">
           {isQuickSelling ? (
             <div className="flex items-center gap-2 bg-zinc-900 border border-yellow-400/50 p-1 rounded-xl animate-in fade-in zoom-in duration-200">
               <span className="text-zinc-500 text-[10px] font-black uppercase ml-3">R$</span>
               <input 
                 autoFocus
                 type="text"
                 placeholder="0,00"
                 value={quickSaleValue}
                 onChange={e => setQuickSaleValue(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleQuickSaleSubmit()}
                 className="bg-transparent text-white text-sm font-bold w-24 outline-none px-2"
               />
               <button 
                 onClick={handleQuickSaleSubmit}
                 className="bg-yellow-400 text-black px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-yellow-300 transition-all"
               >
                 OK
               </button>
               <button 
                 onClick={() => setIsQuickSelling(false)}
                 className="text-zinc-500 px-3 text-xs hover:text-white"
               >
                 ✕
               </button>
             </div>
           ) : (
             <button 
               onClick={() => setIsQuickSelling(true)}
               className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black uppercase text-xs transition-all active:scale-95 shadow-lg ${
                 showSuccess 
                 ? 'bg-green-500 text-white shadow-green-500/20' 
                 : 'bg-yellow-400 text-black shadow-yellow-400/10 hover:bg-yellow-300'
               }`}
             >
               {showSuccess ? '✓ Lançado!' : '+ Lançar Venda'}
             </button>
           )}
           
           <button 
             onClick={() => setIsEditingGoal(!isEditingGoal)}
             className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:border-zinc-600 transition-all"
           >
             {isEditingGoal ? 'Fechar' : 'Metas'}
           </button>
        </div>
      </div>

      {isEditingGoal && (
        <div className="mb-8 bg-zinc-900 border border-yellow-400/30 p-6 rounded-[24px] animate-in slide-in-from-top duration-300">
           <h3 className="text-white font-bold text-xs uppercase mb-4 tracking-widest">Configurar Metas de Hoje</h3>
           <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] text-zinc-500 uppercase font-black block mb-1">Meta Mínima (R$)</label>
                <input 
                  type="number" 
                  value={newMin} 
                  onChange={e => setNewMin(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="text-[9px] text-zinc-500 uppercase font-black block mb-1">Super Meta (R$)</label>
                <input 
                  type="number" 
                  value={newSuper} 
                  onChange={e => setNewSuper(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white outline-none focus:border-yellow-400"
                />
              </div>
           </div>
           <button 
             onClick={handleSaveGoal}
             className="mt-4 w-full bg-zinc-800 text-yellow-400 py-4 rounded-xl font-black uppercase text-[10px] hover:bg-zinc-700 transition-all"
           >
             Confirmar Metas de {new Date().toLocaleDateString('pt-BR')}
           </button>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {/* Card de Vendas */}
         <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800 md:col-span-2 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-32 h-32 bg-yellow-400/5 rounded-full blur-3xl group-hover:bg-yellow-400/10 transition-all"></div>
            
            <div className="flex justify-between items-start mb-4">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Vendas Realizadas (Hoje)</p>
              <div className="flex gap-2">
                {currentGoal.actualSales >= currentGoal.superGoal && currentGoal.superGoal > 0 && (
                  <span className="bg-green-500 text-white text-[9px] font-black px-2 py-1 rounded-md uppercase animate-bounce">Super Meta Batida! 🏆</span>
                )}
                <span className="bg-zinc-800 text-zinc-400 text-[9px] font-black px-2 py-1 rounded-md uppercase">Atualizado agora</span>
              </div>
            </div>
            
            <p className="text-6xl font-black text-white tabular-nums tracking-tighter">
              <span className="text-2xl text-zinc-600 mr-2">R$</span>
              {currentGoal.actualSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            
            <div className="mt-10">
              <div className="flex justify-between mb-2">
                <p className="text-[10px] font-bold text-zinc-500 uppercase">Progresso da Meta</p>
                <p className="text-[10px] font-black text-white uppercase">{percent.toFixed(1)}%</p>
              </div>
              <div className="h-5 bg-zinc-950 rounded-full p-1 border border-zinc-800">
                 <div 
                   className="h-full bg-yellow-400 rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(250,204,21,0.3)] relative" 
                   style={{ width: `${Math.min(100, percent)}%` }}
                 >
                    {percent > 5 && <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse"></div>}
                 </div>
              </div>
            </div>
            
            <div className="flex justify-between mt-4">
              <p className="text-[10px] font-bold text-zinc-600 uppercase">Alvo: R$ {currentGoal.minGoal.toLocaleString('pt-BR')}</p>
              <p className="text-[10px] font-black text-yellow-400 uppercase">
                {currentGoal.actualSales < currentGoal.minGoal 
                  ? `Faltam R$ ${(currentGoal.minGoal - currentGoal.actualSales).toLocaleString('pt-BR')}`
                  : 'Meta Batida! 🦉'}
              </p>
            </div>
         </div>

         {/* Card de Estoque Crítico */}
         <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800 flex flex-col shadow-2xl shadow-black">
            <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              Atenção: Estoque Baixo
            </p>
            <div className="space-y-4 flex-1 max-h-[180px] overflow-y-auto custom-scrollbar pr-2">
              {lowStock.length > 0 ? lowStock.map(b => (
                <div key={b.id} className="border-b border-zinc-800 pb-3 last:border-0">
                  <p className="text-xs font-bold text-zinc-200 truncate">{b.title}</p>
                  <p className="text-[9px] text-zinc-500 font-black uppercase mt-1">
                    ISBN: {b.isbn} <span className="text-red-400 ml-2">({b.stockCount} un)</span>
                  </p>
                </div>
              )) : (
                <div className="flex flex-col items-center justify-center h-full opacity-30 gap-3 py-4">
                  <span className="text-3xl">📦</span>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase text-center">Tudo em ordem com o estoque.</p>
                </div>
              )}
            </div>
         </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900/50 p-6 rounded-[28px] border border-zinc-800 hover:border-zinc-700 transition-all">
           <div className="flex justify-between items-center mb-4">
             <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">🏆 Status da Super Meta</h4>
             {currentGoal.superGoal > 0 && (
               <span className="text-[10px] font-black text-zinc-500">R$ {currentGoal.superGoal.toLocaleString('pt-BR')}</span>
             )}
           </div>
           <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner transition-all ${currentGoal.actualSales >= currentGoal.superGoal && currentGoal.superGoal > 0 ? 'bg-yellow-400 animate-bounce' : 'bg-zinc-800 text-zinc-600'}`}>
                {currentGoal.actualSales >= currentGoal.superGoal && currentGoal.superGoal > 0 ? '🔥' : '🏆'}
              </div>
              <div className="flex-1">
                <div className="h-2 bg-zinc-950 rounded-full mb-2 overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-1000" 
                    style={{ width: `${Math.min(100, currentGoal.superGoal > 0 ? (currentGoal.actualSales / currentGoal.superGoal) * 100 : 0)}%` }}
                  ></div>
                </div>
                <p className="text-[10px] text-zinc-500 font-bold uppercase">
                  {currentGoal.superGoal > 0 
                    ? currentGoal.actualSales >= currentGoal.superGoal 
                      ? 'Parabéns! Super Meta Concluída.' 
                      : `Restam R$ ${Math.max(0, currentGoal.superGoal - currentGoal.actualSales).toLocaleString('pt-BR')} para o prêmio.`
                    : 'Defina uma Super Meta para começar.'}
                </p>
              </div>
           </div>
        </div>
        <div className="bg-zinc-900/50 p-6 rounded-[28px] border border-zinc-800 flex items-center justify-center group overflow-hidden relative">
           <div className="absolute inset-0 bg-yellow-400/0 group-hover:bg-yellow-400/5 transition-all"></div>
           <div className="text-center z-10">
             <p className="text-[10px] text-zinc-600 font-black uppercase tracking-[0.25em]">Nobelino Sales Intel v1.2</p>
             <p className="text-[8px] text-zinc-700 font-bold uppercase mt-1">Conectado ao Banco de Dados Nobel</p>
           </div>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
