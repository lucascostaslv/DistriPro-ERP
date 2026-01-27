import React, { useState } from 'react';
import { PlusCircle, FileText, ScrollText } from 'lucide-react'; // Adicionei ScrollText
import EntradaNotas from './EntradaNotas'; 
import AccountsPayable from './AccountsPayable';
import FiscalInvoices from './FiscalInvoices'; // <--- IMPORTAÇÃO NOVA

const Transactions = (props) => {
  // 'entry' | 'payable' | 'fiscal'
  const [activeTab, setActiveTab] = useState('entry'); 

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
        {/* --- NOVO BOTÃO --- */}
        <button 
          onClick={() => setActiveTab('fiscal')}
          className={`px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'fiscal' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}
        >
           <ScrollText size={16}/> Notas Emitidas (Fiscal)
        </button>
      </div>

      {/* Renderização Condicional */}
      <div className="min-h-[600px]">
        {activeTab === 'entry' && (
          <EntradaNotas {...props} />
        )}
        
        {activeTab === 'payable' && (
          <AccountsPayable products={props.products || []} />
        )}

        {/* --- NOVA TELA --- */}
        {activeTab === 'fiscal' && (
          <FiscalInvoices 
            storeConfig={props.storeConfig} 
            showNotification={props.showNotification || alert} // Fallback para alert se não passar func
          />
        )}
      </div>
    </div>
  );
};

export default Transactions;