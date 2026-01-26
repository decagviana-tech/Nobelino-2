
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { SalesGoal, Book } from '../types';

const Dashboard: React.FC = () => {
  const [goals, setGoals] = useState<SalesGoal[]>([]);
  const [inventory, setInventory] = useState<Book[]>([]);
  
  const load = async () => {
    const g = await db.get('nobel_sales_goals') || [];
    const inv = await db.get('nobel_inventory') || [];
    setGoals(g);
    setInventory(inv);
  };

  useEffect(() => { load(); }, []);

  const today = new Date().toISOString().split('T')[0];
  const currentGoal = goals.find(g => g.date === today) || { actualSales: 0, minGoal: 0, superGoal: 0 };
  const percent = currentGoal.minGoal > 0 ? (currentGoal.actualSales / currentGoal.minGoal) * 100 : 0;

  return (
    <div className="p-8 bg-zinc-950 h-full overflow-y-auto custom-scrollbar">
      <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-8">Painel da Loja</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Vendas Hoje</p>
            <p className="text-6xl font-black text-white">R$ {currentGoal.actualSales.toLocaleString('pt-BR')}</p>
            <div className="mt-6 h-2 bg-zinc-800 rounded-full overflow-hidden">
               <div className="h-full bg-yellow-400" style={{ width: `${Math.min(100, percent)}%` }}></div>
            </div>
         </div>
         <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Estoque Total</p>
            <p className="text-6xl font-black text-white">{inventory.length}</p>
         </div>
      </div>
    </div>
  );
};
export default Dashboard;
