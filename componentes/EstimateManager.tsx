
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

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm("Deseja excluir este orçamento?")) {
      await db.deleteEstimate(id);
      load();
    }
  };

  const handlePrint = () => {
    window.print();
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
          <p className="text-[9px] mt-2">Mande uma lista para o Nobelino no chat para criar um.</p>
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
                <span className="text-[8px] font-black uppercase px-2 py-1 bg-blue-500/10 text-blue-400 rounded-md tracking-widest border border-blue-500/20">
                  {est.status === 'pending' ? 'PENDENTE' : 'CONVERTIDO'}
                </span>
                <span className="text-[9px] text-zinc-600 font-bold uppercase">{new Date(est.createdAt).toLocaleDateString('pt-BR')}</span>
              </div>
              <h3 className="text-lg font-black text-white truncate group-hover:text-yellow-400 transition-colors">{est.customerName}</h3>
              <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1">{est.items.length} itens no carrinho</p>
              
              <div className="mt-6 flex justify-between items-end border-t border-white/5 pt-4">
                <div>
                  <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Total da Proposta</p>
                  <p className="text-xl font-black text-white italic">R$ {est.total.toFixed(2)}</p>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDelete(est.id); }}
                  className="p-3 bg-zinc-950 text-zinc-700 hover:text-red-500 rounded-xl transition-all"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedEstimate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelectedEstimate(null)}></div>
          <div className="relative bg-white text-zinc-900 w-full max-w-2xl rounded-[40px] shadow-2xl p-12 overflow-hidden max-h-[90vh] flex flex-col print:m-0 print:p-0 print:w-full print:max-w-none print:shadow-none print:rounded-none">
            
            <div className="flex justify-between items-start mb-10 print:mb-6">
              <div>
                <h1 className="text-2xl font-black italic tracking-tighter">LIVRARIA NOBEL<span className="text-yellow-500">.</span></h1>
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Orçamento de Venda</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-zinc-900 uppercase">Proposta #{selectedEstimate.id.slice(-6)}</p>
                <p className="text-[9px] text-zinc-500 uppercase">{new Date(selectedEstimate.createdAt).toLocaleString('pt-BR')}</p>
              </div>
            </div>

            <div className="mb-8 p-6 bg-zinc-50 rounded-2xl border border-zinc-100 flex justify-between">
              <div>
                <p className="text-[8px] font-black text-zinc-400 uppercase mb-1">Cliente</p>
                <p className="font-bold">{selectedEstimate.customerName}</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black text-zinc-400 uppercase mb-1">Vendedor</p>
                <p className="font-bold">{selectedEstimate.sellerName}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 mb-8">
              <table className="w-full text-left">
                <thead className="border-b-2 border-zinc-100">
                  <tr>
                    <th className="py-4 text-[9px] font-black uppercase text-zinc-400">Título / ISBN</th>
                    <th className="py-4 text-[9px] font-black uppercase text-zinc-400 text-center">Status</th>
                    <th className="py-4 text-[9px] font-black uppercase text-zinc-400 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {selectedEstimate.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-4">
                        <p className="font-bold text-sm">{item.title}</p>
                        <p className="text-[9px] text-zinc-500 uppercase font-black">ISBN: {item.isbn || 'N/A'}</p>
                      </td>
                      <td className="py-4 text-center">
                        <span className={`text-[8px] font-black px-2 py-1 rounded-md uppercase border ${
                          item.status === 'available' 
                          ? 'bg-green-500/10 text-green-600 border-green-500/20' 
                          : 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                        }`}>
                          {item.status === 'available' ? 'Estoque' : 'Encomenda'}
                        </span>
                      </td>
                      <td className="py-4 text-right font-bold tabular-nums">
                        R$ {item.price.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-8 border-t-2 border-zinc-900 flex justify-between items-end">
              <div className="print:hidden flex gap-4">
                <button 
                  onClick={() => setSelectedEstimate(null)}
                  className="px-6 py-3 rounded-2xl border border-zinc-200 text-zinc-500 font-black uppercase text-[10px] hover:bg-zinc-50 transition-all"
                >
                  Voltar
                </button>
                <button 
                  onClick={handlePrint}
                  className="px-8 py-4 rounded-2xl bg-zinc-900 text-white font-black uppercase text-[10px] hover:bg-black transition-all shadow-xl shadow-black/10"
                >
                  🖨️ Imprimir Orçamento
                </button>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-zinc-400 uppercase mb-1">Valor Total</p>
                <p className="text-4xl font-black text-zinc-900 italic tracking-tighter">R$ {selectedEstimate.total.toFixed(2)}</p>
              </div>
            </div>

            <p className="mt-8 text-[8px] text-zinc-400 text-center font-bold uppercase tracking-widest">
              Validade da proposta: 7 dias • Sujeito a alteração de estoque nos distribuidores
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EstimateManager;
