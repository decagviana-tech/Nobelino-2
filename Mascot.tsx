
import React from 'react';

interface MascotProps {
  className?: string;
  animated?: boolean;
  talking?: boolean;
  mood?: 'happy' | 'thinking' | 'surprised' | 'tired' | 'success';
}

const Mascot: React.FC<MascotProps> = ({ className, animated = false, talking = false, mood = 'happy' }) => {
  return (
    <div className={`${className} flex items-center justify-center select-none ${animated && mood !== 'tired' ? 'animate-float' : ''} transition-all duration-500`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-2xl">
        <style>
          {`
            @keyframes blink { 0%, 90%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
            @keyframes talk { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.5); } }
            .eye-blink { animation: blink 4s infinite; transform-origin: center 38px; }
            .beak-talk { animation: ${talking ? 'talk 0.2s infinite' : 'none'}; transform-origin: center 48px; }
          `}
        </style>
        
        {/* Pernas da Coruja */}
        <path d="M42 85L40 92" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />
        <path d="M58 85L60 92" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />
        
        {/* Corpo Amarelo */}
        <path d="M25 50C25 32 36 18 50 18C64 18 75 32 75 50V75C75 82 69 88 62 88H38C31 88 25 82 25 75V50Z" fill="#FACC15" />
        
        {/* Camisa Polo Preta */}
        <path d="M25 62C25 58 30 52 40 50H60C70 52 75 58 75 62V75C75 82 69 88 62 88H38C31 88 25 82 25 75V62Z" fill="#18181b" />
        
        {/* Detalhe Gola Nobel (Amarelo na camisa preta) */}
        <path d="M44 50L50 58L56 50" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" />
        
        {/* Olhos Grandes */}
        <g className="eye-blink">
          <circle cx="38" cy="38" r="10" fill="white" />
          <circle cx="62" cy="38" r="10" fill="white" />
          <circle cx="38" cy="38" r="4" fill="#18181b" />
          <circle cx="62" cy="38" r="4" fill="#18181b" />
        </g>
        
        {/* Bico (Laranja) */}
        <path className="beak-talk" d="M47 48L50 54L53 48H47Z" fill="#F97316" />
        
        {/* Sobrancelhas de Coruja */}
        <path d="M30 25L42 30" stroke="#EAB308" strokeWidth="3" strokeLinecap="round" />
        <path d="M70 25L58 30" stroke="#EAB308" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
};

export default Mascot;
