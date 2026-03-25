import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle, AlertTriangle, Calendar as CalendarIcon, 
  DollarSign, Lock, Save, X,
  TrendingUp, TrendingDown, Clock, AlertCircle, ChevronLeft, ChevronRight,
  Landmark, ArrowUpRight, ArrowDownRight, Wallet, Info
} from 'lucide-react';
import { useTenant } from './contexts/TenantContext';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val) || 0);

const safeGetDate = (dateVal) => {
    if (!dateVal) return null;
    try {
        if (dateVal.seconds) return new Date(dateVal.seconds * 1000).toISOString().split('T')[0];
        if (typeof dateVal === 'string') return dateVal.split('T')[0];
        if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0];
        return null;
    } catch (e) { return null; }
};

const CashClosingManager = ({ showNotification }) => {
  const { tenantDB, currentUser } = useTenant();
  
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [closings, setClosings] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankTxns, setBankTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedPeriodClosing, setSelectedPeriodClosing] = useState(null);
  const [actualCashInput, setActualCashInput] = useState('');
  const [observationInput, setObservationInput] = useState('');
  const [modalTab, setModalTab] = useState('gaveta'); 
  
  const [checkedTxns, setCheckedTxns] = useState(new Set());
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (!tenantDB) return;
    setLoading(true);

    const unsubSales = tenantDB.firestore.subscribe('sales', setSales);
    const unsubExpenses = tenantDB.firestore.subscribe('financial_movements', setExpenses);
    const unsubAccs = tenantDB.firestore.subscribe('bank_accounts', setBankAccounts);
    const unsubTxns = tenantDB.firestore.subscribe('account_transactions', setBankTxns);
    
    const unsubClosings = tenantDB.firestore.subscribe('cash_closings', (data) => {
        setClosings(data);
        setLoading(false);
    });

    return () => { unsubSales(); unsubExpenses(); unsubClosings(); unsubAccs(); unsubTxns(); };
  }, [tenantDB, currentDate]);

  const calendarGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay(); 
    const today = new Date(); today.setHours(0,0,0,0);
    const grid = [];

    for (let i = 0; i < firstDayOfWeek; i++) grid.push({ type: 'padding', id: `pad-${i}` });

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dayOfWeek = dateObj.getDay(); 
        const dateStr = dateObj.toISOString().split('T')[0];

        if (dateObj > today) {
            grid.push({ type: 'day', id: dateStr, day, dateStr, status: 'FUTURE', isWeekend: (dayOfWeek === 0 || dayOfWeek === 6) });
            continue;
        }

        let belongsToPeriodId = dateStr;
        let periodDatesIncluded = [dateStr];
        let isGroupedDay = false;

        if (dayOfWeek === 6) {
            const mon = new Date(dateObj); mon.setDate(dateObj.getDate() + 2);
            const sun = new Date(dateObj); sun.setDate(dateObj.getDate() + 1);
            belongsToPeriodId = mon.toISOString().split('T')[0];
            isGroupedDay = true;
            // Inclui sáb + dom + seg para a verificação de transações pendentes
            periodDatesIncluded = [dateStr, sun.toISOString().split('T')[0], belongsToPeriodId];
        } else if (dayOfWeek === 0) {
            const mon = new Date(dateObj); mon.setDate(dateObj.getDate() + 1);
            const sat = new Date(dateObj); sat.setDate(dateObj.getDate() - 1);
            belongsToPeriodId = mon.toISOString().split('T')[0];
            isGroupedDay = true;
            // Inclui sáb + dom + seg para a verificação de transações pendentes
            periodDatesIncluded = [sat.toISOString().split('T')[0], dateStr, belongsToPeriodId];
        } else if (dayOfWeek === 1) {
            const sat = new Date(dateObj); sat.setDate(dateObj.getDate() - 2);
            const sun = new Date(dateObj); sun.setDate(dateObj.getDate() - 1);
            if (sat.getMonth() === month) periodDatesIncluded = [sat.toISOString().split('T')[0], sun.toISOString().split('T')[0], dateStr];
        }

        const existingClosing = closings.find(c => c.periodId === belongsToPeriodId);
        
        // INTELIGÊNCIA EXTRA: Verifica dinamicamente se surgiram novas transações não checadas
        let hasMissingChecks = false;
        if (existingClosing) {
            const periodExpenses = expenses.filter(e => periodDatesIncluded.includes(safeGetDate(e.date) || safeGetDate(e.createdAt)) && e.status === 'PAGO');
            const periodTxns = bankTxns.filter(t => periodDatesIncluded.includes(safeGetDate(t.date) || safeGetDate(t.createdAt)));
            
            const auditableExpenses = periodExpenses.filter(e => e.accountId === '' || !e.accountId);
            const auditableTxnIds = [...auditableExpenses.map(e => e.id), ...periodTxns.map(t => t.id)];
            
            const acknowledgedTxns = new Set(existingClosing.acknowledgedTxns || []);
            hasMissingChecks = auditableTxnIds.some(id => !acknowledgedTxns.has(id));
        }

        let visualStatus = 'OPEN';
        if (existingClosing) {
            if (existingClosing.status === 'INFERIOR_PENDENTE') {
                visualStatus = 'PENDING_RED'; // Faltou dinheiro (Soberano)
            } else if (existingClosing.status === 'PENDENTE_CONCILIACAO' || hasMissingChecks) {
                visualStatus = 'PENDING_YELLOW'; // Faltou marcar checkbox
            } else {
                visualStatus = 'OK'; // Tudo perfeito
            }
        }

        grid.push({ 
            type: 'day', id: dateStr, day, dateStr, periodId: belongsToPeriodId, datesIncluded: periodDatesIncluded,
            status: visualStatus, isWeekend: (dayOfWeek === 0 || dayOfWeek === 6), isGroupedDay, closingData: existingClosing || null
        });
    }
    return grid;
  }, [currentDate, closings, expenses, bankTxns]); // Agora o calendário reage a novas despesas e transações!

  const selectedPeriodData = useMemo(() => {
      if (!selectedPeriodClosing) return null;
      const { datesIncluded } = selectedPeriodClosing;

      const periodSales = sales.filter(s => datesIncluded.includes(safeGetDate(s.date) || safeGetDate(s.createdAt)));
      const periodExpenses = expenses.filter(e => datesIncluded.includes(safeGetDate(e.date) || safeGetDate(e.createdAt)) && e.status === 'PAGO');

      const salesDinheiro = periodSales.reduce((acc, curr) => acc + (curr.paymentMethod === 'DINHEIRO' ? (Number(curr.total) || 0) : 0), 0);
      const salesOutros = periodSales.reduce((acc, curr) => acc + (curr.paymentMethod !== 'DINHEIRO' ? (Number(curr.total) || 0) : 0), 0);
      const expensesGaveta = periodExpenses.filter(e => e.accountId === '' || !e.accountId).reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      
      const expectedCash = salesDinheiro - expensesGaveta;

      const periodTxns = bankTxns.filter(t => datesIncluded.includes(safeGetDate(t.date) || safeGetDate(t.createdAt)));
      const groupedBanks = {};

      periodTxns.forEach(t => {
          if (!groupedBanks[t.accountId]) {
              const accInfo = bankAccounts.find(a => a.id === t.accountId);
              groupedBanks[t.accountId] = { name: accInfo ? accInfo.name : 'Conta Não Identificada', in: [], out: [], totalIn: 0, totalOut: 0 };
          }
          if (t.type === 'IN') { groupedBanks[t.accountId].in.push(t); groupedBanks[t.accountId].totalIn += Number(t.amount); } 
          else { groupedBanks[t.accountId].out.push(t); groupedBanks[t.accountId].totalOut += Number(t.amount); }
      });

      const auditableExpenses = periodExpenses.filter(e => e.accountId === '' || !e.accountId);
      const auditableTxnIds = [...auditableExpenses.map(e => e.id), ...periodTxns.map(t => t.id)];

      return {
          salesDinheiro, salesOutros, expensesGaveta, expectedCash,
          banks: Object.values(groupedBanks), auditableExpenses, auditableTxnIds,
          details: { sales: periodSales, expenses: periodExpenses }
      };

  }, [selectedPeriodClosing, sales, expenses, bankTxns, bankAccounts]);

  const pendingAlerts = useMemo(() => {
    const pendings = closings.filter(c => c.status === 'INFERIOR_PENDENTE' || c.status === 'PENDENTE_CONCILIACAO');
    if (pendings.length === 0) return null;
    
    const monthsSet = new Set();
    let qteVermelho = 0;
    let qteAmarelo = 0;

    pendings.forEach(p => {
        if (p.status === 'INFERIOR_PENDENTE') qteVermelho++;
        if (p.status === 'PENDENTE_CONCILIACAO') qteAmarelo++;
        const d = new Date(p.periodId);
        const monthName = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][d.getMonth()];
        monthsSet.add(`${monthName}/${d.getFullYear()}`);
    });

    return { 
        total: pendings.length, 
        qteVermelho, qteAmarelo, 
        monthsList: Array.from(monthsSet).join(', ') 
    };
  }, [closings]);

  const handleSelectDay = (dayInfo) => {
      if (dayInfo.status === 'FUTURE' || dayInfo.type === 'padding') return;
      setSelectedPeriodClosing(dayInfo);
      setActualCashInput(dayInfo.closingData?.actualCash ? String(dayInfo.closingData.actualCash).replace('.', ',') : '');
      setObservationInput(dayInfo.closingData?.observation || '');
      setModalTab('gaveta');
      
      setCheckedTxns(new Set(dayInfo.closingData?.acknowledgedTxns || []));
  };

  const toggleCheckbox = (id) => {
      const newSet = new Set(checkedTxns);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      setCheckedTxns(newSet);
  };

  const handleSelectAll = (ids, select) => {
      const newSet = new Set(checkedTxns);
      ids.forEach(id => select ? newSet.add(id) : newSet.delete(id));
      setCheckedTxns(newSet);
  };

  const handleSaveClosing = async () => {
      if (!actualCashInput && actualCashInput !== '0') return showNotification('Informe o valor real em caixa.', 'error');
      
      const actualVal = Number(actualCashInput.replace(',', '.'));
      if (isNaN(actualVal)) return showNotification('Valor inválido.', 'error');

      const expectedVal = selectedPeriodData.expectedCash;
      const diff = actualVal - expectedVal;
      const obs = observationInput.trim();

      // MÁGICA RECUPERADA: Verifica as transações não marcadas!
      const missingChecks = selectedPeriodData.auditableTxnIds.some(id => !checkedTxns.has(id));

      let finalStatus = 'OK';
      
      if (diff > 0.05) { 
          if (!obs) return showNotification('LUCRO SUPERIOR: Para sobras no caixa, é obrigatório inserir uma justificativa.', 'error');
          finalStatus = missingChecks ? 'PENDENTE_CONCILIACAO' : 'SUPERIOR_OK';
          showNotification(missingChecks ? 'Sobra justificada, mas há transações não reconhecidas (Amarelo).' : 'Caixa fechado com sobra justificada!', missingChecks ? 'warning' : 'success');
      } else if (diff < -0.05) { 
          finalStatus = 'INFERIOR_PENDENTE';
          showNotification('LUCRO INFERIOR: Quebra de caixa detectada! O dia ficará travado em Vermelho.', 'error');
      } else {
          finalStatus = missingChecks ? 'PENDENTE_CONCILIACAO' : 'OK';
          showNotification(missingChecks ? 'Valores batem, mas há transações não reconhecidas (Amarelo).' : 'Caixa batido e conciliado perfeitamente!', missingChecks ? 'warning' : 'success');
      }

      try {
          const payload = {
              periodId: selectedPeriodClosing.periodId, expectedCash: expectedVal, actualCash: actualVal,
              difference: diff, status: finalStatus, observation: obs,
              acknowledgedTxns: Array.from(checkedTxns), 
              closedBy: currentUser?.name || 'Operador', closedAt: new Date().toISOString()
          };
          if (selectedPeriodClosing.closingData) await tenantDB.firestore.update('cash_closings', selectedPeriodClosing.closingData.id, payload);
          else await tenantDB.firestore.add('cash_closings', payload);
          setSelectedPeriodClosing(null);
      } catch (e) { showNotification('Erro ao registrar fechamento.', 'error'); }
  };

  const handlePrevMonth = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  if (loading) return <div className="p-10 flex flex-col items-center text-slate-400"><Clock className="animate-spin mb-2" /> Sincronizando dados bancários...</div>;
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
        
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
            <div className='flex items-center gap-3'>
                <div className={`p-2.5 rounded-lg ${pendingAlerts ? (pendingAlerts.qteVermelho > 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600') : 'bg-slate-50 text-slate-800'}`}>
                    {pendingAlerts ? <AlertCircle size={20}/> : <Lock size={20}/>}
                </div>
                <div>
                    <h2 className="font-bold text-lg text-slate-800 leading-tight">Fechamento e Conciliação</h2>
                    {pendingAlerts && (
                        <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${pendingAlerts.qteVermelho > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                            {pendingAlerts.qteVermelho} Quebras (Vermelho) e {pendingAlerts.qteAmarelo} Não Reconhecidos (Amarelo) em: {pendingAlerts.monthsList}
                        </p>
                    )}
                </div>
            </div>
            
            <div className="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-200">
                <button onClick={handlePrevMonth} className="p-1.5 rounded hover:bg-white text-slate-400 hover:text-slate-800"><ChevronLeft size={16}/></button>
                <div className="text-center px-4 min-w-[120px]">
                    <p className="text-sm font-bold text-slate-800 capitalize">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</p>
                </div>
                <button onClick={handleNextMonth} className="p-1.5 rounded hover:bg-white text-slate-400 hover:text-slate-800"><ChevronRight size={16}/></button>
            </div>
        </div>

        <div className="bg-white p-5 rounded-xl border shadow-sm">
            <div className="grid grid-cols-7 gap-2 mb-2 text-center">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, i) => (
                    <div key={day} className={`text-[10px] font-bold uppercase ${i === 0 || i === 6 ? 'text-red-400' : 'text-slate-400'}`}>{day}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
                {calendarGrid.map((item) => {
                    if (item.type === 'padding') return <div key={item.id} className="aspect-square"></div>;

                    let statusClasses = "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed";
                    let badge = null;

                    if (item.status === 'OPEN') {
                        statusClasses = "bg-white text-slate-700 border-slate-200 hover:border-indigo-400 cursor-pointer shadow-sm";
                        badge = <Clock size={12} className="text-slate-300"/>;
                    } else if (item.status === 'OK') {
                        statusClasses = "bg-emerald-50 text-emerald-800 border-emerald-200 cursor-pointer";
                        badge = <CheckCircle size={12} className="text-emerald-500"/>;
                    } else if (item.status === 'PENDING_RED') {
                        statusClasses = "bg-red-50 text-red-800 border-red-200 cursor-pointer animate-pulse-slow";
                        badge = <AlertTriangle size={12} className="text-red-500"/>;
                    } else if (item.status === 'PENDING_YELLOW') {
                        statusClasses = "bg-amber-50 text-amber-900 border-amber-200 cursor-pointer shadow-sm";
                        badge = <AlertTriangle size={12} className="text-amber-500"/>;
                    }

                    return (
                        <div key={item.id} onClick={() => handleSelectDay(item)} className={`relative aspect-square rounded-lg border p-2 flex flex-col justify-between transition-all ${statusClasses}`}>
                            <div className="flex justify-between items-start">
                                <span className="font-bold text-lg leading-none">{item.day}</span>
                                {badge}
                            </div>
                            
                            {item.isGroupedDay && item.status !== 'FUTURE' && (
                                <span className="text-[8px] bg-slate-900/5 text-slate-500 px-1 py-0.5 rounded font-bold uppercase w-full text-center mt-1">Fim de Sem.</span>
                            )}

                            {item.closingData && item.status !== 'FUTURE' && (
                                <span className={`text-[9px] font-bold mt-auto ${item.closingData.difference > 0 ? 'text-blue-600' : item.closingData.difference < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {item.closingData.difference !== 0 ? (item.closingData.difference > 0 ? '+' : '-') : ''}{formatCurrency(Math.abs(item.closingData.difference))}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

        {selectedPeriodClosing && selectedPeriodData && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
                    
                    <div className="p-4 border-b flex justify-between items-center bg-white shrink-0">
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                <CalendarIcon size={18} className="text-indigo-600"/> 
                                {selectedPeriodClosing.isGroupedDay ? `Fechamento (Sáb - Seg)` : `Fechamento Diário`}
                            </h3>
                            <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">
                                Ref: {selectedPeriodClosing.datesIncluded.map(d => safeGetDate(d).split('-').reverse().join('/')).join(' a ')}
                            </p>
                        </div>
                        <button onClick={() => setSelectedPeriodClosing(null)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-lg transition-colors"><X size={20}/></button>
                    </div>

                    <div className="flex px-4 pt-2 border-b bg-slate-50 shrink-0 gap-4">
                        <button onClick={() => setModalTab('gaveta')} className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 px-2 transition-colors ${modalTab === 'gaveta' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                            <Wallet size={16}/> Gaveta (Dinheiro)
                        </button>
                        <button onClick={() => setModalTab('banco')} className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 px-2 transition-colors ${modalTab === 'banco' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                            <Landmark size={16}/> Extrato de Contas
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-5 custom-scrollbar">
                        
                        {modalTab === 'gaveta' && (
                            <div className="space-y-6 animate-in fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="bg-white p-5 rounded-xl border shadow-sm border-slate-200 flex flex-col justify-between">
                                        <div>
                                            <div className='flex justify-between items-center mb-1'>
                                                <span className="text-[10px] text-slate-400 uppercase font-bold">Saldo Esperado (Físico)</span>
                                                <Info size={14} className="text-slate-300"/>
                                            </div>
                                            <p className="text-3xl font-extrabold text-slate-800">{formatCurrency(selectedPeriodData.expectedCash)}</p>
                                        </div>
                                        <div className="mt-4 space-y-2 pt-4 border-t border-slate-100 text-sm">
                                            <div className="flex justify-between text-emerald-700"><span className="flex items-center gap-1.5 font-bold"><TrendingUp size={14}/> Entradas</span> <span>{formatCurrency(selectedPeriodData.salesDinheiro)}</span></div>
                                            <div className="flex justify-between text-red-600"><span className="flex items-center gap-1.5 font-bold"><TrendingDown size={14}/> Saídas Físicas</span> <span>-{formatCurrency(selectedPeriodData.expensesGaveta)}</span></div>
                                            <div className="flex justify-between text-slate-400 text-xs pt-1"><span className="italic">Vendas Cartão/Pix (Ignoradas)</span> <span>{formatCurrency(selectedPeriodData.salesOutros)}</span></div>
                                        </div>
                                    </div>

                                    <div className="bg-white p-5 rounded-xl border shadow-sm border-indigo-100 flex flex-col">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><DollarSign size={12}/> Dinheiro Contado</label>
                                        <input 
                                            type="text" placeholder="0,00"
                                            className="w-full border rounded-lg p-3 text-2xl font-bold text-slate-800 outline-none focus:border-indigo-500 bg-slate-50 mb-4"
                                            value={actualCashInput}
                                            onChange={(e) => setActualCashInput(e.target.value.replace(/[^0-9,]/g, ''))}
                                        />
                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-2">Justificativa (Sobras/Faltas)</label>
                                        <textarea 
                                            className="w-full border rounded-lg p-3 text-sm outline-none focus:border-indigo-500 resize-none flex-1 bg-slate-50"
                                            placeholder="Detalhes..." value={observationInput} onChange={(e) => setObservationInput(e.target.value)}
                                        />
                                    </div>
                                </div>
                                
                                {selectedPeriodData.auditableExpenses.length > 0 && (
                                    <div className="bg-white border rounded-xl overflow-hidden shadow-sm mt-4">
                                        <div className="bg-slate-100 p-3 px-4 flex justify-between items-center border-b">
                                            <h4 className="font-bold text-slate-800 text-xs uppercase">Saídas na Gaveta (Reconhecimento)</h4>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleSelectAll(selectedPeriodData.auditableExpenses.map(e=>e.id), true)} className="text-[10px] bg-white border px-2 py-1 rounded text-slate-600 hover:bg-slate-50 font-bold">Marcar Todos</button>
                                                <button onClick={() => handleSelectAll(selectedPeriodData.auditableExpenses.map(e=>e.id), false)} className="text-[10px] bg-white border px-2 py-1 rounded text-slate-600 hover:bg-slate-50 font-bold">Desmarcar</button>
                                            </div>
                                        </div>
                                        <table className="w-full text-left text-xs">
                                            <tbody className="divide-y divide-slate-50">
                                                {selectedPeriodData.auditableExpenses.map(exp => (
                                                    <tr key={exp.id} className={`hover:bg-slate-50 transition-colors cursor-pointer ${checkedTxns.has(exp.id) ? 'bg-emerald-50/30' : ''}`} onClick={() => toggleCheckbox(exp.id)}>
                                                        <td className="p-3 w-8 text-center">
                                                            <input type="checkbox" checked={checkedTxns.has(exp.id)} readOnly className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                                                        </td>
                                                        <td className="p-3">
                                                            <p className="font-bold text-slate-700">{exp.description}</p>
                                                            <p className="text-[9px] text-slate-400 uppercase mt-0.5">{exp.category} • {safeGetDate(exp.date).split('-').reverse().join('/')}</p>
                                                        </td>
                                                        <td className="p-3 text-right font-bold text-red-500">
                                                            -{formatCurrency(exp.amount)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {modalTab === 'banco' && (
                            <div className="space-y-4 animate-in fade-in">
                                {selectedPeriodData.banks.length === 0 ? (
                                    <div className="text-center p-8 text-slate-400 border border-dashed rounded-xl bg-white">Nenhuma movimentação bancária registrada neste período.</div>
                                ) : (
                                    selectedPeriodData.banks.map((bank, idx) => {
                                        const allBankTxnIds = [...bank.in, ...bank.out].map(t => t.id);
                                        return (
                                            <div key={idx} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                                                <div className="bg-slate-100 p-3 px-4 flex justify-between items-center border-b">
                                                    <h4 className="font-bold text-slate-800 flex items-center gap-2"><Landmark size={14}/> {bank.name}</h4>
                                                    <div className="flex gap-3 items-center">
                                                        <div className="flex gap-3 text-xs font-bold mr-4">
                                                            <span className="text-emerald-600">IN: {formatCurrency(bank.totalIn)}</span>
                                                            <span className="text-red-500">OUT: {formatCurrency(bank.totalOut)}</span>
                                                        </div>
                                                        <button onClick={() => handleSelectAll(allBankTxnIds, true)} className="text-[10px] bg-white border px-2 py-1 rounded text-slate-600 hover:bg-slate-50 font-bold">Marcar Todos</button>
                                                        <button onClick={() => handleSelectAll(allBankTxnIds, false)} className="text-[10px] bg-white border px-2 py-1 rounded text-slate-600 hover:bg-slate-50 font-bold">Desmarcar</button>
                                                    </div>
                                                </div>
                                                <div className="p-0">
                                                    <table className="w-full text-left text-xs">
                                                        <tbody className="divide-y divide-slate-50">
                                                            {[...bank.in, ...bank.out].sort((a,b) => new Date(a.date) - new Date(b.date)).map((txn, i) => (
                                                                <tr key={txn.id} className={`hover:bg-slate-50 transition-colors cursor-pointer ${checkedTxns.has(txn.id) ? 'bg-emerald-50/30' : ''}`} onClick={() => toggleCheckbox(txn.id)}>
                                                                    <td className="p-3 w-8 text-center">
                                                                        <input type="checkbox" checked={checkedTxns.has(txn.id)} readOnly className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                                                                    </td>
                                                                    <td className="p-3 w-8 text-center">
                                                                        {txn.type === 'IN' ? <ArrowDownRight size={14} className="text-emerald-500 mx-auto"/> : <ArrowUpRight size={14} className="text-red-400 mx-auto"/>}
                                                                    </td>
                                                                    <td className="p-3">
                                                                        <p className="font-bold text-slate-700">{txn.description}</p>
                                                                        <p className="text-[9px] text-slate-400 uppercase mt-0.5">{txn.category} • {safeGetDate(txn.date).split('-').reverse().join('/')}</p>
                                                                    </td>
                                                                    <td className={`p-3 text-right font-bold ${txn.type === 'IN' ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                        {txn.type === 'IN' ? '+' : '-'}{formatCurrency(txn.amount)}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-white border-t flex justify-end gap-3 shrink-0">
                        <button onClick={() => setSelectedPeriodClosing(null)} className="px-5 py-2.5 rounded-lg text-slate-500 font-bold hover:bg-slate-100 text-sm">Cancelar</button>
                        <button 
                            onClick={handleSaveClosing} 
                            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 flex items-center gap-2 transition-transform active:scale-95"
                        >
                            <Save size={16}/> Confirmar Fechamento
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default CashClosingManager;
