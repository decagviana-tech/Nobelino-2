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
  const [authError, setAuthError] = useState(false);
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
      if (hist && hist.length > 0) setMessages(hist);
      else resetChat();
    } catch (e) { resetChat(); }
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
    if (authError || hasConnectionError) {
      setCurrentMood('tired');
    } else if (quotaCooldown > 0) {
      setCurrentMood('tired');
      timer = setInterval(() => setQuotaCooldown(c => Math.max(0, c - 1)), 1000);
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
  }, [quotaCooldown, isLoading, messages, hasConnectionError, authError, isSpeaking]);

  const resetChat = async () => {
    const welcome = "🦉 Olá! Nobelino pronto para o balcão. Qual o desafio de vendas hoje?";
    const initialMsg: ChatMessage = { role: 'assistant', content: welcome, timestamp: new Date() };
    setMessages([initialMsg]);
    setHasConnectionError(false);
    setAuthError(false);
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
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
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

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: trimmedInput, timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setHasConnectionError(false);
    setAuthError(false);

    try {
      const result = await processUserQuery(trimmedInput, inventory, messages, knowledge, salesGoals);
      if (result.isAuthError) {
        setAuthError(true);
      } else if (result.isQuotaError) {
        setQuotaCooldown(60);
      } 
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
      if (autoVoice && !result.isAuthError) playResponse(assistantMsg.content);
    } catch (e: any) {
      setHasConnectionError(true);
      setMessages(prev => [...prev, { role: 'assistant', content: "🦉 Opa! Perdi a conexão ou minha chave de acesso não está funcionando. Verifique o painel do Netlify.", timestamp: new Date() }]);
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
                   <button onClick={() => setAutoVoice(!autoVoice)} className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${autoVoice ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-zinc-800 text-zinc-600'}`}>{autoVoice ? 'Voz ON' : 'Voz OFF'}</button>
                   {(authError || hasConnectionError) && <span className="text-[8px] font-black text-red-500 uppercase animate-pulse">● Erro de Chave</span>}
                </div>
             </div>
          </div>
          <div className="flex gap-2">
            <button onClick={resetChat} className="p-3 bg-zinc-900 rounded-xl text-zinc-600 hover:text-white transition-all">🗑️</button>
            <button onClick={() => setIsVoiceActive(true)} disabled={quotaCooldown > 0 || authError} className={`bg-yellow-400 text-black px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-yellow-400/20 ${(quotaCooldown > 0 || authError) ? 'opacity-20' : ''}`}>🎙️ VOZ</button>
          </div>
       </header>
       <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-10 custom-scrollbar">
         {messages.map((m, i) => (
           <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} w-full animate-in fade-in slide-in-from-bottom-4 group`}>
              <div className={`max-w-[85%] p-6 rounded-[32px] text-sm shadow-2xl relative transition-all ${m.role === 'user' ? 'bg-zinc-100 text-black font-semibold' : 'bg-zinc-900 text-zinc-200 border border-zinc-800'} ${m.content.includes('API_KEY') ? 'border-red-500/50 bg-red-500/5' : ''}`}>
                {m.role === 'assistant' && !authError && (
                  <div className="absolute -right-12 top-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => playResponse(m.content)} className="p-2 bg-zinc-800 rounded-full text-lg shadow-lg">🔊</button>
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
             <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={authError ? "Aguardando API_KEY no Netlify..." : "ISBN, Título ou Dúvida..."} className={`flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-8 py-5 focus:outline-none transition-all text-sm text-white focus:border-yellow-400 ${authError ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={isLoading || authError} />
             <button onClick={handleSend} disabled={isLoading || !input.trim() || authError} className="bg-yellow-400 text-black px-10 rounded-2xl font-black uppercase text-[12px] tracking-widest shadow-xl shadow-yellow-400/20 active:scale-95 disabled:opacity-20">BUSCAR</button>
          </div>
       </div>
    </div>
  );
};
export default ChatView;