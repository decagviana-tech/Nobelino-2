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

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
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

            if (message.serverContent?.outputTranscription) {
              setTranscript(prev => prev + " " + (message.serverContent?.outputTranscription?.text || ''));
            }
            
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();
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

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onclose: () => stopSession(),
          onerror: (e) => {
            console.error(e);
            setError("Falha na conexão de voz.");
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `VOCÊ É O NOBELINO. Comece cumprimentando o vendedor com "Olá! Nobelino no balcão!". Seja prestativo, use uma voz amigável e entusiasmada.`
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setError(err.message);
    }
  };

  const stopSession = async () => {
    isClosingRef.current = true;
    if (sessionRef.current) sessionRef.current.close();
    if (audioContextRef.current) audioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    setIsActive(false);
    setIsListening(false);
    setIsSpeaking(false);
  };

  useEffect(() => {
    startSession();
    return () => { stopSession(); };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-8">
      <div className="absolute top-8 right-8">
        <button onClick={onClose} className="w-16 h-16 bg-zinc-800 text-white rounded-full flex items-center justify-center text-xl">✕</button>
      </div>

      <div className="relative mb-16">
        {(isListening || isSpeaking) && (
          <div className={`absolute inset-0 rounded-full bg-yellow-400/20 animate-ping ${isSpeaking ? 'scale-150' : 'scale-110'}`}></div>
        )}
        <div className="w-64 h-64 relative z-10">
          <Mascot animated talking={isSpeaking} className="w-full h-full" />
        </div>
      </div>

      <div className="text-center max-w-3xl space-y-4">
        <h2 className={`font-black text-xs uppercase tracking-[0.5em] ${error ? 'text-red-500' : 'text-yellow-400'}`}>
          {error ? 'ERRO DE VOZ' : isSpeaking ? 'NOBELINO FALANDO' : 'OUVINDO...'}
        </h2>
        <p className="text-zinc-100 text-2xl font-bold italic h-20 overflow-hidden">
          {transcript || "Nobelino está pronto para ouvir..."}
        </p>
      </div>
    </div>
  );
};

export default VoiceConsultant;