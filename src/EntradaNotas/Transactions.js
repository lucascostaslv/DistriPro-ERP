import React, { useState } from 'react';
import { PlusCircle, FileText } from 'lucide-react';
import EntradaNotas from './EntradaNotas'; // Importa seu arquivo original
import AccountsPayable from './AccountsPayable'; // O arquivo novo de contas a pagar

const Transactions = (props) => {
  // Props recebidos: products, onSaveEntry e priceGroups (via ...props)
  const [activeTab, setActiveTab] = useState('entry'); // 'entry' | 'payable'

  return (
    <div className="space-y-4">
      {/* Navegação de Abas */}
      <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm inline-flex gap-1 mb-2">
        <button 
          onClick={() => setActiveTab('entry')}
          className={`px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'entry' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}
        >
           <PlusCircle size={16}/> Nova Nota (XML/Manual)
        </button>
        <button 
          onClick={() => setActiveTab('payable')}
          className={`px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'payable' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}
        >
           <FileText size={16}/> Contas a Pagar
        </button>
      </div>

      {/* Renderização Condicional */}
      <div className="min-h-[600px]">
        {activeTab === 'entry' ? (
          // O {...props} aqui é fundamental: ele passa 'products', 'onSaveEntry' 
          // e agora 'priceGroups' para o EntradaNotas automaticamente.
          <EntradaNotas {...props} />
        ) : (
          // Renderiza a nova tela, passando produtos para os filtros de categoria
          <AccountsPayable products={props.products || []} />
        )}
      </div>
    </div>
  );
};

export default Transactions;