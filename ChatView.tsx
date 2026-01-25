
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Book, KnowledgeEntry, SalesGoal } from '../types';
import { INITIAL_INVENTORY } from '../data/mockInventory';
import { processUserQuery, speakText } from '../services/geminiService';
import { db } from '../services/db';
import Mascot from './Mascot';

const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inventory, setInventory] = useState<Book[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [salesGoals, setSalesGoals] = useState<SalesGoal[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [autoVoice, setAutoVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
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
    
    if (hist && hist.length > 0) setMessages(hist);
    else resetChat();
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const resetChat = async () => {
    const initialMsg: ChatMessage = { role: 'assistant', content: "🦉 Nobelino no balcão! Como posso ajudar a Livraria Nobel hoje?", timestamp: new Date() };
    setMessages([initialMsg]);
    await db.save('nobel_chat_history', [initialMsg]);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setCurrentMood('thinking');

    try {
      const result = await processUserQuery(userMsg.content, inventory, messages, knowledge, salesGoals);
      const assistantMsg: ChatMessage = { 
        role: 'assistant', 
        content: result.responseText, 
        timestamp: new Date(),
        suggestedBooks: result.recommendedBooks,
        groundingUrls: result.groundingUrls
      };
      
      const newHistory = [...messages, userMsg, assistantMsg];
      setMessages(newHistory);
      await db.save('nobel_chat_history', newHistory);
      setCurrentMood('happy');
    } catch (e) {
      setCurrentMood('tired');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
       <header className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12">
                <Mascot animated={isLoading} talking={isSpeaking} mood={currentMood} />
             </div>
             <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-zinc-100">Nobelino Consultor</h2>
                <span className="text-[8px] font-bold text-zinc-500 uppercase">🧠 {knowledge.length} Regras Ativas</span>
             </div>
          </div>
          <button onClick={resetChat} className="p-3 bg-zinc-900 rounded-xl text-zinc-600 hover:text-white">🗑️</button>
       </header>

       <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
         {messages.map((m, i) => (
           <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-5 rounded-[24px] text-sm ${m.role === 'user' ? 'bg-zinc-100 text-black' : 'bg-zinc-900 text-zinc-200 border border-zinc-800'}`}>
                {m.content}
                {m.suggestedBooks && m.suggestedBooks.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 gap-2">
                    {m.suggestedBooks.map(b => (
                      <div key={b.id} className="bg-zinc-800 p-3 rounded-xl border border-zinc-700">
                        <p className="text-xs font-bold text-yellow-400">{b.title}</p>
                        <p className="text-[10px] text-zinc-400">Estoque: {b.stockCount} | R$ {b.price.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
           </div>
         ))}
         {isLoading && (
           <div className="flex justify-start animate-pulse">
              <div className="bg-zinc-900 text-zinc-500 p-4 rounded-full text-xs font-black uppercase">🦉 Pensando...</div>
           </div>
         )}
         <div ref={chatEndRef} />
       </div>

       <div className="p-6 bg-zinc-950 border-t border-zinc-900">
          <div className="max-w-4xl mx-auto flex gap-3">
             <input 
               value={input} 
               onChange={e => setInput(e.target.value)} 
               onKeyDown={e => e.key === 'Enter' && handleSend()}
               placeholder="Pergunte sobre livros, metas ou regras..." 
               className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-white focus:border-yellow-400 outline-none" 
             />
             <button onClick={handleSend} className="bg-yellow-400 text-black px-8 rounded-2xl font-black uppercase text-xs">Enviar</button>
          </div>
       </div>
    </div>
  );
};
export default ChatView;
