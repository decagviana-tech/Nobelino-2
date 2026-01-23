
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type } from '@google/genai';
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
    const buffer = ctx.createBuffer(1, dataInt16.length, sampleRate);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
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

  const startSession = async () => {
    setError(null);
    setIsActive(true);
    isClosingRef.current = false;
    
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Seu navegador não suporta entrada de voz.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          throw new Error("Microfone não encontrado.");
        }
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error("Acesso ao microfone negado.");
        }
        throw new Error("Erro ao acessar microfone.");
      });

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            if (isClosingRef.current) return;
            setIsListening(true);
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (isClosingRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              sessionPromise.then(s => {
                if (!isClosingRef.current) s.sendRealtimeInput({ media: createBlob(inputData) });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (isClosingRef.current) return;

            if (message.serverContent?.outputTranscription) {
              setTranscript(prev => prev + " " + message.serverContent?.outputTranscription?.text);
            }
            
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
              setIsSpeaking(true);
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsSpeaking(false);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
            
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'consultarEstoqueInterno') {
                  const termo = String((fc.args as any).termo || '').toLowerCase();
                  const matches = inventory.filter(b => 
                    b.title.toLowerCase().includes(termo) || 
                    b.isbn.includes(termo)
                  ).slice(0, 3);
                  
                  const result = matches.length > 0 
                    ? `NO ESTOQUE: ${matches.map(m => `${m.title} por R$${m.price}`).join(', ')}`
                    : "Lamento, não encontrei no balcão agora.";
                  
                  sessionPromise.then(s => {
                    if (!isClosingRef.current) s.sendToolResponse({
                      functionResponses: { id: fc.id, name: fc.name, response: { result } }
                    });
                  });
                }
              }
            }
          },
          onclose: () => stopSession(),
          onerror: (e) => {
            console.error("Erro Live API:", e);
            setError("Conexão interrompida.");
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          tools: [{ functionDeclarations: [{
            name: "consultarEstoqueInterno",
            parameters: {
              type: Type.OBJECT,
              properties: { termo: { type: Type.STRING } },
              required: ["termo"]
            }
          }] }],
          systemInstruction: `VOCÊ É O NOBELINO EM MODO VOZ. Responda rápido e com entusiasmo.`
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setIsActive(false);
    }
  };

  const stopSession = async () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch(e) {}
      sessionRef.current = null;
    }

    const closeContext = async (ref: React.MutableRefObject<AudioContext | null>) => {
      if (ref.current && ref.current.state !== 'closed') {
        try {
          await ref.current.close();
        } catch (e) {
          console.warn("Erro ao fechar AudioContext:", e);
        }
      }
      ref.current = null;
    };

    await closeContext(audioContextRef);
    await closeContext(outputAudioContextRef);

    setIsActive(false);
    setIsListening(false);
    setIsSpeaking(false);
  };

  useEffect(() => {
    startSession();
    return () => { stopSession(); };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-8 transition-all">
      <div className="absolute top-8 right-8">
        <button onClick={onClose} className="w-16 h-16 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full flex items-center justify-center text-xl transition-all shadow-xl active:scale-90 border border-zinc-700">✕</button>
      </div>

      <div className="relative mb-16 group">
        {!error && (isListening || isSpeaking) && (
          <>
            <div className={`absolute inset-0 rounded-full bg-yellow-400/20 animate-ping [animation-duration:2.5s] ${isSpeaking ? 'scale-[1.8]' : 'scale-110'}`}></div>
            <div className={`absolute inset-0 rounded-full bg-yellow-400/10 animate-ping [animation-duration:3.5s] ${isSpeaking ? 'scale-[2.8]' : 'scale-125'}`}></div>
          </>
        )}
        <div className={`w-64 h-64 relative z-10 transition-all duration-500 ${error ? 'grayscale opacity-50 scale-90' : 'scale-110 hover:scale-125'}`}>
          <Mascot 
            animated={!error && isListening} 
            talking={!error && isSpeaking} 
            className="w-full h-full" 
          />
        </div>
      </div>

      <div className="text-center max-w-3xl space-y-8">
        <div className="space-y-2">
          <h2 className={`font-black text-[10px] uppercase tracking-[0.6em] transition-colors ${error ? 'text-red-500' : 'text-yellow-400'}`}>
            {error ? 'SISTEMA INTERROMPIDO' : isSpeaking ? 'NOBELINO RESPONDENDO' : isListening ? 'OUVINDO ATENTAMENTE' : 'CONECTANDO...'}
          </h2>
          <div className="h-1 w-20 bg-yellow-400 mx-auto rounded-full overflow-hidden">
             {(isListening || isSpeaking) && <div className="h-full bg-white animate-[shimmer_2s_infinite]"></div>}
          </div>
        </div>
        
        <div className="min-h-[140px] flex flex-col items-center justify-center px-6">
           {error ? (
             <div className="space-y-6">
               <p className="text-zinc-400 text-lg font-bold">"{error}"</p>
               <button 
                 onClick={startSession}
                 className="bg-white text-black px-10 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-yellow-400 transition-all shadow-2xl"
               >
                 REINICIAR VOZ
               </button>
             </div>
           ) : (
             <p className="text-zinc-100 text-2xl font-bold italic animate-in fade-in slide-in-from-bottom-4 leading-relaxed max-w-xl">
               {transcript || "Pode perguntar sobre qualquer livro..."}
             </p>
           )}
        </div>
      </div>
    </div>
  );
};

export default VoiceConsultant;
