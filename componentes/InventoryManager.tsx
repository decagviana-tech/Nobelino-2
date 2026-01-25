
import React, { useState, useEffect } from 'react';
import { Book } from '../types';
import { INITIAL_INVENTORY } from '../data/mockInventory';
import { db } from '../services/db';
import * as XLSX from 'xlsx';

const InventoryManager: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

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
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const result = await db.syncInventory(data);
        alert(`Sincronização concluída!\n${result.added} novos títulos\n${result.updated} atualizados.`);
        load();
      } catch (error) {
        alert("Erro ao ler planilha. Verifique as colunas (ISBN, title, price, stockCount).");
      } finally {
        setIsSyncing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const filtered = books.filter(b => 
    b.title.toLowerCase().includes(search.toLowerCase()) || 
    b.isbn.includes(search)
  );

  return (
    <div className="p-8 bg-zinc-950 h-full overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center mb-8">
        <div>
           <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Acervo Real</h2>
           <p className="text-zinc-500 text-xs font-bold uppercase">{books.length} Livros Sincronizados</p>
        </div>
        <label className={`bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase cursor-pointer hover:bg-blue-500 transition-colors ${isSyncing ? 'opacity-50' : ''}`}>
          {isSyncing ? 'Sincronizando...' : 'Importar Planilha'}
          <input type="file" className="hidden" onChange={handleFileUpload} disabled={isSyncing} />
        </label>
      </div>

      <div className="mb-6">
        <input 
          placeholder="Buscar por título ou ISBN..." 
          className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-white focus:border-yellow-400 outline-none"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(book => (
          <div key={book.id} className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl group hover:border-yellow-400/50 transition-all">
            <h4 className="font-bold text-zinc-100 truncate">{book.title}</h4>
            <p className="text-[10px] text-zinc-500 uppercase mt-1 truncate">{book.author}</p>
            <div className="mt-4 flex justify-between items-end">
              <div>
                <span className="text-xs font-black text-yellow-400 block">R$ {Number(book.price).toFixed(2)}</span>
                <span className="text-[8px] text-zinc-600 font-bold uppercase">ISBN: {book.isbn}</span>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${Number(book.stockCount) <= 3 ? 'bg-red-500/10 text-red-500' : 'text-zinc-400'}`}>
                {book.stockCount} un
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default InventoryManager;
