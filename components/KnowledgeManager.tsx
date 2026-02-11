
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { KnowledgeEntry, PortableProcess, Book } from '../types';

const KnowledgeManager: React.FC = () => {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [processes, setProcesses] = useState<PortableProcess[]>([]);
  const [inventory, setInventory] = useState<Book[]>([]);
  const [activeTab, setActiveTab] = useState<'regras' | 'processos' | 'sincronia'>('regras');
  
  // States para novas entradas e edições
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  
  const [processName, setProcessName] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  
  const [isSaving, setIsSaving] = useState(false);
  const [syncCode, setSyncCode] = useState('');

  const load = async () => {
    const kData = await db.get('nobel_knowledge_base') || [];
    const pData = await db.get('nobel_processes') || [];
    const iData = await db.get('nobel_inventory') || [];
    setEntries(kData.sort((a: any, b: any) => Number(b.id) - Number(a.id)));
    setProcesses(pData.sort((a: any, b: any) => Number(b.id) - Number(a.id)));
    setInventory(iData);
  };

  useEffect(() => { 
    load(); 
  }, []);

  const saveRule = async () => {
    if (!topic.trim() || !content.trim()) return;
    setIsSaving(true);
    try {
      if (editingRuleId) {
        await db.updateKnowledge(editingRuleId, topic.trim(), content.trim());
      } else {
        await db.addKnowledge(topic.trim(), content.trim());
      }
      setTopic(''); 
      setContent('');
      setEditingRuleId(null);
      await load();
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm("Tem certeza que deseja apagar esta regra?")) return;
    await db.deleteKnowledge(id);
    await load();
  };

  const startEditRule = (entry: KnowledgeEntry) => {
    setTopic(entry.topic);
    setContent(entry.content);
    setEditingRuleId(entry.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setTopic('');
    setContent('');
    setEditingRuleId(null);
  };

  const saveProcess = async () => {
    if (!processName.trim() || steps.some(s => !s.trim())) return;
    setIsSaving(true);
    try {
      await db.addProcess(processName.trim(), steps.filter(s => s.trim() !== ''));
      setProcessName(''); setSteps(['']);
      await load();
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProcess = async (id: string) => {
    if (!confirm("Remover este processo?")) return;
    await db.deleteProcess(id);
    await load();
  };

  const generateSyncDNA = () => {
    const dna = {
      rules: entries,
      processes: processes,
      inventory: inventory,
      exportedAt: new Date().toISOString()
    };
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(dna))));
    setSyncCode(code);
  };

  const importSyncDNA = async () => {
    const code = prompt("Cole o Código DNA de outro Nobelino:");
    if (!code) return;
    try {
      const decoded = JSON.parse(decodeURIComponent(escape(atob(code))));
      
      const currentRules = await db.get('nobel_knowledge_base') || [];
      const mergedRules = [...decoded.rules, ...currentRules].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      await db.save('nobel_knowledge_base', mergedRules);

      const currentProcesses = await db.get('nobel_processes') || [];
      const mergedProcesses = [...decoded.processes, ...currentProcesses].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      await db.save('nobel_processes', mergedProcesses);

      if (decoded.inventory) {
        const currentInv = await db.get('nobel_inventory') || [];
        const mergedInv = [...decoded.inventory, ...currentInv].filter((v, i, a) => a.findIndex(t => t.isbn === v.isbn) === i);
        await db.save('nobel_inventory', mergedInv);
      }

      alert("🧬 Sincronia Portátil Concluída!");
      load();
    } catch (e) {
      alert("Erro ao ler DNA.");
    }
  };

  return (
    <div className="p-8 bg-[#09090b] h-full overflow-y-auto custom-scrollbar">
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">Cérebro do Nobelino</h2>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Gestão de Conhecimento Ativa</p>
        </div>
        
        <div className="flex bg-zinc-900 p-1.5 rounded-[20px] border border-zinc-800 shadow-xl">
          <button onClick={() => setActiveTab('regras')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'regras' ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'text-zinc-500 hover:text-white'}`}>Regras e Metas</button>
          <button onClick={() => setActiveTab('processos')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'processos' ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'text-zinc-500 hover:text-white'}`}>Processos</button>
          <button onClick={() => setActiveTab('sincronia')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'sincronia' ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'text-zinc-500 hover:text-white'}`}>Sincronia</button>
        </div>
      </header>

      {activeTab === 'regras' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className={`bg-zinc-900/50 p-8 rounded-[32px] border ${editingRuleId ? 'border-yellow-400/40' : 'border-zinc-800'} mb-10 transition-all`}>
              <h3 className="text-white font-bold text-xs uppercase mb-2 tracking-widest flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${editingRuleId ? 'bg-blue-400' : 'bg-yellow-400'} animate-pulse`}></span>
                {editingRuleId ? 'Editando Regra' : 'Nova Regra ou Meta'}
              </h3>
              <p className="text-[9px] text-zinc-500 uppercase font-bold mb-6">Instruções passadas aqui moldam como o Nobelino atende no balcão.</p>
              
              <div className="space-y-4">
                 <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Título da Regra..." className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-yellow-400 transition-all font-bold" />
                 <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Descreva a regra detalhadamente..." rows={6} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-yellow-400 transition-all resize-none font-medium" />
                 <div className="flex gap-3">
                   <button onClick={saveRule} disabled={isSaving || !topic || !content} className="flex-1 bg-yellow-400 disabled:opacity-50 text-black py-5 rounded-2xl font-black uppercase text-xs hover:bg-yellow-300 transition-all active:scale-95 shadow-xl">
                     {isSaving ? 'Salvando...' : editingRuleId ? 'Atualizar Regra' : 'Gravar no Cérebro'}
                   </button>
                   {editingRuleId && (
                     <button onClick={cancelEdit} className="px-8 bg-zinc-800 text-white rounded-2xl font-black uppercase text-xs hover:bg-zinc-700 transition-all">Cancelar</button>
                   )}
                 </div>
              </div>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {entries.map(e => (
                <div key={e.id} className="p-6 bg-zinc-900/20 border border-zinc-800 rounded-[32px] group hover:border-zinc-700 transition-all relative">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-white font-bold pr-20">{e.topic}</h4>
                    <div className="flex gap-2 absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEditRule(e)} className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-yellow-400 transition-colors">✏️</button>
                      <button onClick={() => deleteRule(e.id)} className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-red-500 transition-colors">🗑️</button>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed whitespace-pre-wrap line-clamp-4">{e.content}</p>
                </div>
              ))}
           </div>
        </div>
      )}

      {activeTab === 'processos' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
           {/* Formulário de Processos */}
           <div className="bg-zinc-900/50 p-8 rounded-[32px] border border-zinc-800 mb-10">
              <h3 className="text-white font-bold text-xs uppercase mb-6 tracking-widest">Script de Venda (Passo a Passo)</h3>
              <div className="space-y-4">
                 <input value={processName} onChange={e => setProcessName(e.target.value)} placeholder="Nome do Processo..." className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-yellow-400 transition-all font-bold" />
                 <div className="space-y-2">
                    {steps.map((step, idx) => (
                      <div key={idx} className="flex gap-2">
                        <div className="w-10 h-10 shrink-0 bg-zinc-800 rounded-xl flex items-center justify-center text-[10px] font-black text-yellow-400">{idx + 1}</div>
                        <input value={step} onChange={e => { const ns = [...steps]; ns[idx] = e.target.value; setSteps(ns); }} placeholder={`Passo ${idx + 1}...`} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 text-white outline-none focus:border-yellow-400 text-xs" />
                      </div>
                    ))}
                    <button onClick={() => setSteps([...steps, ''])} className="text-[9px] font-black uppercase text-zinc-500 hover:text-yellow-400 mt-2 ml-12 transition-colors">+ Adicionar Passo</button>
                 </div>
                 <button onClick={saveProcess} disabled={isSaving || !processName || steps[0] === ''} className="w-full bg-white text-black py-5 rounded-2xl font-black uppercase text-xs hover:bg-zinc-200 transition-all mt-4">Salvar Processo</button>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {processes.map(p => (
                <div key={p.id} className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-[32px] group relative">
                   <div className="flex justify-between mb-4">
                     <h4 className="text-yellow-400 font-black uppercase text-[10px] tracking-widest italic">{p.name}</h4>
                     <button onClick={() => deleteProcess(p.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-red-500">🗑️</button>
                   </div>
                   <div className="space-y-3">
                      {p.steps.map((step, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <span className="text-[10px] font-black text-zinc-700 mt-1">{i+1}.</span>
                          <p className="text-xs text-zinc-400 leading-tight">{step}</p>
                        </div>
                      ))}
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}

      {activeTab === 'sincronia' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
           {/* UI de Sincronia mantida */}
           <div className="bg-zinc-900/50 p-10 rounded-[40px] border border-zinc-800 text-center max-w-2xl mx-auto">
              <h3 className="text-2xl font-black text-white italic mb-2">Ponte Digital Nobel</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
                 <button onClick={generateSyncDNA} className="p-6 bg-zinc-950 border border-zinc-800 rounded-[32px] hover:border-blue-500/30 transition-all">Gerar DNA</button>
                 <button onClick={importSyncDNA} className="p-6 bg-zinc-950 border border-zinc-800 rounded-[32px] hover:border-yellow-400/30 transition-all">Importar DNA</button>
              </div>
              {syncCode && <textarea readOnly value={syncCode} className="w-full mt-6 bg-black border border-zinc-800 p-4 rounded-xl text-[7px] text-zinc-500 h-24" />}
           </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeManager;
