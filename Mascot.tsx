
import React from 'react';

interface MascotProps {
  className?: string;
  animated?: boolean;
  talking?: boolean;
  mood?: 'happy' | 'thinking' | 'surprised' | 'tired';
}

const Mascot: React.FC<MascotProps> = ({ className, animated = false, talking = false, mood = 'happy' }) => {
  return (
    <div className={`${className} flex items-center justify-center select-none ${animated && mood !== 'tired' ? 'animate-float' : ''} transition-all duration-500`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-2xl">
        <style>
          {`
            @keyframes blink {
              0%, 90%, 100% { transform: scaleY(1); }
              95% { transform: scaleY(0.1); }
            }
            @keyframes talk {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(2px) scaleY(1.5); }
            }
            @keyframes wing-flap {
              0%, 100% { transform: rotate(0deg); }
              50% { transform: rotate(-5deg); }
            }
            .eye-blink { animation: ${mood === 'tired' ? 'none' : 'blink 4s infinite'}; transform-origin: center 38px; }
            .beak-talk { animation: ${talking ? 'talk 0.2s infinite' : 'none'}; transform-origin: center 44px; }
          `}
        </style>
        
        {/* Pernas/Pés */}
        <path d="M40 85L38 92" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />
        <path d="M60 85L62 92" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />
        
        {/* Corpo (Amarelo) */}
        <path d="M20 50C20 30 35 15 50 15C65 15 80 30 80 50V75C80 82 74 88 67 88H33C26 88 20 82 20 75V50Z" fill="#FACC15" />
        
        {/* Camisa Polo Preta (Vendedor Nobel) */}
        <path d="M20 60C20 55 25 50 35 48H65C75 50 80 55 80 60V75C80 82 74 88 67 88H33C26 88 20 82 20 75V60Z" fill="#18181b" />
        
        {/* Detalhe da Gola Nobel */}
        <path d="M42 48L50 58L58 48" stroke="#FACC15" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="50" cy="65" r="1.5" fill="#FACC15" />
        
        {/* Cabeça e Penas de Orelha */}
        <path d="M30 22L22 12M70 22L78 12" stroke="#FACC15" strokeWidth="4" strokeLinecap="round" />
        
        {/* Olhos Expressivos */}
        <g className="eye-blink">
          {mood === 'tired' ? (
            <>
              {/* Olhos fechados para cansaço */}
              <path d="M30 40C30 40 34 35 38 35C42 35 46 40 46 40" stroke="#18181b" strokeWidth="2" strokeLinecap="round" />
              <path d="M54 40C54 40 58 35 62 35C66 35 70 40 70 40" stroke="#18181b" strokeWidth="2" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle cx="38" cy="38" r="10" fill="white" />
              <circle cx="62" cy="38" r="10" fill="white" />
              <circle cx="38" cy="38" r="8" stroke="#18181b" strokeWidth="0.5" />
              <circle cx="62" cy="38" r="8" stroke="#18181b" strokeWidth="0.5" />
              <circle cx={mood === 'surprised' ? 38 : 40} cy={mood === 'thinking' ? 36 : 38} r="4" fill="#18181b" />
              <circle cx={mood === 'surprised' ? 62 : 60} cy={mood === 'thinking' ? 36 : 38} r="4" fill="#18181b" />
            </>
          )}
        </g>
        
        {/* Bico */}
        <path className="beak-talk" d="M47 44L50 50L53 44H47Z" fill="#F97316" />
        
        {/* Asas Nobelinas */}
        <path d="M18 55C14 60 14 70 18 75" stroke="#EAB308" strokeWidth="4" strokeLinecap="round" />
        <path d="M82 55C86 60 86 70 82 75" stroke="#EAB308" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  );
};

export default Mascot;
