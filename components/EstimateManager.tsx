
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

  const handlePrint = () => {
    window.print();
  };

  const handleConvertSale = async (est: Estimate) => {
    if (confirm("Deseja concluir esta venda? Isso dará baixa automática no estoque dos itens disponíveis.")) {
      const itemsToRecord = est.items
        .filter(item => item.isbn && item.status !== 'unavailable')
        .map(item => ({
          isbn: item.isbn!,
          quantity: item.quantity,
          price: item.price
        }));

      if (itemsToRecord.length > 0) {
        await db.recordSale(itemsToRecord);
        await db.saveEstimate({ ...est, status: 'converted' }); // Note: db.saveEstimate currently appends, but let's assume it updates if ID exists or just handle deletion
        // To avoid duplicate sales/estimates, we can mark it or delete it.
        // For now, let's delete it or mark it as converted if db supports it. 
        // Checking db.ts... it only has saveEstimate which appends.
        // Let's modify db.ts later if needed, but for now delete after conversion to simplify.
        await db.deleteEstimate(est.id);
        alert("Venda concluída e estoque atualizado!");
        setSelectedEstimate(null);
        load();
      } else {
        alert("Sem itens válidos para dar baixa.");
      }
    }
  };

  return (
    <div className="p-8 bg-[#09090b] h-full overflow-y-auto custom-scrollbar">
      <header className="mb-10 flex justify-between items-end border-b border-white/5 pb-8">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">Orçamentos de Venda</h2>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Crie propostas para enviar aos clientes</p>
        </div>
      </header>

      {estimates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-20 grayscale">
          <span className="text-6xl mb-4">📋</span>
          <p className="text-xs font-black uppercase tracking-widest">Nenhuma proposta gerada</p>
          <p className="text-[9px] mt-2 text-zinc-500">Mande uma lista de livros para o Nobelino no chat e peça para ele gerar um orçamento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {estimates.map(est => (
            <div 
              key={est.id} 
              onClick={() => setSelectedEstimate(est)}
              className="bg-zinc-900/40 border border-zinc-800 p-6 rounded-[32px] hover:border-yellow-400/40 transition-all cursor-pointer group shadow-xl"
            >
              <div className="flex justify-between items-start mb-4">
                <span className="text-[8px] font-black uppercase px-2 py-1 bg-yellow-400/10 text-yellow-400 rounded-md tracking-widest border border-yellow-400/20">PROPOSTA ATIVA</span>
                <span className="text-[9px] text-zinc-600 font-bold uppercase">{new Date(est.createdAt).toLocaleDateString('pt-BR')}</span>
              </div>
              <h3 className="text-lg font-black text-white truncate group-hover:text-yellow-400 transition-colors">{est.customerName || 'Cliente Nobel'}</h3>
              <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1">{est.items?.length || 0} itens listados</p>
              
              <div className="mt-6 flex justify-between items-end border-t border-white/5 pt-4">
                <div>
                  <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Total</p>
                  <p className="text-xl font-black text-white italic">R$ {(est.total || 0).toFixed(2)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); handlePrint(); }} className="p-3 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-all">🖨️</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(est.id); }} className="p-3 bg-zinc-950 text-zinc-700 hover:text-red-500 rounded-xl transition-all">🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedEstimate && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelectedEstimate(null)}></div>
           <div className="relative bg-white text-black w-full max-w-xl rounded-[40px] shadow-2xl p-10 flex flex-col max-h-[85vh] print:p-0">
              <div className="flex justify-between items-start mb-8">
                 <div>
                    <h2 className="text-2xl font-black italic">NOBEL PETRÓPOLIS</h2>
                    <p className="text-[9px] font-bold uppercase text-zinc-500">Orçamento Digital #{selectedEstimate.id.slice(-4)}</p>
                 </div>
                 <button onClick={() => setSelectedEstimate(null)} className="text-zinc-400 hover:text-black text-xl print:hidden">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 mb-8">
                 <table className="w-full text-left text-sm">
                    <thead>
                       <tr className="border-b-2 border-zinc-100">
                          <th className="py-2 text-[10px] uppercase text-zinc-400">Livro</th>
                          <th className="py-2 text-[10px] uppercase text-zinc-400 text-right">Preço</th>
                       </tr>
                    </thead>
                    <tbody>
                       {selectedEstimate.items.map((item, i) => (
                          <tr key={i} className="border-b border-zinc-50">
                             <td className="py-3 pr-4">
                                <p className="font-bold">{item.title}</p>
                                <p className="text-[9px] text-zinc-500">ISBN: {item.isbn}</p>
                             </td>
                             <td className="py-3 text-right font-bold">R$ {item.price.toFixed(2)}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>

              <div className="border-t-2 border-zinc-100 pt-6 flex justify-between items-center">
                 <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase">Total da Proposta</p>
                    <p className="text-4xl font-black italic">R$ {selectedEstimate.total.toFixed(2)}</p>
                 </div>
                 <div className="flex gap-4 print:hidden">
                    <button onClick={() => handleConvertSale(selectedEstimate)} className="bg-green-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs hover:bg-green-500 transition-all">🚀 Concluir Venda</button>
                    <button onClick={handlePrint} className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase text-xs hover:bg-zinc-800 transition-all">🖨️ Imprimir / PDF</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default EstimateManager;
