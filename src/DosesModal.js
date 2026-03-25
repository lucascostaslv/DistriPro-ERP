import React, { useState } from 'react';
import { X, Wine, Search, AlertCircle, Plus, CheckCircle2 } from 'lucide-react';

const DosesModal = ({ isOpen, onClose, products, onOpenBottle }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // 1. Filtra tudo que é Destilado/Garrafa do estoque
  const allBottles = products.filter(p => {
      const cat = (p.category || '').toUpperCase();
      const name = (p.name || '').toUpperCase();
      return cat === 'DESTILADOS' || name.includes('VODKA') || name.includes('WHISKY') || name.includes('GIN') || p.isBottle;
  });

  // 2. Identifica quais garrafas JÁ ESTÃO ABERTAS
  // ATENÇÃO: Ajuste a regra abaixo conforme a propriedade que você usa para definir uma garrafa aberta no seu banco!
  // Aqui assumimos que a garrafa aberta tem a palavra "DOSE" no nome, ou "ABERTA", ou uma prop doseStock > 0.
  const openedBottles = allBottles.filter(p => 
      (p.name || '').toUpperCase().includes('DOSE') || 
      (p.name || '').toUpperCase().includes('ABERTA') ||
      p.doseStock > 0
  );

  // 3. Lógica de exibição: 
  // Se estiver pesquisando, mostra o que bate com a pesquisa (para abrir novas).
  // Se não estiver pesquisando, mostra só as que já estão abertas.
  const displayProducts = searchTerm 
      ? allBottles.filter(p => (p.name || '').toUpperCase().includes(searchTerm.toUpperCase()))
      : openedBottles;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="p-6 border-b bg-white flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Wine className="text-indigo-600" /> Painel de Doses
            </h2>
            <p className="text-sm text-slate-500 mt-1">
               {searchTerm ? 'Pesquisando estoque para abrir nova garrafa.' : 'Garrafas atualmente abertas para consumo.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Busca */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={20} />
            <input 
              className="w-full bg-white border border-slate-200 p-3 pl-10 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
              placeholder="Pesquisar estoque para ABRIR uma nova garrafa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Grade de Garrafas */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 custom-scrollbar">
          {displayProducts.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
              <AlertCircle size={48} className="mb-2 opacity-20" />
              <p>{searchTerm ? 'Nenhuma garrafa encontrada com este nome no estoque.' : 'Nenhuma garrafa aberta no momento.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {displayProducts.map(p => {
                // Verifica se este item específico já está na lista de abertos
                const isAlreadyOpen = openedBottles.some(ob => ob.id === p.id);

                return (
                  <button
                    key={p.id}
                    onClick={() => {
                        onOpenBottle(p); 
                        onClose(); 
                    }}
                    className={`border-2 p-4 rounded-2xl flex flex-col items-center gap-3 transition-all group text-center
                        ${isAlreadyOpen 
                            ? 'bg-indigo-50/50 border-indigo-200 hover:border-indigo-500 hover:shadow-lg hover:-translate-y-1' 
                            : 'bg-white border-slate-100 hover:border-emerald-500 hover:shadow-lg hover:-translate-y-1'
                        }
                    `}
                  >
                    <div className={`p-4 rounded-full transition-colors ${isAlreadyOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-emerald-500 group-hover:text-white'}`}>
                      <Wine size={32} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm leading-tight uppercase line-clamp-2 h-8">{p.name}</p>
                      <p className="text-[10px] font-extrabold text-slate-500 uppercase mt-2">
                          {isAlreadyOpen ? `Doses Disponíveis: ${p.stock || 0}` : `Estoque Lacrado: ${p.stock || 0} un`}
                      </p>
                    </div>
                    <div className={`mt-auto w-full pt-3 border-t flex items-center justify-center gap-1 font-bold text-xs
                        ${isAlreadyOpen ? 'border-indigo-100 text-indigo-700' : 'border-slate-50 text-emerald-600'}
                    `}>
                      {isAlreadyOpen ? <><CheckCircle2 size={14} /> LANÇAR DOSE</> : <><Plus size={14} /> ABRIR GARRAFA</>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t flex justify-end shrink-0">
          <button onClick={onClose} className="px-6 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default DosesModal;
