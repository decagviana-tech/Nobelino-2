
import React, { useState } from 'react';
import { db } from '../services/db';
import Mascot from './Mascot';

const MemoryManager: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [previewData, setPreviewData] = useState<any>(null);

  const handleExport = async () => {
    setStatus('processing');
    try {
      const data = await db.exportBrain();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `CEREBRO-NOBELINO-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        setPreviewData(json);
      } catch (err) {
        alert("Arquivo inválido. Certifique-se de selecionar um arquivo .json");
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!previewData) return;
    setStatus('processing');
    try {
      await db.importBrain(previewData);
      setStatus('success');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div className="p-8 h-full flex flex-col items-center justify-center bg-zinc-950">
      <div className="max-w-4xl w-full text-center space-y-12">
        
        {!previewData ? (
          <>
            <div className="space-y-4">
              <Mascot animated={status === 'processing'} className="w-32 h-32 mx-auto" />
              <div className="space-y-2">
                <h2 className="text-4xl font-black tracking-tighter text-white uppercase">Sincronização Master<span className="text-yellow-400">.</span></h2>
                <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl max-w-md mx-auto mb-6">
                   <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Dica de Economia Netlify</p>
                   <p className="text-[11px] text-zinc-400 mt-1">
                     Atualizar o estoque aqui **NÃO GERA DEPLOY**. Você pode atualizar 100x por dia e o Netlify não te cobrará nada extra.
                   </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div 
                onClick={handleExport}
                className="group cursor-pointer p-8 border border-zinc-800 bg-zinc-900/30 rounded-[40px] hover:border-yellow-400 transition-all text-left flex flex-col justify-between h-64"
              >
                <div>
                  <span className="text-4xl mb-4 block group-hover:scale-110 transition-transform">💾</span>
                  <p className="font-black text-white text-xl leading-tight mb-2">Exportar Memória Total</p>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase leading-relaxed">Gera um arquivo com Estoque, Regras e Metas para levar para outro computador.</p>
                </div>
                <div className="text-yellow-400 font-black text-[10px] uppercase tracking-widest pt-4 border-t border-zinc-800/50">
                  {status === 'processing' ? 'GERANDO...' : 'BAIXAR CÉREBRO'}
                </div>
              </div>

              <label className="group cursor-pointer p-8 border border-zinc-800 bg-zinc-900/30 rounded-[40px] hover:border-blue-400 transition-all text-left flex flex-col justify-between h-64">
                <div>
                  <span className="text-4xl mb-4 block group-hover:scale-110 transition-transform">🧠</span>
                  <p className="font-black text-white text-xl leading-tight mb-2">Importar de Backup</p>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase leading-relaxed">Atualiza este computador com os dados que você salvou em outro aparelho.</p>
                </div>
                <div className="text-blue-400 font-black text-[10px] uppercase tracking-widest pt-4 border-t border-zinc-800/50">
                  CARREGAR ARQUIVO
                </div>
                <input type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
              </label>
            </div>
          </>
        ) : (
          <div className="glass p-12 rounded-[56px] border border-zinc-800 animate-in zoom-in-95 duration-300">
             <div className="flex items-center gap-6 mb-8 text-left">
                <div className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center text-3xl">🔍</div>
                <div>
                   <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Raio-X do Backup</h3>
                   <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Confirme a integração dos dados</p>
                </div>
             </div>

             <div className="flex gap-4">
                <button 
                  onClick={() => setPreviewData(null)}
                  className="flex-1 py-5 bg-zinc-900 text-zinc-400 rounded-3xl font-black uppercase text-xs tracking-widest hover:bg-zinc-800 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleConfirmRestore}
                  disabled={status === 'processing'}
                  className="flex-2 px-12 py-5 bg-blue-500 text-white rounded-3xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-blue-500/20 disabled:opacity-50"
                >
                  {status === 'processing' ? 'ATUALIZANDO...' : 'CONFIRMAR RESTAURAÇÃO'}
                </button>
             </div>
          </div>
        )}

        <div className="pt-8 border-t border-zinc-900">
           <p className="text-[9px] text-zinc-700 font-black uppercase tracking-[0.4em]">Nobelino v3.2 • Gestão de Dados Local (Sem custos de deploy)</p>
        </div>
      </div>
    </div>
  );
};

export default MemoryManager;
