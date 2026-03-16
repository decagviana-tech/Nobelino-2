
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Book, KnowledgeEntry } from '../types';
import Mascot from './Mascot';

interface Props {
  inventory: Book[];
  knowledge: KnowledgeEntry[];
  onClose: () => void;
}


const VoiceConsultant: React.FC<Props> = ({ inventory, knowledge, onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isClosingRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Helper functions for search
  const slugify = (text: string) => text.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const searchInventory = (query: string) => {
    const term = slugify(query);
    return inventory
      .filter(b => slugify(b.title).includes(term) || slugify(b.author).includes(term) || slugify(b.description || '').includes(term))
      .slice(0, 5)
      .map(b => ({ title: b.title, author: b.author, price: b.price, stock: b.stockCount, isbn: b.isbn }));
  };

  const searchKnowledge = (query: string) => {
    const term = slugify(query);
    return knowledge
      .filter(k => slugify(k.topic).includes(term) || slugify(k.content).includes(term))
      .slice(0, 3)
      .map(k => ({ topic: k.topic, content: k.content }));
  };

  const encode = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number) => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i] / 32768.0;
    return buffer;
  };

  const createBlob = (data: Float32Array) => {
    const int16 = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32768;
    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  };

  const stopSession = async () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      mediaStreamRef.current = null;
    }

    if (sessionRef.current) try { sessionRef.current.close(); } catch(e) {}
    if (audioContextRef.current) try { audioContextRef.current.close(); } catch(e) {}
    if (outputAudioContextRef.current) try { outputAudioContextRef.current.close(); } catch(e) {}
    
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    sourcesRef.current.clear();

    setIsActive(false);
    setIsListening(false);
    setIsSpeaking(false);
  };

  const startSession = async () => {
    setError(null);
    setIsActive(true);
    isClosingRef.current = false;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: (window as any).API_KEY || process.env.API_KEY });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.0-flash-exp', // Modelo estável para Multimodal Live API
        callbacks: {
          onopen: () => {
            if (isClosingRef.current || !audioContextRef.current) return;
            setIsListening(true);
            const source = audioContextRef.current.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (isClosingRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              sessionPromise.then(s => {
                if (!isClosingRef.current) s.sendRealtimeInput({ media: createBlob(inputData) });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (isClosingRef.current) return;
            
            // Handle Tool Calls
            const toolCall = message.serverContent?.modelTurn?.parts?.[0]?.toolCall;
            if (toolCall) {
              const currentSession = await sessionPromise;
              for (const call of toolCall.functionCalls) {
                let result = {};
                if (call.name === 'search_inventory') {
                  result = { books: searchInventory(call.args.query as string) };
                } else if (call.name === 'get_store_rules') {
                  result = { rules: searchKnowledge(call.args.query as string) };
                }
                
                await currentSession.sendToolResponse({
                  functionResponses: [{
                    name: call.name,
                    response: { result },
                    id: call.id
                  }]
                });
              }
              return;
            }

            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              setIsSpeaking(true);
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsSpeaking(false);
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
          },
          onclose: () => { if (!isClosingRef.current) stopSession(); },
          onerror: (e) => { console.error("Live Error:", e); setError("Erro na conexão de voz."); stopSession(); },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          tools: [{
            functionDeclarations: [
              {
                name: 'search_inventory',
                description: 'Busca livros no estoque real da loja por título, autor ou assunto.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    query: { type: 'STRING', description: 'O termo de busca (título, autor ou tema)' }
                  },
                  required: ['query']
                }
              },
              {
                name: 'get_store_rules',
                description: 'Busca regras da loja, políticas de troca, promoções e treinamentos.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    query: { type: 'STRING', description: 'O assunto da dúvida (ex: trocas, pagamento)' }
                  },
                  required: ['query']
                }
              }
            ]
          } as any],
          systemInstruction: `VOCÊ É O NOBELINO, o mascote coruja da Livraria Nobel. 
          Sua voz é amigável e entusiasmada. 
          Sempre comece perguntando qual colaborador está falando com você.
          
          CAPACIDADES ESPECIAIS:
          - Use 'search_inventory' sempre que o usuário perguntar por um livro, preço ou se algo está disponível.
          - Use 'get_store_rules' para dúvidas sobre procedimentos da loja.
          - NÃO INVENTE DADOS. Se não encontrar no estoque, diga que não localizou mas pode pesquisar na internet (se o chat permitir) ou encomendar.
          
          Contexto imediato (exemplos): ${inventory.slice(0,2).map(b => b.title).join(', ')}.`
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error("Session Start Error:", err);
      setError("Microfone não autorizado ou erro de conexão.");
      stopSession();
    }
  };

  useEffect(() => {
    startSession();
    return () => { stopSession(); };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
      <button onClick={onClose} className="absolute top-8 right-8 w-14 h-14 bg-zinc-800 text-white rounded-2xl flex items-center justify-center text-xl hover:bg-zinc-700 transition-all active:scale-90">✕</button>
      <div className="relative mb-12">
        {(isListening || isSpeaking) && <div className="absolute inset-0 rounded-full bg-yellow-400/20 animate-ping scale-150"></div>}
        <div className="w-64 h-64 relative z-10">
          <Mascot animated talking={isSpeaking} className="w-full h-full" mood={isSpeaking ? 'happy' : 'thinking'} />
        </div>
      </div>
      <div className="text-center max-w-xl">
        <h2 className="text-yellow-400 font-black uppercase tracking-widest text-xs mb-4">
          {error ? 'ERRO' : isSpeaking ? 'NOBELINO FALANDO' : 'OUVINDO VOCÊ...'}
        </h2>
        <div className="bg-zinc-900/50 p-8 rounded-[32px] border border-zinc-800 min-h-[100px] flex items-center justify-center">
          <p className="text-zinc-300 italic">{error || transcript || "Pode falar, estou ouvindo!"}</p>
        </div>
        <button onClick={onClose} className="mt-8 text-zinc-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">Encerrar Chamada</button>
      </div>
    </div>
  );
};

export default VoiceConsultant;
