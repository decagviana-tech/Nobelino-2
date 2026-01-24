import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Book, KnowledgeEntry, SalesGoal, UsageMetrics } from '../types';
import { INITIAL_INVENTORY } from '../data/mockInventory';
import { processUserQuery, speakText } from '../services/geminiService';
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
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [autoVoice, setAutoVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [quotaCooldown, setQuotaCooldown] = useState(0);
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const [currentMood, setCurrentMood] = useState<'happy' | 'thinking' | 'surprised' | 'tired' | 'success'>('happy');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const load = async () => {
    try {
      const hist = await db.get('nobel_chat_history');
      const savedInventory = await db.get('nobel_inventory');
      const savedKnowledge = await db.get('nobel_knowledge_base') || [];
      const savedGoals = await db.get('nobel_sales_goals') || [];
      
      setInventory(savedInventory || INITIAL_INVENTORY);
      setKnowledge(savedKnowledge);
      setSalesGoals(savedGoals);
      
      if (hist && hist.length > 0) {
        setMessages(hist);
      } else {
        resetChat();
      }
    } catch (e) {
      resetChat();
    }
  };

  useEffect(() => {
    load();
    window.addEventListener('nobel_usage_updated', load);
    return () => window.removeEventListener('nobel_usage_updated', load);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let timer: any;
    if (quotaCooldown > 0 || hasConnectionError) {
      setCurrentMood('tired');
      if (quotaCooldown > 0) {
        timer = setInterval(() => setQuotaCooldown(c => Math.max(0, c - 1)), 1000);
      }
    } else if (isLoading) {
      setCurrentMood('thinking');
    } else if (isSpeaking) {
      setCurrentMood('happy');
    } else if (messages.length > 0 && messages[messages.length - 1].suggestedBooks?.length) {
      setCurrentMood('success');
    } else {
      setCurrentMood('happy');
    }
    return () => clearInterval(timer);
  }, [quotaCooldown, isLoading, messages, hasConnectionError, isSpeaking]);

  const resetChat = async () => {
    const welcome = "🦉 Olá! Nobelino pronto para o balcão. Qual o desafio de vendas hoje?";
    const initialMsg: ChatMessage = { role: 'assistant', content: welcome, timestamp: new Date() };
    setMessages([initialMsg]);
    setHasConnectionError(false);
    await db.save('nobel_chat_history', [initialMsg]);
  };

  const decodeAudio = async (base64: string, ctx: AudioContext) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const dataInt16 = new Int16Array(bytes.buffer);
    const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
    return buffer;
  };

  const playResponse = async (text: string) => {
    if (isSpeaking || !text) return;
    setIsSpeaking(true);
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      
      const audioData = await speakText(text);
      if (audioData) {
        const buffer = await decodeAudio(audioData, audioContextRef.current);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsSpeaking(false);
        source.start(0);
      } else {
        setIsSpeaking(false);
      }
    } catch (e) {
      setIsSpeaking(false);
    }
  };

  const handleSaveToKnowledge = async (text: string) => {
    try {
      const current = await db.get('nobel_knowledge_base') || [];
      const newEntry: KnowledgeEntry = {
        id: Date.now().toString(),
        topic: "Sugestão Nobelino",
        content: text,
        type: 'rule',
        active: true
      };
      const updated = [newEntry, ...current];
      await db.save('nobel_knowledge_base', updated);
      alert("🧠 Nobelino memorizou essa instrução!");
    } catch (e) {
      console.error(e);
    }
  };

  const openDistributor = (dist: 'catavento' | 'ramalivros', query: string) => {
    const url = dist === 'catavento' 
      ? `https://www.cataventobr.com.br/busca?q=${encodeURIComponent(query)}`
      : `https://www.ramalivros.com.br/busca?q=${encodeURIComponent(query)}`;
    window.open(url, '_blank');
  };

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading || quotaCooldown > 0) return;
    
    const userMsg: ChatMessage = { role: 'user', content: trimmedInput, timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setHasConnectionError(false);

    try {
      const result = await processUserQuery(trimmedInput, inventory, messages, knowledge, salesGoals);
      
      if (result.isQuotaError) {
        setQuotaCooldown(60);
      } else {
        const assistantMsg: ChatMessage = { 
          role: 'assistant', 
          content: result.responseText || "🦉 Conectado!", 
          timestamp: new Date(),
          suggestedBooks: result.recommendedBooks,
          groundingUrls: result.groundingUrls
        };
        const finalHistory = [...newMessages, assistantMsg];
        setMessages(finalHistory);
        await db.save('nobel_chat_history', finalHistory);
        if (autoVoice) playResponse(assistantMsg.content);
      }
    } catch (e: any) {
      setHasConnectionError(true);
      const errorMsg: ChatMessage = { 
        role: 'assistant', 
        content: `🦉 Opa! Perdi a conexão. Pode repetir?`, 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, errorMsg]);
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
                <Mascot animated={isLoading} talking={isLoading || isSpeaking} mood={currentMood} />
             </div>
             <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-zinc-100">Nobelino Balcão</h2>
                <div className="flex items-center gap-2 mt-1">
                   <button 
                     onClick={() => setAutoVoice(!autoVoice)}
                     className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${autoVoice ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-zinc-800 text-zinc-600'}`}
                   >
                     {autoVoice ? 'Voz ON' : 'Voz OFF'}
                   </button>
                </div>
             </div>
          </div>
          <div className="flex gap-2">
            <button onClick={resetChat} className="p-3 bg-zinc-900 rounded-xl text-zinc-600 hover:text-white transition-all">🗑️</button>
            <button 
              onClick={() => setIsVoiceActive(true)} 
              disabled={quotaCooldown > 0}
              className={`bg-yellow-400 text-black px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-yellow-400/20 ${quotaCooldown > 0 ? 'opacity-20' : ''}`}
            >
              🎙️ VOZ
            </button>
          </div>
       </header>
       
       <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-10 custom-scrollbar">
         {messages.map((m, i) => (
           <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} w-full animate-in fade-in slide-in-from-bottom-4 group`}>
              <div className={`max-w-[85%] p-6 rounded-[32px] text-sm shadow-2xl relative transition-all ${m.role === 'user' ? 'bg-zinc-100 text-black font-semibold' : 'bg-zinc-900 text-zinc-200 border border-zinc-800'}`}>
                {m.role === 'assistant' && (
                  <div className="absolute -right-12 top-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => playResponse(m.content)} className="p-2 bg-zinc-800 rounded-full text-lg shadow-lg">🔊</button>
                    <button onClick={() => handleSaveToKnowledge(m.content)} className="p-2 bg-zinc-800 rounded-full text-lg shadow-lg">🧠</button>
                  </div>
                )}
                {(m.content || "").split('\n').map((line, idx) => (
                  <p key={idx} className="mb-3">{line}</p>
                ))}

                {m.groundingUrls && m.groundingUrls.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2">
                    <p className="text-[9px] font-black text-zinc-600 uppercase">Fontes Externas:</p>
                    {m.groundingUrls.map((g, idx) => (
                      <a key={idx} href={g.uri} target="_blank" rel="noreferrer" className="block text-[10px] text-blue-400 hover:underline truncate">🔗 {g.title}</a>
                    ))}
                  </div>
                )}
              </div>

              {m.suggestedBooks && m.suggestedBooks.length > 0 && (
                <div className="mt-6 w-full flex gap-5 overflow-x-auto pb-6 snap-x custom-scrollbar">
                  {m.suggestedBooks.map(book => (
                    <div key={book.id} className="min-w-[300px] bg-zinc-900 border border-zinc-800 p-6 rounded-[40px] snap-start relative group/card">
                      <h4 className="font-black text-white text-lg leading-tight mb-1">{book.title}</h4>
                      <p className="text-[10px] font-black text-zinc-500 uppercase mb-4">{book.author}</p>
                      
                      <div className="flex justify-between items-center mb-6">
                         <div>
                            <p className="font-black text-xl text-yellow-400">R$ {book.price.toFixed(2)}</p>
                            <p className={`text-[9px] font-black uppercase ${book.stockCount > 0 ? 'text-zinc-600' : 'text-red-500'}`}>{book.stockCount > 0 ? `${book.stockCount} UN EM ESTOQUE` : 'ESTOQUE ZERADO'}</p>
                         </div>
                      </div>

                      <div className="flex gap-2">
                         <button 
                           onClick={() => openDistributor('catavento', book.isbn || book.title)}
                           className="flex-1 bg-zinc-950 border border-zinc-800 py-3 rounded-2xl text-[9px] font-black uppercase text-blue-400 hover:border-blue-500 transition-all"
                         >
                           🔍 Catavento
                         </button>
                         <button 
                           onClick={() => openDistributor('ramalivros', book.isbn || book.title)}
                           className="flex-1 bg-zinc-950 border border-zinc-800 py-3 rounded-2xl text-[9px] font-black uppercase text-pink-400 hover:border-pink-500 transition-all"
                         >
                           🔍 Ramalivros
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
           </div>
         ))}
         {isLoading && (
           <div className="flex items-start w-full animate-pulse">
              <div className="bg-zinc-900 text-zinc-500 p-6 rounded-[32px] text-xs font-black uppercase tracking-widest border border-zinc-800">
                🦉 Pesquisando no acervo e na web...
              </div>
           </div>
         )}
         <div ref={chatEndRef} />
       </div>

       <div className="p-6 md:p-8 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-900">
          <div className="max-w-4xl mx-auto flex gap-4">
             <input 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="ISBN, Título ou Dúvida de Venda..."
                className={`flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-8 py-5 focus:outline-none transition-all text-sm text-white focus:border-yellow-400`}
                disabled={isLoading || quotaCooldown > 0}
             />
             <button 
               onClick={handleSend} 
               disabled={isLoading || !input.trim() || quotaCooldown > 0}
               className="bg-yellow-400 text-black px-10 rounded-2xl font-black uppercase text-[12px] tracking-widest shadow-xl shadow-yellow-400/20 active:scale-95"
             >
               BUSCAR
             </button>
          </div>
       </div>
    </div>
  );
};
export default ChatView;