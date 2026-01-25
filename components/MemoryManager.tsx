
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

  return (
    <div className="p-8 bg-zinc-950 h-full flex flex-col items-center justify-center text-center">
      <Mascot className="w-32 h-32 mb-8" animated />
      <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Sincronização Master</h2>
      <p className="text-zinc-500 text-sm max-w-md mb-8">Salve ou restaure todo o conhecimento do Nobelino (estoque, metas e regras) em um único arquivo.</p>
      
      <div className="flex gap-4">
        <button onClick={exportData} className="bg-zinc-900 border border-zinc-800 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs hover:border-yellow-400 transition-all">Exportar Backup</button>
        <label className="bg-yellow-400 text-black px-8 py-4 rounded-2xl font-black uppercase text-xs cursor-pointer hover:bg-yellow-300 transition-all">
          Importar Backup
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
    </div>
  );
};
export default MemoryManager;
