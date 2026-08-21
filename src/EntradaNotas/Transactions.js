import React, { useState, useEffect } from 'react';
import { PlusCircle, FileText, ScrollText, Minus, Save, X, Calendar, DollarSign, Tag, CheckSquare, Landmark, ClipboardList } from 'lucide-react';
import EntradaNotas from './EntradaNotas';
import AccountsPayable from './AccountsPayable';
import FiscalInvoices from './FiscalInvoices';
import AccountsReceivable from '../AccountsReceivable';
import { useTenant } from '../contexts/TenantContext';
import { safeStr } from '../utils/safeString';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

// "YYYY-MM-DD" do dia local — toISOString() converte para UTC antes de fatiar, então depois das
// ~21h no fuso do Brasil (UTC-3) já mostra o dia seguinte como "hoje".
const todayLocalStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const Transactions = ({ showNotification, products, initialTab, onFinalizeSale, highlightId }) => {
  const { tenantDB, currentUser, currentStore } = useTenant();

  const [activeTab, setActiveTab] = useState(initialTab || 'entry');
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  const [categories, setCategories] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);

  const [isAddingCat, setIsAddingCat] = useState(false);
  const [tempCatName, setTempCatName] = useState('');
  const [tempCatIsOp, setTempCatIsOp] = useState(true);

  const [expenseForm, setExpenseForm] = useState({
      description: '',
      value: '',
      date: todayLocalStr(),
      category: '',
      accountId: ''
  });

  useEffect(() => {
      const fetchData = async () => {
          if(!tenantDB) return;
          try {
              const snapCat = await tenantDB.firestore.getAll('transaction_categories');
              setCategories(snapCat);

              const snapAcc = await tenantDB.firestore.getAll('bank_accounts');
              setBankAccounts(snapAcc);
          } catch(e) { console.error(e); }
      };
      if(isExpenseModalOpen) fetchData();
  }, [isExpenseModalOpen, tenantDB]);

  const handleSaveExpense = async () => {
      if (!expenseForm.description || !expenseForm.value || !expenseForm.category) {
          alert("Preencha descrição, valor e categoria.");
          return;
      }

      const todayStr = todayLocalStr();
      const calculatedStatus = expenseForm.date > todayStr ? 'PENDENTE' : 'PAGO';
      const amountNum = parseFloat(expenseForm.value) || 0;

      if (calculatedStatus === 'PAGO' && !expenseForm.accountId) {
          alert("Para despesas pagas hoje ou retroativas, selecione de qual conta o dinheiro saiu.");
          return;
      }

      if (calculatedStatus === 'PAGO' && expenseForm.accountId) {
          const selectedAccount = bankAccounts.find(a => a.id === expenseForm.accountId);
          const currentBalance = Number(selectedAccount?.currentBalance) || 0;
          if (currentBalance < amountNum) {
              const msg = `Saldo insuficiente em "${selectedAccount?.name || 'conta selecionada'}". Saldo atual: ${formatCurrency(currentBalance)}, despesa: ${formatCurrency(amountNum)}.`;
              if (showNotification) showNotification(msg, 'error'); else alert(msg);
              return;
          }
      }

      try {
          const batch = tenantDB.firestore.batch(); 

          // 1. Registo da Movimentação Financeira
          batch.add('financial_movements', {
              type: 'EXPENSE',
              category: expenseForm.category,
              description: expenseForm.description,
              amount: amountNum,
              date: expenseForm.date,
              status: calculatedStatus,
              createdAt: tenantDB.firestore.utils.serverTimestamp(),
              userId: currentUser?.id || 'manager',
              userName: currentUser?.name || currentUser?.username || 'Gerente',
              accountId: expenseForm.accountId || null 
          });

          // 2. Desconto direto (Se pago e com conta selecionada)
          if (calculatedStatus === 'PAGO' && expenseForm.accountId) {
              // Adiciona a transação ao extrato
              batch.add('account_transactions', {
                  accountId: expenseForm.accountId,
                  type: 'OUT',
                  amount: amountNum,
                  description: `DESPESA: ${expenseForm.description}`,
                  category: expenseForm.category,
                  date: expenseForm.date,
                  createdAt: tenantDB.firestore.utils.serverTimestamp(),
                  userId: currentUser?.id || 'manager',
                  userName: currentUser?.name || currentUser?.username || 'Gerente'
              });

              // Atualiza o saldo da conta
              batch.update('bank_accounts', expenseForm.accountId, { 
                  currentBalance: tenantDB.firestore.utils.increment(-amountNum) 
              });
          }

          await batch.commit(); // ✨ Executa tudo de forma segura

          const msg = calculatedStatus === 'PENDENTE' ? "Agendado no Contas a Pagar!" : "Despesa paga e descontada da conta!";
          if (showNotification) showNotification(msg, 'success'); else alert(msg);
          
          setIsExpenseModalOpen(false);
          setExpenseForm({ description: '', value: '', date: todayStr, category: '', accountId: '' });
      } catch (e) {
          console.error(e);
          if (showNotification) showNotification("Erro ao salvar: " + e.message, 'error'); else alert("Erro: " + e.message);
      }
  };

  const handleQuickAddCategory = async () => {
    if (!tempCatName) return;
    try {
        // Mágica do Multi-Tenant no Add
        const newId = await tenantDB.firestore.add('transaction_categories', {
            name: tempCatName, 
            type: 'EXPENSE', 
            isOperational: tempCatIsOp
        });
        
        setCategories([...categories, { id: newId, name: tempCatName, isOperational: tempCatIsOp }]);
        setExpenseForm({...expenseForm, category: tempCatName}); 
        
        setIsAddingCat(false); 
        setTempCatName('');
        setTempCatIsOp(true);
    } catch (e) { 
        if (showNotification) showNotification('Erro ao criar categoria', 'error'); else alert('Erro'); 
    }
  };

  return (
    <div className="bg-white rounded border shadow-sm h-full flex flex-col overflow-hidden animate-in fade-in">
      <div className="flex border-b overflow-x-auto shrink-0">
          <button onClick={() => setActiveTab('entry')} className={`px-6 py-4 font-bold text-sm flex items-center gap-2 ${activeTab === 'entry' ? 'border-b-2 border-slate-800 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
              <ScrollText size={18}/> Entrada de Notas
          </button>
          <button onClick={() => setActiveTab('payable')} className={`px-6 py-4 font-bold text-sm flex items-center gap-2 ${activeTab === 'payable' ? 'border-b-2 border-red-600 text-red-600' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Calendar size={18}/> Contas a Pagar
          </button>
          <button onClick={() => setActiveTab('receivable')} className={`px-6 py-4 font-bold text-sm flex items-center gap-2 ${activeTab === 'receivable' ? 'border-b-2 border-green-600 text-green-600' : 'text-slate-500 hover:bg-slate-50'}`}>
              <ClipboardList size={18}/> Contas a Receber
          </button>
          <button onClick={() => setActiveTab('invoices')} className={`px-6 py-4 font-bold text-sm flex items-center gap-2 ${activeTab === 'invoices' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}>
              <FileText size={18}/> Notas Fiscais
          </button>
          <div className="flex-1 flex justify-end items-center px-4">
              <button onClick={() => setIsExpenseModalOpen(true)} className="bg-red-100 text-red-700 px-4 py-2 rounded font-bold hover:bg-red-200 flex items-center gap-2 text-sm">
                  <Minus size={16}/> Lançar Despesa
              </button>
          </div>
      </div>

      <div className="flex-1 bg-slate-50 overflow-hidden relative">
          {/* O storeConfig continua sendo passado provisoriamente para EntradaNotas e Invoices para não quebrá-los */}
          {activeTab === 'entry' && <EntradaNotas storeConfig={currentStore} showNotification={showNotification} products={products}/>}
          {activeTab === 'payable' && <AccountsPayable products={products} />}
          {activeTab === 'receivable' && (
            <AccountsReceivable
              showNotification={showNotification}
              onFinalizeSale={onFinalizeSale}
              highlightId={highlightId}
            />
          )}
          {activeTab === 'invoices' && <FiscalInvoices storeConfig={currentStore} currentUser={currentUser} showNotification={showNotification || alert}/>}
      </div>

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

                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1"><Tag size={12}/> Categoria</label>
                          {!isAddingCat ? (
                              <div className="flex gap-1">
                                  <select className="w-full border p-2 rounded text-sm bg-white" value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})}>
                                      <option value="">Selecione...</option>
                                      {categories.map((c, i) => {
                                          // Blindagem: categoria antiga com `name` gravado como objeto
                                          // (bug de cadastro já corrigido — ver Apêndice A.1) quebrava esta tela.
                                          const catName = typeof c.name === 'string' ? c.name : c.name?.name || String(c.id || i);
                                          return <option key={i} value={catName}>{catName}</option>;
                                      })}
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

                      <div className="border-t border-slate-100 pt-4 mt-2">
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1">
                              <Landmark size={12}/> Conta de Saída (Pagamento)
                          </label>
                          <select
                              className={`w-full border p-2 rounded text-sm bg-white focus:ring-2 outline-none ${expenseForm.date <= todayLocalStr() && !expenseForm.accountId ? 'border-red-400 focus:ring-red-200' : 'border-slate-200 focus:ring-indigo-200'}`}
                              value={expenseForm.accountId}
                              onChange={e => setExpenseForm({...expenseForm, accountId: e.target.value})}
                          >
                              <option value="">{expenseForm.date <= todayLocalStr() ? '-- Selecione a Conta (Obrigatório) --' : '-- Nenhuma (Apenas Agendar) --'}</option>
                              {bankAccounts.map((acc, i) => (
                                  <option key={i} value={acc.id}>{safeStr(acc.name, 'Conta')} (Saldo: {formatCurrency(acc.currentBalance)})</option>
                              ))}
                          </select>
                          {expenseForm.date <= todayLocalStr() && !expenseForm.accountId ? (
                              <span className="text-[10px] text-red-500 font-bold mt-1 block">Necessário para debitar o valor do extrato hoje.</span>
                          ) : expenseForm.date > todayLocalStr() && (
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
