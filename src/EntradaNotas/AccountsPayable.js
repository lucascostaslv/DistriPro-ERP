import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Filter, Search, DollarSign, 
  Clock, CheckCircle, AlertTriangle, Eye, X, Package 
} from 'lucide-react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase'; // Ajuste o caminho conforme sua estrutura

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
  
  // Filtros
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal Detalhes
  const [detailsModal, setDetailsModal] = useState(null);

  // Categorias extraídas dos produtos cadastrados
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
        // Acessa a mesma coleção que o EntradaNotas grava
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

  // Processamento dos dados para exibição (Flattening: Nota -> Parcelas)
  const payableItems = useMemo(() => {
    let items = [];
    
    invoices.forEach(inv => {
      // Filtrar por categoria do produto (se selecionado)
      if (selectedCategory !== 'ALL') {
        const hasCategory = inv.items.some(i => {
            // Tenta encontrar a categoria do item no banco de produtos
            const prod = products.find(p => p.id === i.productId);
            return prod && prod.category === selectedCategory;
        });
        if (!hasCategory) return;
      }

      // Se não tiver financeiro, ignora (ex: bonificação sem financeiro)
      if (!inv.financials || inv.financials.length === 0) return;

      inv.financials.forEach(inst => {
        // Filtrar pelo Mês de Vencimento
        if (!inst.dueDate.startsWith(selectedMonth)) return;
        
        // Filtro de Busca Texto (Fornecedor ou Número Nota)
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
          fullInvoice: inv, // Referência para abrir detalhes
          
          // Dados da Parcela
          installmentNum: inst.number,
          dueDate: inst.dueDate,
          value: inst.value,
          status: inst.status, // 'PENDENTE' ou 'PAGO'
          
          // Cálculo de dias
          daysToDue: Math.ceil((new Date(inst.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
        });
      });
    });

    return items.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [invoices, selectedMonth, selectedCategory, searchTerm, products]);

  const totalDueMonth = payableItems.reduce((acc, item) => acc + (item.status === 'PENDENTE' ? item.value : 0), 0);
  const totalPaidMonth = payableItems.reduce((acc, item) => acc + (item.status === 'PAGO' ? item.value : 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-bold">Total a Pagar ({selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]})</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(totalDueMonth)}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded border border-emerald-100 shadow-sm">
          <p className="text-xs text-emerald-600 uppercase font-bold">Total Pago</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(totalPaidMonth)}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-end">
         <div className="w-full md:w-auto">
            <label className="text-xs font-bold text-slate-500 block mb-1">Mês de Referência</label>
            <input 
              type="month" 
              className="border p-2 rounded text-sm w-full md:w-48" 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(e.target.value)}
            />
         </div>
         <div className="w-full md:w-auto flex-1">
            <label className="text-xs font-bold text-slate-500 block mb-1">Buscar Fornecedor/Nota</label>
            <div className="relative">
                <Search className="absolute left-2 top-2.5 text-slate-400" size={16}/>
                <input 
                  className="border p-2 pl-8 rounded text-sm w-full" 
                  placeholder="Nome ou número..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
         </div>
         <div className="w-full md:w-auto">
            <label className="text-xs font-bold text-slate-500 block mb-1">Filtrar Categoria</label>
            <select 
              className="border p-2 rounded text-sm w-full md:w-48"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
            >
                <option value="ALL">Todas Categorias</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
         </div>
      </div>

      {/* Grid de Contas */}
      {loading ? (
        <div className="text-center py-10 text-slate-500">Carregando contas...</div>
      ) : payableItems.length === 0 ? (
        <div className="text-center py-10 bg-slate-50 rounded border border-dashed border-slate-300 text-slate-400">
           Nenhuma conta encontrada para este período/filtro.
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
                        
                        {/* Hover Overlay */}
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

      {/* Modal de Detalhes */}
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
                    {/* Cabeçalho */}
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

                    {/* Itens */}
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

                    {/* Financeiro */}
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