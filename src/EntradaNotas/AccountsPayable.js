import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, Search, CheckCircle, Eye, X, Package, 
  ChevronLeft, ChevronRight, CalendarDays, RefreshCw
} from 'lucide-react';
import { collection, query, orderBy, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase'; 

// Utilitários de formatação
const formatCurrency = (val) => {
    const numberVal = Number(val);
    if (isNaN(numberVal)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numberVal);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  // Tenta tratar ISO date ou YYYY-MM-DD
  try {
      if(dateStr.includes('T')) dateStr = dateStr.split('T')[0];
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
  } catch (e) { return dateStr; }
};

const AccountsPayable = ({ products, storeConfig }) => { // Aceita storeConfig para garantir o ID
  // Estados de Dados (Separados para evitar conflitos)
  const [rawInvoices, setRawInvoices] = useState([]);
  const [rawExpenses, setRawExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- ESTADO DE DATA ---
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false); 
  
  // Filtros
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal Detalhes
  const [detailsModal, setDetailsModal] = useState(null);

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  // Computa a string "YYYY-MM" para filtragem
  const selectedMonthStr = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }, [currentDate]);

  // Controles de Navegação de Data
  const handlePrevMonth = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  
  const handleYearChange = (e) => {
    const newYear = parseInt(e.target.value, 10);
    setCurrentDate(prev => new Date(newYear, prev.getMonth(), 1));
  };

  const handleSelectMonthSpecific = (monthIndex) => {
    setCurrentDate(prev => new Date(prev.getFullYear(), monthIndex, 1));
    setShowMonthPicker(false);
  };

  // Extração de Categorias
  const categories = useMemo(() => {
    const cats = new Set((products || []).map(p => p.category).filter(Boolean));
    return ['ALL', ...Array.from(cats)];
  }, [products]);

  // --- BUSCA DE DADOS EM TEMPO REAL (BLINDADA) ---
  useEffect(() => {
    // CORREÇÃO CRÍTICA: Forçamos String() no ID da loja.
    // Se o ID for numérico (ex: 10), o Firebase trava sem essa conversão.
    const rawId = storeConfig?.id || (typeof window !== 'undefined' ? window.__app_id : null);
    const appId = rawId ? String(rawId) : null;
    
    if (!appId) {
        console.warn("AccountsPayable: Loja não identificada. Aguardando...");
        return;
    }

    setLoading(true);

    // 1. Listener de Notas Fiscais (Invoices)
    const qInvoices = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'invoices'), 
        orderBy('createdAt', 'desc')
    );
    
    const unsubInvoices = onSnapshot(qInvoices, (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, source: 'invoice', ...d.data() }));
        setRawInvoices(data);
        setLoading(false);
    }, (error) => {
        console.error("Erro ao sincronizar Invoices:", error);
        setLoading(false);
    });

    // 2. Listener de Movimentos Financeiros (Expenses)
    const qExpenses = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'financial_movements'), 
        where('type', '==', 'EXPENSE')
    );

    const unsubExpenses = onSnapshot(qExpenses, (snap) => {
        const data = snap.docs.map(d => {
            const item = d.data();
            
            // Status Automático
            let computedStatus = item.status || 'PENDENTE';
            if (!item.status) {
                 const today = new Date().toISOString().split('T')[0];
                 if (item.date < today) computedStatus = 'ATRASADO';
            }

            return {
                id: d.id,
                source: 'expense',
                header: {
                    number: 'DESP',
                    entityName: (item.category || 'Geral') + ' - ' + (item.description || 'Sem Descrição'),
                    issueDate: item.createdAt?.toDate ? item.createdAt.toDate().toISOString() : item.date,
                    total: Number(item.amount) || 0
                },
                items: [],
                financials: [{
                    number: '1',
                    dueDate: item.date,
                    value: Number(item.amount) || 0,
                    status: computedStatus
                }],
                category: item.category
            };
        });
        setRawExpenses(data);
    }, (error) => {
        console.error("Erro ao sincronizar Expenses:", error);
    });

    return () => {
        unsubInvoices();
        unsubExpenses();
    };
  }, [storeConfig]);

  // --- PROCESSAMENTO E UNIFICAÇÃO ---
  const payableItems = useMemo(() => {
    // Combina as duas fontes
    const allRecords = [...rawInvoices, ...rawExpenses];
    let items = [];
    
    allRecords.forEach(inv => {
      // Filtro de Categoria (Apenas para notas com produtos categorizados ou despesas categorizadas)
      if (selectedCategory !== 'ALL') {
          if (inv.source === 'invoice') {
             const hasCategory = inv.items.some(i => {
                const prod = (products || []).find(p => p.id === i.productId);
                return prod && prod.category === selectedCategory;
             });
             if (!hasCategory) return;
          } else {
             // Para despesa manual, verifica a categoria direta
             if (inv.category !== selectedCategory) return;
          }
      }

      if (!inv.financials || inv.financials.length === 0) return;

      inv.financials.forEach(inst => {
        if (!inst.dueDate) return;

        // Filtro de Mês (Essencial)
        if (!inst.dueDate.startsWith(selectedMonthStr)) return;
        
        // Filtro de Texto
        const searchLower = searchTerm.toLowerCase();
        if (searchTerm && 
            !inv.header.entityName.toLowerCase().includes(searchLower) && 
            !String(inv.header.number).toLowerCase().includes(searchLower)) {
            return;
        }

        const safeValue = Number(inst.value) || 0;

        items.push({
          uniqueId: `${inv.id}_${inst.number}`,
          invoiceId: inv.id,
          invoiceNumber: inv.header.number,
          supplier: inv.header.entityName,
          issueDate: inv.header.issueDate,
          fullInvoice: inv,
          installmentNum: inst.number,
          dueDate: inst.dueDate,
          value: safeValue,
          status: inst.status || 'PENDENTE',
          source: inv.source,
          daysToDue: Math.ceil((new Date(inst.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
        });
      });
    });

    // Ordenação Final em Memória
    return items.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [rawInvoices, rawExpenses, selectedMonthStr, selectedCategory, searchTerm, products]);

  // Totais
  const totalDueMonth = payableItems.reduce((acc, item) => acc + (item.status === 'PENDENTE' || item.status === 'ATRASADO' ? item.value : 0), 0);
  const totalPaidMonth = payableItems.reduce((acc, item) => acc + (item.status === 'PAGO' ? item.value : 0), 0);

  // Exibir apenas Pendentes/Atrasados na lista (Opcional: Pode querer ver pagos também)
  // Vou mostrar TUDO para garantir que nada suma, mas você pode descomentar o filtro abaixo
  const itemsToShow = payableItems; //.filter(item => item.status !== 'PAGO');

  // Dropdown Anos
  const years = Array.from({length: 6}, (_, i) => new Date().getFullYear() - 2 + i);

  // Click Outside
  const pickerRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setShowMonthPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      
      {/* 1. SELETOR DE DATA */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-full">
                  <CalendarDays size={20} />
              </div>
              <div>
                  <h3 className="text-sm font-bold text-slate-700">Período Financeiro</h3>
                  <p className="text-xs text-slate-500">Mês de Referência</p>
              </div>
          </div>

          <div className="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-200">
              <button onClick={handlePrevMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500 hover:text-indigo-600">
                  <ChevronLeft size={20} />
              </button>
              
              <div className="flex items-center px-4 gap-2 relative" ref={pickerRef}>
                  <div className="relative">
                      <button 
                        onClick={() => setShowMonthPicker(!showMonthPicker)}
                        className="text-lg font-bold text-slate-800 capitalize w-28 text-center hover:text-indigo-600 transition-colors flex justify-center items-center gap-1"
                      >
                          {monthNames[currentDate.getMonth()]}
                      </button>

                      {showMonthPicker && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 bg-white border border-slate-200 shadow-xl rounded-lg p-3 z-50 w-64 animate-in fade-in zoom-in-95 duration-200">
                            <div className="grid grid-cols-3 gap-2">
                                {monthNames.map((m, idx) => (
                                    <button
                                        key={m}
                                        onClick={() => handleSelectMonthSpecific(idx)}
                                        className={`p-2 text-xs font-bold rounded hover:bg-indigo-50 hover:text-indigo-600 transition-colors
                                            ${currentDate.getMonth() === idx ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm' : 'text-slate-600 bg-slate-50'}
                                        `}
                                    >
                                        {m.substring(0, 3)}
                                    </button>
                                ))}
                            </div>
                        </div>
                      )}
                  </div>

                  <select 
                    value={currentDate.getFullYear()} 
                    onChange={handleYearChange}
                    className="bg-transparent text-sm font-bold text-slate-500 cursor-pointer outline-none border-none hover:text-indigo-600"
                  >
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
              </div>

              <button onClick={handleNextMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500 hover:text-indigo-600">
                  <ChevronRight size={20} />
              </button>
          </div>
      </div>

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-xs text-slate-500 uppercase font-bold">A Pagar (Pendente)</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(totalDueMonth)}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded border border-emerald-100 shadow-sm flex flex-col justify-between">
          <p className="text-xs text-emerald-600 uppercase font-bold">Já Pago</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(totalPaidMonth)}</p>
        </div>
      </div>

      {/* 3. Filtros Secundários */}
      <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
         <div className="w-full md:w-auto flex-1">
            <label className="text-xs font-bold text-slate-500 block mb-1">Buscar</label>
            <div className="relative">
                <Search className="absolute left-2 top-2.5 text-slate-400" size={16}/>
                <input 
                  className="border p-2 pl-8 rounded text-sm w-full outline-none focus:ring-1 focus:ring-indigo-500" 
                  placeholder="Nome, número ou descrição..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
         </div>
         <div className="w-full md:w-auto">
            <label className="text-xs font-bold text-slate-500 block mb-1">Categoria</label>
            <select 
              className="border p-2 rounded text-sm w-full md:w-48 outline-none focus:ring-1 focus:ring-indigo-500"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
            >
                <option value="ALL">Todas</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
         </div>
      </div>

      {/* 4. Grid de Contas */}
      {loading ? (
        <div className="text-center py-10 text-slate-500 flex flex-col items-center gap-2">
            <RefreshCw className="animate-spin text-indigo-500" size={24}/>
            <p>Sincronizando contas...</p>
        </div>
      ) : itemsToShow.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded border border-dashed border-slate-300 text-slate-400">
           Nenhuma conta encontrada para <strong>{monthNames[currentDate.getMonth()]}</strong>.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {itemsToShow.map(item => {
                const isLate = item.daysToDue < 0 && item.status !== 'PAGO';
                const isNear = item.daysToDue >= 0 && item.daysToDue <= 5 && item.status !== 'PAGO';
                const isPaid = item.status === 'PAGO';
                
                return (
                    <div 
                      key={item.uniqueId} 
                      onClick={() => setDetailsModal(item.fullInvoice)}
                      className={`bg-white rounded-lg border shadow-sm p-4 cursor-pointer hover:shadow-md transition-all relative overflow-hidden group 
                        ${isPaid ? 'border-emerald-200 bg-emerald-50/30' : isLate ? 'border-red-200 bg-red-50' : isNear ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}
                      `}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h4 className="font-bold text-slate-800 text-sm truncate w-48" title={item.supplier}>{item.supplier}</h4>
                                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                                    {item.source === 'expense' ? <span className="bg-slate-200 px-1 rounded">DESPESA</span> : <span className="bg-indigo-100 text-indigo-700 px-1 rounded">NOTA</span>}
                                    <span>#{item.invoiceNumber}</span>
                                </div>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded border ${isPaid ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                {item.status}
                            </span>
                        </div>

                        <div className="flex items-end justify-between mt-4">
                            <div>
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Vencimento</p>
                                <div className="flex items-center gap-1 font-medium text-sm text-slate-700">
                                    <Calendar size={14}/> {formatDate(item.dueDate)}
                                </div>
                                {!isPaid && (
                                    <p className={`text-[10px] mt-1 font-bold ${isLate ? 'text-red-600' : isNear ? 'text-amber-600' : 'text-slate-400'}`}>
                                        {item.daysToDue < 0 ? `Atrasado ${Math.abs(item.daysToDue)} dias` : item.daysToDue === 0 ? 'Vence Hoje!' : `Faltam ${item.daysToDue} dias`}
                                    </p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Valor</p>
                                <p className="text-xl font-bold text-slate-800">{formatCurrency(item.value)}</p>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
      )}

      {/* Modal de Detalhes */}
      {detailsModal && (
         <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-2xl rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Package size={18} className="text-indigo-600"/> 
                        Detalhes: {detailsModal.header.entityName}
                    </h3>
                    <button onClick={() => setDetailsModal(null)} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-slate-50 p-3 rounded border">
                            <p className="text-xs text-slate-500 font-bold uppercase">Origem</p>
                            <p className="font-medium text-slate-800">{detailsModal.source === 'expense' ? 'Movimento Manual' : 'Nota Fiscal'}</p>
                            <p className="text-xs text-slate-500 mt-1">Data: {formatDate(detailsModal.header.issueDate)}</p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded border">
                            <p className="text-xs text-slate-500 font-bold uppercase">Valor Total</p>
                            <p className="font-bold text-lg text-emerald-700">{formatCurrency(detailsModal.header.total)}</p>
                        </div>
                    </div>

                    {detailsModal.items && detailsModal.items.length > 0 && (
                        <div>
                            <h4 className="font-bold text-sm text-slate-700 mb-2 border-b pb-1">Itens</h4>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-xs text-slate-500 uppercase">
                                    <tr><th className="p-2">Produto</th><th className="p-2 text-right">Qtd</th><th className="p-2 text-right">Total</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {detailsModal.items.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="p-2">{item.productName}</td>
                                            <td className="p-2 text-right">{item.quantity}</td>
                                            <td className="p-2 text-right">{formatCurrency(item.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div>
                        <h4 className="font-bold text-sm text-slate-700 mb-2 border-b pb-1">Financeiro</h4>
                         <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                             {detailsModal.financials.map((inst, idx) => (
                                 <div key={idx} className={`p-2 rounded border text-sm ${inst.status === 'PAGO' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                                     <div className="flex justify-between items-center">
                                         <span className="font-bold text-slate-600">{inst.number}ª Parcela</span>
                                         {inst.status === 'PAGO' && <CheckCircle size={12} className="text-emerald-500"/>}
                                     </div>
                                     <div className="text-slate-500 text-xs mt-1">Vence: {formatDate(inst.dueDate)}</div>
                                     <div className="font-bold text-slate-800">{formatCurrency(Number(inst.value))}</div>
                                 </div>
                             ))}
                         </div>
                    </div>
                </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default AccountsPayable;