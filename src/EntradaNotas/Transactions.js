import React, { useState, useEffect } from 'react';
import { PlusCircle, FileText, ScrollText, Minus, Save, X, Calendar, DollarSign, Tag, CheckSquare } from 'lucide-react';
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase'; // Ajuste o caminho se necessário
import EntradaNotas from './EntradaNotas'; 
import AccountsPayable from './AccountsPayable';
import FiscalInvoices from './FiscalInvoices'; 

const Transactions = (props) => {
  const [activeTab, setActiveTab] = useState('entry'); 
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  
  // Estado do Formulário de Despesa
  const [expenseForm, setExpenseForm] = useState({
      description: '',
      value: '',
      date: new Date().toISOString().split('T')[0],
      category: '',
      isOvertime: false, // Item 23
      isHoliday: false   // Item 23
  });

  // Carregar categorias ao abrir
  useEffect(() => {
      const fetchCategories = async () => {
          if(!props.storeConfig?.id) return;
          const storeId = String(props.storeConfig.id);
          try {
              const catRef = collection(db, 'artifacts', storeId, 'public', 'data', 'transaction_categories');
              const snap = await getDocs(catRef);
              const cats = snap.docs.map(d => ({id: d.id, ...d.data()}));
              
              // Se não tiver categorias criadas, usa padrão
              if (cats.length === 0) {
                  setCategories([
                      {name: 'Custos Fixos (Luz/Água/Aluguel)'},
                      {name: 'Pessoal'},
                      {name: 'Manutenção'},
                      {name: 'Impostos'},
                      {name: 'Outros'}
                  ]);
              } else {
                  setCategories(cats);
              }
          } catch(e) { console.error("Erro ao buscar categorias", e); }
      };
      fetchCategories();
  }, [props.storeConfig]);

  const handleSaveExpense = async () => {
      if (!expenseForm.description || !expenseForm.value || !expenseForm.category) {
          alert("Preencha descrição, valor e categoria.");
          return;
      }

      try {
          const storeId = String(props.storeConfig.id);
          
          await addDoc(collection(db, 'artifacts', storeId, 'public', 'data', 'financial_movements'), {
              type: 'EXPENSE',
              category: expenseForm.category,
              description: expenseForm.description,
              amount: parseFloat(expenseForm.value.replace(',', '.')),
              date: expenseForm.date,
              
              // Flags Especiais (Item 23)
              isOvertime: expenseForm.isOvertime,
              isHoliday: expenseForm.isHoliday,
              
              status: 'PAGO', // Lançamento avulso geralmente já foi pago
              createdAt: serverTimestamp(),
              userId: 'manager' // Ou pegar do props.currentUser
          });

          alert("Despesa lançada com sucesso!");
          setIsExpenseModalOpen(false);
          setExpenseForm({ description: '', value: '', date: new Date().toISOString().split('T')[0], category: '', isOvertime: false, isHoliday: false });
      } catch (e) {
          console.error(e);
          alert("Erro ao salvar: " + e.message);
      }
  };

  return (
    <div className="space-y-4">
      {/* Navegação de Abas + Botão de Despesa */}
      <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 shadow-sm mb-2">
          <div className="inline-flex gap-1">
            <button 
              onClick={() => setActiveTab('entry')}
              className={`px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'entry' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}
            >
               <PlusCircle size={16}/> Nova Nota (XML)
            </button>
            <button 
              onClick={() => setActiveTab('payable')}
              className={`px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'payable' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}
            >
               <FileText size={16}/> Contas a Pagar
            </button>
            <button 
              onClick={() => setActiveTab('fiscal')}
              className={`px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'fiscal' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}
            >
               <ScrollText size={16}/> Notas Emitidas
            </button>
          </div>

          {/* BOTÃO DE LANÇAR DESPESA (Item 20, 21, 22) */}
          <button 
              onClick={() => setIsExpenseModalOpen(true)}
              className="px-4 py-2 bg-red-100 text-red-700 border border-red-200 rounded text-sm font-bold flex items-center gap-2 hover:bg-red-200 transition-colors"
          >
              <Minus size={16}/> Lançar Saída/Despesa
          </button>
      </div>

      {/* Renderização Condicional */}
      <div className="min-h-[600px]">
        {activeTab === 'entry' && <EntradaNotas {...props} />}
        {activeTab === 'payable' && <AccountsPayable products={props.products || []} />}
        {activeTab === 'fiscal' && <FiscalInvoices storeConfig={props.storeConfig} showNotification={props.showNotification || alert} />}
      </div>

      {/* MODAL DE LANÇAMENTO DE DESPESA */}
      {isExpenseModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col">
                  <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
                      <h3 className="font-bold flex items-center gap-2"><Minus size={18} className="text-red-400"/> Nova Despesa Avulsa</h3>
                      <button onClick={() => setIsExpenseModalOpen(false)}><X size={20}/></button>
                  </div>
                  
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Descrição do Gasto</label>
                          <input 
                              className="w-full border p-2 rounded text-sm focus:ring-2 focus:ring-red-500 outline-none" 
                              placeholder="Ex: Conta de Luz referente Maio"
                              value={expenseForm.description}
                              onChange={e => setExpenseForm({...expenseForm, description: e.target.value})}
                              autoFocus
                          />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1"><DollarSign size={12}/> Valor (R$)</label>
                              <input 
                                  type="number" 
                                  step="0.01"
                                  className="w-full border p-2 rounded text-sm font-bold text-red-600" 
                                  placeholder="0.00"
                                  value={expenseForm.value}
                                  onChange={e => setExpenseForm({...expenseForm, value: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1"><Calendar size={12}/> Data Pagto</label>
                              <input 
                                  type="date" 
                                  className="w-full border p-2 rounded text-sm" 
                                  value={expenseForm.date}
                                  onChange={e => setExpenseForm({...expenseForm, date: e.target.value})}
                              />
                          </div>
                      </div>

                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1"><Tag size={12}/> Categoria</label>
                          <select 
                              className="w-full border p-2 rounded text-sm bg-white"
                              value={expenseForm.category}
                              onChange={e => setExpenseForm({...expenseForm, category: e.target.value})}
                          >
                              <option value="">Selecione...</option>
                              {categories.map((c, i) => (
                                  <option key={i} value={c.name}>{c.name}</option>
                              ))}
                          </select>
                      </div>

                      {/* ITEM 23: FLAGS ESPECIAIS */}
                      <div className="bg-slate-50 p-3 rounded border border-slate-200">
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">Classificação Especial (RH)</label>
                          <div className="flex gap-4">
                              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                  <input 
                                      type="checkbox" 
                                      className="rounded text-red-600 focus:ring-red-500"
                                      checked={expenseForm.isOvertime}
                                      onChange={e => setExpenseForm({...expenseForm, isOvertime: e.target.checked})}
                                  />
                                  Hora Extra
                              </label>
                              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                  <input 
                                      type="checkbox" 
                                      className="rounded text-red-600 focus:ring-red-500"
                                      checked={expenseForm.isHoliday}
                                      onChange={e => setExpenseForm({...expenseForm, isHoliday: e.target.checked})}
                                  />
                                  Feriado / Domingo
                              </label>
                          </div>
                      </div>
                  </div>

                  <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                      <button onClick={() => setIsExpenseModalOpen(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded text-sm">Cancelar</button>
                      <button onClick={handleSaveExpense} className="px-6 py-2 bg-red-600 text-white rounded font-bold text-sm hover:bg-red-700 flex items-center gap-2">
                          <Save size={16}/> Confirmar Despesa
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Transactions;