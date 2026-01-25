
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { KnowledgeEntry } from '../types';

const KnowledgeManager: React.FC = () => {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');

  const load = async () => {
    const data = await db.get('nobel_knowledge_base') || [];
    setEntries(data);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!topic || !content) return;
    const newEntry: KnowledgeEntry = { id: Date.now().toString(), topic, content, type: 'rule', active: true };
    const updated = [newEntry, ...entries];
    await db.save('nobel_knowledge_base', updated);
    setEntries(updated);
    setTopic(''); setContent('');
  };

  return (
    <div className="p-8 bg-zinc-950 h-full overflow-y-auto custom-scrollbar">
      <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-8">Treinar Nobelino</h2>
      
      <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800 mb-8">
         <div className="space-y-4">
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Título da Regra" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-400" />
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Instrução..." rows={4} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-400" />
            <button onClick={save} className="w-full bg-yellow-400 text-black py-4 rounded-xl font-black uppercase text-xs">Gravar Regra</button>
         </div>
      </div>

      <div className="space-y-4">
        {entries.map(e => (
          <div key={e.id} className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-2xl">
            <h4 className="font-bold text-white mb-2">{e.topic}</h4>
            <p className="text-xs text-zinc-500 leading-relaxed">{e.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
export default KnowledgeManager;
