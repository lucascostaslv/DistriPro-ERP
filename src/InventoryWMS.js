import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Plus, Edit, Trash2, Package, Save, X, AlertTriangle, 
  CheckCircle, BarChart3, Boxes, ArrowRightLeft, Lock, ArrowUpCircle, ArrowDownCircle,
  DollarSign, Layers, Calculator
} from 'lucide-react';
import { collection, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, increment } from "firebase/firestore";
import { db } from './firebase'; 
import { supabase } from './supabaseClient';

// Máscaras e Utilitários
const masks = {
  ncm: (val) => val ? String(val).replace(/\D/g, '').replace(/^(\d{4})(\d{2})(\d{2})/, '$1.$2.$3').substring(0, 10) : '',
  cest: (val) => val ? String(val).replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{2})/, '$1.$2.$3').substring(0, 9) : '',
  ean: (val) => val ? String(val).replace(/\D/g, '').substring(0, 14) : '',
  currency: (val) => {
      if (!val) return '';
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  }
};

// --- CARD DE MOVIMENTAÇÃO RÁPIDA (ABA 1) ---
const StockCard = ({ product, getDisplayStock, getParentName, onUpdateStock }) => {
    const [qtyInput, setQtyInput] = useState('');
    const isPack = product.itemType === 'pack';
    const displayStock = getDisplayStock(product);

    const handleQuickStock = (amount) => {
        onUpdateStock(product, amount);
        setQtyInput('');
    };

    return (
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group">
             <div className={`absolute top-0 right-0 p-1 px-2 rounded-bl text-[10px] font-bold uppercase ${isPack ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                {isPack ? 'Caixa/Fardo' : 'Unidade'}
             </div>

             <div>
                <div className="flex justify-between items-start pr-16">
                    <h3 className="font-bold text-slate-800 line-clamp-2 min-h-[40px] text-sm" title={product.name}>
                        {product.name}
                    </h3>
                </div>
                
                <div className="mt-1 space-y-1">
                    <div className="text-xs text-slate-500 font-mono flex items-center gap-1">
                        <span className="bg-slate-100 px-1 rounded">{product.barcode || product.cbaCode || 'S/ CÓDIGO'}</span>
                    </div>
                    {isPack && (
                        <div className="text-[10px] text-purple-600 flex items-center gap-1 bg-purple-50 p-1 rounded w-fit">
                            <Boxes size={10}/> Contém {product.packQuantity || product.conversionFactor}x {getParentName(product.parentId)}
                        </div>
                    )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs border-t pt-2">
                    <div>
                        <span className="text-slate-400 block text-[10px]">Varejo</span>
                        <span className="font-bold text-slate-700">{masks.currency(product.price)}</span>
                    </div>
                    <div>
                        <span className="text-slate-400 block text-[10px]">Atacado</span>
                        <span className="font-bold text-emerald-600">
                            {product.wholesalePrice > 0 ? masks.currency(product.wholesalePrice) : '-'}
                        </span>
                    </div>
                </div>
             </div>

             <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="flex justify-between items-end mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Estoque Atual</span>
                    <span className={`text-xl font-bold ${displayStock < 10 ? 'text-red-500' : 'text-slate-800'}`}>
                        {displayStock} <span className="text-xs font-normal text-slate-400">{product.unit}</span>
                    </span>
                </div>
                
                <div className="flex gap-1">
                     <input 
                        type="number" 
                        className="w-full border rounded p-1 text-sm text-center outline-none focus:border-blue-500"
                        placeholder="Qtd..."
                        value={qtyInput}
                        onChange={e => setQtyInput(e.target.value)}
                     />
                     <button 
                        onClick={() => { if(qtyInput) handleQuickStock(Number(qtyInput)); }}
                        className="bg-emerald-100 text-emerald-700 px-2 rounded hover:bg-emerald-200"
                        title="Entrada"
                     >
                        <Plus size={16}/>
                     </button>
                     <button 
                        onClick={() => { if(qtyInput) handleQuickStock(Number(qtyInput) * -1); }}
                        className="bg-red-100 text-red-700 px-2 rounded hover:bg-red-200"
                        title="Saída"
                     >
                        <Trash2 size={16}/>
                     </button>
                </div>
             </div>
        </div>
    );
};

const InventoryWMS = ({ products, onProductUpdate, showNotification, storeConfig }) => {
  const [activeTab, setActiveTab] = useState('quick'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taxProfiles, setTaxProfiles] = useState([]);
  
  const initialFormState = {
      name: '',
      barcode: '', 
      price: '', 
      wholesalePrice: '', 
      costPrice: '', 
      profitMargin: '', 
      stock: 0,
      minStock: 5,
      unit: 'UN',
      category: 'Geral',
      ncm: '',
      cest: '',
      taxProfileId: '',
      itemType: 'unit',
      parentId: '',
      packQuantity: 0
  };

  const [currentProduct, setCurrentProduct] = useState(initialFormState);
  const [createPackMode, setCreatePackMode] = useState(false);
  const [packFormData, setPackFormData] = useState({
      barcode: '',
      quantity: 12,
      price: '',
      wholesalePrice: '',
      costPrice: ''
  });

  useEffect(() => {
    const loadTaxProfiles = async () => {
        if (!storeConfig?.id) return;
        const { data } = await supabase.from('fiscal_tax_profiles').select('*').eq('firebase_store_id', String(storeConfig.id));
        if (data) setTaxProfiles(data);
    };
    loadTaxProfiles();
  }, [storeConfig]);

  const handleCostCalculation = (field, value) => {
      let newData = { ...currentProduct, [field]: value };
      
      const cost = parseFloat(newData.costPrice) || 0;
      const margin = parseFloat(newData.profitMargin) || 0;
      const price = parseFloat(newData.price) || 0;

      if (field === 'costPrice' && margin > 0) {
          newData.price = (cost * (1 + margin / 100)).toFixed(2);
      }
      else if (field === 'profitMargin' && cost > 0) {
          newData.price = (cost * (1 + margin / 100)).toFixed(2);
      }
      else if (field === 'price' && cost > 0) {
          const newMargin = ((price - cost) / cost) * 100;
          newData.profitMargin = newMargin.toFixed(2);
      }

      setCurrentProduct(newData);

      if (createPackMode) {
          const packQty = Number(packFormData.quantity) || 1;
          const unitCost = Number(newData.costPrice) || 0;
          setPackFormData(prev => ({
              ...prev,
              costPrice: (unitCost * packQty).toFixed(2)
          }));
      }
  };

  const handleEdit = (prod) => {
      setCurrentProduct({
          ...prod,
          barcode: prod.barcode || prod.cbaCode || prod.ean || '',
          costPrice: prod.cost || prod.costPrice || 0,
          packQuantity: prod.conversionFactor || prod.packQuantity || 0
      });
      setCreatePackMode(false); 
      setIsModalOpen(true);
  };

  const handleAddNew = () => {
      setCurrentProduct(initialFormState);
      setCreatePackMode(false);
      setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
        const storeId = String(storeConfig.id);
        if (!currentProduct.name || !currentProduct.price) {
            return showNotification('Nome e Preço de Venda são obrigatórios.', 'error');
        }

        const productData = {
            ...currentProduct,
            name: currentProduct.name.toUpperCase(),
            cbaCode: currentProduct.barcode,
            barcode: currentProduct.barcode,
            price: Number(currentProduct.price),
            wholesalePrice: Number(currentProduct.wholesalePrice) || 0,
            cost: Number(currentProduct.costPrice) || 0,
            costPrice: Number(currentProduct.costPrice) || 0,
            profitMargin: Number(currentProduct.profitMargin) || 0,
            stock: Number(currentProduct.stock),
            conversionFactor: Number(currentProduct.packQuantity) || 1,
            packQuantity: Number(currentProduct.packQuantity) || 1,
            last_updated: serverTimestamp()
        };

        let mainDocRef;
        if (currentProduct.id) {
            await updateDoc(doc(db, 'artifacts', storeId, 'public', 'data', 'products', currentProduct.id), productData);
            mainDocRef = { id: currentProduct.id };
            showNotification('Produto atualizado!', 'success');
        } else {
            const docRef = await addDoc(collection(db, 'artifacts', storeId, 'public', 'data', 'products'), {
                ...productData,
                created_at: serverTimestamp()
            });
            mainDocRef = docRef;
            showNotification('Produto criado!', 'success');
        }

        if (!currentProduct.id && createPackMode && mainDocRef.id) {
            const packData = {
                name: `CX ${currentProduct.name}`,
                cbaCode: packFormData.barcode,
                barcode: packFormData.barcode,
                price: Number(packFormData.price),
                wholesalePrice: Number(packFormData.wholesalePrice) || 0,
                cost: Number(packFormData.costPrice) || 0,
                stock: 0,
                itemType: 'pack',
                parentId: mainDocRef.id, 
                conversionFactor: Number(packFormData.quantity),
                packQuantity: Number(packFormData.quantity),
                taxProfileId: currentProduct.taxProfileId, 
                category: currentProduct.category,
                unit: 'CX',
                created_at: serverTimestamp()
            };

            await addDoc(collection(db, 'artifacts', storeId, 'public', 'data', 'products'), packData);
            showNotification('Caixa vinculada criada com sucesso!', 'success');
        }

        setIsModalOpen(false);
        setCreatePackMode(false);
        setPackFormData({ barcode: '', quantity: 12, price: '', wholesalePrice: '', costPrice: '' });

    } catch (error) {
        console.error("Erro ao salvar:", error);
        showNotification("Erro ao salvar produto.", "error");
    }
  };

  const handleDelete = async (id) => {
      if (window.confirm("Tem certeza que deseja excluir?")) {
          const storeId = String(storeConfig.id);
          await deleteDoc(doc(db, 'artifacts', storeId, 'public', 'data', 'products', id));
          showNotification("Produto excluído.", "success");
      }
  };

  const handleUpdateStock = async (product, qtyChange) => {
      try {
          const storeId = String(storeConfig.id);
          if (product.itemType === 'pack' && product.parentId) {
              const factor = product.conversionFactor || product.packQuantity || 1;
              const parentRef = doc(db, 'artifacts', storeId, 'public', 'data', 'products', product.parentId);
              await updateDoc(parentRef, { stock: increment(qtyChange * factor) });
              showNotification('Estoque do item pai atualizado via caixa!', 'success');
          } else {
              const ref = doc(db, 'artifacts', storeId, 'public', 'data', 'products', product.id);
              await updateDoc(ref, { stock: increment(qtyChange) });
              showNotification("Estoque atualizado!", "success");
          }
      } catch (e) {
          showNotification("Erro ao mover estoque.", "error");
      }
  };

  const getParentName = (parentId) => {
      const parent = products.find(p => p.id === parentId);
      return parent ? parent.name : '...';
  };
  
  const getDisplayStock = (prod) => {
      if (prod.itemType === 'pack' && prod.parentId) {
          const parent = products.find(p => p.id === prod.parentId);
          const factor = prod.conversionFactor || prod.packQuantity || 1;
          return parent ? Math.floor((parent.stock || 0) / factor) : 0;
      }
      return prod.stock; 
  };

  const filteredProducts = useMemo(() => {
      return products.filter(p => {
          const term = searchTerm.toLowerCase();
          return p.name.toLowerCase().includes(term) || (p.barcode && p.barcode.includes(term)) || (p.cbaCode && p.cbaCode.includes(term));
      });
  }, [products, searchTerm]);

  return (
    <div className="space-y-4 animate-in fade-in">
      
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

      {activeTab === 'quick' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredProducts.map(prod => (
                 <StockCard 
                    key={prod.id}
                    product={prod} 
                    getDisplayStock={getDisplayStock}
                    getParentName={getParentName}
                    onUpdateStock={handleUpdateStock}
                 />
              ))}
          </div>
      )}

      {/* Tabela de Gestão com Coluna ATACADO adicionada */}
      {activeTab === 'management' && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
             <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold">
                    <tr>
                        <th className="p-4">Produto</th>
                        <th className="p-4 text-right">Preço Varejo</th>
                        <th className="p-4 text-right text-emerald-600">Preço Atacado</th>
                        <th className="p-4">Custo</th>
                        <th className="p-4 text-center">Tipo</th>
                        <th className="p-4 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map(prod => (
                        <tr key={prod.id} className="hover:bg-slate-50">
                            <td className="p-4">
                                <div className="font-bold text-slate-800">{prod.name}</div>
                                <div className="text-xs text-slate-500">{prod.barcode || prod.cbaCode}</div>
                            </td>
                            <td className="p-4 text-right font-bold text-slate-700">{masks.currency(prod.price)}</td>
                            <td className="p-4 text-right font-bold text-emerald-600">
                                {prod.wholesalePrice > 0 ? masks.currency(prod.wholesalePrice) : '-'}
                            </td>
                            <td className="p-4 text-slate-500">{masks.currency(prod.cost || prod.costPrice)}</td>
                            <td className="p-4 text-center">
                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${prod.itemType === 'pack' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {prod.itemType === 'pack' ? 'Caixa' : 'Unidade'}
                                </span>
                            </td>
                            <td className="p-4 text-right flex justify-end gap-2">
                                <button onClick={() => handleEdit(prod)} className="bg-blue-100 text-blue-600 p-1.5 rounded hover:bg-blue-200"><Edit size={14}/></button>
                                <button onClick={() => handleDelete(prod.id)} className="bg-red-100 text-red-600 p-1.5 rounded hover:bg-red-200"><Trash2 size={14}/></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
             </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
                    <h2 className="font-bold text-lg flex items-center gap-2">
                        <Package/> {currentProduct.id ? 'Editar Produto' : 'Novo Produto'}
                    </h2>
                    <button onClick={() => setIsModalOpen(false)}><X/></button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                    {/* (O restante do modal é igual ao anterior, mantendo toda a lógica de cadastro) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div className="md:col-span-3">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Código de Barras</label>
                            <div className="relative">
                                <input 
                                    className="w-full border p-2 rounded text-sm pl-8" 
                                    value={currentProduct.barcode} 
                                    onChange={e => setCurrentProduct({...currentProduct, barcode: masks.ean(e.target.value)})}
                                    placeholder="Sem GTIN"
                                />
                                <span className="absolute left-2 top-2.5 text-slate-400"><ScanningIcon/></span>
                            </div>
                        </div>
                        <div className="md:col-span-6">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Descrição</label>
                            <input 
                                className="w-full border p-2 rounded text-sm uppercase" 
                                value={currentProduct.name} 
                                onChange={e => setCurrentProduct({...currentProduct, name: e.target.value.toUpperCase()})}
                                placeholder="Ex: COCA COLA 2L"
                            />
                        </div>
                        <div className="md:col-span-3">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Categoria</label>
                            <input 
                                className="w-full border p-2 rounded text-sm" 
                                value={currentProduct.category} 
                                onChange={e => setCurrentProduct({...currentProduct, category: e.target.value})}
                                list="categories"
                            />
                            <datalist id="categories">
                                <option value="Bebidas"/><option value="Mercearia"/><option value="Limpeza"/>
                            </datalist>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded border border-slate-200 relative">
                        <div className="absolute -top-3 left-4 bg-slate-50 px-2 text-xs font-bold text-slate-500 flex items-center gap-1">
                            <DollarSign size={12}/> Formação de Preço
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Custo (R$)</label>
                                <input 
                                    type="number" step="0.01"
                                    className="w-full border p-2 rounded text-sm" 
                                    value={currentProduct.costPrice} 
                                    onChange={e => handleCostCalculation('costPrice', e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Margem (%)</label>
                                <input 
                                    type="number" step="0.1"
                                    className="w-full border p-2 rounded text-sm" 
                                    value={currentProduct.profitMargin} 
                                    onChange={e => handleCostCalculation('profitMargin', e.target.value)}
                                    placeholder="%"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-blue-700 uppercase">Preço Varejo</label>
                                <input 
                                    type="number" step="0.01"
                                    className="w-full border border-blue-300 bg-blue-50 p-2 rounded text-sm font-bold text-blue-900" 
                                    value={currentProduct.price} 
                                    onChange={e => handleCostCalculation('price', e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-emerald-700 uppercase">Preço Atacado</label>
                                <input 
                                    type="number" step="0.01"
                                    className="w-full border border-emerald-300 bg-emerald-50 p-2 rounded text-sm font-bold text-emerald-900" 
                                    value={currentProduct.wholesalePrice} 
                                    onChange={e => setCurrentProduct({...currentProduct, wholesalePrice: e.target.value})}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                         <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Unidade</label>
                            <select className="w-full border p-2 rounded text-sm bg-white" value={currentProduct.unit} onChange={e => setCurrentProduct({...currentProduct, unit: e.target.value})}>
                                <option>UN</option><option>KG</option><option>CX</option><option>FD</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Estoque</label>
                            <input type="number" className="w-full border p-2 rounded text-sm" value={currentProduct.stock} onChange={e => setCurrentProduct({...currentProduct, stock: e.target.value})}/>
                        </div>
                        <div className="md:col-span-4">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Perfil Tributário</label>
                            <select className="w-full border p-2 rounded text-sm bg-white" value={currentProduct.taxProfileId} onChange={e => setCurrentProduct({...currentProduct, taxProfileId: e.target.value})}>
                                <option value="">-- Selecione --</option>
                                {taxProfiles.map(tp => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">NCM</label>
                            <input className="w-full border p-2 rounded text-sm" value={currentProduct.ncm} onChange={e => setCurrentProduct({...currentProduct, ncm: masks.ncm(e.target.value)})}/>
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">CEST</label>
                            <input className="w-full border p-2 rounded text-sm" value={currentProduct.cest} onChange={e => setCurrentProduct({...currentProduct, cest: masks.cest(e.target.value)})}/>
                        </div>
                    </div>

                    {!currentProduct.id && currentProduct.itemType !== 'pack' && (
                        <div className={`p-4 rounded border transition-all ${createPackMode ? 'bg-purple-50 border-purple-200 shadow-inner' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center gap-2 mb-4">
                                <input 
                                    type="checkbox" 
                                    id="createPack" 
                                    className="w-4 h-4 text-purple-600 rounded"
                                    checked={createPackMode}
                                    onChange={e => setCreatePackMode(e.target.checked)}
                                />
                                <label htmlFor="createPack" className="font-bold text-slate-700 cursor-pointer select-none flex items-center gap-2 text-sm">
                                    <Layers size={18} className="text-purple-600"/>
                                    Deseja cadastrar também a Caixa/Fardo deste item?
                                </label>
                            </div>

                            {createPackMode && (
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 animate-in slide-in-from-top-2">
                                    <div className="md:col-span-3">
                                        <label className="text-[10px] font-bold text-purple-800 uppercase">Cód. Barras da Caixa</label>
                                        <input 
                                            className="w-full border border-purple-200 p-2 rounded text-sm focus:border-purple-500" 
                                            placeholder="EAN da Caixa"
                                            value={packFormData.barcode}
                                            onChange={e => setPackFormData({...packFormData, barcode: masks.ean(e.target.value)})}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-purple-800 uppercase">Qtd na Caixa</label>
                                        <input 
                                            type="number"
                                            className="w-full border border-purple-200 p-2 rounded text-sm focus:border-purple-500 font-bold" 
                                            value={packFormData.quantity}
                                            onChange={e => {
                                                const qtd = e.target.value;
                                                setPackFormData({
                                                    ...packFormData, 
                                                    quantity: qtd,
                                                    costPrice: (Number(currentProduct.costPrice || 0) * Number(qtd)).toFixed(2)
                                                });
                                            }}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-purple-800 uppercase">Custo Caixa</label>
                                        <input 
                                            className="w-full border border-purple-200 p-2 rounded text-sm bg-purple-100 text-purple-700" 
                                            value={packFormData.costPrice}
                                            readOnly
                                            title="Calculado automaticamente"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-purple-800 uppercase">Venda Caixa</label>
                                        <input 
                                            type="number"
                                            className="w-full border border-purple-200 p-2 rounded text-sm focus:border-purple-500" 
                                            value={packFormData.price}
                                            onChange={e => setPackFormData({...packFormData, price: e.target.value})}
                                            placeholder="R$"
                                        />
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="text-[10px] font-bold text-purple-800 uppercase">Atacado Caixa</label>
                                        <input 
                                            type="number"
                                            className="w-full border border-purple-200 p-2 rounded text-sm focus:border-purple-500" 
                                            value={packFormData.wholesalePrice}
                                            onChange={e => setPackFormData({...packFormData, wholesalePrice: e.target.value})}
                                            placeholder="R$"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 bg-slate-50 border-t flex justify-end gap-2 shrink-0">
                    <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded font-bold text-sm">Cancelar</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-slate-800 text-white rounded font-bold text-sm hover:bg-slate-900 flex items-center gap-2">
                        <Save size={16}/> {currentProduct.id ? 'Salvar Alterações' : createPackMode ? 'Salvar Unidade + Caixa' : 'Salvar Produto'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

// Componente simples de icone para input
const ScanningIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>
);

export default InventoryWMS;