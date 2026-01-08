import React, { useState, useEffect } from 'react';
import { Search, Plus, Minus, Trash2, ShoppingCart, UserPlus, CreditCard, X, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../utils';

const POS = ({ products, clients, setClients, feeProfiles, onSaleComplete, showNotification }) => {
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  
  const [paymentModal, setPaymentModal] = useState({ open: false, method: null });
  const [paymentDetails, setPaymentDetails] = useState({ 
    installments: 1, 
    feePercent: 0,
    moneyGiven: 0,
    selectedProfileId: '',
    fiadoClientId: '',
    fiadoDueDate: '',
    newClientName: '',
    isNewClient: false
  });

  const categories = ['Todos', ...new Set(products.map(p => p.category))];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product) => {
    if (product.stock <= 0) return showNotification('Sem estoque!', 'error');
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing && existing.quantity >= product.stock) return prev;
      return existing 
        ? prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(item => item.id !== id));
  
  const updateQuantity = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const product = products.find(p => p.id === id);
        const newQty = item.quantity + delta;
        return (newQty > 0 && newQty <= product.stock) ? { ...item, quantity: newQty } : item;
      }
      return item;
    }));
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const initPayment = (method) => {
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const dateStr = nextMonth.toISOString().split('T')[0];

    setPaymentDetails({ 
      installments: 1, 
      feePercent: 0, 
      moneyGiven: 0, 
      selectedProfileId: '', 
      fiadoClientId: '',
      fiadoDueDate: dateStr,
      newClientName: '',
      isNewClient: false
    });
    setPaymentModal({ open: true, method });
  };

  // Efeito para atualizar a taxa quando muda o perfil OU o número de parcelas
  useEffect(() => {
    if (paymentModal.open && paymentDetails.selectedProfileId) {
      const profile = feeProfiles.find(p => p.id === Number(paymentDetails.selectedProfileId));
      if (profile) {
        let fee = 0;
        if (paymentModal.method === 'Crédito') {
          // Busca a taxa específica da parcela no objeto credit
          fee = profile.credit[paymentDetails.installments] || 0;
        } else if (paymentModal.method === 'Débito') {
          fee = profile.debit;
        } else if (paymentModal.method === 'Pix') {
          fee = profile.pix;
        }
        setPaymentDetails(prev => ({ ...prev, feePercent: fee }));
      }
    }
  }, [paymentDetails.selectedProfileId, paymentDetails.installments, paymentModal.method, paymentModal.open, feeProfiles]);

  const finalizeSale = () => {
    let finalClientId = null;
    let finalClientName = 'Consumidor Final';

    if (paymentModal.method === 'Fiado') {
      if (paymentDetails.isNewClient) {
        if (!paymentDetails.newClientName) return showNotification('Nome do cliente é obrigatório!', 'error');
        const newId = Date.now();
        const newClientObj = { id: newId, name: paymentDetails.newClientName, phone: '', type: 'PF', debt: cartTotal };
        setClients([...clients, newClientObj]);
        finalClientId = newId;
        finalClientName = paymentDetails.newClientName;
      } else {
        if (!paymentDetails.fiadoClientId) return showNotification('Selecione um cliente!', 'error');
        finalClientId = Number(paymentDetails.fiadoClientId);
        const existingClient = clients.find(c => c.id === finalClientId);
        finalClientName = existingClient.name;
        setClients(clients.map(c => c.id === finalClientId ? { ...c, debt: c.debt + cartTotal } : c));
      }
      if (!paymentDetails.fiadoDueDate) return showNotification('Data de vencimento obrigatória!', 'error');
    }

    const feeAmount = (cartTotal * paymentDetails.feePercent) / 100;
    const netTotal = cartTotal - feeAmount;
    const profit = cart.reduce((acc, item) => acc + ((item.price - item.cost) * item.quantity), 0) - feeAmount;

    const sale = {
      id: crypto.randomUUID(),
      date: new Date(),
      items: [...cart],
      total: cartTotal,
      netTotal: netTotal,
      fee: feeAmount,
      profit: profit,
      paymentMethod: paymentModal.method,
      installments: paymentDetails.installments,
      clientId: finalClientId,
      clientName: finalClientName,
      dueDate: paymentModal.method === 'Fiado' ? paymentDetails.fiadoDueDate : null,
      isPaid: paymentModal.method !== 'Fiado'
    };

    onSaleComplete(sale);
    setCart([]);
    setPaymentModal({ open: false, method: null });
    showNotification(paymentModal.method === 'Fiado' ? 'Venda Fiado Registrada!' : 'Venda Realizada!', 'success');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] md:h-full md:flex-row gap-4 animate-fade-in relative">
      {/* Lista de Produtos */}
      <div className="flex-1 flex flex-col bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar..." 
              className="w-full pl-10 pr-4 py-2 text-sm rounded border border-slate-300 focus:outline-none focus:border-emerald-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProducts.map(product => (
              <div 
                key={product.id} 
                onClick={() => addToCart(product)}
                className={`group flex flex-col justify-between p-3 rounded border border-slate-200 hover:border-emerald-500 hover:shadow-md cursor-pointer transition-all bg-white ${product.stock === 0 ? 'opacity-60 bg-slate-50' : ''}`}
              >
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs text-slate-500 font-mono bg-slate-100 px-1 rounded">{product.category}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${product.stock < 10 ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {product.stock} UN
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm leading-snug min-h-[2.5em]">{product.name}</h3>
                </div>
                <div className="mt-3 flex justify-between items-end border-t border-slate-100 pt-2">
                  <span className="text-lg font-bold text-slate-800">{formatCurrency(product.price)}</span>
                  <div className="bg-slate-100 text-slate-400 p-1 rounded-full group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                    <Plus size={16} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Caixa */}
      <div className="w-full md:w-96 flex flex-col bg-white rounded border border-slate-200 shadow-lg h-[50vh] md:h-full">
        <div className="p-4 bg-slate-800 text-white rounded-t flex justify-between items-center">
          <h2 className="font-bold flex items-center gap-2"><ShoppingCart size={20} /> Caixa Aberto</h2>
          <span className="text-xs bg-slate-700 px-2 py-1 rounded">Itens: {cart.reduce((a, c) => a + c.quantity, 0)}</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-0">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
              <ShoppingCart size={48} className="mb-2 opacity-20" />
              <p className="text-sm">Vazio</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10 text-xs uppercase">
                <tr>
                  <th className="p-3 font-semibold">Prod.</th>
                  <th className="p-3 font-semibold text-center w-20">Qtd</th>
                  <th className="p-3 font-semibold text-right w-20">Tot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cart.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 group">
                    <td className="p-3">
                      <div className="font-medium text-slate-800 truncate max-w-[140px]">{item.name}</div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1 border rounded bg-white">
                        <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-slate-100 text-slate-600"><Minus size={12}/></button>
                        <span className="w-4 text-center font-medium">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-slate-100 text-slate-600"><Plus size={12}/></button>
                      </div>
                    </td>
                    <td className="p-3 text-right font-medium relative">
                      {formatCurrency(item.price * item.quantity)}
                      <button onClick={() => removeFromCart(item.id)} className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 bg-red-50 text-red-500 rounded hidden group-hover:block"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200">
          <div className="flex justify-between items-end mb-4">
            <span className="text-sm text-slate-500 font-medium">Subtotal</span>
            <span className="text-3xl font-bold text-slate-800">{formatCurrency(cartTotal)}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button disabled={cart.length === 0} onClick={() => initPayment('Dinheiro')} className="py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded shadow-sm text-sm">Dinheiro</button>
            <button disabled={cart.length === 0} onClick={() => initPayment('Pix')} className="py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold rounded shadow-sm text-sm">Pix</button>
            <button disabled={cart.length === 0} onClick={() => initPayment('Débito')} className="py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded shadow-sm text-sm">Débito</button>
            <button disabled={cart.length === 0} onClick={() => initPayment('Crédito')} className="py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded shadow-sm text-sm">Crédito</button>
          </div>
          <button disabled={cart.length === 0} onClick={() => initPayment('Fiado')} className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded shadow-sm text-sm flex justify-center items-center gap-2">
            <UserPlus size={16} /> Fiado / A Prazo
          </button>
        </div>
      </div>

      {/* Modal Pagamento */}
      {paymentModal.open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[80] p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-800 text-white p-4 flex justify-between items-center sticky top-0 z-10">
              <h3 className="font-bold flex items-center gap-2"><CreditCard size={20} /> {paymentModal.method}</h3>
              <button onClick={() => setPaymentModal({ open: false, method: null })}><X size={20}/></button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="text-center pb-4 border-b border-slate-100">
                <p className="text-slate-500 text-sm mb-1">Valor Total</p>
                <p className="text-4xl font-bold text-slate-800">{formatCurrency(cartTotal)}</p>
              </div>

              {/* Lógica Cartão/Pix: Selecionar Máquina */}
              {(paymentModal.method === 'Crédito' || paymentModal.method === 'Débito' || paymentModal.method === 'Pix') && (
                <div className="bg-slate-50 p-3 rounded border border-slate-100">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Selecione a Máquina/Taxa Padrão</label>
                  <select 
                    className="w-full border p-2 rounded text-sm mb-2"
                    value={paymentDetails.selectedProfileId}
                    onChange={(e) => setPaymentDetails({ ...paymentDetails, selectedProfileId: e.target.value })}
                  >
                    <option value="">-- Personalizado / Manual --</option>
                    {feeProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  
                  {/* Parcelas (Só Crédito) - Movido para antes da taxa para recalcular corretamente */}
                  {paymentModal.method === 'Crédito' && (
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Parcelas</label>
                      <select 
                        className="w-full border border-slate-300 rounded p-2 text-sm"
                        value={paymentDetails.installments}
                        onChange={(e) => setPaymentDetails({ ...paymentDetails, installments: Number(e.target.value) })}
                      >
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(num => (
                          <option key={num} value={num}>{num}x sem juros</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">Taxa Aplicada (%)</label>
                      <input 
                        type="number" 
                        className="w-full border p-1 rounded text-sm"
                        value={paymentDetails.feePercent}
                        onChange={(e) => setPaymentDetails({...paymentDetails, feePercent: e.target.value})}
                      />
                    </div>
                    <div className="text-right">
                       <label className="block text-[10px] text-slate-400">Valor Líquido</label>
                       <span className="font-bold text-emerald-600 text-sm">{formatCurrency(cartTotal - (cartTotal * paymentDetails.feePercent / 100))}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Lógica FIADO */}
              {paymentModal.method === 'Fiado' && (
                <div className="space-y-3 bg-amber-50 p-4 rounded border border-amber-100">
                  <div className="flex gap-2 text-sm mb-2">
                    <button 
                      onClick={() => setPaymentDetails({...paymentDetails, isNewClient: false})}
                      className={`flex-1 py-1 rounded border ${!paymentDetails.isNewClient ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600'}`}
                    >
                      Cliente Existente
                    </button>
                    <button 
                       onClick={() => setPaymentDetails({...paymentDetails, isNewClient: true})}
                       className={`flex-1 py-1 rounded border ${paymentDetails.isNewClient ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600'}`}
                    >
                      Novo Cliente
                    </button>
                  </div>

                  {!paymentDetails.isNewClient ? (
                    <select 
                      className="w-full border p-2 rounded text-sm"
                      value={paymentDetails.fiadoClientId}
                      onChange={(e) => setPaymentDetails({...paymentDetails, fiadoClientId: e.target.value})}
                    >
                      <option value="">Selecione o Cliente...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : (
                    <input 
                      className="w-full border p-2 rounded text-sm"
                      placeholder="Nome do Novo Cliente"
                      value={paymentDetails.newClientName}
                      onChange={(e) => setPaymentDetails({...paymentDetails, newClientName: e.target.value})}
                    />
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Data de Vencimento / Cobrança</label>
                    <input 
                      type="date"
                      className="w-full border p-2 rounded text-sm"
                      value={paymentDetails.fiadoDueDate}
                      onChange={(e) => setPaymentDetails({...paymentDetails, fiadoDueDate: e.target.value})}
                    />
                    <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1"><AlertCircle size={10}/> O sistema gerará um aviso neste dia.</p>
                  </div>
                </div>
              )}

              {/* Dinheiro */}
              {paymentModal.method === 'Dinheiro' && (
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Valor Recebido</label>
                   <input 
                      type="number" 
                      className="w-full border p-2 text-lg font-bold text-slate-800 rounded"
                      value={paymentDetails.moneyGiven || ''}
                      onChange={(e) => setPaymentDetails({ ...paymentDetails, moneyGiven: e.target.value })}
                      placeholder="0.00"
                   />
                   {paymentDetails.moneyGiven > cartTotal && (
                     <div className="mt-2 text-center font-bold text-emerald-600">Troco: {formatCurrency(paymentDetails.moneyGiven - cartTotal)}</div>
                   )}
                </div>
              )}

              <button onClick={finalizeSale} className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded font-bold shadow-md">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;