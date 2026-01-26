
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { KnowledgeEntry, PortableProcess, Book } from '../types';

const KnowledgeManager: React.FC = () => {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [processes, setProcesses] = useState<PortableProcess[]>([]);
  const [inventory, setInventory] = useState<Book[]>([]);
  const [activeTab, setActiveTab] = useState<'regras' | 'processos' | 'sincronia'>('regras');
  
  // States para novas entradas
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [processName, setProcessName] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  
  const [isSaving, setIsSaving] = useState(false);
  const [syncCode, setSyncCode] = useState('');

  const load = async () => {
    const kData = await db.get('nobel_knowledge_base') || [];
    const pData = await db.get('nobel_processes') || [];
    const iData = await db.get('nobel_inventory') || [];
    setEntries(kData.sort((a, b) => Number(b.id) - Number(a.id)));
    setProcesses(pData.sort((a, b) => Number(b.id) - Number(a.id)));
    setInventory(iData);
  };

  useEffect(() => { 
    load(); 
    window.addEventListener('nobel_rule_saved', load);
    return () => window.removeEventListener('nobel_rule_saved', load);
  }, []);

  const saveRule = async () => {
    if (!topic.trim() || !content.trim()) return;
    setIsSaving(true);
    try {
      await db.addKnowledge(topic.trim(), content.trim());
      setTopic(''); setContent('');
      await load();
    } finally {
      setIsSaving(false);
    }
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

  const generateSyncDNA = () => {
    // Agora o DNA foca em TUDO (Regras + Processos + Estoque) para portabilidade real
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
      
      // Merge de Regras
      const currentRules = await db.get('nobel_knowledge_base') || [];
      const mergedRules = [...decoded.rules, ...currentRules].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      await db.save('nobel_knowledge_base', mergedRules);

      // Merge de Processos
      const currentProcesses = await db.get('nobel_processes') || [];
      const mergedProcesses = [...decoded.processes, ...currentProcesses].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      await db.save('nobel_processes', mergedProcesses);

      // Merge/Import de Estoque se disponível no DNA
      if (decoded.inventory) {
        const currentInv = await db.get('nobel_inventory') || [];
        const mergedInv = [...decoded.inventory, ...currentInv].filter((v, i, a) => a.findIndex(t => t.isbn === v.isbn) === i);
        await db.save('nobel_inventory', mergedInv);
      }

      alert("🧬 Sincronia Portátil Concluída! Regras, Processos e Estoque integrados.");
      load();
    } catch (e) {
      alert("Erro ao ler DNA. Verifique se o código está completo.");
    }
  };

  return (
    <div className="p-8 bg-[#09090b] h-full overflow-y-auto custom-scrollbar">
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">Cérebro do Nobelino</h2>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Treinamento Portátil Ativo • Livraria Nobel</p>
        </div>
        
        <div className="flex bg-zinc-900 p-1.5 rounded-[20px] border border-zinc-800 shadow-xl">
          <button onClick={() => setActiveTab('regras')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'regras' ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'text-zinc-500 hover:text-white'}`}>Regras</button>
          <button onClick={() => setActiveTab('processos')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'processos' ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'text-zinc-500 hover:text-white'}`}>Processos</button>
          <button onClick={() => setActiveTab('sincronia')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'sincronia' ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'text-zinc-500 hover:text-white'}`}>Sincronia</button>
        </div>
      </header>

      {activeTab === 'regras' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="bg-zinc-900/50 p-8 rounded-[32px] border border-zinc-800 mb-10">
              <h3 className="text-white font-bold text-xs uppercase mb-6 tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                Nova Regra de IA
              </h3>
              <div className="space-y-4">
                 <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Título da Regra (Ex: Cupom de Primeira Compra)" className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-yellow-400 transition-all placeholder:text-zinc-800 font-bold" />
                 <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Instrução detalhada para o Nobelino..." rows={4} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-yellow-400 transition-all placeholder:text-zinc-800 resize-none font-medium" />
                 <button onClick={saveRule} disabled={isSaving || !topic || !content} className="w-full bg-yellow-400 disabled:opacity-50 text-black py-5 rounded-2xl font-black uppercase text-xs hover:bg-yellow-300 transition-all active:scale-95 shadow-xl shadow-yellow-400/10">
                   {isSaving ? 'Gravando Inteligência...' : 'Ensinar ao Nobelino'}
                 </button>
              </div>
           </div>
           
           <div className="space-y-4">
              {entries.map(e => (
                <div key={e.id} className="p-6 bg-zinc-900/20 border border-zinc-800 rounded-[24px]">
                  <h4 className="text-white font-bold mb-2">{e.topic}</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed">{e.content}</p>
                </div>
              ))}
           </div>
        </div>
      )}

      {activeTab === 'processos' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="bg-zinc-900/50 p-8 rounded-[32px] border border-zinc-800 mb-10">
              <h3 className="text-white font-bold text-xs uppercase mb-6 tracking-widest">Script de Venda (Passo a Passo)</h3>
              <div className="space-y-4">
                 <input value={processName} onChange={e => setProcessName(e.target.value)} placeholder="Nome do Processo (Ex: Sondagem do Cliente)" className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-yellow-400 transition-all font-bold" />
                 
                 <div className="space-y-2">
                    {steps.map((step, idx) => (
                      <div key={idx} className="flex gap-2">
                        <div className="w-10 h-10 shrink-0 bg-zinc-800 rounded-xl flex items-center justify-center text-[10px] font-black text-yellow-400">{idx + 1}</div>
                        <input 
                          value={step} 
                          onChange={e => {
                            const newSteps = [...steps];
                            newSteps[idx] = e.target.value;
                            setSteps(newSteps);
                          }}
                          placeholder={`Passo ${idx + 1}...`}
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 text-white outline-none focus:border-yellow-400 text-xs"
                        />
                      </div>
                    ))}
                    <button onClick={() => setSteps([...steps, ''])} className="text-[9px] font-black uppercase text-zinc-500 hover:text-yellow-400 mt-2 ml-12 transition-colors">+ Adicionar Próximo Passo</button>
                 </div>

                 <button onClick={saveProcess} disabled={isSaving || !processName || steps[0] === ''} className="w-full bg-white text-black py-5 rounded-2xl font-black uppercase text-xs hover:bg-zinc-200 transition-all active:scale-95 mt-4">
                   Salvar Processo de Venda
                 </button>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {processes.map(p => (
                <div key={p.id} className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-[32px]">
                   <h4 className="text-yellow-400 font-black uppercase text-[10px] tracking-widest mb-4 italic">{p.name}</h4>
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
           <div className="bg-zinc-900/50 p-10 rounded-[40px] border border-zinc-800 text-center max-w-2xl mx-auto">
              <h3 className="text-2xl font-black text-white italic mb-2">Ponte Digital Nobel</h3>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-10">Sincronize sua inteligência entre computadores</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-[32px] hover:border-blue-500/30 transition-all group">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400 text-xl mx-auto mb-4 group-hover:scale-110 transition-transform">🧬</div>
                    <h4 className="text-white font-black uppercase text-[10px] mb-2">DNA de Conhecimento</h4>
                    <p className="text-[9px] text-zinc-600 mb-6 leading-relaxed">Copia Regras, Processos e Estoque que você criou.</p>
                    <button onClick={generateSyncDNA} className="w-full bg-zinc-900 text-zinc-300 py-3 rounded-xl font-black uppercase text-[10px] hover:bg-zinc-800 border border-zinc-800">Gerar Código DNA</button>
                 </div>

                 <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-[32px] hover:border-yellow-400/30 transition-all group">
                    <div className="w-12 h-12 bg-yellow-400/10 rounded-2xl flex items-center justify-center text-yellow-400 text-xl mx-auto mb-4 group-hover:scale-110 transition-transform">📥</div>
                    <h4 className="text-white font-black uppercase text-[10px] mb-2">Receber Inteligência</h4>
                    <p className="text-[9px] text-zinc-600 mb-6 leading-relaxed">Integra conhecimentos vindos de outro computador.</p>
                    <button onClick={importSyncDNA} className="w-full bg-yellow-400 text-black py-3 rounded-xl font-black uppercase text-[10px] hover:bg-yellow-300 shadow-lg shadow-yellow-400/5">Colar Código DNA</button>
                 </div>
              </div>

              {syncCode && (
                <div className="mt-10 p-6 bg-zinc-950 border border-yellow-400/20 rounded-2xl animate-in zoom-in duration-300">
                   <p className="text-[9px] text-yellow-400 font-black uppercase mb-3">DNA Pronto para Viagem:</p>
                   <textarea readOnly value={syncCode} className="w-full bg-black border border-zinc-900 rounded-xl p-4 text-[7px] text-zinc-600 font-mono break-all h-24 outline-none" />
                   <button onClick={() => { navigator.clipboard.writeText(syncCode); alert("DNA Copiado!"); }} className="mt-4 text-white text-[9px] font-black uppercase hover:text-yellow-400 transition-all">📋 Copiar DNA</button>
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeManager;
