
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Book, KnowledgeEntry, PortableProcess, Estimate, EstimateItem } from '../types';
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
      content: "🦉 Nobelino na escuta! Antes de começarmos o atendimento, com qual colaborador eu falo agora?", 
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
      const result = await processUserQuery(
        textToSend, 
        inventory, 
        messages, 
        knowledge, 
        processes
      );

      // Conferência de Segurança de Preços
      if (result.detectedEstimate) {
        const correctedItems = (result.detectedEstimate.items || []).map(item => {
          const realBook = inventory.find(b => 
            (item.isbn && b.isbn === item.isbn) || 
            (b.title.toLowerCase().includes(item.title?.toLowerCase() || ''))
          );
          return {
            ...item,
            price: realBook ? Number(realBook.price) : Number(item.price),
            status: realBook ? 'available' : 'order'
          };
        });

        const newEstimate: Estimate = {
          id: `EST-${Date.now()}`,
          customerName: result.detectedEstimate.customerName || "Cliente Nobel",
          sellerName: "Consultor Nobelino",
          items: correctedItems as EstimateItem[],
          total: correctedItems.reduce((acc, curr) => acc + curr.price, 0),
          createdAt: new Date(),
          status: 'pending'
        };
        await db.saveEstimate(newEstimate);
        setCurrentMood('success');
      }
      
      const assistantMsg: ChatMessage = { 
        role: 'assistant', 
        content: result.responseText, 
        timestamp: new Date(),
        groundingUrls: result.groundingUrls
      };
      
      const newHistory = [...messages, userMsg, assistantMsg];
      setMessages(newHistory);
      await db.save('nobel_chat_history', newHistory);
      if (currentMood !== 'success') setCurrentMood('happy');
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
                <h2 className="text-sm font-black uppercase text-zinc-100 tracking-widest italic">Nobelino • IA de Balcão</h2>
                <span className="text-[8px] font-black text-zinc-500 uppercase italic">Conectado ao Estoque Local & Google Search</span>
             </div>
          </div>
          <button onClick={resetChat} title="Nova Sessão" className="p-2 text-zinc-600 hover:text-white transition-colors">🗑️</button>
       </header>

       <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-12">
         {messages.map((m, i) => (
           <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-5 rounded-[24px] text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-zinc-100 text-black font-semibold' : 'bg-zinc-900 text-zinc-200 border border-zinc-800 shadow-2xl'
              }`}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                
                {m.groundingUrls && m.groundingUrls.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2">
                    <p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Fontes de Pesquisa:</p>
                    {m.groundingUrls.map((u, idx) => (
                      <a key={idx} href={u.uri} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-blue-400 hover:underline truncate">
                        🔗 {u.title}
                      </a>
                    ))}
                  </div>
                )}

                {m.role === 'assistant' && i > 0 && (
                  <button onClick={() => { navigator.clipboard.writeText(m.content); }} className="mt-4 text-[8px] font-black uppercase px-2 py-1 bg-zinc-800 text-zinc-500 rounded hover:text-white transition-colors">📋 Copiar para o Sistema</button>
                )}
              </div>
           </div>
         ))}
         {isLoading && (
           <div className="flex justify-start">
              <div className="bg-zinc-900/50 text-zinc-600 px-6 py-3 rounded-full text-[9px] font-black uppercase animate-pulse tracking-widest flex items-center gap-3">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-ping"></span>
                Consultando Estoque e Tendências...
              </div>
           </div>
         )}
         <div ref={chatEndRef} />
       </div>

       <div className="p-6 bg-zinc-950 border-t border-zinc-900 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
          <div className="max-w-4xl mx-auto flex gap-3">
             <button onClick={() => setIsVoiceOpen(true)} className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center text-xl border border-zinc-800 hover:border-yellow-400/50 transition-all shadow-lg active:scale-95 group">
                <span className="group-hover:scale-125 transition-transform">🎙️</span>
             </button>
             <input 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleSend()} 
              placeholder="Ex: 'Qual o lançamento da Hoover?' ou 'Faz um orçamento de Coraline'" 
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-white focus:border-yellow-400 outline-none transition-all placeholder:text-zinc-700" 
              disabled={isLoading} 
             />
             <button 
              onClick={handleSend} 
              disabled={isLoading || !input.trim()} 
              className="bg-yellow-400 text-black px-8 rounded-2xl font-black uppercase text-xs hover:bg-yellow-300 transition-all active:scale-95 disabled:opacity-50 shadow-[0_0_20px_rgba(250,204,21,0.2)]"
             >
               Consultar
             </button>
          </div>
       </div>
    </div>
  );
};
export default ChatView;
