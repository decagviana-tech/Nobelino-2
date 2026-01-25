
import React, { useState, useEffect } from 'react';
import { Book } from '../types';
import { INITIAL_INVENTORY } from '../data/mockInventory';
import { db } from '../services/db';
import * as XLSX from 'xlsx';

const InventoryManager: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  const load = async () => {
    const saved = await db.get('nobel_inventory');
    setBooks(saved || INITIAL_INVENTORY);
  };

  useEffect(() => {
    load();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSyncing(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        // O XLSX.read com type 'array' lida bem com XLSX e CSV
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        
        const result = await db.syncInventory(json);
        alert(`Sincronização Nobel Concluída!\n\n- ${result.added} novos títulos adicionados\n- ${result.updated} títulos atualizados ou enriquecidos.\n\nPreços e estoques foram ajustados conforme a planilha. Sinopses e autores foram adicionados aos livros correspondentes.`);
        load();
      } catch (error) {
        console.error("Erro na importação:", error);
        alert("Erro ao ler planilha. Certifique-se de que é um arquivo Excel (.xlsx) ou CSV válido.");
      } finally {
        setIsSyncing(false);
        e.target.value = ''; 
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const filtered = books.filter(b => 
    b.title.toLowerCase().includes(search.toLowerCase()) || 
    b.isbn.includes(search) ||
    b.author.toLowerCase().includes(search.toLowerCase()) ||
    (b.genre && b.genre.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-8 bg-zinc-950 h-full overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center mb-8">
        <div>
           <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">Acervo Nobel</h2>
           <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">{books.length} Livros em Memória</p>
        </div>
        <div className="flex gap-3">
          <label className={`bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-[10px] uppercase cursor-pointer hover:bg-blue-500 transition-all flex items-center gap-2 shadow-xl shadow-blue-600/10 ${isSyncing ? 'opacity-50 pointer-events-none' : ''}`}>
            {isSyncing ? 'Processando...' : '📥 Importar Planilha (XLSX/CSV)'}
            <input type="file" className="hidden" onChange={handleFileUpload} disabled={isSyncing} accept=".xlsx,.xls,.csv" />
          </label>
        </div>
      </div>

      <div className="mb-8 group relative">
        <input 
          placeholder="Buscar por Título, ISBN, Autor ou Gênero..." 
          className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-white focus:border-yellow-400 outline-none transition-all placeholder:text-zinc-700 font-medium"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-zinc-700 pointer-events-none">🔍</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map(book => (
          <div 
            key={book.id} 
            onClick={() => setSelectedBook(book)}
            className="bg-zinc-900/40 border border-zinc-800/60 p-6 rounded-[28px] group hover:border-yellow-400/40 transition-all cursor-pointer relative overflow-hidden active:scale-[0.98]"
          >
            <div className="flex justify-between items-start mb-2">
               {book.genre && (
                 <span className="text-[8px] font-black uppercase px-2 py-1 bg-zinc-800 text-zinc-400 rounded-md tracking-widest border border-zinc-700/50">
                   {book.genre}
                 </span>
               )}
               {book.description && (
                 <span title="Possui Sinopse" className="text-[10px] bg-yellow-400/10 text-yellow-400 w-5 h-5 flex items-center justify-center rounded-full border border-yellow-400/20">📖</span>
               )}
            </div>
            
            <h4 className="font-bold text-zinc-100 group-hover:text-yellow-400 transition-colors line-clamp-1">{book.title}</h4>
            <p className="text-[9px] text-zinc-500 uppercase font-black tracking-tighter mt-1">{book.author}</p>
            
            <div className="mt-6 flex justify-between items-end border-t border-white/5 pt-4">
              <div>
                <span className="text-sm font-black text-white block tabular-nums">R$ {Number(book.price).toFixed(2)}</span>
                <span className="text-[8px] text-zinc-600 font-bold uppercase tracking-widest">ISBN: {book.isbn}</span>
              </div>
              <div className="text-right">
                <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg ${Number(book.stockCount) <= 3 ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
                  {book.stockCount} {Number(book.stockCount) === 1 ? 'UN' : 'UNS'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedBook && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedBook(null)}></div>
           <div className="relative bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-[40px] shadow-2xl p-10 overflow-hidden max-h-[90vh] flex flex-col">
              <button onClick={() => setSelectedBook(null)} className="absolute top-8 right-8 text-zinc-500 hover:text-white text-xl">✕</button>
              
              <div className="mb-6">
                 <span className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-2 block">{selectedBook.genre || 'LITERATURA'}</span>
                 <h3 className="text-3xl font-black text-white italic leading-tight">{selectedBook.title}</h3>
                 <p className="text-sm text-zinc-400 font-bold mt-2 uppercase tracking-tight">{selectedBook.author}</p>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 mb-8">
                 <h5 className="text-[10px] font-black text-zinc-600 uppercase mb-3">Sinopse do Livro</h5>
                 <p className="text-zinc-300 text-sm leading-relaxed font-medium">
                    {selectedBook.description || "Nenhuma sinopse cadastrada para este título ainda. Adicione via planilha para enriquecer o atendimento do Nobelino."}
                 </p>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-zinc-800">
                 <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
                    <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Preço Venda</p>
                    <p className="text-lg font-black text-white italic">R$ {Number(selectedBook.price).toFixed(2)}</p>
                 </div>
                 <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-center">
                    <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Estoque</p>
                    <p className={`text-lg font-black italic ${selectedBook.stockCount <= 3 ? 'text-red-500' : 'text-zinc-200'}`}>{selectedBook.stockCount} un</p>
                 </div>
                 <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-right">
                    <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Cód. ISBN</p>
                    <p className="text-[10px] font-bold text-zinc-400 truncate mt-2">{selectedBook.isbn}</p>
                 </div>
              </div>
           </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="h-64 flex flex-col items-center justify-center opacity-20 mt-12 grayscale">
           <span className="text-6xl mb-4">📚</span>
           <p className="text-xs font-black uppercase tracking-widest">Nenhum livro encontrado</p>
        </div>
      )}
    </div>
  );
};
export default InventoryManager;
