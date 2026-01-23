
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
  const [consecutiveQuotaErrors, setConsecutiveQuotaErrors] = useState(0);
  const [brainStress, setBrainStress] = useState(0); 
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
    if (quotaCooldown > 0) {
      timer = setInterval(() => {
        setQuotaCooldown(c => Math.max(0, c - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [quotaCooldown]);

  const resetChat = async () => {
    const welcome = "🦉 Olá! Nobelino pronto para o balcão. Qual o desafio de vendas hoje?";
    const initialMsg: ChatMessage = { role: 'assistant', content: welcome, timestamp: new Date() };
    setMessages([initialMsg]);
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
    setBrainStress(prev => Math.min(100, prev + 10));
  };

  const saveAsRule = async (content: string) => {
    const currentKnowledge = await db.get('nobel_knowledge_base') || [];
    const newRule: KnowledgeEntry = {
      id: Date.now().toString(),
      topic: `Regra de Ouro (${new Date().toLocaleDateString('pt-BR')})`,
      content: content,
      type: 'rule',
      active: true
    };
    const updated = [newRule, ...currentKnowledge];
    await db.save('nobel_knowledge_base', updated);
    setKnowledge(updated);
    alert("🧠 Resposta eternizada nas Regras Comerciais!");
  };

  useEffect(() => {
    if (messages.length > 0) db.save('nobel_chat_history', messages);
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading || quotaCooldown > 0) return;
    
    const userMsg: ChatMessage = { role: 'user', content: trimmedInput, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const latestGoals = await db.get('nobel_sales_goals') || [];
      const latestKnowledge = await db.get('nobel_knowledge_base') || [];
      const latestInventory = await db.get('nobel_inventory') || inventory;
      
      const result = await processUserQuery(trimmedInput, latestInventory, messages, latestKnowledge, latestGoals);
      
      if (result.isQuotaError) {
        setQuotaCooldown(60);
        setConsecutiveQuotaErrors(prev => prev + 1);
        setBrainStress(100);
      } else {
        setConsecutiveQuotaErrors(0);
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
      setMessages(prev => [...prev, { role: 'assistant', content: '🦉 Minha conexão falhou. Vamos tentar de novo?', timestamp: new Date() }]);
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
                <Mascot animated={isLoading} talking={isLoading} mood={quotaCooldown > 0 ? 'tired' : 'happy'} />
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
         {messages.map((m, i) => (
           <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} w-full animate-in fade-in slide-in-from-bottom-4 group`}>
              <div className={`max-w-[85%] p-6 rounded-[32px] text-sm shadow-2xl relative transition-all ${m.role === 'user' ? 'bg-zinc-100 text-black font-semibold' : 'bg-zinc-900 text-zinc-200 border border-zinc-800'}`}>
                {(m.content || "").split('\n').map((line, idx) => (
                  <p key={idx} className="mb-3">{line}</p>
                ))}

                {m.role === 'assistant' && i > 0 && (
                   <div className="absolute -bottom-4 right-6 opacity-0 group-hover:opacity-100 transition-all duration-300">
                      <button 
                        onClick={() => saveAsRule(m.content)}
                        className="flex items-center gap-2 bg-zinc-950 border border-zinc-700 hover:border-blue-400 px-3 py-2 rounded-xl text-[9px] font-black text-blue-400 uppercase tracking-widest shadow-2xl"
                      >
                         🧠 Gravar no Cérebro
                      </button>
                   </div>
                )}
              </div>

              {m.suggestedBooks && m.suggestedBooks.length > 0 && (
                <div className="mt-6 w-full flex gap-5 overflow-x-auto pb-6 snap-x custom-scrollbar">
                  {m.suggestedBooks.map(book => (
                    <div key={book.id} className="min-w-[280px] bg-zinc-900 border border-zinc-800 p-6 rounded-[40px] snap-start relative overflow-hidden group/card hover:border-yellow-400/50 transition-all">
                      {book.stockCount < 3 && <div className="absolute top-4 right-4 text-[7px] font-black bg-red-500 text-white px-2 py-1 rounded-full animate-pulse">ESTOQUE BAIXO</div>}
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

              {m.groundingUrls && m.groundingUrls.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                   {m.groundingUrls.map((url, idx) => (
                     <a key={idx} href={url.uri} target="_blank" rel="noreferrer" className="text-[9px] font-black text-zinc-500 uppercase bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all">
                       🔗 {url.title}
                     </a>
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
