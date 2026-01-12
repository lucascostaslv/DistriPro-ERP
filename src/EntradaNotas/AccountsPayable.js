import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, Search, CheckCircle, Eye, X, Package, 
  ChevronLeft, ChevronRight, CalendarDays
} from 'lucide-react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase'; 

// Utilitários de formatação
const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

const AccountsPayable = ({ products }) => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- ESTADO DE DATA ---
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false); // Novo estado para o popup de meses
  
  // Filtros
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal Detalhes
  const [detailsModal, setDetailsModal] = useState(null);

  // Lista de Meses
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
  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleYearChange = (e) => {
    const newYear = parseInt(e.target.value, 10);
    setCurrentDate(prev => new Date(newYear, prev.getMonth(), 1));
  };

  // Nova função: Selecionar mês direto no Grid
  const handleSelectMonthSpecific = (monthIndex) => {
    setCurrentDate(prev => new Date(prev.getFullYear(), monthIndex, 1));
    setShowMonthPicker(false);
  };

  // Categorias extraídas
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return ['ALL', ...Array.from(cats)];
  }, [products]);

  // Carregar Notas
  useEffect(() => {
    const fetchInvoices = async () => {
      setLoading(true);
      try {
        const appId = typeof window.__app_id !== 'undefined' ? String(window.__app_id) : 'default-app';
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'invoices'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setInvoices(data);
      } catch (error) {
        console.error("Erro ao buscar contas:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, []);

  // Processamento dos dados (Filtragem)
  const payableItems = useMemo(() => {
    let items = [];
    
    invoices.forEach(inv => {
      if (selectedCategory !== 'ALL') {
        const hasCategory = inv.items.some(i => {
            const prod = products.find(p => p.id === i.productId);
            return prod && prod.category === selectedCategory;
        });
        if (!hasCategory) return;
      }

      if (!inv.financials || inv.financials.length === 0) return;

      inv.financials.forEach(inst => {
        // Filtrar pelo Mês Selecionado
        if (!inst.dueDate.startsWith(selectedMonthStr)) return;
        
        const searchLower = searchTerm.toLowerCase();
        if (searchTerm && 
            !inv.header.entityName.toLowerCase().includes(searchLower) && 
            !inv.header.number.includes(searchLower)) {
            return;
        }

        items.push({
          uniqueId: `${inv.id}_${inst.number}`,
          invoiceId: inv.id,
          invoiceNumber: inv.header.number,
          supplier: inv.header.entityName,
          issueDate: inv.header.issueDate,
          fullInvoice: inv,
          installmentNum: inst.number,
          dueDate: inst.dueDate,
          value: inst.value,
          status: inst.status,
          daysToDue: Math.ceil((new Date(inst.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
        });
      });
    });

    return items.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [invoices, selectedMonthStr, selectedCategory, searchTerm, products]);

  const totalDueMonth = payableItems.reduce((acc, item) => acc + (item.status === 'PENDENTE' ? item.value : 0), 0);
  const totalPaidMonth = payableItems.reduce((acc, item) => acc + (item.status === 'PAGO' ? item.value : 0), 0);

  // Lista de Anos para o Dropdown (Atual +/- 5 anos)
  const years = Array.from({length: 11}, (_, i) => new Date().getFullYear() - 5 + i);

  // Fechar o picker se clicar fora (ref simples)
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
    <div className="space-y-6 animate-fade-in pb-10">
      
      {/* 1. SELETOR DE DATA ESTILIZADO */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-full">
                  <CalendarDays size={20} />
              </div>
              <div>
                  <h3 className="text-sm font-bold text-slate-700">Período Financeiro</h3>
                  <p className="text-xs text-slate-500">Selecione o mês de referência</p>
              </div>
          </div>

          <div className="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-200">
              {/* Botão Mês Anterior */}
              <button onClick={handlePrevMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500 hover:text-indigo-600">
                  <ChevronLeft size={20} />
              </button>
              
              <div className="flex items-center px-4 gap-2 relative" ref={pickerRef}>
                  
                  {/* Nome do Mês (Clicável para abrir Grid) */}
                  <div className="relative">
                      <button 
                        onClick={() => setShowMonthPicker(!showMonthPicker)}
                        className="text-lg font-bold text-slate-800 capitalize w-28 text-center hover:text-indigo-600 transition-colors flex justify-center items-center gap-1"
                      >
                          {monthNames[currentDate.getMonth()]}
                      </button>

                      {/* POPUP GRID DE MESES */}
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
                            {/* Setinha visual do popup */}
                            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-t border-l border-slate-200 transform rotate-45"></div>
                        </div>
                      )}
                  </div>

                  {/* Dropdown de Ano */}
                  <select 
                    value={currentDate.getFullYear()} 
                    onChange={handleYearChange}
                    className="bg-transparent text-sm font-bold text-slate-500 cursor-pointer outline-none border-none hover:text-indigo-600"
                  >
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
              </div>

              {/* Botão Próximo Mês */}
              <button onClick={handleNextMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500 hover:text-indigo-600">
                  <ChevronRight size={20} />
              </button>
          </div>
      </div>

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-xs text-slate-500 uppercase font-bold">A Pagar em {monthNames[currentDate.getMonth()]}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(totalDueMonth)}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded border border-emerald-100 shadow-sm flex flex-col justify-between">
          <p className="text-xs text-emerald-600 uppercase font-bold">Pago em {monthNames[currentDate.getMonth()]}</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(totalPaidMonth)}</p>
        </div>
      </div>

      {/* 3. Filtros Secundários */}
      <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
         <div className="w-full md:w-auto flex-1">
            <label className="text-xs font-bold text-slate-500 block mb-1">Buscar Fornecedor/Nota</label>
            <div className="relative">
                <Search className="absolute left-2 top-2.5 text-slate-400" size={16}/>
                <input 
                  className="border p-2 pl-8 rounded text-sm w-full outline-none focus:ring-1 focus:ring-indigo-500" 
                  placeholder="Nome ou número..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
         </div>
         <div className="w-full md:w-auto">
            <label className="text-xs font-bold text-slate-500 block mb-1">Categoria de Produto</label>
            <select 
              className="border p-2 rounded text-sm w-full md:w-48 outline-none focus:ring-1 focus:ring-indigo-500"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
            >
                <option value="ALL">Todas Categorias</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
         </div>
      </div>

      {/* 4. Grid de Contas */}
      {loading ? (
        <div className="text-center py-10 text-slate-500">Carregando contas...</div>
      ) : payableItems.length === 0 ? (
        <div className="text-center py-10 bg-slate-50 rounded border border-dashed border-slate-300 text-slate-400">
           Nenhuma conta encontrada para {monthNames[currentDate.getMonth()]} de {currentDate.getFullYear()} com estes filtros.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {payableItems.map(item => {
                const isLate = item.daysToDue < 0 && item.status === 'PENDENTE';
                const isNear = item.daysToDue >= 0 && item.daysToDue <= 5 && item.status === 'PENDENTE';
                
                return (
                    <div 
                      key={item.uniqueId} 
                      onClick={() => setDetailsModal(item.fullInvoice)}
                      className={`bg-white rounded-lg border shadow-sm p-4 cursor-pointer hover:shadow-md transition-all relative overflow-hidden group ${isLate ? 'border-red-200 bg-red-50' : isNear ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h4 className="font-bold text-slate-800 text-sm truncate w-48" title={item.supplier}>{item.supplier}</h4>
                                <p className="text-xs text-slate-500">Nota: {item.invoiceNumber}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded border ${item.status === 'PAGO' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                {item.status}
                            </span>
                        </div>

                        <div className="flex items-end justify-between mt-4">
                            <div>
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Vencimento</p>
                                <div className="flex items-center gap-1 font-medium text-sm text-slate-700">
                                    <Calendar size={14}/> {formatDate(item.dueDate)}
                                </div>
                                {item.status === 'PENDENTE' && (
                                    <p className={`text-[10px] mt-1 font-bold ${isLate ? 'text-red-600' : isNear ? 'text-amber-600' : 'text-slate-400'}`}>
                                        {item.daysToDue < 0 ? `Vencido há ${Math.abs(item.daysToDue)} dias` : item.daysToDue === 0 ? 'Vence Hoje!' : `Vence em ${item.daysToDue} dias`}
                                    </p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Parcela {item.installmentNum}</p>
                                <p className="text-xl font-bold text-slate-800">{formatCurrency(item.value)}</p>
                            </div>
                        </div>
                        
                        <div className="absolute inset-0 bg-indigo-900/5 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="bg-white px-3 py-1 rounded-full text-xs font-bold shadow text-indigo-700 flex items-center gap-1">
                                <Eye size={14}/> Ver Detalhes
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
      )}

      {/* Modal de Detalhes (Mantido) */}
      {detailsModal && (
         <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-2xl rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Package size={18} className="text-indigo-600"/> 
                        Detalhes da Nota {detailsModal.header.number}
                    </h3>
                    <button onClick={() => setDetailsModal(null)} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-slate-50 p-3 rounded border">
                            <p className="text-xs text-slate-500 font-bold uppercase">Fornecedor</p>
                            <p className="font-medium text-slate-800">{detailsModal.header.entityName}</p>
                            <p className="text-xs text-slate-500 mt-1">CNPJ: {detailsModal.header.entityDoc}</p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded border">
                            <p className="text-xs text-slate-500 font-bold uppercase">Dados da Nota</p>
                            <p className="font-medium text-slate-800">Emissão: {formatDate(detailsModal.header.issueDate)}</p>
                            <p className="font-medium text-slate-800">Chave: <span className="text-xs text-slate-500 font-mono">{detailsModal.header.accessKey || 'N/A'}</span></p>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-bold text-sm text-slate-700 mb-2 border-b pb-1">Produtos Comprados</h4>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-xs text-slate-500 uppercase">
                                <tr>
                                    <th className="p-2">Produto</th>
                                    <th className="p-2 text-right">Qtd</th>
                                    <th className="p-2 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {detailsModal.items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="p-2">
                                            <div className="font-medium">{item.productName}</div>
                                            <div className="text-[10px] text-slate-400">{item.xmlProductCode}</div>
                                        </td>
                                        <td className="p-2 text-right">{item.quantity}</td>
                                        <td className="p-2 text-right">{formatCurrency(item.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div>
                        <h4 className="font-bold text-sm text-slate-700 mb-2 border-b pb-1">Parcelas Financeiras</h4>
                         <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                             {detailsModal.financials.map((inst, idx) => (
                                 <div key={idx} className={`p-2 rounded border text-sm ${inst.status === 'PAGO' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                                     <div className="flex justify-between items-center">
                                         <span className="font-bold text-slate-600">{inst.number}ª Parcela</span>
                                         {inst.status === 'PAGO' && <CheckCircle size={12} className="text-emerald-500"/>}
                                     </div>
                                     <div className="text-slate-500 text-xs mt-1">Vence: {formatDate(inst.dueDate)}</div>
                                     <div className="font-bold text-slate-800">{formatCurrency(inst.value)}</div>
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