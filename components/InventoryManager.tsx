import React, { useState, useEffect } from 'react';
import { Book, UsageMetrics } from '../types';
import { INITIAL_INVENTORY } from '../data/mockInventory';
import { db } from '../services/db';
import { enrichBooks } from '../services/geminiService';
import Mascot from './Mascot';
import * as XLSX from 'xlsx';

const InventoryManager: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isEnriching, setIsEnriching] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  
  const [editingBook, setEditingBook] = useState<Book | null>(null);

  useEffect(() => {
    const load = async () => {
      const saved = await db.get('nobel_inventory');
      setBooks(saved || INITIAL_INVENTORY);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const incrementEnrichmentCount = async (count: number) => {
    const today = new Date().toISOString().split('T')[0];
    const metrics: UsageMetrics = await db.get('nobel_usage_metrics') || { dailyRequests: 0, dailyEnrichments: 0, lastResetDate: today, totalTokensEstimate: 0 };
    
    if (metrics.lastResetDate !== today) {
      metrics.dailyEnrichments = count;
      metrics.lastResetDate = today;
    } else {
      metrics.dailyEnrichments = (metrics.dailyEnrichments || 0) + count;
    }
    await db.save('nobel_usage_metrics', metrics);
    window.dispatchEvent(new CustomEvent('nobel_usage_updated'));
  };

  const handleFullInventorySync = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Lendo como matriz de arrays para detecção manual de colunas (mais robusto)
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
        if (!rows || rows.length === 0) throw new Error("Arquivo vazio.");

        // Busca o cabeçalho nas primeiras 10 linhas
        let headerIdx = -1;
        let colMap = { isbn: -1, title: -1, author: -1, price: -1, stock: -1, desc: -1, genre: -1 };

        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i].map(c => String(c || '').toLowerCase().trim());
          const foundIsbn = row.findIndex(c => ['isbn', 'ean', 'barras', 'código', 'codigo', 'cod'].some(k => c.includes(k)));
          if (foundIsbn !== -1) {
            headerIdx = i;
            colMap.isbn = foundIsbn;
            colMap.title = row.findIndex(c => ['titulo', 'título', 'nome', 'descricao', 'descrição'].some(k => c.includes(k) && !c.includes('longa')));
            colMap.author = row.findIndex(c => ['autor'].some(k => c.includes(k)));
            colMap.price = row.findIndex(c => ['preco', 'preço', 'valor', 'venda'].some(k => c.includes(k)));
            colMap.stock = row.findIndex(c => ['estoque', 'stock', 'qtd', 'quantidade'].some(k => c.includes(k)));
            colMap.desc = row.findIndex(c => ['sinopse', 'resumo', 'longa'].some(k => c.includes(k)));
            colMap.genre = row.findIndex(c => ['genero', 'gênero', 'categoria'].some(k => c.includes(k)));
            break;
          }
        }

        if (headerIdx === -1 || colMap.isbn === -1) {
          alert("Não consegui encontrar a coluna de ISBN ou Código de Barras na sua planilha. Verifique o cabeçalho.");
          return;
        }

        const incomingData = rows.slice(headerIdx + 1).map(row => {
          const isbnVal = row[colMap.isbn];
          if (!isbnVal) return null;

          // Limpeza do ISBN (remove notação científica se houver)
          let isbn = String(isbnVal).trim();
          if (isbn.includes('E+')) isbn = Number(isbnVal).toLocaleString('fullwide', {useGrouping:false});
          isbn = isbn.replace(/\D/g, '');

          const priceVal = colMap.price !== -1 ? String(row[colMap.price] || '').replace(',', '.') : undefined;
          const stockVal = colMap.stock !== -1 ? String(row[colMap.stock] || '') : undefined;

          return {
            isbn,
            title: colMap.title !== -1 ? row[colMap.title] : undefined,
            author: colMap.author !== -1 ? row[colMap.author] : undefined,
            price: priceVal ? parseFloat(priceVal) : undefined,
            stockCount: stockVal ? parseInt(stockVal) : undefined,
            description: colMap.desc !== -1 ? row[colMap.desc] : undefined,
            genre: colMap.genre !== -1 ? row[colMap.genre] : undefined
          };
        }).filter(item => item !== null && item.isbn.length > 5);

        if (incomingData.length === 0) {
          alert("Nenhum dado válido encontrado após o cabeçalho. Verifique se os ISBNs estão na coluna correta.");
          return;
        }

        const result = await db.syncInventory(incomingData);
        const refreshed = await db.get('nobel_inventory');
        setBooks(refreshed);
        alert(`🦉 Sincronização Master Concluída!\n\n📈 Livros Atualizados: ${result.updatedCount}\n✨ Novos Livros: ${result.addedCount}`);
      } catch (err) {
        console.error(err);
        alert("Erro ao processar planilha. Verifique se o arquivo está no formato correto.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleEnrich = async () => {
    const poorData = books.filter(b => !b.enriched);
    if (poorData.length === 0) {
      alert("🦉 Acervo 100% Inteligente!");
      return;
    }
    
    const confirmMsg = `Você vai enriquecer ${poorData.length} livros. Isso gera custo de processamento de IA (aprox. R$ 0,01 por livro). Deseja continuar?`;
    if (!confirm(confirmMsg)) return;

    setIsEnriching(true);
    setQuotaError(false);
    const batchSize = 1; 
    let currentInventory = [...books];
    try {
      for (let i = 0; i < poorData.length; i += batchSize) {
        const batch = poorData.slice(i, i + batchSize);
        try {
          const results = await enrichBooks(batch);
          results.forEach(res => {
            const idx = currentInventory.findIndex(b => b.isbn === res.isbn);
            if (idx !== -1) {
              currentInventory[idx] = {
                ...currentInventory[idx],
                author: res.author || currentInventory[idx].author,
                description: res.description || currentInventory[idx].description,
                genre: res.genre || currentInventory[idx].genre,
                targetAge: res.targetAge || currentInventory[idx].targetAge,
                enriched: !!(res.author && res.author !== 'Não localizado')
              };
            }
          });
          setBooks([...currentInventory]);
          await db.save('nobel_inventory', currentInventory);
          await incrementEnrichmentCount(batch.length);
          await new Promise(r => setTimeout(r, 15000));
        } catch (innerError: any) {
          const errorMsg = JSON.stringify(innerError).toLowerCase();
          if (errorMsg.includes('429') || errorMsg.includes('500')) {
            setQuotaError(true);
            setCountdown(90);
            setIsEnriching(false);
            return;
          }
          throw innerError;
        }
      }
    } catch (err) {
      setIsEnriching(false);
    } finally {
      setIsEnriching(false);
    }
  };

  const filtered = books.filter(b => 
    b.title.toLowerCase().includes(search.toLowerCase()) || 
    b.isbn.includes(search) ||
    b.author.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-zinc-950">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tighter uppercase text-white">Acervo Real<span className="text-yellow-400">.</span></h2>
          <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-[0.3em]">{books.length} Títulos • {books.filter(b => b.enriched).length} Inteligentes</p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => setShowGuide(true)}
            className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all flex items-center gap-2 font-black text-[10px] uppercase"
          >
            ❓ GUIA DE EXCEL
          </button>
          <label className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase transition-all flex items-center gap-2 cursor-pointer hover:bg-blue-500 shadow-xl shadow-blue-600/10 active:scale-95">
             📥 ATUALIZAR ACERVO
             <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFullInventorySync} />
          </label>
          <button 
            onClick={handleEnrich}
            disabled={isEnriching || countdown > 0}
            className={`relative overflow-hidden bg-yellow-400 text-black px-8 py-4 rounded-2xl font-black text-[10px] uppercase transition-all flex items-center gap-2 ${isEnriching || countdown > 0 ? 'opacity-50' : 'hover:scale-105 shadow-xl shadow-yellow-400/10'}`}
          >
            {isEnriching ? 'ESTUDANDO...' : countdown > 0 ? `SONECA (${countdown}s)` : '✨ ENRIQUECER'}
          </button>
        </div>
      </div>

      {showGuide && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl animate-in fade-in">
           <div className="bg-zinc-900 border border-zinc-800 rounded-[48px] p-12 max-w-4xl w-full shadow-2xl space-y-8 overflow-y-auto max-h-[90vh] custom-scrollbar">
              <div className="flex justify-between items-center">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-xl shadow-lg">📄</div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Manual de Importação Nobel</h3>
                 </div>
                 <button onClick={() => setShowGuide(false)} className="text-zinc-500 hover:text-white text-2xl font-black">✕</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                 <div className="space-y-6">
                    <h4 className="text-sm font-black text-yellow-400 uppercase tracking-widest border-b border-zinc-800 pb-2">Colunas Aceitas</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">O Nobelino usa o <b>ISBN</b> para identificar o livro. Você não precisa preencher tudo sempre!</p>
                    <div className="space-y-3">
                       <div className="flex justify-between p-4 bg-zinc-950 rounded-2xl border border-zinc-800">
                          <span className="text-[10px] font-black text-white uppercase">ISBN / Código</span>
                          <span className="text-[10px] font-bold text-zinc-600">Obrigatório</span>
                       </div>
                       <div className="flex justify-between p-4 bg-zinc-950 rounded-2xl border border-zinc-800">
                          <span className="text-[10px] font-black text-white uppercase">Sinopse / Descrição</span>
                          <span className="text-[10px] font-bold text-blue-500/50">Enriquece Cérebro</span>
                       </div>
                       <div className="flex justify-between p-4 bg-zinc-950 rounded-2xl border border-zinc-800">
                          <span className="text-[10px] font-black text-white uppercase">Autor / Gênero</span>
                          <span className="text-[10px] font-bold text-blue-500/50">Enriquece Cérebro</span>
                       </div>
                       <div className="flex justify-between p-4 bg-zinc-950 rounded-2xl border border-zinc-800">
                          <span className="text-[10px] font-black text-white uppercase">Preço / Estoque</span>
                          <span className="text-[10px] font-bold text-green-500/50">Atualiza Dados</span>
                       </div>
                    </div>
                 </div>

                 <div className="space-y-6">
                    <h4 className="text-sm font-black text-blue-400 uppercase tracking-widest border-b border-zinc-800 pb-2">Lógica de Enriquecimento</h4>
                    <div className="bg-zinc-950 p-6 rounded-3xl border border-zinc-800 space-y-4">
                       <p className="text-xs text-zinc-400"><b>A Regra do ISBN:</b> Se o Nobelino já conhece um ISBN e você subir uma planilha com o mesmo ISBN mas apenas com a Sinopse, ele <u>integra</u> essa sinopse ao cadastro existente sem apagar o preço ou o autor que já estavam lá.</p>
                       <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                          <p className="text-[10px] font-black text-blue-400 uppercase mb-1">Exemplo Prático:</p>
                          <p className="text-[9px] text-zinc-500 leading-tight italic">"Subi uma lista só com ISBN e SINOPSE? Perfeito! Eu guardo a sinopse e mantenho todo o resto intacto."</p>
                       </div>
                    </div>
                    <ul className="space-y-3 text-[10px] text-zinc-500 list-disc pl-4 font-bold uppercase tracking-wider">
                       <li>Formatos: .XLSX ou .CSV</li>
                       <li>Múltiplos gêneros: Separe por vírgula</li>
                       <li>ISBN: Formatar como Texto no Excel</li>
                    </ul>
                 </div>
              </div>

              <div className="bg-yellow-400/5 p-8 rounded-[32px] border border-yellow-400/10 flex items-center gap-6">
                 <div className="w-20 h-20 shrink-0"><Mascot mood="happy" /></div>
                 <div>
                    <p className="text-xs font-bold text-yellow-400 leading-relaxed uppercase tracking-wide">
                      "Não precisa de planilhas gigantes! Se quiser me ensinar sobre um livro, basta o ISBN e o que você quer que eu aprenda (Sinopse, Autor, etc)."
                    </p>
                    <p className="text-[9px] font-black text-zinc-600 uppercase mt-2">— Nobelino</p>
                 </div>
              </div>

              <button 
                onClick={() => setShowGuide(false)}
                className="w-full py-5 bg-white text-black rounded-3xl font-black uppercase text-xs tracking-widest hover:bg-yellow-400 transition-all"
              >
                ENTENDI, VAMOS TRABALHAR!
              </button>
           </div>
        </div>
      )}

      {quotaError && (
        <div className="mb-8 p-8 bg-zinc-900 border border-zinc-800 rounded-[40px] flex items-center gap-8 animate-in slide-in-from-top-4">
          <div className="w-24 h-24 shrink-0"><Mascot mood="tired" /></div>
          <div className="flex-1">
             <h4 className="text-yellow-400 font-black text-sm uppercase tracking-widest mb-2">Nobelino está Exausto! 🦉💤</h4>
             <p className="text-zinc-400 text-xs leading-relaxed max-w-xl">
               A busca automática atingiu o limite. <b>Dica:</b> Sua planilha Excel agora atualiza tudo de uma vez: <b>Estoque, Preços e Descrições</b>. Use-a para manter o Nobelino sempre afiado!
             </p>
          </div>
          <div className="text-4xl font-black text-zinc-800">{countdown}s</div>
        </div>
      )}

      {editingBook && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[48px] p-10 max-w-2xl w-full shadow-2xl space-y-8 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center">
               <h3 className="text-xl font-black text-white uppercase tracking-tighter">Ficha do Livro</h3>
               <button onClick={() => setEditingBook(null)} className="text-zinc-500 hover:text-white transition-colors">✕</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Título do Livro</label>
                  <input value={editingBook.title} onChange={e => setEditingBook({...editingBook, title: e.target.value})} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:border-yellow-400 outline-none" />
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Autor(a)</label>
                  <input value={editingBook.author} onChange={e => setEditingBook({...editingBook, author: e.target.value})} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:border-yellow-400 outline-none" />
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Gênero</label>
                  <input value={editingBook.genre} onChange={e => setEditingBook({...editingBook, genre: e.target.value})} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:border-yellow-400 outline-none" />
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Preço (R$)</label>
                  <input type="number" value={editingBook.price} onChange={e => setEditingBook({...editingBook, price: parseFloat(e.target.value)})} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:border-yellow-400 outline-none" />
               </div>
            </div>

            <div className="space-y-2">
               <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sinopse / Descrição Completa</label>
               <textarea rows={5} value={editingBook.description} onChange={e => setEditingBook({...editingBook, description: e.target.value})} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:border-yellow-400 outline-none resize-none" />
            </div>

            <div className="flex gap-4">
               <button onClick={() => setEditingBook(null)} className="flex-1 py-4 bg-zinc-800 text-zinc-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-zinc-700 transition-all">Cancelar</button>
               <button onClick={async () => {
                 if (!editingBook) return;
                 const updated = books.map(b => b.id === editingBook.id ? { ...editingBook, enriched: true } : b);
                 setBooks(updated);
                 await db.save('nobel_inventory', updated);
                 setEditingBook(null);
                 alert("🦉 Conhecimento interno atualizado!");
               }} className="flex-2 px-12 py-4 bg-yellow-400 text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all shadow-xl shadow-yellow-400/20">Gravar Alterações</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 relative">
        <input 
          type="text"
          placeholder="Busque por Título, Autor ou EAN..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-3xl px-14 py-5 focus:outline-none focus:border-yellow-400 text-sm text-zinc-100 transition-all shadow-inner"
        />
        <div className="absolute inset-y-0 left-6 flex items-center text-zinc-600">🔍</div>
      </div>

      <div className="glass rounded-[40px] border border-zinc-800/50 overflow-hidden shadow-2xl">
        <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur-md z-10 border-b border-zinc-800">
              <tr className="text-zinc-500 text-[9px] font-black uppercase tracking-[0.2em]">
                <th className="px-8 py-6">Livro / Autor</th>
                <th className="px-8 py-6">Preço / Estoque</th>
                <th className="px-8 py-6 text-center">Conhecimento</th>
                <th className="px-8 py-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/30">
              {filtered.map(book => (
                <tr key={book.id} className="hover:bg-yellow-400/[0.03] transition-colors group">
                  <td className="px-8 py-5">
                    <div className="font-bold text-zinc-100">{book.title}</div>
                    <div className="text-[10px] font-black uppercase text-zinc-500 mt-1">{book.author}</div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="text-sm font-black text-zinc-300">R$ {book.price.toFixed(2)}</div>
                    <div className={`text-[10px] font-bold uppercase ${book.stockCount <= 2 ? 'text-red-500' : 'text-zinc-600'}`}>{book.stockCount} UN</div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className={`inline-block px-4 py-1.5 rounded-xl text-[9px] font-black ${book.enriched ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-zinc-800 text-zinc-600'}`}>
                      {book.enriched ? '✨ COMPLETO' : 'PENDENTE'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button 
                      onClick={() => setEditingBook(book)}
                      className="p-3 bg-zinc-900 rounded-xl text-[10px] font-black uppercase text-zinc-400 hover:text-yellow-400 border border-zinc-800 hover:border-yellow-400/50 transition-all"
                    >
                      ✏️ EDITAR
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default InventoryManager;