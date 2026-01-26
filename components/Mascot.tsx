
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
            @keyframes talk { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.4); } }
            .eye-blink { animation: ${mood === 'tired' ? 'none' : 'blink 4s infinite'}; transform-origin: center 42px; }
            .beak-talk { animation: ${talking ? 'talk 0.15s infinite' : 'none'}; transform-origin: center 58px; }
          `}
        </style>
        
        {/* Patas Laranjas */}
        <path d="M42 88L40 95" stroke="#F97316" strokeWidth="4" strokeLinecap="round" />
        <path d="M58 88L60 95" stroke="#F97316" strokeWidth="4" strokeLinecap="round" />
        
        {/* Penas da Cabeça (Coruja) - DIMINUÍDAS */}
        <path d="M22 28L18 18L35 22" fill="#FACC15" />
        <path d="M78 28L82 18L65 22" fill="#FACC15" />

        {/* Cabeça e Corpo Amarelo Nobel */}
        <circle cx="50" cy="45" r="30" fill="#FACC15" />
        <path d="M20 55C20 45 30 35 50 35C70 35 80 45 80 55V75C80 85 70 92 50 92C30 92 20 85 20 75V55Z" fill="#FACC15" />
        
        {/* Camisa Polo Preta */}
        <path d="M20 62C20 58 25 50 50 50C75 50 80 58 80 62V75C80 85 70 92 50 92C30 92 20 85 20 75V62Z" fill="#18181b" />
        
        {/* Gola da Camisa Amarela */}
        <path d="M35 50L50 65L65 50" stroke="#FACC15" strokeWidth="3" strokeLinecap="round" fill="#18181b" />
        
        {/* Olhos de Coruja (Grandes e Expressivos) */}
        <g className="eye-blink">
          {mood === 'tired' ? (
            <>
              <path d="M32 42Q40 35 48 42" stroke="#18181b" strokeWidth="3" fill="none" />
              <path d="M52 42Q60 35 68 42" stroke="#18181b" strokeWidth="3" fill="none" />
            </>
          ) : (
            <>
              <circle cx="40" cy="42" r="10" fill="white" />
              <circle cx="60" cy="42" r="10" fill="white" />
              <circle cx="40" cy="42" r="4.5" fill="#18181b" />
              <circle cx="60" cy="42" r="4.5" fill="#18181b" />
            </>
          )}
        </g>
        
        {/* Bico Laranja */}
        <path className="beak-talk" d="M45 54L50 62L55 54H45Z" fill="#F97316" />
      </svg>
    </div>
  );
};

export default Mascot;
