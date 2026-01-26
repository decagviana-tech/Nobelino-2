
import React, { useState } from 'react';
import { db } from '../services/db';
import * as XLSX from 'xlsx';

const InvoiceProcessor: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);
        
        // Tenta encontrar colunas de valor (Total, Preço, Valor, Price, TotalValue)
        let totalValue = 0;
        data.forEach(row => {
          const val = row.Total || row.total || row.Valor || row.valor || row.Price || row.price || 0;
          totalValue += Number(val);
        });

        if (totalValue > 0) {
          await db.updateDailySales(totalValue);
          alert(`Relatório processado!\nR$ ${totalValue.toLocaleString('pt-BR')} somados às vendas de hoje.`);
        } else {
          alert("Nenhum valor identificado nas colunas da planilha.");
        }
      } catch (error) {
        alert("Erro ao ler relatório de vendas. Verifique o formato.");
      } finally {
        setLoading(false);
        e.target.value = ''; // Limpa input
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="p-8 bg-zinc-950 h-full flex flex-col items-center justify-center">
      <div className="max-w-xl w-full text-center space-y-8">
        <div className="w-20 h-20 bg-yellow-400/10 rounded-3xl flex items-center justify-center mx-auto text-4xl shadow-[0_0_30px_rgba(250,204,21,0.1)]">📊</div>
        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Baixa de Vendas</h2>
        <p className="text-zinc-500 text-sm">Selecione o relatório de vendas (Excel/CSV) para atualizar as metas de hoje automaticamente.</p>
        
        <label className={`block border-2 border-dashed border-zinc-800 hover:border-yellow-400 rounded-[40px] p-16 transition-all cursor-pointer bg-zinc-900/20 group ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
           <p className="text-zinc-400 font-bold uppercase text-xs group-hover:text-yellow-400 transition-colors">
             {loading ? 'Processando Relatório...' : 'Clique para selecionar planilha'}
           </p>
           <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={loading} />
        </label>
        
        <div className="pt-8 border-t border-zinc-900 flex justify-center gap-12">
           <div className="text-center">
              <p className="text-[10px] font-black text-zinc-700 uppercase mb-1">Formatos Aceitos</p>
              <p className="text-[9px] font-bold text-zinc-500">XLSX, CSV, XLS</p>
           </div>
           <div className="text-center">
              <p className="text-[10px] font-black text-zinc-700 uppercase mb-1">Campo Requerido</p>
              <p className="text-[9px] font-bold text-zinc-500">Coluna "Total" ou "Valor"</p>
           </div>
        </div>
      </div>
    </div>
  );
};
export default InvoiceProcessor;
