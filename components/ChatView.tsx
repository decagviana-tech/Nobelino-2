import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Book, KnowledgeEntry, SalesGoal, UsageMetrics } from '../types';
import { INITIAL_INVENTORY } from '../data/mockInventory';
import { processUserQuery } from '../services/geminiService';
import { db } from '../services/db';
import Mascot from './Mascot';
import VoiceConsultant from './VoiceConsultant';

const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inventory, setInventory] = useState<Book[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [quotaCooldown, setQuotaCooldown] = useState(0);
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const [currentMood, setCurrentMood] = useState<'happy' | 'thinking' | 'surprised' | 'tired' | 'success'>('happy');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const hist = await db.get('nobel_chat_history');
        const savedInventory = await db.get('nobel_inventory');
        const savedKnowledge = await db.get('nobel_knowledge_base') || [];
        
        setInventory(savedInventory || INITIAL_INVENTORY);
        setKnowledge(savedKnowledge);
        
        if (hist && hist.length > 0) setMessages(hist);
        else resetChat();
      } catch (e) {
        resetChat();
      }
    };
    load();
  }, []);

  useEffect(() => {
    let timer: any;
    if (quotaCooldown > 0 || hasConnectionError) {
      setCurrentMood('tired');
      if (quotaCooldown > 0) {
        timer = setInterval(() => {
          setQuotaCooldown(c => Math.max(0, c - 1));
        }, 1000);
      }
    } else if (isLoading) {
      setCurrentMood('thinking');
    } else if (messages.length > 0 && messages[messages.length - 1].suggestedBooks?.length) {
      setCurrentMood('success');
    } else {
      setCurrentMood('happy');
    }
    return () => clearInterval(timer);
  }, [quotaCooldown, isLoading, messages, hasConnectionError]);

  const resetChat = async () => {
    const welcome = "🦉 Olá! Nobelino pronto para o balcão. Qual o desafio de vendas hoje?";
    const initialMsg: ChatMessage = { role: 'assistant', content: welcome, timestamp: new Date() };
    setMessages([initialMsg]);
    setHasConnectionError(false);
    await db.save('nobel_chat_history', [initialMsg]);
  };

  const incrementUsage = async () => {
    const today = new Date().toISOString().split('T')[0];
    const metrics: UsageMetrics = await db.get('nobel_usage_metrics') || { dailyRequests: 0, lastResetDate: today, totalTokensEstimate: 0 };
    
    if (metrics.lastResetDate !== today) {
      metrics.dailyRequests = 1;
      metrics.lastResetDate = today;
    } else {
      metrics.dailyRequests += 1;
    }
    await db.save('nobel_usage_metrics', metrics);
    window.dispatchEvent(new CustomEvent('nobel_usage_updated'));
  };

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading || quotaCooldown > 0) return;
    
    const userMsg: ChatMessage = { role: 'user', content: trimmedInput, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setHasConnectionError(false);

    try {
      const latestGoals = await db.get('nobel_sales_goals') || [];
      const latestKnowledge = await db.get('nobel_knowledge_base') || [];
      const latestInventory = await db.get('nobel_inventory') || inventory;
      
      const result = await processUserQuery(trimmedInput, latestInventory, messages, latestKnowledge, latestGoals);
      
      if (result.isQuotaError) {
        setQuotaCooldown(60);
      } else {
        await incrementUsage();
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: result.responseText, 
          timestamp: new Date(),
          suggestedBooks: result.recommendedBooks,
          groundingUrls: result.groundingUrls
        }]);
      }
    } catch (e: any) {
      console.error("Erro Nobelino:", e);
      setHasConnectionError(true);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '🦉 Ops! Minha inteligência está desligada. Parece que a API_KEY não foi configurada no Netlify. Siga o passo a passo para me ativar!', 
        timestamp: new Date() 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
       {isVoiceActive && <VoiceConsultant inventory={inventory} knowledge={knowledge} onClose={() => setIsVoiceActive(false)} />}
       
       <header className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12">
                <Mascot animated={isLoading || currentMood === 'success'} talking={isLoading} mood={currentMood} />
             </div>
             <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-zinc-100">Consultor Nobelino</h2>
                <p className="text-[7px] text-zinc-600 font-bold uppercase tracking-[0.4em]">Inteligência de Vendas Ativa</p>
             </div>
          </div>
          <div className="flex gap-2">
            <button onClick={resetChat} className="p-3 bg-zinc-900 rounded-xl text-zinc-600 hover:text-white transition-all">🗑️</button>
            <button 
              onClick={() => setIsVoiceActive(true)} 
              disabled={quotaCooldown > 0}
              className={`bg-yellow-400 text-black px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-yellow-400/20 active:scale-95 ${quotaCooldown > 0 ? 'opacity-20' : ''}`}
            >
              🎙️ ATENDER VIA VOZ
            </button>
          </div>
       </header>
       
       <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-10 custom-scrollbar">
         {hasConnectionError && (
           <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-[40px] mb-8 animate-in slide-in-from-top-4">
             <h3 className="text-red-500 font-black uppercase text-xs tracking-widest mb-4">⚠️ Falha de Configuração</h3>
             <p className="text-zinc-400 text-sm leading-relaxed mb-6">
               O Nobelino precisa de uma <b>API_KEY</b> para funcionar. Vá ao painel do Netlify e adicione a variável de ambiente.
             </p>
             <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="inline-block bg-white text-black px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-yellow-400 transition-all">
               Pegar minha Chave Grátis ↗
             </a>
           </div>
         )}

         {messages.map((m, i) => (
           <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} w-full animate-in fade-in slide-in-from-bottom-4 group`}>
              <div className={`max-w-[85%] p-6 rounded-[32px] text-sm shadow-2xl relative transition-all ${m.role === 'user' ? 'bg-zinc-100 text-black font-semibold' : 'bg-zinc-900 text-zinc-200 border border-zinc-800'}`}>
                {(m.content || "").split('\n').map((line, idx) => (
                  <p key={idx} className="mb-3">{line}</p>
                ))}
              </div>

              {m.suggestedBooks && m.suggestedBooks.length > 0 && (
                <div className="mt-6 w-full flex gap-5 overflow-x-auto pb-6 snap-x custom-scrollbar">
                  {m.suggestedBooks.map(book => (
                    <div key={book.id} className="min-w-[280px] bg-zinc-900 border border-zinc-800 p-6 rounded-[40px] snap-start relative overflow-hidden group/card hover:border-yellow-400/50 transition-all">
                      <h4 className="font-black text-white text-lg leading-tight mb-1 line-clamp-1">{book.title}</h4>
                      <p className="text-[10px] font-black text-zinc-500 uppercase mb-4">{book.author}</p>
                      <div className="flex justify-between items-end">
                         <p className="font-black text-xl text-yellow-400">R$ {book.price.toFixed(2)}</p>
                         <p className="text-[9px] font-bold text-zinc-600 uppercase">{book.stockCount} UN</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
           </div>
         ))}
         <div ref={chatEndRef} />
       </div>

       <div className="p-6 md:p-8 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-900">
          <div className="max-w-4xl mx-auto flex gap-4">
             <input 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Como posso te ajudar a vender?"
                className={`flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-8 py-5 focus:outline-none transition-all text-sm text-white shadow-inner focus:border-yellow-400`}
                disabled={isLoading || quotaCooldown > 0}
             />
             <button 
               onClick={handleSend} 
               disabled={isLoading || !input.trim() || quotaCooldown > 0}
               className="bg-yellow-400 text-black px-10 rounded-2xl font-black uppercase text-[12px] tracking-widest hover:scale-105 transition-all shadow-xl shadow-yellow-400/20 active:scale-95 disabled:opacity-30"
             >
               VENDER
             </button>
          </div>
       </div>
    </div>
  );
};
export default ChatView;