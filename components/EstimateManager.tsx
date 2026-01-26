
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Estimate } from '../types';

const EstimateManager: React.FC = () => {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);

  const load = async () => {
    const data = await db.get('nobel_estimates') || [];
    setEstimates(data);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (confirm("Deseja excluir este orçamento?")) {
      await db.deleteEstimate(id);
      load();
    }
  };

  return (
    <div className="p-8 bg-[#09090b] h-full overflow-y-auto custom-scrollbar">
      <header className="mb-10 flex justify-between items-end border-b border-white/5 pb-8">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">Central de Orçamentos</h2>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Gestão de Propostas Nobel</p>
        </div>
      </header>

      {estimates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-20 grayscale">
          <span className="text-6xl mb-4">📝</span>
          <p className="text-xs font-black uppercase tracking-widest">Nenhum orçamento salvo</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {estimates.map(est => (
            <div 
              key={est.id} 
              onClick={() => setSelectedEstimate(est)}
              className="bg-zinc-900/40 border border-zinc-800 p-6 rounded-[32px] hover:border-yellow-400/40 transition-all cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-4">
                <span className="text-[8px] font-black uppercase px-2 py-1 bg-blue-500/10 text-blue-400 rounded-md tracking-widest border border-blue-500/20">PENDENTE</span>
                <span className="text-[9px] text-zinc-600 font-bold uppercase">{new Date(est.createdAt).toLocaleDateString('pt-BR')}</span>
              </div>
              <h3 className="text-lg font-black text-white truncate group-hover:text-yellow-400 transition-colors">{est.customerName}</h3>
              <div className="mt-6 flex justify-between items-end border-t border-white/5 pt-4">
                <div>
                  <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Total</p>
                  <p className="text-xl font-black text-white italic">R$ {est.total.toFixed(2)}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(est.id); }} className="p-3 bg-zinc-950 text-zinc-700 hover:text-red-500 rounded-xl transition-all">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EstimateManager;
