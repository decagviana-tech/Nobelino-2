
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

  useEffect(() => { load(); }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSyncing(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        const result = await db.syncInventory(json);
        alert(`Sincronização Nobel Concluída!\n\n- ${result.added} novos títulos\n- ${result.updated} atualizados.`);
        load();
      } catch (error) {
        alert("Erro ao ler planilha.");
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
    b.author.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 bg-zinc-950 h-full overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center mb-8">
        <div>
           <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Acervo Real</h2>
           <p className="text-zinc-500 text-[10px] font-black uppercase">{books.length.toLocaleString('pt-BR')} Livros em Memória</p>
        </div>
        <label className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase cursor-pointer hover:bg-blue-500 transition-all">
          {isSyncing ? 'Sincronizando...' : 'Importar Excel'}
          <input type="file" className="hidden" onChange={handleFileUpload} accept=".xlsx,.xls,.csv" />
        </label>
      </div>

      <div className="mb-6">
        <input 
          placeholder="Buscar por Título, ISBN ou Autor..." 
          className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-white focus:border-yellow-400 outline-none"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.slice(0, 50).map(book => (
          <div 
            key={book.id} 
            onClick={() => setSelectedBook(book)}
            className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-[24px] group hover:border-yellow-400/50 transition-all cursor-pointer active:scale-95"
          >
            <div className="flex justify-between items-start mb-2">
               <span className="text-[8px] font-black uppercase px-2 py-1 bg-zinc-800 text-zinc-500 rounded border border-zinc-700">{book.genre || 'Geral'}</span>
               {book.description && <span className="text-[10px] text-yellow-400">📖</span>}
            </div>
            <h4 className="font-bold text-zinc-100 group-hover:text-yellow-400 transition-colors line-clamp-1">{book.title}</h4>
            <p className="text-[9px] text-zinc-500 uppercase font-black mt-1">{book.author}</p>
            <div className="mt-4 flex justify-between items-end border-t border-white/5 pt-4">
              <span className="text-xs font-black text-white italic">R$ {book.price.toFixed(2)}</span>
              <span className="text-[10px] text-zinc-600 font-bold uppercase">ISBN: {book.isbn}</span>
            </div>
          </div>
        ))}
      </div>

      {selectedBook && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedBook(null)}></div>
           <div className="relative bg-zinc-900 border border-zinc-800 w-full max-w-xl rounded-[40px] shadow-2xl p-10 max-h-[85vh] flex flex-col">
              <button onClick={() => setSelectedBook(null)} className="absolute top-6 right-8 text-zinc-500 hover:text-white text-2xl">✕</button>
              <span className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-2">{selectedBook.genre || 'LITERATURA'}</span>
              <h3 className="text-2xl font-black text-white italic mb-1">{selectedBook.title}</h3>
              <p className="text-xs text-zinc-500 font-bold uppercase mb-6">{selectedBook.author}</p>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 mb-6">
                 <h5 className="text-[10px] font-black text-zinc-700 uppercase mb-2">Sinopse</h5>
                 <p className="text-zinc-300 text-sm leading-relaxed">{selectedBook.description || "Nenhuma sinopse disponível para este título."}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-6 border-t border-zinc-800">
                 <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
                    <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Preço</p>
                    <p className="text-lg font-black text-white">R$ {selectedBook.price.toFixed(2)}</p>
                 </div>
                 <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
                    <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Estoque</p>
                    <p className="text-lg font-black text-zinc-200">{selectedBook.stockCount} un</p>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
export default InventoryManager;
