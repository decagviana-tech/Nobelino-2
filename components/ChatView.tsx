
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Book, EstimateItem, Estimate, KnowledgeEntry, SalesGoal, PortableProcess } from '../types';
import { INITIAL_INVENTORY } from '../data/mockInventory';
import { processUserQuery } from '../services/geminiService';
import { db } from '../services/db';
import Mascot from './Mascot';
import VoiceConsultant from './VoiceConsultant';

const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inventory, setInventory] = useState<Book[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [processes, setProcesses] = useState<PortableProcess[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [currentMood, setCurrentMood] = useState<'happy' | 'thinking' | 'surprised' | 'tired' | 'success'>('happy');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const hist = await db.get('nobel_chat_history');
    const savedInventory = await db.get('nobel_inventory');
    const savedKnowledge = await db.get('nobel_knowledge_base') || [];
    const savedProcesses = await db.get('nobel_processes') || [];
    
    setInventory(savedInventory || INITIAL_INVENTORY);
    setKnowledge(savedKnowledge);
    setProcesses(savedProcesses);
    
    if (hist && hist.length > 0) setMessages(hist);
    else resetChat();
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  const resetChat = async () => {
    const initialMsg: ChatMessage = { 
      role: 'assistant', 
      content: "Olá! Nobelino no balcão. Com qual colaborador da loja eu falo agora? 🦉", 
      timestamp: new Date() 
    };
    setMessages([initialMsg]);
    await db.save('nobel_chat_history', [initialMsg]);
  };

  const handleSend = async () => {
    const textToSend = input.trim();
    if (!textToSend || isLoading) return;
    
    const userMsg: ChatMessage = { role: 'user', content: textToSend, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setCurrentMood('thinking');

    try {
      const currentKnowledge = await db.get('nobel_knowledge_base') || [];
      const currentProcesses = await db.get('nobel_processes') || [];
      const currentInventory = await db.get('nobel_inventory') || INITIAL_INVENTORY;
      
      const result = await processUserQuery(
        textToSend, 
        currentInventory, 
        messages, 
        currentKnowledge, 
        [], 
        currentProcesses
      );
      
      const assistantMsg: ChatMessage = { 
        role: 'assistant', 
        content: result.responseText, 
        timestamp: new Date()
      };
      
      const newHistory = [...messages, userMsg, assistantMsg];
      setMessages(newHistory);
      await db.save('nobel_chat_history', newHistory);
      setCurrentMood('happy');
    } catch (e: any) {
      setCurrentMood('tired');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
       {isVoiceOpen && <VoiceConsultant inventory={inventory} knowledge={knowledge} onClose={() => setIsVoiceOpen(false)} />}
       
       <header className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10">
                <Mascot animated={isLoading} mood={currentMood} />
             </div>
             <div>
                <div className="flex items-center gap-2">
                   <h2 className="text-sm font-black uppercase text-zinc-100">Nobelino</h2>
                   {(knowledge.length > 0 || processes.length > 0) && (
                     <span className="text-yellow-400 text-[10px] animate-pulse">✨</span>
                   )}
                </div>
                <span className="text-[8px] font-black text-zinc-500 uppercase italic">
                  Livraria Nobel • {knowledge.length + processes.length} Memórias Ativas
                </span>
             </div>
          </div>
          <div className="flex gap-1">
            <button onClick={load} title="Sincronizar Cérebro" className="p-2 text-zinc-600 hover:text-yellow-400 transition-colors">🔄</button>
            <button onClick={resetChat} title="Limpar Conversa" className="p-2 text-zinc-600 hover:text-red-400 transition-colors">🗑️</button>
          </div>
       </header>

       <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-12">
         {messages.map((m, i) => (
           <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-5 rounded-[24px] text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-zinc-100 text-black font-semibold' : 'bg-zinc-900 text-zinc-200 border border-zinc-800 shadow-xl'
              }`}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.role === 'assistant' && i > 0 && (
                  <button onClick={() => { navigator.clipboard.writeText(m.content); }} className="mt-4 text-[8px] font-black uppercase px-2 py-1 bg-zinc-800 text-zinc-500 rounded hover:text-white">📋 Copiar</button>
                )}
              </div>
           </div>
         ))}
         {isLoading && (
           <div className="flex justify-start">
              <div className="bg-zinc-900/50 text-zinc-600 px-4 py-2 rounded-full text-[8px] font-black uppercase italic animate-pulse">Lendo memórias do cérebro...</div>
           </div>
         )}
         <div ref={chatEndRef} />
       </div>

       <div className="p-6 bg-zinc-950 border-t border-zinc-900 shadow-2xl">
          <div className="max-w-4xl mx-auto flex gap-3">
             <button onClick={() => setIsVoiceOpen(true)} className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center text-xl border border-zinc-800 hover:border-yellow-400/50 transition-all shadow-lg active:scale-95">🎙️</button>
             <input 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleSend()} 
              placeholder="Diga quem é ou o que precisa..." 
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-white focus:border-yellow-400 outline-none transition-all" 
              disabled={isLoading} 
             />
             <button 
              onClick={handleSend} 
              disabled={isLoading || !input.trim()} 
              className="bg-yellow-400 text-black px-8 rounded-2xl font-black uppercase text-xs hover:bg-yellow-300 transition-all active:scale-95 disabled:opacity-50"
             >
               Enviar
             </button>
          </div>
       </div>
    </div>
  );
};
export default ChatView;
