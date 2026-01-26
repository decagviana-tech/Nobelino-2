
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
            .eye-blink { animation: ${mood === 'tired' ? 'none' : 'blink 4s infinite'}; transform-origin: center 38px; }
            .beak-talk { animation: ${talking ? 'talk 0.2s infinite' : 'none'}; transform-origin: center 48px; }
          `}
        </style>
        
        {/* Pernas */}
        <path d="M42 85L40 92" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />
        <path d="M58 85L60 92" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />
        
        {/* Peninhas da Cabeça (Orelhas de Coruja) */}
        <path d="M28 24L18 8L36 18" fill="#FACC15" />
        <path d="M72 24L82 8L64 18" fill="#FACC15" />

        {/* Corpo Amarelo Nobel */}
        <path d="M25 50C25 32 36 18 50 18C64 18 75 32 75 50V75C75 82 69 88 62 88H38C31 88 25 82 25 75V50Z" fill="#FACC15" />
        
        {/* Camisa Polo Preta Nobel */}
        <path d="M25 65C25 58 30 52 40 50H60C70 52 75 58 75 65V75C75 82 69 88 62 88H38C31 88 25 82 25 75V65Z" fill="#18181b" />
        
        {/* Detalhe Gola Nobel */}
        <path d="M42 50L50 60L58 50" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" fill="#18181b" />
        
        {/* Olhos */}
        <g className="eye-blink">
          {mood === 'tired' ? (
            <>
              <path d="M30 40Q38 35 46 40" stroke="#18181b" strokeWidth="2" fill="none" />
              <path d="M54 40Q62 35 70 40" stroke="#18181b" strokeWidth="2" fill="none" />
            </>
          ) : (
            <>
              <circle cx="38" cy="42" r="10" fill="white" />
              <circle cx="62" cy="42" r="10" fill="white" />
              <circle cx="38" cy="42" r="4" fill="#18181b" />
              <circle cx="62" cy="42" r="4" fill="#18181b" />
            </>
          )}
        </g>
        
        {/* Bico */}
        <path className="beak-talk" d="M46 50L50 58L54 50H46Z" fill="#F97316" />
      </svg>
    </div>
  );
};

export default Mascot;
