
import React from 'react';
import { db } from '../services/db';
import Mascot from './Mascot';

const MemoryManager: React.FC = () => {
  const exportData = async () => {
    const data = await db.exportBrain();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-nobelino-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleHardReset = async () => {
    if (confirm("ATENÇÃO: Isso apagará todas as regras, estoque salvo e resetará o contador de uso. Continuar?")) {
      const today = new Date().toISOString().split('T')[0];
      await db.save('nobel_usage_metrics', {
        dailyRequests: 0,
        dailyEnrichments: 0,
        lastResetDate: today,
        totalTokensEstimate: 0,
        usageLimit: 1500
      });
      await db.save('nobel_chat_history', []);
      window.location.reload();
    }
  };

  return (
    <div className="p-8 bg-zinc-950 h-full flex flex-col items-center justify-center text-center">
      <Mascot className="w-32 h-32 mb-8" animated />
      <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Sincronização Master</h2>
      <p className="text-zinc-500 text-sm max-w-md mb-8">Gerencie o cérebro do Nobelino. Se o limite estiver travado, use o reset de emergência.</p>
      
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <div className="flex gap-2">
          <button onClick={exportData} className="flex-1 bg-zinc-900 border border-zinc-800 text-white py-4 rounded-2xl font-black uppercase text-[10px] hover:border-yellow-400 transition-all">Exportar Backup</button>
          <label className="flex-1 bg-yellow-400 text-black py-4 rounded-2xl font-black uppercase text-[10px] cursor-pointer hover:bg-yellow-300 transition-all text-center">
            Importar
            <input type="file" className="hidden" accept=".json" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async (evt) => {
                const json = JSON.parse(evt.target?.result as string);
                await db.importBrain(json);
                window.location.reload();
              };
              reader.readAsText(file);
            }} />
          </label>
        </div>
        
        <button 
          onClick={handleHardReset} 
          className="w-full bg-red-500/10 border border-red-500/20 text-red-500 py-3 rounded-xl font-bold uppercase text-[9px] hover:bg-red-500 hover:text-white transition-all"
        >
          🚨 Reset de Emergência (Limites e Dados)
        </button>
      </div>
    </div>
  );
};
export default MemoryManager;
