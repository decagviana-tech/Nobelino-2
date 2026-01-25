import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Book, KnowledgeEntry, SalesGoal } from '../types';
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
  const [currentMood, setCurrentMood] = useState<'happy' | 'thinking' | 'surprised' | 'tired' | 'success'>('happy');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

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
    window.addEventListener('nobel_usage_updated', load);
    return () => window.removeEventListener('nobel_usage_updated', load);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let timer: any;
    if (quotaCooldown > 0) {
      setCurrentMood('tired');
      timer = setInterval(() => setQuotaCooldown(c => Math.max(0, c - 1)), 1000);
    } else if (isLoading) {
      setCurrentMood('thinking');
    } else {
      setCurrentMood('happy');
    }
    return () => clearInterval(timer);
  }, [quotaCooldown, isLoading]);

  const resetChat = async () => {
    const initialMsg: ChatMessage = { role: 'assistant', content: "🦉 Nobelino no balcão! O que vamos vender hoje?", timestamp: new Date() };
    setMessages([initialMsg]);
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
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const audioData = await speakText(text);
      if (audioData) {
        const buffer = await decodeAudio(audioData, audioContextRef.current);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsSpeaking(false);
        source.start(0);
      } else setIsSpeaking(false);
    } catch (e) { setIsSpeaking(false); }
  };

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input.trim();
    if (!textToSend || isLoading) return;
    
    // Se for entrada manual (não override do botão retentar), adiciona ao chat
    if (!overrideInput) {
      const userMsg: ChatMessage = { role: 'user', content: textToSend, timestamp: new Date() };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
    }
    
    setIsLoading(true);
    try {
      // Passando explicitamente o knowledge e salesGoals para o serviço
      const result = await processUserQuery(textToSend, inventory, messages, knowledge, salesGoals);
      
      if (result.isQuotaError) {
        setQuotaCooldown(20);
      }

      const assistantMsg: ChatMessage = { 
        role: 'assistant', 
        content: result.responseText, 
        timestamp: new Date(),
        suggestedBooks: result.recommendedBooks,
        groundingUrls: result.groundingUrls,
        isQuotaError: result.isQuotaError
      };
      
      const newHistory = [...messages];
      if (!overrideInput) {
        newHistory.push({ role: 'user', content: textToSend, timestamp: new Date() });
      }
      newHistory.push(assistantMsg);

      setMessages(prev => [...prev.filter(m => m.role !== 'assistant' || !m.isQuotaError), assistantMsg]);
      await db.save('nobel_chat_history', newHistory);
      
      if (autoVoice && !result.isQuotaError) playResponse(assistantMsg.content);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "🦉 Tive um apagão. Pode repetir?", timestamp: new Date() }]);
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
                <Mascot animated={isLoading} talking={isSpeaking} mood={currentMood} />
             </div>
             <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-zinc-100">Nobelino Balcão</h2>
                <div className="flex items-center gap-2 mt-1">
                   <button onClick={() => setAutoVoice(!autoVoice)} className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${autoVoice ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-zinc-800 text-zinc-600'}`}>{autoVoice ? 'Voz ON' : 'Voz OFF'}</button>
                   {quotaCooldown > 0 && <span className="text-[8px] font-black text-yellow-500 uppercase animate-pulse">● Aguardando ({quotaCooldown}s)</span>}
                   <span className="text-[8px] font-bold text-zinc-500 uppercase">🧠 {knowledge.length} Regras Ativas</span>
                </div>
             </div>
          </div>
          <button onClick={resetChat} className="p-3 bg-zinc-900 rounded-xl text-zinc-600 hover:text-white transition-all">🗑️</button>
       </header>

       <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-10 custom-scrollbar">
         {messages.map((m, i) => (
           <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} w-full animate-in fade-in slide-in-from-bottom-4 group`}>
              <div className={`max-w-[85%] p-6 rounded-[32px] text-sm shadow-2xl relative transition-all ${m.role === 'user' ? 'bg-zinc-100 text-black font-semibold' : 'bg-zinc-900 text-zinc-200 border border-zinc-800'} ${m.isQuotaError ? 'border-yellow-500/50 bg-yellow-500/5' : ''}`}>
                {m.content.split('\n').map((line, idx) => <p key={idx} className="mb-3">{line}</p>)}
                
                {m.isQuotaError && (
                  <button 
                    onClick={() => handleSend(messages[i-1]?.content)}
                    className="mt-4 w-full py-4 bg-yellow-400 text-black rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-yellow-400/20"
                  >
                    🔄 Tentar Pergunta de Novo
                  </button>
                )}

                {m.suggestedBooks && m.suggestedBooks.length > 0 && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {m.suggestedBooks.map(b => (
                      <div key={b.id} className="bg-zinc-800 p-4 rounded-2xl border border-zinc-700 min-w-[150px] max-w-[200px]">
                        <p className="text-[10px] font-bold text-white mb-1">{b.title}</p>
                        <p className="text-[8px] text-zinc-500 uppercase font-black">Estoque: {b.stockCount} un</p>
                        <p className="text-[10px] text-yellow-400 font-black mt-2">R$ {b.price.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {m.groundingUrls && m.groundingUrls.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2">
                    <p className="text-[9px] font-black text-zinc-600 uppercase">Fontes Externas:</p>
                    {m.groundingUrls.map((g, idx) => (
                      <a key={idx} href={g.uri} target="_blank" rel="noreferrer" className="block text-[10px] text-blue-400 hover:underline truncate">🔗 {g.title}</a>
                    ))}
                  </div>
                )}
              </div>
           </div>
         ))}
         {isLoading && (
           <div className="flex items-start w-full animate-pulse">
              <div className="bg-zinc-900 text-zinc-500 p-6 rounded-[32px] text-xs font-black uppercase tracking-widest border border-zinc-800">🦉 Consultando Cérebro...</div>
           </div>
         )}
         <div ref={chatEndRef} />
       </div>

       <div className="p-6 md:p-8 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-900">
          <div className="max-w-4xl mx-auto flex gap-4">
             <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={quotaCooldown > 0 ? `Aguarde ${quotaCooldown}s...` : "Pergunte ao Nobelino..."} className={`flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-8 py-5 focus:outline-none transition-all text-sm text-white focus:border-yellow-400 ${quotaCooldown > 0 ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={isLoading || quotaCooldown > 0} />
             <button onClick={() => handleSend()} disabled={isLoading || !input.trim() || quotaCooldown > 0} className="bg-yellow-400 text-black px-10 rounded-2xl font-black uppercase text-[12px] tracking-widest shadow-xl shadow-yellow-400/20 active:scale-95 disabled:opacity-20">ENVIAR</button>
          </div>
       </div>
    </div>
  );
};
export default ChatView;