import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { KnowledgeEntry } from '../types';

const KnowledgeManager: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const saved = await db.get('nobel_knowledge_base') || [];
      setEntries(saved);
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!topic || !content) return;
    let updated: KnowledgeEntry[];
    if (editingId) {
      updated = entries.map(e => e.id === editingId ? { ...e, topic, content } : e);
      alert(`Regra "${topic}" atualizada!`);
    } else {
      const newEntry: KnowledgeEntry = {
        id: Date.now().toString(),
        topic,
        content,
        type: topic.toLowerCase().includes('site') || content.toLowerCase().includes('http') ? 'rule' : (topic.includes('Treinamento') ? 'training' : 'rule'),
        active: true
      };
      updated = [newEntry, ...entries];
      alert(`Regra sobre "${topic}" gravada na memória!`);
    }
    await db.save('nobel_knowledge_base', updated);
    setEntries(updated);
    clearForm();
  };

  const insertBookTemplate = () => {
    setTopic("Ficha do Livro: [NOME]");
    setContent("AUTOR: \nSINOPSE: \nMOTIVOS PARA COMPRAR: \nPÚBLICO-ALVO: \nDICA DE VENDA: ");
  };

  const insertLinkTemplate = () => {
    setTopic("Site Distribuidor: [NOME]");
    setContent("Link: https://");
  };

  const handleEdit = (entry: KnowledgeEntry) => {
    setEditingId(entry.id);
    setTopic(entry.topic);
    setContent(entry.content);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearForm = () => {
    setTopic('');
    setContent('');
    setEditingId(null);
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Excluir esta regra da memória do Nobelino?")) return;
    const updated = entries.filter(e => e.id !== id);
    await db.save('nobel_knowledge_base', updated);
    setEntries(updated);
    if (editingId === id) clearForm();
  };

  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-zinc-950">
      <div className="mb-12">
        <h2 className="text-4xl font-black tracking-tighter text-white uppercase">Regras Comerciais<span className="text-yellow-400">.</span></h2>
        <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Treinamento e Enriquecimento de Balcão</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-1 space-y-6">
          <div className={`p-8 rounded-[40px] border transition-all sticky top-0 z-20 ${editingId ? 'border-blue-500/30 bg-blue-500/[0.02]' : 'border-zinc-800 bg-zinc-900/20'}`}>
            <div className="flex flex-col gap-4 mb-6">
               <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">
                 {editingId ? '🧠 EDITANDO' : '📝 NOVA INSTRUÇÃO'}
               </h3>
               <div className="flex gap-2">
                 <button 
                   onClick={insertBookTemplate}
                   className="flex-1 text-[8px] font-black uppercase text-yellow-400 bg-yellow-400/10 px-3 py-2 rounded-xl border border-yellow-400/20 hover:bg-yellow-400 hover:text-black transition-all"
                 >
                   ✨ Livro
                 </button>
                 <button 
                   onClick={insertLinkTemplate}
                   className="flex-1 text-[8px] font-black uppercase text-blue-400 bg-blue-400/10 px-3 py-2 rounded-xl border border-blue-400/20 hover:bg-blue-500 hover:text-white transition-all"
                 >
                   🔗 Link Site
                 </button>
               </div>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Título / Assunto</label>
                <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Ex: Site Catavento" className={`w-full bg-zinc-900 border rounded-2xl px-6 py-4 focus:outline-none transition-all text-sm border-zinc-800 focus:border-yellow-400 text-white`} />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Instrução Completa</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} rows={10} placeholder="Descreva a regra ou cole o link..." className={`w-full bg-zinc-900 border rounded-2xl px-6 py-4 focus:outline-none transition-all text-sm resize-none border-zinc-800 focus:border-yellow-400 text-white`} />
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button onClick={handleSave} className="w-full py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all shadow-xl bg-yellow-400 text-black hover:bg-yellow-300 active:scale-95">
                  {editingId ? 'ATUALIZAR MEMÓRIA' : 'GRAVAR NA MEMÓRIA'}
                </button>
                {editingId && <button onClick={clearForm} className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-center">Cancelar</button>}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
           <div className="flex justify-between items-center mb-8">
              <h3 className="font-black text-sm uppercase tracking-widest text-zinc-500">Histórico de Conhecimento</h3>
              <span className="text-[10px] font-bold text-zinc-700 uppercase bg-zinc-900 px-4 py-1.5 rounded-full border border-zinc-800">
                {entries.length} Instruções Ativas
              </span>
           </div>

           <div className="grid grid-cols-1 gap-6">
              {entries.length === 0 && (
                <div className="p-12 text-center border-2 border-dashed border-zinc-900 rounded-[40px]">
                  <p className="text-zinc-600 font-black text-xs uppercase tracking-widest">A memória do Nobelino ainda está vazia.</p>
                  <p className="text-zinc-800 text-[9px] mt-2 font-bold uppercase">Comece salvando respostas do chat ou cadastrando manuais aqui.</p>
                </div>
              )}
              {entries.map(entry => {
                const isLink = entry.content.toLowerCase().includes('http');
                return (
                  <div key={entry.id} className={`p-8 bg-zinc-900/30 border rounded-[40px] group relative transition-all border-zinc-800 hover:bg-zinc-900/50 ${isLink ? 'border-blue-500/20' : ''}`}>
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg ${isLink ? 'bg-blue-500/10 text-blue-400' : 'bg-yellow-400/10 text-yellow-400'}`}>
                              {isLink ? '🔗' : '📜'}
                          </div>
                          <div>
                              <p className="font-black text-white uppercase text-sm leading-none">{entry.topic}</p>
                              <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mt-2">
                                Tipo: {isLink ? 'Atalho Distribuidor' : (entry.topic.includes('Treinamento') ? 'Treinamento via Chat' : 'Manual de Balcão')}
                              </p>
                          </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEdit(entry)} className="p-3 bg-zinc-800 hover:bg-blue-500 text-zinc-400 hover:text-white rounded-xl transition-all">✏️</button>
                          <button onClick={() => deleteEntry(entry.id)} className="p-3 bg-zinc-800 hover:bg-red-500 text-zinc-400 hover:text-white rounded-xl transition-all">🗑️</button>
                        </div>
                    </div>
                    <div className="bg-zinc-950/50 p-6 rounded-3xl border border-zinc-800/50">
                      <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-wrap">{entry.content}</p>
                    </div>
                  </div>
                );
              })}
           </div>
        </div>
      </div>
    </div>
  );
};
export default KnowledgeManager;