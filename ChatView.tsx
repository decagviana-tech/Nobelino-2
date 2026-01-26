
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Book, KnowledgeEntry, SalesGoal, EstimateItem, Estimate } from '../types';
import { INITIAL_INVENTORY } from '../data/mockInventory';
import { processUserQuery } from '../services/geminiService';
import { db } from '../services/db';
import Mascot from './Mascot';
import VoiceConsultant from './VoiceConsultant';

const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inventory, setInventory] = useState<Book[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [salesGoals, setSalesGoals] = useState<SalesGoal[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isApiActive, setIsApiActive] = useState(false);
  const [currentMood, setCurrentMood] = useState<'happy' | 'thinking' | 'surprised' | 'tired' | 'success'>('happy');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const hist = await db.get('nobel_chat_history');
    const savedInventory = await db.get('nobel_inventory');
    const savedKnowledge = await db.get('nobel_knowledge_base');
    const savedGoals = await db.get('nobel_sales_goals');
    
    setInventory(savedInventory || INITIAL_INVENTORY);
    setKnowledge(savedKnowledge || []);
    setSalesGoals(savedGoals || []);
    
    // @ts-ignore
    if (window.aistudio && window.aistudio.hasSelectedApiKey) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setIsApiActive(hasKey);
    }

    if (hist && hist.length > 0) setMessages(hist);
    else resetChat();
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [messages, isLoading]);

  const resetChat = async () => {
    const initialMsg: ChatMessage = { 
      role: 'assistant', 
      content: "🦉 Olá! Nobelino no balcão. Com qual colaborador da loja eu falo agora?", 
      timestamp: new Date() 
    };
    setMessages([initialMsg]);
    await db.save('nobel_chat_history', [initialMsg]);
  };

  const autoSaveEstimate = async (estData: Partial<Estimate>) => {
    if (!estData.items || estData.items.length === 0) return;

    const newEstimate: Estimate = {
      id: Date.now().toString(),
      customerName: estData.customerName || "Cliente Balcão",
      sellerName: "Equipe Nobel",
      items: estData.items as EstimateItem[],
      total: estData.total || 0,
      createdAt: new Date(),
      status: 'pending'
    };

    await db.saveEstimate(newEstimate);
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
      const freshKnowledge = await db.get('nobel_knowledge_base') || [];
      const freshGoals = await db.get('nobel_sales_goals') || [];
      const result = await processUserQuery(textToSend, inventory, messages, freshKnowledge, freshGoals);
      
      if (result.detectedEstimate) {
        await autoSaveEstimate(result.detectedEstimate);
      }

      const assistantMsg: ChatMessage = { 
        role: 'assistant', 
        content: result.responseText, 
        timestamp: new Date(),
        suggestedBooks: result.recommendedBooks,
        isLocalResponse: result.isLocalResponse,
        groundingUrls: result.groundingUrls
      };
      
      const newHistory = [...messages, userMsg, assistantMsg];
      setMessages(newHistory);
      await db.save('nobel_chat_history', newHistory);
      
      setCurrentMood(result.isLocalResponse ? 'success' : 'happy');
    } catch (e: any) {
      setCurrentMood('tired');
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `🦉 Verifique sua chave API.`, 
        timestamp: new Date() 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
       {isVoiceOpen && (
         <VoiceConsultant 
           inventory={inventory} 
           knowledge={knowledge} 
           onClose={() => setIsVoiceOpen(false)} 
         />
       )}

       <header className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10">
                <Mascot animated={isLoading} mood={currentMood} />
             </div>
             <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-zinc-100">Nobelino</h2>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${isApiActive ? 'bg-green-500' : 'bg-zinc-600'}`}></span>
                  <span className="text-[8px] font-black text-zinc-500 uppercase tracking-tighter italic">Assistente de Balcão</span>
                </div>
             </div>
          </div>
          <button onClick={resetChat} title="Nova Conversa" className="p-2.5 bg-zinc-900 rounded-xl text-zinc-500 hover:text-white transition-colors">🗑️</button>
       </header>

       <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-12">
         {messages.map((m, i) => (
           <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-6 rounded-[32px] text-sm leading-relaxed shadow-2xl ${
                m.role === 'user' ? 'bg-zinc-100 text-black font-semibold' : 'bg-zinc-900 text-zinc-200 border border-zinc-800'
              }`}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.role === 'assistant' && (
                  <button onClick={() => { navigator.clipboard.writeText(m.content); alert("Texto copiado!"); }} className="mt-4 text-[8px] font-black uppercase px-3 py-2 bg-zinc-800 text-zinc-500 rounded-lg hover:text-white transition-all">📋 Copiar Resposta</button>
                )}
              </div>
           </div>
         ))}
         {isLoading && (
           <div className="flex justify-start items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-zinc-900 border-2 border-yellow-400 border-t-transparent animate-spin"></div>
              <div className="bg-zinc-900/50 text-zinc-500 px-6 py-3 rounded-full text-[8px] font-black uppercase tracking-widest italic">Processando...</div>
           </div>
         )}
         <div ref={chatEndRef} />
       </div>

       <div className="p-6 bg-zinc-950 border-t border-zinc-900 relative z-20">
          <div className="max-w-4xl mx-auto flex gap-3">
             <button onClick={() => setIsVoiceOpen(true)} className="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center text-xl hover:border-yellow-400 transition-all">🎙️</button>
             <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Identifique-se ou peça o que precisa..." className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-white focus:border-yellow-400 outline-none transition-all placeholder:text-zinc-800" disabled={isLoading} />
             <button onClick={handleSend} disabled={isLoading || !input.trim()} className="bg-yellow-400 disabled:opacity-30 text-black px-8 rounded-2xl font-black uppercase text-xs hover:bg-yellow-300 transition-all shadow-xl shadow-yellow-400/10">Enviar</button>
          </div>
       </div>
    </div>
  );
};
export default ChatView;
