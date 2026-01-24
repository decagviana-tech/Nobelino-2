
import React, { useState } from 'react';
import { db } from '../services/db';
import Mascot from './Mascot';
import * as XLSX from 'xlsx';

const cleanIsbn = (val: any): string => {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  // Trata notação científica do Excel (ex: 9.78E+12)
  if (str.toUpperCase().includes('E+')) {
    return Number(str).toLocaleString('fullwide', { useGrouping: false });
  }
  return str.replace(/\D/g, ''); // Mantém apenas números
};

const parseCurrencyNobel = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  let clean = String(val).replace(/[^\d,.-]/g, '');
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
};

const InvoiceProcessor: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [importMode, setImportMode] = useState<'add' | 'replace'>('replace');
  const [report, setReport] = useState<{ updated: number, value: number, date: string, stockSubtracted: number } | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const handleSalesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReport(null);
    setIsProcessing(true);
    
    const reader = new FileReader();
    const uploadDate = selectedDate; 

    reader.onload = async (event) => {
      try {
        let sales: { isbn: string; quantity: number; price?: number }[] = [];
        let rows: any[][] = [];

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellNF: false, cellText: false });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: true }) as any[][];
        } else {
          const text = event.target?.result as string;
          const delimiter = text.includes('\t') ? '\t' : (text.includes(';') ? ';' : ',');
          rows = text.split('\n').map(line => line.split(delimiter));
        }

        if (!rows || rows.length === 0) throw new Error("Arquivo vazio.");

        let headerRowIndex = -1;
        let isbnCol = -1, qtyCol = -1, priceCol = -1;

        for (let i = 0; i < Math.min(rows.length, 50); i++) {
          const row = (rows[i] || []).map(c => String(c || '').toLowerCase().trim());
          const foundIsbn = row.findIndex(c => ['barras', 'ean', 'isbn', 'código', 'codigo', 'cod'].some(k => c.includes(k)));
          const foundQty = row.findIndex(c => ['qtde', 'qtd', 'quantidade', 'venda', 'itens', 'saida', 'saída'].some(k => c.includes(k)));
          
          if (foundIsbn !== -1 && foundQty !== -1) {
            headerRowIndex = i;
            isbnCol = foundIsbn;
            qtyCol = foundQty;
            priceCol = row.findIndex(c => ['preco', 'preço', 'valor', 'total', 'unitario', 'unitário'].some(k => c.includes(k)));
            break;
          }
        }

        if (headerRowIndex === -1) {
          throw new Error("Não encontrei as colunas 'ISBN/Barras' e 'Quantidade'.");
        }

        const dataRows = rows.slice(headerRowIndex + 1);
        sales = dataRows.map(row => {
          const isbn = cleanIsbn(row[isbnCol]);
          const qtyStr = String(row[qtyCol] || '0').replace(',', '.');
          const qty = Math.abs(parseFloat(qtyStr)) || 0;
          const rawPrice = priceCol !== -1 ? row[priceCol] : undefined;
          const cleanPrice = parseCurrencyNobel(rawPrice);

          return {
            isbn,
            quantity: qty,
            price: (cleanPrice === 0 && rawPrice === undefined) ? undefined : cleanPrice
          };
        }).filter(s => s.isbn && s.isbn.length > 5 && s.quantity > 0);

        if (sales.length === 0) throw new Error("Nenhum dado válido identificado.");

        const result = await db.updateStockAndSales(sales, uploadDate, importMode === 'replace');
        
        setReport({ 
          updated: result.itemsUpdated, 
          value: result.totalValue, 
          date: uploadDate,
          stockSubtracted: result.stockSubtracted
        });
        
      } catch (err: any) {
        alert(err.message || "Erro.");
      } finally {
        setIsProcessing(false);
        if (e.target) e.target.value = '';
      }
    };

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-zinc-950">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-12">
           <div className="w-16 h-16 bg-yellow-400 rounded-3xl flex items-center justify-center text-3xl shadow-lg shadow-yellow-400/20">📉</div>
           <div>
              <h2 className="text-4xl font-black tracking-tighter uppercase">Baixa de Vendas</h2>
              <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-[0.3em]">Sincronização de Relatório Diário</p>
           </div>
        </div>

        {!isProcessing && !report && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] flex flex-col justify-center">
                 <p className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-1">Data das Vendas</p>
                 <input 
                   type="date" 
                   value={selectedDate} 
                   onChange={e => setSelectedDate(e.target.value)}
                   className="bg-zinc-950 border border-zinc-700 rounded-xl px-5 py-3 text-sm focus:border-yellow-400 outline-none text-white cursor-pointer font-bold mt-2"
                 />
              </div>

              <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] flex flex-col justify-center">
                 <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Método de Importação</p>
                 <div className="flex gap-2 p-1 bg-zinc-950 rounded-2xl border border-zinc-800">
                    <button 
                      onClick={() => setImportMode('replace')}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${importMode === 'replace' ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/10' : 'text-zinc-600 hover:text-zinc-400'}`}
                    >
                      SUBSTITUIR DIA
                    </button>
                    <button 
                      onClick={() => setImportMode('add')}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${importMode === 'add' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/10' : 'text-zinc-600 hover:text-zinc-400'}`}
                    >
                      SOMAR AO DIA
                    </button>
                 </div>
              </div>
            </div>

            <label className="group block border-2 border-dashed border-zinc-800 hover:border-yellow-400/50 rounded-[56px] p-24 text-center transition-all cursor-pointer bg-zinc-900/10">
              <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-yellow-400 group-hover:text-black transition-colors group-hover:scale-110 text-2xl">📊</div>
              <p className="text-2xl font-black text-white mb-4">Importar Planilha Nobel</p>
              <p className="text-zinc-500 text-sm mb-8 max-w-sm mx-auto leading-relaxed">
                {importMode === 'replace' 
                  ? "Os dados do dia selecionado serão substituídos pelos desta planilha."
                  : "Os itens desta planilha serão somados ao total já lançado no dia."}
              </p>
              <div className="inline-block bg-white text-black px-12 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest group-hover:bg-yellow-400 transition-all shadow-xl shadow-white/5 active:scale-95">
                SINCRONIZAR ARQUIVO
              </div>
              <input type="file" className="hidden" accept=".xlsx,.xls,.csv,.txt" onChange={handleSalesUpload} />
            </label>
          </div>
        )}

        {isProcessing && (
           <div className="text-center py-24 space-y-8 animate-pulse">
              <Mascot animated className="w-28 h-28 mx-auto" />
              <div className="space-y-2">
                <h3 className="text-yellow-400 font-black text-xl tracking-[0.3em] uppercase">Sincronizando Balcão...</h3>
                <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest">Processando cálculos financeiros</p>
              </div>
           </div>
        )}

        {report && (
          <div className="glass p-16 rounded-[56px] border border-green-500/20 text-center space-y-8 animate-in zoom-in-95 duration-500">
             <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto text-4xl">✅</div>
             <div>
                <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Conferência Finalizada</h3>
                <p className="text-zinc-500 font-bold uppercase text-[10px] mt-2 tracking-widest">
                  Processado em {new Date(report.date + 'T12:00:00').toLocaleDateString('pt-BR')} 
                  {importMode === 'replace' ? ' (Modo Substituição)' : ' (Modo Adição)'}
                </p>
                
                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                   <div className="p-6 bg-zinc-900 rounded-3xl border border-zinc-800">
                      <p className="text-[8px] font-black text-zinc-600 uppercase mb-2">Itens na Planilha</p>
                      <p className="text-2xl font-black text-zinc-100">{report.updated}</p>
                   </div>
                   <div className="p-6 bg-zinc-900 rounded-3xl border border-zinc-800">
                      <p className="text-[8px] font-black text-zinc-600 uppercase mb-2">Saída de Estoque</p>
                      <p className="text-2xl font-black text-yellow-400">-{report.stockSubtracted} UN</p>
                   </div>
                   <div className="p-6 bg-zinc-900 rounded-3xl border border-zinc-800">
                      <p className="text-[8px] font-black text-zinc-600 uppercase mb-2">Valor do Arquivo</p>
                      <p className="text-2xl font-black text-green-400">R$ {report.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                   </div>
                </div>
             </div>
             <button onClick={() => setReport(null)} className="bg-white text-black px-12 py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-yellow-400 transition-all">
                Subir Novo Relatório
             </button>
          </div>
        )}
      </div>
    </div>
  );
};
export default InvoiceProcessor;
