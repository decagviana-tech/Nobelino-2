
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
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        
        const result = await db.syncInventory(json);
        alert(`Acervo Nobel Atualizado!\n- ${result.added} novos títulos\n- ${result.updated} atualizados.`);
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
      <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-8">
        <div>
           <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">Acervo da Loja</h2>
           <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">{books.length.toLocaleString('pt-BR')} Títulos Cadastrados</p>
        </div>
        <div className="flex gap-3">
          <label className={`bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-[10px] uppercase cursor-pointer hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/10 ${isSyncing ? 'opacity-50 pointer-events-none' : ''}`}>
            {isSyncing ? 'Atualizando Inteligência...' : '📥 Importar Planilha'}
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".xlsx,.xls,.csv" />
          </label>
        </div>
      </div>

      <div className="mb-8 relative">
        <input 
          placeholder="Pesquise por título ou ISBN..." 
          className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-white focus:border-yellow-400 outline-none transition-all placeholder:text-zinc-700 font-medium"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-zinc-700">🔍</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.slice(0, 100).map(book => (
          <div 
            key={book.id} 
            onClick={() => setSelectedBook(book)}
            className="bg-zinc-900/40 border border-zinc-800/60 p-6 rounded-[32px] group hover:border-yellow-400/40 transition-all cursor-pointer relative overflow-hidden active:scale-[0.98]"
          >
            <div className="flex justify-between items-start mb-2">
               <span className="text-[8px] font-black uppercase px-2 py-1 bg-zinc-800 text-zinc-400 rounded-md tracking-widest border border-zinc-700/50">
                 {book.genre || 'Geral'}
               </span>
               {book.description ? (
                 <span className="text-[9px] text-yellow-400 font-black">✨</span>
               ) : (
                 <span className="text-[9px] text-zinc-700 font-black">∅</span>
               )}
            </div>
            
            <h4 className="font-bold text-zinc-100 group-hover:text-yellow-400 transition-colors line-clamp-1">{book.title}</h4>
            <p className="text-[9px] text-zinc-500 uppercase font-black mt-1">{book.author}</p>
            
            <div className="mt-6 flex justify-between items-end border-t border-white/5 pt-4">
              <div>
                <span className="text-sm font-black text-white block tabular-nums">R$ {Number(book.price).toFixed(2)}</span>
                <span className="text-[8px] text-zinc-600 font-bold uppercase tracking-widest">ISBN: {book.isbn}</span>
              </div>
              <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg ${Number(book.stockCount) <= 0 ? 'text-red-500' : 'text-zinc-500'}`}>
                {book.stockCount} UN
              </span>
            </div>
          </div>
        ))}
      </div>

      {selectedBook && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelectedBook(null)}></div>
           <div className="relative bg-[#18181b] border border-white/5 w-full max-w-2xl rounded-[44px] shadow-2xl p-12 overflow-hidden max-h-[90vh] flex flex-col">
              <button onClick={() => setSelectedBook(null)} className="absolute top-8 right-8 text-zinc-500 hover:text-white text-2xl transition-colors">✕</button>
              
              <div className="mb-10">
                 <span className="text-[10px] font-black text-yellow-400 uppercase tracking-[0.2em] mb-3 block leading-relaxed">
                   {selectedBook.genre || 'LITERATURA NOBEL'}
                 </span>
                 <h3 className="text-4xl font-black text-white italic leading-[1.1] mb-2">{selectedBook.title}</h3>
                 <p className="text-md text-zinc-500 font-bold uppercase tracking-tighter">{selectedBook.author}</p>
              </div>

              <div className="mb-8 border-t border-white/5 pt-8">
                 <h5 className="text-[10px] font-black text-zinc-600 uppercase mb-4 tracking-widest italic">SINOPSE</h5>
                 <div className="max-h-[250px] overflow-y-auto custom-scrollbar pr-6">
                    <p className="text-zinc-300 text-base leading-relaxed font-medium">
                        {selectedBook.description || "Este título ainda não possui sinopse no banco de dados. O enriquecimento deste campo pela curadoria permitirá que o Nobelino faça indicações inteligentes."}
                    </p>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-auto">
                 <div className="bg-zinc-900/50 p-7 rounded-[32px] border border-white/5">
                    <p className="text-[9px] font-black text-zinc-600 uppercase mb-2 tracking-[0.2em]">PREÇO</p>
                    <p className="text-3xl font-black text-white italic leading-none">R$ {Number(selectedBook.price).toFixed(2)}</p>
                 </div>
                 <div className="bg-zinc-900/50 p-7 rounded-[32px] border border-white/5">
                    <p className="text-[9px] font-black text-zinc-600 uppercase mb-2 tracking-[0.2em]">ESTOQUE</p>
                    <p className={`text-3xl font-black italic leading-none ${Number(selectedBook.stockCount) <= 1 ? 'text-red-500' : 'text-zinc-100'}`}>{selectedBook.stockCount} un</p>
                 </div>
              </div>
              
              <div className="mt-8 text-center opacity-30">
                 <p className="text-[8px] font-black text-zinc-500 uppercase tracking-[0.4em]">Cód. ISBN: {selectedBook.isbn}</p>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
export default InventoryManager;
