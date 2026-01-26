import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Plus, Edit, Trash2, Package, Save, X, AlertTriangle, 
  CheckCircle, BarChart3, Boxes, ArrowRightLeft, Lock, ArrowUpCircle, ArrowDownCircle
} from 'lucide-react';
import { collection, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, increment } from "firebase/firestore";
import { db } from './firebase'; 
import { supabase } from './supabaseClient';

// Máscaras de Proteção
const masks = {
  ncm: (val) => val ? String(val).replace(/\D/g, '').replace(/^(\d{4})(\d{2})(\d{2})/, '$1.$2.$3').substring(0, 10) : '',
  ean: (val) => val ? String(val).replace(/\D/g, '').substring(0, 14) : '',
};

// --- SUB-COMPONENTE PARA CARD DE ESTOQUE (Evita re-renderizar tudo ao digitar qtd) ---
const StockCard = ({ product, getDisplayStock, getParentName, onUpdateStock }) => {
    const [qtyInput, setQtyInput] = useState('');
    const isPack = product.itemType === 'pack';
    const displayStock = getDisplayStock(product);

    const handleAction = (direction) => {
        const val = parseInt(qtyInput);
        if (!val || val <= 0) return;
        
        // Direção: 1 para entrada, -1 para saída
        onUpdateStock(product, val * direction);
        setQtyInput(''); // Limpa após usar
    };

    return (
        <div className={`bg-white p-4 rounded border shadow-sm flex flex-col justify-between ${isPack ? 'border-l-4 border-l-indigo-500' : 'border-l-4 border-l-emerald-500'}`}>
            <div>
                <div className="flex justify-between items-start">
                    <h4 className="font-bold text-slate-800 truncate" title={product.name}>{product.name}</h4>
                    {isPack && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-200 uppercase">Caixa</span>}
                </div>
                <p className="text-xs text-slate-500 mt-1">Cód: {product.cbaCode}</p>
                
                {isPack && product.parentId && (
                    <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                        <Boxes size={12}/> Contém {product.conversionFactor}x {getParentName(product.parentId)}
                    </p>
                )}
            </div>

            <div className="mt-4 bg-slate-50 p-3 rounded border border-slate-100">
                <div className="text-center mb-3">
                    <div className="text-2xl font-bold text-slate-800">{displayStock}</div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">{product.unit || 'UN'}</div>
                </div>
                
                <div className="flex gap-1">
                    <input 
                        type="number" 
                        placeholder="Quantidade" 
                        className="w-full border rounded px-2 text-center font-bold text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                        value={qtyInput}
                        onChange={(e) => setQtyInput(e.target.value)}
                    />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                    <button 
                        onClick={() => handleAction(-1)}
                        disabled={!qtyInput}
                        className="flex items-center justify-center gap-1 bg-red-100 text-red-700 hover:bg-red-200 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-50"
                    >
                        <ArrowDownCircle size={14}/> Saída
                    </button>
                    <button 
                        onClick={() => handleAction(1)} 
                        disabled={!qtyInput}
                        className="flex items-center justify-center gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-50"
                    >
                        <ArrowUpCircle size={14}/> Entrada
                    </button>
                </div>
            </div>
        </div>
    );
};

const InventoryWMS = ({ storeConfig, showNotification, products = [] }) => {
  const [activeTab, setActiveTab] = useState('quick'); // 'quick' | 'management'
  const [taxProfiles, setTaxProfiles] = useState([]); 
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);

  // 1. CARREGAR PERFIS
  useEffect(() => {
    if (!storeConfig?.id) return;
    const fetchProfiles = async () => {
      try {
        const storeIdStr = String(storeConfig.id);
        const { data, error } = await supabase
          .from('fiscal_tax_profiles')
          .select('*')
          .eq('firebase_store_id', storeIdStr);
        if (!error && data) setTaxProfiles(data);
      } catch (err) {
        console.error("Erro Supabase:", err);
      }
    };
    fetchProfiles();
  }, [storeConfig]);

  // --- LÓGICA DE EXIBIÇÃO DE ESTOQUE (Virtual vs Real) ---
  const getDisplayStock = (prod) => {
      if (prod.itemType === 'pack' && prod.parentId && prod.conversionFactor) {
          const parent = products.find(p => p.id === prod.parentId);
          if (parent) {
              return Math.floor((parent.stock || 0) / prod.conversionFactor);
          }
          return 0;
      }
      return prod.stock || 0;
  };

  const getParentName = (parentId) => {
      const p = products.find(x => x.id === parentId);
      return p ? p.name : 'Produto Pai Não Encontrado';
  };

  // --- AÇÕES ---

  // Movimentação Rápida (Aba 1)
  const handleQuickStockUpdate = async (product, delta) => {
      const storeIdStr = String(storeConfig.id);
      try {
          if (product.itemType === 'pack') {
              // Se for caixa, atualiza o pai multiplicando pelo fator
              if (!product.parentId || !product.conversionFactor) return showNotification('Erro de configuração do produto pai/filho', 'error');
              
              const qtyToChange = delta * product.conversionFactor;
              const parentRef = doc(db, 'artifacts', storeIdStr, 'public', 'data', 'products', product.parentId);
              
              await updateDoc(parentRef, { stock: increment(qtyToChange) });
              showNotification(`Estoque do pai (${getParentName(product.parentId)}) ajustado: ${qtyToChange > 0 ? '+' : ''}${qtyToChange} un.`, 'success');
          } else {
              // Se for unidade, atualiza direto
              const prodRef = doc(db, 'artifacts', storeIdStr, 'public', 'data', 'products', product.id);
              await updateDoc(prodRef, { stock: increment(delta) });
              showNotification('Estoque atualizado!', 'success');
          }
      } catch (error) {
          showNotification('Erro ao atualizar estoque: ' + error.message, 'error');
      }
  };

  // Gestão Completa (Aba 2)
  const handleEdit = (prod) => {
    setCurrentProduct({ 
      ...prod, 
      ncm: prod.ncm || '', 
      taxProfileId: prod.taxProfileId || '',
      unit: prod.unit || 'UN',
      ean: prod.ean || '',
      origin: prod.origin || '0',
      price: prod.price || 0,
      cost: prod.cost || 0,
      stock: prod.stock || 0,
      itemType: prod.itemType || 'unit',
      parentId: prod.parentId || '',
      conversionFactor: prod.conversionFactor || 1
    });
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setCurrentProduct({
      name: '', price: 0, cost: 0, stock: 0,
      ncm: '', taxProfileId: '', unit: 'UN', ean: '', origin: '0',
      itemType: 'unit', parentId: '', conversionFactor: 1
    });
    setIsModalOpen(true);
  };

  const handleUnitChange = (e) => {
      const newUnit = e.target.value;
      // Lógica automática: Se for CX ou FD, vira 'pack'. Senão, 'unit'.
      const newItemType = ['CX', 'FD'].includes(newUnit) ? 'pack' : 'unit';
      
      setCurrentProduct({
          ...currentProduct,
          unit: newUnit,
          itemType: newItemType
      });
  };

  const handleSave = async () => {
    const storeIdStr = String(storeConfig.id);

    try {
      if (!currentProduct.name) return showNotification('Nome é obrigatório', 'error');
      
      // Validação Pai/Filho
      if (currentProduct.itemType === 'pack') {
          if (!currentProduct.parentId) return showNotification('Selecione o Produto Unitário (Pai).', 'error');
          if (currentProduct.conversionFactor < 2) return showNotification('Fator de conversão deve ser maior que 1.', 'error');
      }

      const payload = {
        name: currentProduct.name.toUpperCase(),
        price: Number(currentProduct.price),
        cost: Number(currentProduct.cost || 0),
        
        // Se for Pack, o estoque é virtual.
        stock: currentProduct.itemType === 'unit' ? Number(currentProduct.stock) : 0,

        ncm: currentProduct.ncm ? String(currentProduct.ncm).replace(/\D/g, '') : '',
        taxProfileId: currentProduct.taxProfileId || null,
        unit: currentProduct.unit,
        ean: currentProduct.ean,
        origin: currentProduct.origin,
        
        itemType: currentProduct.itemType,
        parentId: currentProduct.itemType === 'pack' ? currentProduct.parentId : null,
        conversionFactor: currentProduct.itemType === 'pack' ? Number(currentProduct.conversionFactor) : null,

        updatedAt: serverTimestamp()
      };

      if (currentProduct.id) {
        await updateDoc(doc(db, 'artifacts', storeIdStr, 'public', 'data', 'products', currentProduct.id), payload);
        showNotification('Produto atualizado!', 'success');
      } else {
        await addDoc(collection(db, 'artifacts', storeIdStr, 'public', 'data', 'products'), {
            ...payload,
            cbaCode: Date.now().toString(),
            createdAt: serverTimestamp()
        });
        showNotification('Produto criado!', 'success');
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      showNotification('Erro ao salvar: ' + error.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    const storeIdStr = String(storeConfig.id);
    if(window.confirm('Excluir este produto?')) {
      await deleteDoc(doc(db, 'artifacts', storeIdStr, 'public', 'data', 'products', id));
      showNotification('Produto excluído', 'success');
    }
  };

  // Filtros
  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const list = Array.isArray(products) ? products : [];
    
    return list.filter(p => 
      (p.name || '').toLowerCase().includes(term) || 
      String(p.cbaCode || '').includes(term)
    );
  }, [products, searchTerm]);

  return (
    <div className="space-y-4">
      {/* HEADER E TABS */}
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex border-b">
              <button 
                onClick={() => setActiveTab('quick')}
                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'quick' ? 'bg-slate-800 text-white' : 'hover:bg-slate-50 text-slate-500'}`}
              >
                  <ArrowRightLeft size={18}/> Movimentação Rápida
              </button>
              <button 
                onClick={() => setActiveTab('management')}
                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'management' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 text-slate-500'}`}
              >
                  <Package size={18}/> Gestão e Cadastro
              </button>
          </div>

          <div className="p-4 flex justify-between items-center bg-slate-50">
             <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
                <input 
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    placeholder="Buscar produto..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
             </div>
             {activeTab === 'management' && (
                <button onClick={handleAddNew} className="bg-slate-800 text-white px-4 py-2 rounded font-bold hover:bg-slate-700 flex gap-2 ml-4">
                    <Plus size={20}/> Novo Produto
                </button>
             )}
          </div>
      </div>

      {/* ABA 1: MOVIMENTAÇÃO RÁPIDA (Usando Sub-Componente) */}
      {activeTab === 'quick' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredProducts.map(p => (
                  <StockCard 
                      key={p.id} 
                      product={p} 
                      getDisplayStock={getDisplayStock}
                      getParentName={getParentName}
                      onUpdateStock={handleQuickStockUpdate}
                  />
              ))}
          </div>
      )}

      {/* ABA 2: GESTÃO COMPLETA (CRUD) */}
      {activeTab === 'management' && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold">
                    <tr>
                        <th className="p-4">Produto</th>
                        <th className="p-4">Tipo</th>
                        <th className="p-4 text-right">Preço</th>
                        <th className="p-4 text-center">Estoque Atual</th>
                        <th className="p-4 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map(product => {
                        const isPack = product.itemType === 'pack';
                        
                        return (
                            <tr key={product.id} className="hover:bg-slate-50">
                                <td className="p-4">
                                    <div className="font-bold text-slate-800">{product.name}</div>
                                    <div className="text-xs text-slate-500">
                                        {isPack && `Contém: ${product.conversionFactor} un`}
                                    </div>
                                </td>
                                <td className="p-4">
                                    {isPack ? (
                                        <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-bold border border-indigo-200">
                                            <Boxes size={12}/> CX / FARDO
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold border border-slate-200">
                                            <Package size={12}/> UNIDADE
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 text-right font-medium">R$ {Number(product.price).toFixed(2)}</td>
                                <td className="p-4 text-center font-bold">
                                    {getDisplayStock(product)} {product.unit}
                                </td>
                                <td className="p-4 text-right flex justify-end gap-2">
                                    <button onClick={() => handleEdit(product)} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded"><Edit size={18}/></button>
                                    <button onClick={() => handleDelete(product.id)} className="text-slate-400 hover:text-red-500 p-2 rounded"><Trash2 size={18}/></button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
      )}

      {/* MODAL DE CADASTRO/EDIÇÃO */}
      {isModalOpen && currentProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
                <div className="bg-slate-800 text-white p-4 flex justify-between items-center shrink-0">
                    <h3 className="font-bold flex items-center gap-2"><Edit size={18}/> {currentProduct.id ? 'Editar' : 'Novo'} Produto</h3>
                    <button onClick={() => setIsModalOpen(false)}><X size={20}/></button>
                </div>
                
                <div className="p-6 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        
                        {/* CAMPOS ESPECÍFICOS DE CAIXA (Aparece automaticamente se Unidade for CX ou FD) */}
                        {currentProduct.itemType === 'pack' && (
                            <div className="md:col-span-12 bg-indigo-50 p-4 rounded border border-indigo-200 grid grid-cols-12 gap-4 mb-2 animate-in slide-in-from-top-2">
                                <div className="col-span-12">
                                    <h4 className="text-xs font-bold text-indigo-800 uppercase mb-2 flex items-center gap-1">
                                        <Boxes size={14}/> Configuração de Composição (Pai/Filho)
                                    </h4>
                                </div>
                                <div className="col-span-8">
                                    <label className="block text-[10px] font-bold text-indigo-600 mb-1">Produto Unitário (Pai)</label>
                                    <select 
                                        className="w-full border border-indigo-300 p-2 rounded text-sm"
                                        value={currentProduct.parentId}
                                        onChange={e => setCurrentProduct({...currentProduct, parentId: e.target.value})}
                                    >
                                        <option value="">Selecione o produto de origem...</option>
                                        {products.filter(p => (!p.itemType || p.itemType === 'unit') && p.id !== currentProduct.id).map(p => (
                                            <option key={p.id} value={p.id}>{p.name} (Estoque: {p.stock})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-span-4">
                                    <label className="block text-[10px] font-bold text-indigo-600 mb-1">Qtd na Caixa</label>
                                    <input 
                                        type="number" 
                                        className="w-full border border-indigo-300 p-2 rounded text-sm font-bold text-center"
                                        value={currentProduct.conversionFactor}
                                        onChange={e => setCurrentProduct({...currentProduct, conversionFactor: e.target.value})}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="md:col-span-8">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Nome do Produto</label>
                            <input className="w-full border p-2 rounded text-sm" value={currentProduct.name} onChange={e => setCurrentProduct({...currentProduct, name: e.target.value})} placeholder={currentProduct.itemType === 'pack' ? 'Ex: CAIXA CERVEJA X (12 UN)' : 'Ex: CERVEJA LATA'} />
                        </div>
                        <div className="md:col-span-4">
                            <label className="block text-xs font-bold text-slate-500 mb-1">EAN / GTIN</label>
                            <input className="w-full border p-2 rounded text-sm" value={currentProduct.ean} onChange={e => setCurrentProduct({...currentProduct, ean: masks.ean(e.target.value)})} placeholder="Código de Barras" />
                        </div>

                        <div className="md:col-span-4">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Unidade</label>
                            <select 
                                className={`w-full border p-2 rounded text-sm font-bold ${currentProduct.itemType === 'pack' ? 'text-indigo-700 bg-indigo-50 border-indigo-300' : 'text-slate-700'}`}
                                value={currentProduct.unit} 
                                onChange={handleUnitChange}
                            >
                                <option value="UN">UN - Unidade</option>
                                <option value="CX">CX - Caixa (Composto)</option>
                                <option value="FD">FD - Fardo (Composto)</option>
                                <option value="KG">KG - Quilo</option>
                                <option value="L">L - Litro</option>
                            </select>
                        </div>

                        <div className="md:col-span-4">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Preço Venda</label>
                            <input type="number" className="w-full border p-2 rounded text-sm font-bold" value={currentProduct.price} onChange={e => setCurrentProduct({...currentProduct, price: e.target.value})} />
                        </div>
                        
                        <div className="md:col-span-4">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Estoque {currentProduct.itemType === 'pack' ? '(Calculado)' : '(Real)'}</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    className={`w-full border p-2 rounded text-sm ${currentProduct.itemType === 'pack' ? 'bg-slate-100 text-slate-500' : 'bg-white'}`}
                                    value={currentProduct.stock} 
                                    onChange={e => setCurrentProduct({...currentProduct, stock: e.target.value})} 
                                    disabled={currentProduct.itemType === 'pack'}
                                />
                                {currentProduct.itemType === 'pack' && <Lock size={12} className="absolute right-3 top-3 text-slate-400"/>}
                            </div>
                        </div>

                        {/* FISCAL (Mantido) */}
                        <div className="md:col-span-12 my-2 border-t pt-2 bg-slate-50 p-2 rounded border border-slate-200">
                            <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><BarChart3 size={14}/> Configuração Fiscal</p>
                            <div className="grid grid-cols-12 gap-4">
                                <div className="col-span-4">
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">NCM</label>
                                    <input className="w-full border p-2 rounded text-sm" value={masks.ncm(currentProduct.ncm)} onChange={e => setCurrentProduct({...currentProduct, ncm: e.target.value})} placeholder="0000.00.00"/>
                                </div>
                                <div className="col-span-8">
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Perfil Tributário</label>
                                    <select className="w-full border p-2 rounded text-sm bg-white" value={currentProduct.taxProfileId || ''} onChange={e => setCurrentProduct({...currentProduct, taxProfileId: e.target.value})}>
                                        <option value="">-- Selecione --</option>
                                        {taxProfiles.map(tp => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 flex justify-end gap-2 border-t shrink-0">
                    <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded font-bold text-sm">Cancelar</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-slate-800 text-white rounded font-bold text-sm hover:bg-slate-900 flex items-center gap-2"><Save size={16}/> Salvar Produto</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default InventoryWMS;