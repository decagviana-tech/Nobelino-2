
import React, { useState } from 'react';
import { db } from '../services/db';
import Mascot from './Mascot';

const InvoiceProcessor: React.FC = () => {
  const [loading, setLoading] = useState(false);

  return (
    <div className="p-8 bg-zinc-950 h-full flex flex-col items-center justify-center">
      <div className="max-w-xl w-full text-center space-y-8">
        <div className="w-20 h-20 bg-yellow-400/10 rounded-3xl flex items-center justify-center mx-auto text-4xl">📊</div>
        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Baixa de Vendas</h2>
        <p className="text-zinc-500 text-sm">Selecione o relatório de vendas do dia para atualizar o estoque e as metas automaticamente.</p>
        
        <label className="block border-2 border-dashed border-zinc-800 hover:border-yellow-400 rounded-[40px] p-16 transition-all cursor-pointer">
           <p className="text-zinc-400 font-bold uppercase text-xs">Clique para selecionar planilha</p>
           <input type="file" className="hidden" accept=".xlsx,.xls,.csv" />
        </label>
      </div>
    </div>
  );
};
export default InvoiceProcessor;
