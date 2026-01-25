
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Book, KnowledgeEntry, SalesGoal } from '../types';
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
  const [savingId, setSavingId] = useState<number | null>(null);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
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

  const saveAsRule = async (index: number, content: string) => {
    setSavingId(index); // Estado de "Salvando..."
    
    // Sugere um título baseado no conteúdo (primeiros 30 caracteres)
    const suggestedTitle = content.substring(0, 30).split('\n')[0].replace('🦉', '').trim() + '...';
    const topic = prompt("Dê um título para esta regra de conhecimento:", suggestedTitle);
    
    if (topic !== null) { // Se não cancelou
      const finalTopic = topic.trim() || "Regra Manual";
      await db.addKnowledge(finalTopic, content);
      
      // Notifica o sistema para atualizar o ícone de notificação no menu
      window.dispatchEvent(new CustomEvent('nobel_rule_saved'));
      
      // Recarrega os dados locais para atualizar o contador no header
      await load();
      
      // Mantém o estado de sucesso por 2 segundos
      setTimeout(() => setSavingId(null), 2000);
    } else {
      setSavingId(null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setCurrentMood('thinking');

    try {
      const freshKnowledge = await db.get('nobel_knowledge_base') || [];
      const freshGoals = await db.get('nobel_sales_goals') || [];
      const result = await processUserQuery(userMsg.content, inventory, messages, freshKnowledge, freshGoals);
      
      const assistantMsg: ChatMessage = { 
        role: 'assistant', 
        content: result.responseText, 
        timestamp: new Date(),
        suggestedBooks: result.recommendedBooks,
        isLocalResponse: result.isLocalResponse
      };
      
      const newHistory = [...messages, userMsg, assistantMsg];
      setMessages(newHistory);
      await db.save('nobel_chat_history', newHistory);
      setCurrentMood(result.isLocalResponse ? 'success' : 'happy');
    } catch (e: any) {
      setCurrentMood('tired');
      const errorMsg: ChatMessage = { 
        role: 'assistant', 
        content: `🦉 Tive um problema ao acessar meu banco de dados. Pode repetir?`, 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, errorMsg]);
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
                <h2 className="text-sm font-black uppercase tracking-widest text-zinc-100">Nobelino Vendedor</h2>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  <span className="text-[8px] font-black text-zinc-500 uppercase tracking-tighter">
                    {inventory.length} LIVROS + {knowledge.length} REGRAS
                  </span>
                </div>
             </div>
          </div>
          <button onClick={resetChat} title="Limpar Conversa" className="p-2.5 bg-zinc-900 rounded-xl text-zinc-500 hover:text-white transition-colors">🗑️</button>
       </header>

       <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
         {messages.map((m, i) => (
           <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`group relative max-w-[85%] p-6 rounded-[32px] text-sm leading-relaxed shadow-2xl ${m.role === 'user' ? 'bg-zinc-100 text-black font-semibold' : 'bg-zinc-900 text-zinc-200 border border-zinc-800'}`}>
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                
                {m.role === 'assistant' && (
                  <div className="mt-5 flex flex-wrap gap-3 justify-between items-center border-t border-white/5 pt-4">
                    <button 
                      onClick={() => saveAsRule(i, m.content)}
                      className={`text-[9px] font-black uppercase px-4 py-2.5 rounded-xl transition-all active:scale-95 flex items-center gap-2 ${
                        savingId === i 
                          ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' 
                          : 'bg-yellow-400 text-black hover:bg-yellow-300 shadow-lg shadow-yellow-400/5'
                      }`}
                    >
                      {savingId === i ? '✓ REGRA SALVA!' : '+ SALVAR COMO REGRA'}
                    </button>
                    
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${m.isLocalResponse ? 'text-green-500 border-green-500/20 bg-green-500/5' : 'text-blue-400 border-blue-400/20 bg-blue-400/5'}`}>
                      {m.isLocalResponse ? 'MEMÓRIA LOCAL' : 'IA COGNITIVA'}
                    </span>
                  </div>
                )}

                {m.suggestedBooks && m.suggestedBooks.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {m.suggestedBooks.map(b => (
                      <div key={b.id} className="bg-black/40 p-3 rounded-2xl border border-white/5 flex justify-between items-center hover:border-yellow-400/30 transition-all">
                         <div className="overflow-hidden">
                            <p className="text-xs font-bold text-yellow-400 truncate">{b.title}</p>
                            <p className="text-[9px] text-zinc-500 uppercase font-black">ISBN: {b.isbn} | Estoque: {b.stockCount}</p>
                         </div>
                         <span className="text-xs font-black text-white ml-4 tabular-nums">R$ {Number(b.price).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
           </div>
         ))}
         {isLoading && (
           <div className="flex justify-start">
              <div className="bg-zinc-900/50 text-yellow-400/50 px-6 py-3 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border border-yellow-400/10 animate-pulse">Consultando Nobelino...</div>
           </div>
         )}
         <div ref={chatEndRef} />
       </div>

       <div className="p-6 bg-zinc-950 border-t border-zinc-900">
          <div className="max-w-4xl mx-auto flex gap-3">
             <button 
               onClick={() => setIsVoiceOpen(true)}
               title="Conversar por voz"
               className="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center text-xl hover:border-yellow-400 transition-all group active:scale-90 shadow-inner"
             >
                <span className="group-hover:scale-125 transition-transform duration-300">🎙️</span>
             </button>
             
             <input 
               value={input} 
               onChange={e => setInput(e.target.value)} 
               onKeyDown={e => e.key === 'Enter' && handleSend()}
               placeholder="Pergunte sobre a loja ou estoque..." 
               className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-white focus:border-yellow-400 outline-none transition-all placeholder:text-zinc-700 font-medium" 
               disabled={isLoading}
             />
             
             <button 
               onClick={handleSend} 
               disabled={isLoading || !input.trim()} 
               className="bg-yellow-400 disabled:opacity-30 text-black px-8 rounded-2xl font-black uppercase text-xs hover:bg-yellow-300 transition-all active:scale-95 shadow-xl shadow-yellow-400/5"
             >
               Vender
             </button>
          </div>
       </div>
    </div>
  );
};
export default ChatView;
