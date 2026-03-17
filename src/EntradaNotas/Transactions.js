import React, { useState, useEffect } from 'react';
import { PlusCircle, FileText, ScrollText, Minus, Save, X, Calendar, DollarSign, Tag, CheckSquare, Settings, Landmark} from 'lucide-react';
import { collection, addDoc, serverTimestamp, getDocs, writeBatch, doc, increment } from 'firebase/firestore';
import { db } from '../firebase'; 
import EntradaNotas from './EntradaNotas'; 
import AccountsPayable from './AccountsPayable';
import FiscalInvoices from './FiscalInvoices'; 
import BankAccountsManager from './BankAccountsManager';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const Transactions = (props) => {
  const [activeTab, setActiveTab] = useState('entry'); 
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  
  // Listas do banco
  const [categories, setCategories] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]); // <--- NOVO: Contas Bancárias

  // Estados para criação rápida de categoria
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [tempCatName, setTempCatName] = useState('');
  const [tempCatIsOp, setTempCatIsOp] = useState(true);

  // Formulário Atualizado com accountId
  const [expenseForm, setExpenseForm] = useState({
      description: '',
      value: '',
      date: new Date().toISOString().split('T')[0],
      category: '',
      accountId: '' // <--- NOVO: Conta selecionada
  });

  // Carregar categorias e contas ao abrir o modal
  useEffect(() => {
      const fetchData = async () => {
          if(!props.storeConfig?.id) return;
          const storeId = String(props.storeConfig.id);
          try {
              // Busca Categorias
              const catRef = collection(db, 'artifacts', storeId, 'public', 'data', 'transaction_categories');
              const snapCat = await getDocs(catRef);
              setCategories(snapCat.docs.map(d => ({id: d.id, ...d.data()})));

              // Busca Contas Bancárias
              const accRef = collection(db, 'artifacts', storeId, 'public', 'data', 'bank_accounts');
              const snapAcc = await getDocs(accRef);
              setBankAccounts(snapAcc.docs.map(d => ({id: d.id, ...d.data()})));
          } catch(e) { console.error(e); }
      };
      if(isExpenseModalOpen) fetchData();
  }, [isExpenseModalOpen, props.storeConfig]);

  // Função blindada para converter moeda
  const safeCurrencyToNumber = (val) => {
      if (!val) return 0;
      if (typeof val === 'number') return val;
      const cleaned = String(val).replace(/\./g, '').replace(',', '.');
      const result = parseFloat(cleaned);
      return isNaN(result) ? 0 : result;
  };

  const handleSaveExpense = async () => {
      if (!expenseForm.description || !expenseForm.value || !expenseForm.category) {
          alert("Preencha descrição, valor e categoria.");
          return;
      }

      const storeId = String(props.storeConfig.id);
      const todayStr = new Date().toISOString().split('T')[0];
      const calculatedStatus = expenseForm.date > todayStr ? 'PENDENTE' : 'PAGO';
      const amountNum = safeCurrencyToNumber(expenseForm.value);

      // Trava de segurança: Se for pago hoje, precisa dizer de onde o dinheiro saiu
      if (calculatedStatus === 'PAGO' && !expenseForm.accountId) {
          alert("Para despesas pagas hoje ou retroativas, selecione de qual conta o dinheiro saiu.");
          return;
      }

      try {
          const batch = writeBatch(db);

          // 1. Ref da Movimentação Financeira (Despesa)
          const finRef = doc(collection(db, 'artifacts', storeId, 'public', 'data', 'financial_movements'));
          batch.set(finRef, {
              type: 'EXPENSE',
              category: expenseForm.category,
              description: expenseForm.description,
              amount: amountNum,
              date: expenseForm.date,
              status: calculatedStatus,
              createdAt: serverTimestamp(),
              userId: props.currentUser?.id || 'manager',
              userName: props.currentUser?.username || 'Gerente',
              accountId: expenseForm.accountId || null // Associa a conta ao gasto
          });

          // 2. Se a despesa já está PAGA, desconta da conta bancária imediatamente
          if (calculatedStatus === 'PAGO' && expenseForm.accountId) {
              // Registra no extrato da conta
              const accTxnRef = doc(collection(db, 'artifacts', storeId, 'public', 'data', 'account_transactions'));
              batch.set(accTxnRef, {
                  accountId: expenseForm.accountId,
                  type: 'OUT',
                  amount: amountNum,
                  description: `DESPESA: ${expenseForm.description}`,
                  category: expenseForm.category,
                  date: expenseForm.date,
                  createdAt: serverTimestamp(),
                  userId: props.currentUser?.id || 'manager',
                  userName: props.currentUser?.username || 'Gerente'
              });

              // Subtrai o valor do Saldo Atual da Conta
              const accRef = doc(db, 'artifacts', storeId, 'public', 'data', 'bank_accounts', expenseForm.accountId);
              batch.update(accRef, { currentBalance: increment(-amountNum) });
          }

          // Executa tudo ao mesmo tempo (Transação segura)
          await batch.commit();

          const msg = calculatedStatus === 'PENDENTE' ? "Agendado no Contas a Pagar!" : "Despesa paga e descontada da conta!";
          alert(msg);
          setIsExpenseModalOpen(false);
          setExpenseForm({ 
              description: '', value: '', date: todayStr, category: '', accountId: '' 
          });
      } catch (e) {
          console.error(e);
          alert("Erro ao salvar: " + e.message);
      }
  };

  const handleQuickAddCategory = async () => {
    if (!tempCatName) return;
    try {
        const storeId = String(props.storeConfig.id);
        // SALVA A CATEGORIA COM A FLAG 'isOperational'
        const ref = await addDoc(collection(db, 'artifacts', storeId, 'public', 'data', 'transaction_categories'), {
            name: tempCatName, 
            type: 'EXPENSE', 
            isOperational: tempCatIsOp, // <--- A MÁGICA ACONTECE AQUI
            createdAt: serverTimestamp()
        });
        
        // Atualiza localmente
        setCategories([...categories, { id: ref.id, name: tempCatName, isOperational: tempCatIsOp }]);
        setExpenseForm({...expenseForm, category: tempCatName}); // Já seleciona
        
        // Limpa form de categoria
        setIsAddingCat(false); 
        setTempCatName('');
        setTempCatIsOp(true);
    } catch (e) { alert('Erro ao criar categoria'); }
  };

  return (
    <div className="bg-white rounded border shadow-sm h-full flex flex-col overflow-hidden animate-in fade-in">
      {/* Navegação das Abas */}
      <div className="flex border-b overflow-x-auto shrink-0">
          <button onClick={() => setActiveTab('entry')} className={`px-6 py-4 font-bold text-sm flex items-center gap-2 ${activeTab === 'entry' ? 'border-b-2 border-slate-800 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
              <ScrollText size={18}/> Entrada de Notas
          </button>
          <button onClick={() => setActiveTab('payable')} className={`px-6 py-4 font-bold text-sm flex items-center gap-2 ${activeTab === 'payable' ? 'border-b-2 border-red-600 text-red-600' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Calendar size={18}/> Contas a Pagar
          </button>
          <button onClick={() => setActiveTab('invoices')} className={`px-6 py-4 font-bold text-sm flex items-center gap-2 ${activeTab === 'invoices' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}>
              <FileText size={18}/> Notas Fiscais
          </button>
          <button 
            onClick={() => setActiveTab('accounts')}
            className={`px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'accounts' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
        >
            <Landmark size={18}/> Contas Bancárias
        </button>
          <div className="flex-1 flex justify-end items-center px-4">
              <button onClick={() => setIsExpenseModalOpen(true)} className="bg-red-100 text-red-700 px-4 py-2 rounded font-bold hover:bg-red-200 flex items-center gap-2 text-sm">
                  <Minus size={16}/> Lançar Despesa
              </button>
          </div>
      </div>

      <div className="flex-1 bg-slate-50 overflow-hidden relative">
          {activeTab === 'entry' && <EntradaNotas storeConfig={props.storeConfig} showNotification={props.showNotification} products={props.products}/>}
          {activeTab === 'payable' && <AccountsPayable products={props.products} storeConfig={props.storeConfig} currentUser={props.currentUser} />}
          {activeTab === 'invoices' && <FiscalInvoices storeConfig={props.storeConfig} currentUser={props.currentUser} showNotification={props.showNotification || alert}/>}
          {activeTab === 'accounts' && (
                <div className="p-4 h-[calc(100vh-150px)] bg-slate-100">
                    <BankAccountsManager 
                        storeConfig={props.storeConfig} 
                        showNotification={props.showNotification || alert} 
                    />
                </div>
           )}
      </div>

      {/* MODAL SIMPLIFICADO */}
      {isExpenseModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-lg shadow-xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
                      <h3 className="font-bold flex items-center gap-2"><Minus size={18}/> Nova Despesa</h3>
                      <button onClick={() => setIsExpenseModalOpen(false)}><X size={20}/></button>
                  </div>
                  
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Descrição</label>
                          <input className="w-full border p-2 rounded text-sm" placeholder="Ex: Pagamento Extra, Limpeza..." value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} autoFocus />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Valor (R$)</label>
                              <div className="relative">
                                  <DollarSign size={14} className="absolute left-3 top-3 text-slate-400"/>
                                  <input type="number" step="0.01" className="w-full border pl-8 p-2 rounded text-sm font-bold text-red-600" placeholder="0.00" value={expenseForm.value} onChange={e => setExpenseForm({...expenseForm, value: e.target.value})} />
                              </div>
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Data Competência</label>
                              <input type="date" className="w-full border p-2 rounded text-sm" value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})} />
                          </div>
                      </div>

                      {/* SELEÇÃO DE CATEGORIA */}
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1"><Tag size={12}/> Categoria</label>
                          
                          {!isAddingCat ? (
                              <div className="flex gap-1">
                                  <select className="w-full border p-2 rounded text-sm bg-white" value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})}>
                                      <option value="">Selecione...</option>
                                      {categories.map((c, i) => <option key={i} value={c.name}>{c.name}</option>)}
                                  </select>
                                  <button onClick={() => setIsAddingCat(true)} className="bg-slate-200 px-3 rounded hover:bg-slate-300 text-slate-600" title="Criar Nova Categoria">
                                      <PlusCircle size={16}/>
                                  </button>
                              </div>
                          ) : (
                              <div className="bg-slate-100 p-3 rounded border border-slate-200 animate-in fade-in">
                                  <p className="text-xs font-bold text-slate-600 mb-2">Criando Nova Categoria:</p>
                                  <div className="flex gap-2 mb-2">
                                      <input className="w-full border p-2 rounded text-sm" placeholder="Nome da categoria..." value={tempCatName} onChange={e => setTempCatName(e.target.value)} autoFocus />
                                  </div>
                                  
                                  <div className="flex items-center gap-2 mb-3">
                                      <input 
                                          type="checkbox" id="newCatOp" 
                                          className="w-4 h-4 text-indigo-600 rounded"
                                          checked={tempCatIsOp}
                                          onChange={e => setTempCatIsOp(e.target.checked)}
                                      />
                                      <label htmlFor="newCatOp" className="text-xs font-bold text-slate-700 cursor-pointer">
                                          É Custo Operacional? <span className="text-slate-400 font-normal">(Abate do Lucro Líquido)</span>
                                      </label>
                                  </div>

                                  <div className="flex justify-end gap-2">
                                      <button onClick={() => setIsAddingCat(false)} className="text-xs text-red-600 font-bold px-3 py-1 hover:bg-red-50 rounded border border-transparent hover:border-red-200">Cancelar</button>
                                      <button onClick={handleQuickAddCategory} className="text-xs bg-slate-800 text-white font-bold px-3 py-1 rounded hover:bg-slate-900 flex items-center gap-1">
                                          <CheckSquare size={12}/> Criar
                                      </button>
                                  </div>
                              </div>
                          )}
                      </div>

                      {/* --- NOVO: SELEÇÃO DE CONTA BANCÁRIA --- */}
                      <div className="border-t border-slate-100 pt-4 mt-2">
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1">
                              <Landmark size={12}/> Conta de Saída (Pagamento)
                          </label>
                          <select 
                              className={`w-full border p-2 rounded text-sm bg-white focus:ring-2 outline-none ${expenseForm.date <= new Date().toISOString().split('T')[0] && !expenseForm.accountId ? 'border-red-400 focus:ring-red-200' : 'border-slate-200 focus:ring-indigo-200'}`}
                              value={expenseForm.accountId} 
                              onChange={e => setExpenseForm({...expenseForm, accountId: e.target.value})}
                          >
                              <option value="">{expenseForm.date <= new Date().toISOString().split('T')[0] ? '-- Selecione a Conta (Obrigatório) --' : '-- Nenhuma (Apenas Agendar) --'}</option>
                              {bankAccounts.map((acc, i) => (
                                  <option key={i} value={acc.id}>{acc.name} (Saldo: {formatCurrency(acc.currentBalance)})</option>
                              ))}
                          </select>
                          {expenseForm.date <= new Date().toISOString().split('T')[0] && !expenseForm.accountId ? (
                              <span className="text-[10px] text-red-500 font-bold mt-1 block">Necessário para debitar o valor do extrato hoje.</span>
                          ) : expenseForm.date > new Date().toISOString().split('T')[0] && (
                              <span className="text-[10px] text-slate-400 mt-1 block">O valor só será descontado no dia do pagamento efetivo.</span>
                          )}
                      </div>
                  </div>

                  <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                      <button onClick={() => setIsExpenseModalOpen(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded text-sm">Cancelar</button>
                      <button onClick={handleSaveExpense} className="px-6 py-2 bg-slate-800 text-white rounded font-bold text-sm hover:bg-slate-900 flex items-center gap-2">
                          <Save size={16}/> Salvar
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Transactions;
