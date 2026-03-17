import React, { useState, useEffect } from 'react';
import { 
  Building2, Wallet, Plus, ArrowUpRight, ArrowDownRight, 
  Search, CheckCircle, X, Landmark, FileText, Trash2, Settings, Filter, User, ArrowLeftRight
} from 'lucide-react';
import { collection, addDoc, updateDoc, doc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, getDoc, setDoc, writeBatch, increment } from 'firebase/firestore';
import { db } from '../firebase'; // Ajuste o caminho conforme sua estrutura

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const BankAccountsManager = ({ storeConfig, showNotification }) => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  
  // Estados do Modal de Criação
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
      name: '',
      type: 'CHECKING', // CHECKING (Corrente), SAVINGS (Poupança), CASH (Caixa/Gaveta)
      initialBalance: ''
  });

  // Estados para o Roteamento (Fase B)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [routingConfig, setRoutingConfig] = useState({
      dinheiro: '',
      pix: '',
      cartao_credito: '',
      cartao_debito: '',
      transferencia: ''
  });

    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [transferData, setTransferData] = useState({ fromAccountId: '', toAccountId: '', amount: '', description: '' });
    const [isProcessingTransfer, setIsProcessingTransfer] = useState(false);

  // Carregar Configurações de Roteamento
  useEffect(() => {
      if (!storeConfig?.id) return;
      const loadRouting = async () => {
          const docRef = doc(db, 'artifacts', String(storeConfig.id), 'public', 'data', 'financial_settings', 'routing');
          const snap = await getDoc(docRef); // Importe getDoc do firebase/firestore no topo do arquivo!
          if (snap.exists()) {
              setRoutingConfig(snap.data());
          }
      };
      loadRouting();
  }, [storeConfig]);

  // Salvar Configurações de Roteamento
  const handleSaveRouting = async () => {
      try {
          const docRef = doc(db, 'artifacts', String(storeConfig.id), 'public', 'data', 'financial_settings', 'routing');
          // Usamos setDoc com merge para não sobrescrever outras configurações que você possa ter no futuro
          await setDoc(docRef, routingConfig, { merge: true }); // Importe setDoc do firebase/firestore no topo!
          showNotification('Roteamento de contas salvo com sucesso!', 'success');
          setIsSettingsModalOpen(false);
      } catch (error) {
          showNotification('Erro ao salvar roteamento.', 'error');
      }
  };

  // 1. Carregar Contas (Realtime)
  useEffect(() => {
      if (!storeConfig?.id) return;
      const storeId = String(storeConfig.id);
      const accountsRef = collection(db, 'artifacts', storeId, 'public', 'data', 'bank_accounts');
      
      const unsubscribe = onSnapshot(accountsRef, (snap) => {
          const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          // Ordena alfabeticamente
          setAccounts(data.sort((a, b) => a.name.localeCompare(b.name)));
      });

      return () => unsubscribe();
  }, [storeConfig]);

  // 2. Carregar Extrato (Transactions) quando uma conta é selecionada
  useEffect(() => {
      if (!storeConfig?.id || !selectedAccount) return;
      const storeId = String(storeConfig.id);
      
      const transRef = collection(db, 'artifacts', storeId, 'public', 'data', 'account_transactions');
      const q = query(transRef, where('accountId', '==', selectedAccount.id), orderBy('createdAt', 'desc'));
      
      const unsubscribe = onSnapshot(q, (snap) => {
          setTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      return () => unsubscribe();
  }, [storeConfig, selectedAccount]);

  // 3. Salvar Nova Conta
  const handleSaveAccount = async () => {
      if (!formData.name.trim()) return showNotification('O nome da conta é obrigatório.', 'error');
      
      try {
          const storeId = String(storeConfig.id);
          const initialVal = Number(formData.initialBalance) || 0;

          // Cria a conta
          const newAccount = {
              name: formData.name.toUpperCase(),
              type: formData.type,
              initialBalance: initialVal,
              currentBalance: initialVal,
              status: 'ACTIVE',
              createdAt: serverTimestamp()
          };

          const docRef = await addDoc(collection(db, 'artifacts', storeId, 'public', 'data', 'bank_accounts'), newAccount);

          // Se tiver saldo inicial, já cria a primeira movimentação no extrato
          if (initialVal > 0) {
              await addDoc(collection(db, 'artifacts', storeId, 'public', 'data', 'account_transactions'), {
                  accountId: docRef.id,
                  type: 'IN',
                  amount: initialVal,
                  description: 'SALDO INICIAL',
                  category: 'Abertura de Conta',
                  date: new Date().toISOString(),
                  createdAt: serverTimestamp()
              });
          }

          showNotification('Conta criada com sucesso!', 'success');
          setIsModalOpen(false);
          setFormData({ name: '', type: 'CHECKING', initialBalance: '' });
      } catch (error) {
          console.error(error);
          showNotification('Erro ao criar conta.', 'error');
      }
  };

  // Estados para Filtro do Extrato
  const [operatorFilter, setOperatorFilter] = useState('');
  
  // Extrai lista única de operadores que já movimentaram essa conta
  const uniqueOperators = [...new Set(transactions.map(t => t.userName).filter(Boolean))];

  // Filtra as transações e calcula o somatório
  const filteredTransactions = transactions.filter(t => 
      operatorFilter ? t.userName === operatorFilter : true
  );

  const filteredTotal = filteredTransactions.reduce((acc, curr) => {
      return acc + (curr.type === 'IN' ? curr.amount : -curr.amount);
  }, 0);

  const getAccountIcon = (type) => {
      if (type === 'CASH') return <Wallet size={24} className="text-emerald-600"/>;
      if (type === 'SAVINGS') return <Landmark size={24} className="text-blue-600"/>;
      return <Building2 size={24} className="text-indigo-600"/>;
  };

  const handleTransfer = async () => {
    if (isProcessingTransfer) return;
    const { fromAccountId, toAccountId, amount, description } = transferData;

    if (!fromAccountId || !toAccountId || !amount) 
        return showNotification('Preencha todos os campos obrigatórios.', 'error');
    if (fromAccountId === toAccountId) 
        return showNotification('As contas de origem e destino devem ser diferentes.', 'error');

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) 
        return showNotification('Valor inválido.', 'error');

    setIsProcessingTransfer(true);
    try {
        const storeId = String(storeConfig.id);
        const batch = writeBatch(db);
        const now = new Date().toISOString();

        const fromRef = doc(db, 'artifacts', storeId, 'public', 'data', 'bank_accounts', fromAccountId);
        const toRef   = doc(db, 'artifacts', storeId, 'public', 'data', 'bank_accounts', toAccountId);

        batch.update(fromRef, { currentBalance: increment(-amountNum) });
        batch.update(toRef,   { currentBalance: increment(amountNum)  });

        const fromAccount = accounts.find(a => a.id === fromAccountId);
        const toAccount   = accounts.find(a => a.id === toAccountId);
        const txnRef      = collection(db, 'artifacts', storeId, 'public', 'data', 'account_transactions');

        const txnOutRef = doc(txnRef);
        batch.set(txnOutRef, {
            accountId: fromAccountId,
            type: 'OUT',
            amount: amountNum,
            description: description || `TRANSFERÊNCIA PARA ${toAccount?.name}`,
            category: 'Transferência',
            relatedAccountId: toAccountId,
            date: now,
            createdAt: serverTimestamp()
        });

        const txnInRef = doc(txnRef);
        batch.set(txnInRef, {
            accountId: toAccountId,
            type: 'IN',
            amount: amountNum,
            description: description || `TRANSFERÊNCIA DE ${fromAccount?.name}`,
            category: 'Transferência',
            relatedAccountId: fromAccountId,
            date: now,
            createdAt: serverTimestamp()
        });

        await batch.commit();
        showNotification('Transferência realizada com sucesso!', 'success');
        setIsTransferModalOpen(false);
        setTransferData({ fromAccountId: '', toAccountId: '', amount: '', description: '' });
    } catch (error) {
        console.error(error);
        showNotification('Erro ao realizar transferência.', 'error');
    } finally {
        setIsProcessingTransfer(false);
    }
};

  return (
    <div className="flex gap-4 h-full animate-in fade-in">
        
        {/* COLUNA ESQUERDA: LISTA DE CONTAS */}
        <div className="w-1/3 flex flex-col gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                        <Landmark size={18} className="text-slate-500"/> Minhas Contas
                    </h2>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setIsSettingsModalOpen(true)}
                            className="bg-slate-100 text-slate-600 p-2 rounded hover:bg-slate-200 transition-colors"
                            title="Configurar Roteamento"
                        >
                            <Settings size={18}/> {/* Importe o ícone Settings do lucide-react */}
                        </button>
                        <button 
                            onClick={() => setIsModalOpen(true)}
                            className="bg-indigo-50 text-indigo-600 p-2 rounded hover:bg-indigo-100 transition-colors"
                            title="Nova Conta"
                        >
                            <Plus size={18}/>
                        </button>
                        <button 
                            onClick={() => setIsTransferModalOpen(true)}
                            className="bg-slate-100 text-slate-600 p-2 rounded hover:bg-slate-200 transition-colors"
                            title="Transferir entre contas"
                        >
                            <ArrowLeftRight size={18}/>
                        </button>
                    </div>
                </div>

                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                    {accounts.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-4">Nenhuma conta cadastrada.</p>
                    ) : (
                        accounts.map(acc => (
                            <div 
                                key={acc.id}
                                onClick={() => setSelectedAccount(acc)}
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedAccount?.id === acc.id ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-white rounded shadow-sm border border-slate-100">
                                            {getAccountIcon(acc.type)}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-700 text-sm leading-tight">{acc.name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">{acc.type === 'CASH' ? 'Caixa Físico' : acc.type === 'SAVINGS' ? 'Poupança' : 'Conta Corrente'}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-slate-100/50 flex justify-between items-end">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold">Saldo Atual</span>
                                    <span className={`font-bold ${acc.currentBalance < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                                        {formatCurrency(acc.currentBalance)}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>

        {/* COLUNA DIREITA: EXTRATO (LEDGER) */}
        <div className="w-2/3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            {selectedAccount ? (
                <>
                    {/* Header do Extrato com Filtros */}
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                    <FileText size={20} className="text-indigo-600"/>
                                    Extrato: {selectedAccount.name}
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">Acompanhe todas as entradas e saídas desta conta.</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Saldo Consolidado</p>
                                <p className={`text-2xl font-bold ${selectedAccount.currentBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {formatCurrency(selectedAccount.currentBalance)}
                                </p>
                            </div>
                        </div>

                        {/* Barra de Filtros */}
                        <div className="flex justify-between items-center bg-white p-2 border rounded-lg shadow-sm">
                            <div className="flex items-center gap-2">
                                <Filter size={16} className="text-slate-400"/>
                                <span className="text-xs font-bold text-slate-600 uppercase">Filtrar por Operador:</span>
                                <select 
                                    className="border rounded text-sm px-2 py-1 outline-none focus:border-indigo-500 bg-slate-50"
                                    value={operatorFilter}
                                    onChange={(e) => setOperatorFilter(e.target.value)}
                                >
                                    <option value="">Todos os Operadores</option>
                                    {uniqueOperators.map(op => (
                                        <option key={op} value={op}>{op}</option>
                                    ))}
                                </select>
                            </div>
                            
                            {/* Somatório do Filtro */}
                            {operatorFilter && (
                                <div className="text-sm">
                                    <span className="text-slate-500">Total do operador: </span>
                                    <span className={`font-bold ${filteredTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {formatCurrency(filteredTotal)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tabela do Extrato */}
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] sticky top-0 shadow-sm">
                                <tr>
                                    <th className="p-3">Data</th>
                                    <th className="p-3">Descrição / Origem</th>
                                    <th className="p-3 text-center">Tipo</th>
                                    <th className="p-3 text-right">Valor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-10 text-center text-slate-400">
                                            Nenhuma movimentação encontrada para este filtro.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTransactions.map(txn => (
                                        <tr key={txn.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-3 text-xs text-slate-500">
                                                {new Date(txn.date || txn.createdAt?.seconds * 1000).toLocaleDateString('pt-BR')}
                                                <span className="block text-[9px] text-slate-400 mt-0.5">{new Date(txn.date || txn.createdAt?.seconds * 1000).toLocaleTimeString('pt-BR')}</span>
                                            </td>
                                            <td className="p-3">
                                                <p className="font-bold text-slate-700">{txn.description}</p>
                                                <div className="flex gap-2 items-center mt-1">
                                                    <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded uppercase">{txn.category}</span>
                                                    {txn.userName && (
                                                        <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1">
                                                            <User size={10}/> {txn.userName}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 text-center">
                                                {txn.type === 'IN' ? (
                                                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full flex items-center justify-center w-fit mx-auto gap-1">
                                                        <ArrowDownRight size={12}/> ENTRADA
                                                    </span>
                                                ) : (
                                                    <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded-full flex items-center justify-center w-fit mx-auto gap-1">
                                                        <ArrowUpRight size={12}/> SAÍDA
                                                    </span>
                                                )}
                                            </td>
                                            <td className={`p-3 text-right font-bold ${txn.type === 'IN' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {txn.type === 'IN' ? '+' : '-'}{formatCurrency(txn.amount)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                    <Landmark size={48} className="mb-4 opacity-20"/>
                    <p>Selecione uma conta ao lado para ver o extrato.</p>
                </div>
            )}
        </div>

        {/* MODAL DE NOVA CONTA */}
        {isModalOpen && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div className="flex justify-between items-center p-4 border-b bg-slate-50">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <Landmark size={18} className="text-indigo-600"/> Cadastrar Nova Conta
                        </h2>
                        <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                    </div>
                    
                    <div className="p-4 space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Nome da Conta</label>
                            <input 
                                className="w-full border p-2 rounded text-sm uppercase mt-1 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                placeholder="Ex: ITAÚ EMPRESA, GAVETA PDV..."
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Tipo de Conta</label>
                            <div className="grid grid-cols-3 gap-2 mt-1">
                                <button 
                                    onClick={() => setFormData({...formData, type: 'CHECKING'})}
                                    className={`p-2 rounded border text-xs font-bold flex flex-col items-center gap-1 transition-colors ${formData.type === 'CHECKING' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                >
                                    <Building2 size={16}/> Corrente
                                </button>
                                <button 
                                    onClick={() => setFormData({...formData, type: 'SAVINGS'})}
                                    className={`p-2 rounded border text-xs font-bold flex flex-col items-center gap-1 transition-colors ${formData.type === 'SAVINGS' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                >
                                    <Landmark size={16}/> Poupança
                                </button>
                                <button 
                                    onClick={() => setFormData({...formData, type: 'CASH'})}
                                    className={`p-2 rounded border text-xs font-bold flex flex-col items-center gap-1 transition-colors ${formData.type === 'CASH' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                >
                                    <Wallet size={16}/> Caixa Físico
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Saldo Inicial (Opcional)</label>
                            <input 
                                type="number" step="0.01"
                                className="w-full border p-2 rounded text-sm mt-1 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                placeholder="0.00"
                                value={formData.initialBalance}
                                onChange={e => setFormData({...formData, initialBalance: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
                        <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded text-sm">Cancelar</button>
                        <button onClick={handleSaveAccount} className="px-6 py-2 bg-indigo-600 text-white rounded font-bold text-sm hover:bg-indigo-700 flex items-center gap-2">
                            <CheckCircle size={16}/> Salvar Conta
                        </button>
                    </div>
                </div>
            </div>
        )}

    {/* MODAL DE ROTEAMENTO (FASE B) */}
        {isSettingsModalOpen && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                    <div className="flex justify-between items-center p-4 border-b bg-slate-50">
                        <div>
                            <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                <Settings size={18} className="text-indigo-600"/> Roteamento de Pagamentos
                            </h2>
                            <p className="text-xs text-slate-500">Defina para qual conta o dinheiro de cada método deve ir.</p>
                        </div>
                        <button onClick={() => setIsSettingsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                    </div>
                    
                    <div className="p-6 space-y-4">
                        {[
                            { key: 'dinheiro', label: 'Dinheiro', icon: '💵' },
                            { key: 'pix', label: 'PIX', icon: '📱' },
                            { key: 'cartao_credito', label: 'Cartão de Crédito', icon: '💳' },
                            { key: 'cartao_debito', label: 'Cartão de Débito', icon: '💳' },
                            { key: 'transferencia', label: 'Transferência Bancária', icon: '🏦' }
                        ].map(method => (
                            <div key={method.key} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                                <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                    {method.icon} {method.label}
                                </span>
                                <select 
                                    className="border p-2 rounded text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 w-1/2"
                                    value={routingConfig[method.key] || ''}
                                    onChange={e => setRoutingConfig({...routingConfig, [method.key]: e.target.value})}
                                >
                                    <option value="">-- Selecione a Conta --</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.type === 'CASH' ? 'Caixa' : 'Banco'})</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
                        <button onClick={() => setIsSettingsModalOpen(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded text-sm">Cancelar</button>
                        <button onClick={handleSaveRouting} className="px-6 py-2 bg-indigo-600 text-white rounded font-bold text-sm hover:bg-indigo-700 flex items-center gap-2">
                            <CheckCircle size={16}/> Salvar Roteamento
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL DE TRANSFERÊNCIA */}
        {isTransferModalOpen && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div className="flex justify-between items-center p-4 border-b bg-slate-50">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <ArrowLeftRight size={18} className="text-indigo-600"/> Transferir entre Contas
                        </h2>
                        <button onClick={() => setIsTransferModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                    </div>

                    <div className="p-4 space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Conta de Origem</label>
                            <select 
                                className="w-full border p-2 rounded text-sm mt-1 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                value={transferData.fromAccountId}
                                onChange={e => setTransferData({...transferData, fromAccountId: e.target.value})}
                            >
                                <option value="">-- Selecione --</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.currentBalance)})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Conta de Destino</label>
                            <select 
                                className="w-full border p-2 rounded text-sm mt-1 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                value={transferData.toAccountId}
                                onChange={e => setTransferData({...transferData, toAccountId: e.target.value})}
                            >
                                <option value="">-- Selecione --</option>
                                {accounts.filter(a => a.id !== transferData.fromAccountId).map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.currentBalance)})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Valor</label>
                            <input 
                                type="number" step="0.01"
                                className="w-full border p-2 rounded text-sm mt-1 focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="0.00"
                                value={transferData.amount}
                                onChange={e => setTransferData({...transferData, amount: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Descrição <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
                            <input 
                                className="w-full border p-2 rounded text-sm mt-1 focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Ex: Depósito de sangria..."
                                value={transferData.description}
                                onChange={e => setTransferData({...transferData, description: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
                        <button onClick={() => setIsTransferModalOpen(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded text-sm">Cancelar</button>
                        <button 
                            onClick={handleTransfer}
                            disabled={isProcessingTransfer}
                            className={`px-6 py-2 text-white rounded font-bold text-sm flex items-center gap-2 ${isProcessingTransfer ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                        >
                            <ArrowLeftRight size={16}/> {isProcessingTransfer ? 'Processando...' : 'Confirmar Transferência'}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default BankAccountsManager;
