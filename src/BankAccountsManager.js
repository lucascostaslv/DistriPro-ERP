import React, { useState, useEffect } from 'react';
import {
  Building2, Wallet, Plus, ArrowUpRight, ArrowDownRight,
  Search, CheckCircle, X, Landmark, FileText, Trash2, Settings, Filter, User, ArrowLeftRight,
  CheckSquare, Square, Edit2, SlidersHorizontal
} from 'lucide-react';
import { useTenant } from './contexts/TenantContext'; 
import { where } from 'firebase/firestore';
// Importações limpas do Firebase apenas para as transações atômicas e filtros

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

// Strings de data-only (ex: '2026-05-10') são interpretadas pelo JS como UTC midnight,
// causando shift de 1 dia em fusos negativos (UTC-3 BR). Tratar como horário local.
const parseTxnDate = (dateVal) => {
    if (!dateVal) return null;
    if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
        return new Date(dateVal + 'T12:00:00');
    }
    return new Date(dateVal);
};

const toLocalDateStr = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const BankAccountsManager = ({ showNotification }) => {
  const { tenantDB, currentUser } = useTenant();

  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  
  // Estados do Modal de Criação
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
      name: '',
      type: 'CHECKING', 
      initialBalance: ''
  });

  // Estados para o Roteamento (Fase B)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [routingConfig, setRoutingConfig] = useState({
      dinheiro: '', pix: '', cartao_credito: '', cartao_debito: '', transferencia: ''
  });

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferData, setTransferData] = useState({ fromAccountId: '', toAccountId: '', amount: '', description: '' });
  const [isProcessingTransfer, setIsProcessingTransfer] = useState(false);

  // Estados do Modal de Reajuste de Saldo (correção direta, sem registro no extrato)
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustData, setAdjustData] = useState({ accountId: '', newBalance: '' });
  const [isProcessingAdjust, setIsProcessingAdjust] = useState(false);

  // 1. Carregar Configurações de Roteamento (Usando a DAL)
  useEffect(() => {
      if (!tenantDB) return;
      const loadRouting = async () => {
          const data = await tenantDB.firestore.getById('financial_settings', 'routing');
          if (data) {
              setRoutingConfig(data);
          }
      };
      loadRouting();
  }, [tenantDB]);


  const handleSaveRouting = async () => {
      try {
          // Usando a nossa nova abstração limpa:
          await tenantDB.firestore.set('financial_settings', 'routing', routingConfig);
          showNotification('Roteamento de contas salvo com sucesso!', 'success');
          setIsSettingsModalOpen(false);
      } catch (error) {
          showNotification('Erro ao salvar roteamento.', 'error');
      }
  };

  // 2. Carregar Contas (Realtime via DAL)
  useEffect(() => {
      if (!tenantDB) return;
      const unsubscribe = tenantDB.firestore.subscribe('bank_accounts', (dados) => {
          setAccounts(dados);
      });
      return () => unsubscribe();
  }, [tenantDB]);

  // 3. Carregar Extrato (Transactions) QUANDO UMA CONTA É SELECIONADA
  useEffect(() => {
      if (!tenantDB || !selectedAccount) {
          setTransactions([]);
          return;
      }
      
      const unsubscribe = tenantDB.firestore.subscribe(
          'account_transactions', 
          (dados) => {
              // Ordena localmente (mais recentes primeiro)
              const sorted = dados.sort((a,b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
              setTransactions(sorted);
          },
          [where('accountId', '==', selectedAccount.id)] // O filtro mágico!
      );
      
      return () => unsubscribe();
  }, [tenantDB, selectedAccount]);

  // 4. Salvar Nova Conta
  const handleSaveAccount = async () => {
      if (!formData.name.trim()) return showNotification('O nome da conta é obrigatório.', 'error');
      
      try {
          const initialVal = Number(formData.initialBalance) || 0;

          const newAccount = {
              name: formData.name.toUpperCase(),
              type: formData.type,
              initialBalance: initialVal,
              currentBalance: initialVal,
              status: 'ACTIVE'
              // createdAt é injetado automaticamente pelo add da DAL
          };

          const newAccountId = await tenantDB.firestore.add('bank_accounts', newAccount);

          // Se tiver saldo inicial, cria a movimentação inicial no EXTRATO
          if (initialVal > 0) {
              await tenantDB.firestore.add('account_transactions', {
                  accountId: newAccountId,
                  type: 'IN',
                  amount: initialVal,
                  description: 'SALDO INICIAL',
                  category: 'Abertura de Conta',
                  date: new Date().toISOString(),
                  userName: currentUser?.name || 'Sistema'
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

  // 5. Função de Transferência usando Batch e Refs da DAL
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
          const now = new Date().toISOString();
          
          // Inicia o lote (batch) pelo Contexto
          const batch = tenantDB.firestore.batch();

          // Atualiza os saldos usando o utils.increment
          batch.update('bank_accounts', fromAccountId, { 
              currentBalance: tenantDB.firestore.utils.increment(-amountNum) 
          });
          batch.update('bank_accounts', toAccountId, { 
              currentBalance: tenantDB.firestore.utils.increment(amountNum) 
          });

          const fromAccount = accounts.find(a => a.id === fromAccountId);
          const toAccount   = accounts.find(a => a.id === toAccountId);
          
          // Adiciona a transação de SAÍDA (usando utils.serverTimestamp)
          batch.add('account_transactions', {
              accountId: fromAccountId,
              type: 'OUT',
              amount: amountNum,
              description: description || `TRANSFERÊNCIA PARA ${toAccount?.name}`,
              category: 'Transferência',
              relatedAccountId: toAccountId,
              date: now,
              createdAt: tenantDB.firestore.utils.serverTimestamp(),
              userName: currentUser?.name || 'Sistema'
          });

          // Adiciona a transação de ENTRADA (usando utils.serverTimestamp)
          batch.add('account_transactions', {
              accountId: toAccountId,
              type: 'IN',
              amount: amountNum,
              description: description || `TRANSFERÊNCIA DE ${fromAccount?.name}`,
              category: 'Transferência',
              relatedAccountId: fromAccountId,
              date: now,
              createdAt: tenantDB.firestore.utils.serverTimestamp(),
              userName: currentUser?.name || 'Sistema'
          });

          // Executa todas as operações juntas
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

  // 6. Reajuste direto de saldo (correção pontual, NÃO gera transferência nem lançamento no extrato)
  const handleAdjustBalance = async () => {
      if (isProcessingAdjust) return;
      const { accountId, newBalance } = adjustData;

      if (!accountId) return showNotification('Selecione a conta.', 'error');
      if (newBalance === '') return showNotification('Informe o novo saldo.', 'error');

      const newBalanceNum = Number(newBalance);
      if (isNaN(newBalanceNum)) return showNotification('Valor inválido.', 'error');

      setIsProcessingAdjust(true);
      try {
          // Atualiza somente o saldo da conta, sem criar transferência ou lançamento no extrato
          await tenantDB.firestore.update('bank_accounts', accountId, {
              currentBalance: newBalanceNum
          });

          showNotification('Saldo reajustado com sucesso!', 'success');
          setIsAdjustModalOpen(false);
          setAdjustData({ accountId: '', newBalance: '' });
      } catch (error) {
          console.error(error);
          showNotification('Erro ao reajustar saldo.', 'error');
      } finally {
          setIsProcessingAdjust(false);
      }
  };

  // --- INÍCIO DOS FILTROS ATUALIZADOS ---
  const [operatorFilter, setOperatorFilter] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' }); // <-- NOVO ESTADO DE DATA

  const uniqueOperators = [...new Set(transactions.map(t => t.userName).filter(Boolean))];
  
  const filteredTransactions = transactions.filter(t => {
      let passOp = operatorFilter ? t.userName === operatorFilter : true;
      let passStart = true;
      let passEnd = true;
      
      // Usa horário local para comparar (evita shift de fuso UTC-3)
      const tDateObj = t.date ? parseTxnDate(t.date) : (t.createdAt?.seconds ? new Date(t.createdAt.seconds * 1000) : new Date());
      const tDateStr = toLocalDateStr(tDateObj);

      if (dateFilter.start) passStart = tDateStr >= dateFilter.start;
      if (dateFilter.end) passEnd = tDateStr <= dateFilter.end;

      return passOp && passStart && passEnd;
  });

  const filteredTotal = filteredTransactions.reduce((acc, curr) => acc + (curr.type === 'IN' ? curr.amount : -curr.amount), 0);
  // --- FIM DOS FILTROS ---

  const entries = filteredTransactions.filter(t => t.type === 'IN');
  const exits = filteredTransactions.filter(t => t.type === 'OUT');
  const totalEntries = entries.reduce((acc, t) => acc + t.amount, 0);
  const totalExits = exits.reduce((acc, t) => acc + t.amount, 0);
  const saldoPeriodo = totalEntries - totalExits;

  const handleToggleReconciled = async (txn) => {
    try {
      await tenantDB.firestore.update('account_transactions', txn.id, {
        reconciled: !txn.reconciled
      });
    } catch (error) {
      showNotification('Erro ao atualizar conciliação.', 'error');
    }
  };

  // --- EDIÇÃO DE TRANSAÇÃO ---
  const [editTxnModal, setEditTxnModal] = useState(null); // null | { txn, form }

  const openEditTxn = (txn) => {
    const dateStr = txn.date
      ? (typeof txn.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(txn.date)
          ? txn.date
          : toLocalDateStr(new Date(txn.date)))
      : toLocalDateStr(new Date(txn.createdAt?.seconds * 1000));

    setEditTxnModal({
      txn,
      form: {
        description: txn.description || '',
        amount: String(txn.amount ?? ''),
        date: dateStr,
        category: txn.category || '',
        type: txn.type || 'OUT',
      },
    });
  };

  const handleSaveEditedTxn = async () => {
    if (!editTxnModal) return;
    const { txn, form } = editTxnModal;

    const newAmount = parseFloat(String(form.amount).replace(',', '.'));
    if (isNaN(newAmount) || newAmount <= 0) {
      return showNotification('Valor inválido.', 'error');
    }

    try {
      const batch = tenantDB.firestore.batch();

      // Reverte o impacto antigo e aplica o novo no saldo da conta
      const oldEffect = txn.type === 'IN' ? txn.amount : -txn.amount;
      const newEffect = form.type === 'IN' ? newAmount : -newAmount;
      const balanceDelta = newEffect - oldEffect;

      batch.update('account_transactions', txn.id, {
        description: form.description.trim(),
        amount: newAmount,
        date: form.date,
        category: form.category.trim(),
        type: form.type,
      });

      if (balanceDelta !== 0) {
        batch.update('bank_accounts', txn.accountId, {
          currentBalance: tenantDB.firestore.utils.increment(balanceDelta),
        });
      }

      await batch.commit();
      showNotification('Transação atualizada.', 'success');
      setEditTxnModal(null);
    } catch (error) {
      showNotification('Erro ao atualizar transação.', 'error');
    }
  };

  const handleDeleteTransaction = async (txn) => {
    if (!window.confirm(`Excluir transação "${txn.description}" de ${formatCurrency(txn.amount)}? O saldo da conta será revertido.`)) return;
    try {
      const batch = tenantDB.firestore.batch();
      batch.delete('account_transactions', txn.id);
      // Reverte o impacto no saldo da conta
      const delta = txn.type === 'IN' ? -txn.amount : txn.amount;
      batch.update('bank_accounts', txn.accountId, {
        currentBalance: tenantDB.firestore.utils.increment(delta)
      });
      await batch.commit();
      showNotification('Transação excluída e saldo revertido.', 'success');
    } catch (error) {
      showNotification('Erro ao excluir transação.', 'error');
    }
  };

  const getAccountIcon = (type) => {
      if (type === 'CASH') return <Wallet size={24} className="text-emerald-600"/>;
      if (type === 'SAVINGS') return <Landmark size={24} className="text-blue-600"/>;
      return <Building2 size={24} className="text-indigo-600"/>;
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
                            <Settings size={18}/> 
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
                        <button
                            onClick={() => setIsAdjustModalOpen(true)}
                            className="bg-amber-50 text-amber-600 p-2 rounded hover:bg-amber-100 transition-colors"
                            title="Reajuste de Saldo"
                        >
                            <SlidersHorizontal size={18}/>
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

                        {/* Barra de Filtros Melhorada */}
                        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-3 border rounded-lg shadow-sm gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <Filter size={16} className="text-slate-400"/>
                                    <span className="text-xs font-bold text-slate-600 uppercase">Período:</span>
                                    <input type="date" className="border rounded text-sm px-2 py-1 bg-slate-50 outline-none focus:border-indigo-500" value={dateFilter.start} onChange={e => setDateFilter({...dateFilter, start: e.target.value})} />
                                    <span className="text-xs text-slate-400">até</span>
                                    <input type="date" className="border rounded text-sm px-2 py-1 bg-slate-50 outline-none focus:border-indigo-500" value={dateFilter.end} onChange={e => setDateFilter({...dateFilter, end: e.target.value})} />
                                </div>

                                <div className="flex items-center gap-2 border-l pl-3">
                                    <span className="text-xs font-bold text-slate-600 uppercase">Operador:</span>
                                    <select 
                                        className="border rounded text-sm px-2 py-1 outline-none focus:border-indigo-500 bg-slate-50"
                                        value={operatorFilter}
                                        onChange={(e) => setOperatorFilter(e.target.value)}
                                    >
                                        <option value="">Todos</option>
                                        {uniqueOperators.map(op => <option key={op} value={op}>{op}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            {/* Somatório do Filtro */}
                            {(operatorFilter || dateFilter.start || dateFilter.end) && (
                                <div className="text-sm bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 flex items-center">
                                    <span className="text-slate-500 text-xs mr-2">Total do filtro: </span>
                                    <span className={`font-bold ${filteredTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {formatCurrency(filteredTotal)}
                                    </span>
                                    <button 
                                        onClick={() => { setOperatorFilter(''); setDateFilter({start: '', end: ''}); }} 
                                        className="ml-3 text-[10px] bg-indigo-100 text-indigo-500 px-2 py-0.5 rounded hover:bg-indigo-200 font-bold uppercase transition-colors"
                                    >
                                        Limpar
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Resumo do Período */}
                    <div className="px-4 py-3 bg-slate-50 border-b flex gap-3">
                        <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase">Total Entradas</p>
                            <p className="text-lg font-bold text-emerald-700">+{formatCurrency(totalEntries)}</p>
                            <p className="text-[10px] text-emerald-500">{entries.length} transações</p>
                        </div>
                        <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                            <p className="text-[10px] font-bold text-red-600 uppercase">Total Saídas</p>
                            <p className="text-lg font-bold text-red-700">-{formatCurrency(totalExits)}</p>
                            <p className="text-[10px] text-red-500">{exits.length} transações</p>
                        </div>
                        <div className={`flex-1 rounded-lg p-3 text-center border ${saldoPeriodo >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                            <p className="text-[10px] font-bold text-slate-500 uppercase">Saldo do Período</p>
                            <p className={`text-lg font-bold ${saldoPeriodo >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{formatCurrency(saldoPeriodo)}</p>
                            <p className="text-[10px] text-slate-400">{filteredTransactions.length} no total</p>
                        </div>
                    </div>

                    {/* Duas colunas: Entradas | Saídas */}
                    <div className="flex-1 overflow-hidden flex">
                        {/* Coluna Entradas */}
                        <div className="w-1/2 flex flex-col border-r border-slate-200">
                            <div className="bg-emerald-600 text-white px-4 py-2 flex items-center justify-between">
                                <span className="text-xs font-bold uppercase flex items-center gap-1">
                                    <ArrowDownRight size={14}/> Entradas
                                </span>
                                <span className="text-xs font-bold">{formatCurrency(totalEntries)}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                                {entries.length === 0 ? (
                                    <p className="text-center text-slate-400 text-sm py-10">Nenhuma entrada no período.</p>
                                ) : (
                                    entries.map(txn => (
                                        <div key={txn.id} className={`p-3 flex items-start gap-2 hover:bg-emerald-50/40 transition-colors ${txn.reconciled ? 'bg-slate-50' : ''}`}>
                                            <button
                                                onClick={() => handleToggleReconciled(txn)}
                                                className="mt-0.5 shrink-0 text-emerald-600 hover:text-emerald-800 transition-colors"
                                                title={txn.reconciled ? 'Marcar como não conciliada' : 'Marcar como conciliada'}
                                            >
                                                {txn.reconciled ? <CheckSquare size={16}/> : <Square size={16}/>}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-bold truncate ${txn.reconciled ? 'line-through text-slate-400' : 'text-slate-700'}`}>{txn.description}</p>
                                                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                                    <span className="text-[10px] text-slate-400">{(txn.date ? parseTxnDate(txn.date) : new Date(txn.createdAt?.seconds * 1000)).toLocaleDateString('pt-BR')}</span>
                                                    {txn.category && <span className="text-[10px] bg-slate-200 text-slate-600 px-1 rounded uppercase">{txn.category}</span>}
                                                    {txn.userName && <span className="text-[10px] text-indigo-500 flex items-center gap-0.5"><User size={9}/>{txn.userName}</span>}
                                                    {txn.reconciled && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded font-bold">Conciliada</span>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <span className="text-sm font-bold text-emerald-600">+{formatCurrency(txn.amount)}</span>
                                                <button onClick={() => openEditTxn(txn)} className="text-slate-300 hover:text-indigo-500 transition-colors p-0.5" title="Editar transação"><Edit2 size={13}/></button>
                                                <button onClick={() => handleDeleteTransaction(txn)} className="text-slate-300 hover:text-red-500 transition-colors p-0.5" title="Excluir transação"><Trash2 size={13}/></button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Coluna Saídas */}
                        <div className="w-1/2 flex flex-col">
                            <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between">
                                <span className="text-xs font-bold uppercase flex items-center gap-1">
                                    <ArrowUpRight size={14}/> Saídas
                                </span>
                                <span className="text-xs font-bold">{formatCurrency(totalExits)}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                                {exits.length === 0 ? (
                                    <p className="text-center text-slate-400 text-sm py-10">Nenhuma saída no período.</p>
                                ) : (
                                    exits.map(txn => (
                                        <div key={txn.id} className={`p-3 flex items-start gap-2 hover:bg-red-50/40 transition-colors ${txn.reconciled ? 'bg-slate-50' : ''}`}>
                                            <button
                                                onClick={() => handleToggleReconciled(txn)}
                                                className="mt-0.5 shrink-0 text-red-600 hover:text-red-800 transition-colors"
                                                title={txn.reconciled ? 'Marcar como não conciliada' : 'Marcar como conciliada'}
                                            >
                                                {txn.reconciled ? <CheckSquare size={16}/> : <Square size={16}/>}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-bold truncate ${txn.reconciled ? 'line-through text-slate-400' : 'text-slate-700'}`}>{txn.description}</p>
                                                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                                    <span className="text-[10px] text-slate-400">{(txn.date ? parseTxnDate(txn.date) : new Date(txn.createdAt?.seconds * 1000)).toLocaleDateString('pt-BR')}</span>
                                                    {txn.category && <span className="text-[10px] bg-slate-200 text-slate-600 px-1 rounded uppercase">{txn.category}</span>}
                                                    {txn.userName && <span className="text-[10px] text-indigo-500 flex items-center gap-0.5"><User size={9}/>{txn.userName}</span>}
                                                    {txn.reconciled && <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded font-bold">Conciliada</span>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <span className="text-sm font-bold text-red-600">-{formatCurrency(txn.amount)}</span>
                                                <button onClick={() => openEditTxn(txn)} className="text-slate-300 hover:text-indigo-500 transition-colors p-0.5" title="Editar transação"><Edit2 size={13}/></button>
                                                <button onClick={() => handleDeleteTransaction(txn)} className="text-slate-300 hover:text-red-500 transition-colors p-0.5" title="Excluir transação"><Trash2 size={13}/></button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                    <Landmark size={48} className="mb-4 opacity-20"/>
                    <p>Selecione uma conta ao lado para ver o extrato.</p>
                </div>
            )}
        </div>

        {/* MODAL: EDITAR TRANSAÇÃO */}
        {editTxnModal && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                    <div className="flex justify-between items-center p-4 border-b bg-slate-50">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <Edit2 size={17} className="text-indigo-600"/> Editar Transação
                        </h2>
                        <button onClick={() => setEditTxnModal(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                    </div>

                    <div className="p-4 space-y-3">
                        {/* Tipo */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Tipo</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setEditTxnModal(p => ({ ...p, form: { ...p.form, type: 'IN' } }))}
                                    className={`flex-1 py-2 rounded font-bold text-sm border transition-colors ${editTxnModal.form.type === 'IN' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-400'}`}
                                >
                                    Entrada (+)
                                </button>
                                <button
                                    onClick={() => setEditTxnModal(p => ({ ...p, form: { ...p.form, type: 'OUT' } }))}
                                    className={`flex-1 py-2 rounded font-bold text-sm border transition-colors ${editTxnModal.form.type === 'OUT' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-500 border-slate-200 hover:border-red-400'}`}
                                >
                                    Saída (-)
                                </button>
                            </div>
                        </div>

                        {/* Descrição */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Descrição</label>
                            <input
                                className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={editTxnModal.form.description}
                                onChange={e => setEditTxnModal(p => ({ ...p, form: { ...p.form, description: e.target.value } }))}
                            />
                        </div>

                        {/* Valor + Data lado a lado */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Valor (R$)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-full border rounded p-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editTxnModal.form.amount}
                                    onChange={e => setEditTxnModal(p => ({ ...p, form: { ...p.form, amount: e.target.value } }))}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Data</label>
                                <input
                                    type="date"
                                    className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editTxnModal.form.date}
                                    onChange={e => setEditTxnModal(p => ({ ...p, form: { ...p.form, date: e.target.value } }))}
                                />
                            </div>
                        </div>

                        {/* Categoria */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Categoria</label>
                            <input
                                className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={editTxnModal.form.category}
                                onChange={e => setEditTxnModal(p => ({ ...p, form: { ...p.form, category: e.target.value } }))}
                                placeholder="Ex: Salário, Aluguel..."
                            />
                        </div>

                        {/* Aviso de ajuste de saldo */}
                        {(() => {
                            const oldEffect = editTxnModal.txn.type === 'IN' ? editTxnModal.txn.amount : -editTxnModal.txn.amount;
                            const newAmt = parseFloat(String(editTxnModal.form.amount).replace(',', '.')) || 0;
                            const newEffect = editTxnModal.form.type === 'IN' ? newAmt : -newAmt;
                            const delta = newEffect - oldEffect;
                            if (delta === 0) return null;
                            return (
                                <p className={`text-xs rounded p-2 ${delta > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                    Saldo da conta será ajustado em <strong>{delta > 0 ? '+' : ''}{formatCurrency(delta)}</strong>
                                </p>
                            );
                        })()}
                    </div>

                    <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
                        <button onClick={() => setEditTxnModal(null)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded text-sm">Cancelar</button>
                        <button onClick={handleSaveEditedTxn} className="px-6 py-2 bg-indigo-600 text-white rounded font-bold text-sm hover:bg-indigo-700">
                            Salvar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAIS (NOVA CONTA, ROTEAMENTO E TRANSFERÊNCIA) */}
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

        {isAdjustModalOpen && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div className="flex justify-between items-center p-4 border-b bg-slate-50">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <SlidersHorizontal size={18} className="text-amber-600"/> Reajuste de Saldo
                        </h2>
                        <button onClick={() => setIsAdjustModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                    </div>

                    <div className="p-4 space-y-4">
                        <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded p-2">
                            Corrige o saldo da conta diretamente, sem gerar transferência nem lançamento no extrato. Use apenas para ajustes pontuais (ex: divergência de saldo inicial).
                        </p>

                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Conta</label>
                            <select
                                className="w-full border p-2 rounded text-sm mt-1 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                                value={adjustData.accountId}
                                onChange={e => setAdjustData({...adjustData, accountId: e.target.value})}
                            >
                                <option value="">-- Selecione --</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} (Saldo Atual: {formatCurrency(acc.currentBalance)})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Novo Saldo Correto (R$)</label>
                            <input
                                type="number" step="0.01"
                                className="w-full border p-2 rounded text-sm mt-1 focus:ring-2 focus:ring-amber-500 outline-none"
                                placeholder="0.00"
                                value={adjustData.newBalance}
                                onChange={e => setAdjustData({...adjustData, newBalance: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
                        <button onClick={() => setIsAdjustModalOpen(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded text-sm">Cancelar</button>
                        <button
                            onClick={handleAdjustBalance}
                            disabled={isProcessingAdjust}
                            className={`px-6 py-2 text-white rounded font-bold text-sm flex items-center gap-2 ${isProcessingAdjust ? 'bg-slate-400 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-700'}`}
                        >
                            <SlidersHorizontal size={16}/> {isProcessingAdjust ? 'Salvando...' : 'Confirmar Reajuste'}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default BankAccountsManager;
