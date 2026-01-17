import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Plus, Edit, Trash2, Package, Save, X, AlertTriangle, 
  CheckCircle, BarChart3
} from 'lucide-react';
import { collection, doc, updateDoc, deleteDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from './firebase'; 
import { supabase } from './supabaseClient';

// Máscaras de Proteção
const masks = {
  ncm: (val) => val ? String(val).replace(/\D/g, '').replace(/^(\d{4})(\d{2})(\d{2})/, '$1.$2.$3').substring(0, 10) : '',
  ean: (val) => val ? String(val).replace(/\D/g, '').substring(0, 14) : '',
};

// RECEBE 'products' COMO PROPRIEDADE (Vindo do App.js)
const InventoryWMS = ({ storeConfig, showNotification, products = [] }) => {
  const [taxProfiles, setTaxProfiles] = useState([]); 
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);

  // 1. CARREGAR PERFIS (A única coisa que ele busca sozinho agora)
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
    
    // NOTA: Removemos o listener de products daqui. 
    // Ele agora usa o 'products' que vem via props do App.js.
  }, [storeConfig]);

  // 2. LÓGICA DO MODAL
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
      stock: prod.stock || 0
    });
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setCurrentProduct({
      name: '', price: 0, cost: 0, stock: 0,
      ncm: '', taxProfileId: '', unit: 'UN', ean: '', origin: '0'
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    const storeIdStr = String(storeConfig.id);

    try {
      if (!currentProduct.name) return showNotification('Nome é obrigatório', 'error');
      
      const payload = {
        name: currentProduct.name.toUpperCase(),
        price: Number(currentProduct.price),
        cost: Number(currentProduct.cost || 0),
        stock: Number(currentProduct.stock),
        // Campos Fiscais
        ncm: currentProduct.ncm ? String(currentProduct.ncm).replace(/\D/g, '') : '',
        taxProfileId: currentProduct.taxProfileId || null,
        unit: currentProduct.unit,
        ean: currentProduct.ean,
        origin: currentProduct.origin,
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

  // Filtra a lista recebida via Props
  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase();
    // Proteção extra caso products venha nulo
    const list = Array.isArray(products) ? products : []; 
    
    return list.filter(p => 
      (p.name || '').toLowerCase().includes(term) || 
      String(p.cbaCode || '').includes(term)
    );
  }, [products, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-indigo-600"/> Gestão de Estoque & Fiscal
        </h2>
        <button onClick={handleAddNew} className="bg-slate-800 text-white px-4 py-2 rounded font-bold hover:bg-slate-700 flex gap-2">
            <Plus size={20}/> Novo Produto
        </button>
      </div>

      <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
          <input 
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="Buscar por nome, código ou NCM..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
      </div>

      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-bold">
                <tr>
                    <th className="p-4">Produto</th>
                    <th className="p-4">Fiscal (NCM / Perfil)</th>
                    <th className="p-4 text-right">Preço</th>
                    <th className="p-4 text-center">Estoque</th>
                    <th className="p-4 text-right">Ações</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredProducts.map(product => {
                    const profile = taxProfiles.find(tp => tp.id === product.taxProfileId);
                    const isFiscalReady = product.ncm && product.taxProfileId;

                    return (
                        <tr key={product.id} className="hover:bg-slate-50">
                            <td className="p-4">
                                <div className="font-bold text-slate-800">{product.name}</div>
                                <div className="text-xs text-slate-500">EAN: {product.ean || 'Sem GTIN'}</div>
                            </td>
                            <td className="p-4">
                                {isFiscalReady ? (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-mono bg-slate-100 px-1 rounded w-fit border border-slate-200">{masks.ncm(product.ncm)}</span>
                                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1 rounded w-fit flex items-center gap-1 border border-emerald-100">
                                            <CheckCircle size={10}/> {profile?.name}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-amber-600 font-bold flex items-center gap-1 bg-amber-50 px-2 py-1 rounded w-fit border border-amber-100">
                                            <AlertTriangle size={12}/> Incompleto
                                        </span>
                                        {!product.ncm && <span className="text-[9px] text-red-500">Falta NCM</span>}
                                        {!product.taxProfileId && <span className="text-[9px] text-red-500">Falta Perfil</span>}
                                    </div>
                                )}
                            </td>
                            <td className="p-4 text-right font-medium">R$ {Number(product.price).toFixed(2)}</td>
                            <td className="p-4 text-center">
                                <span className={`font-bold px-2 py-1 rounded text-xs ${product.stock < 5 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                                    {product.stock} {product.unit || 'UN'}
                                </span>
                            </td>
                            <td className="p-4 text-right flex justify-end gap-2">
                                <button onClick={() => handleEdit(product)} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded"><Edit size={18}/></button>
                                <button onClick={() => handleDelete(product.id)} className="text-slate-400 hover:text-red-500 p-2 rounded"><Trash2 size={18}/></button>
                            </td>
                        </tr>
                    );
                })}
                {filteredProducts.length === 0 && (
                    <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400">Nenhum produto encontrado.</td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>

      {isModalOpen && currentProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
                    <h3 className="font-bold flex items-center gap-2"><Edit size={18}/> Editar Produto</h3>
                    <button onClick={() => setIsModalOpen(false)}><X size={20}/></button>
                </div>
                
                <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-4 max-h-[80vh] overflow-y-auto">
                    <div className="md:col-span-8">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Nome do Produto</label>
                        <input className="w-full border p-2 rounded text-sm" value={currentProduct.name} onChange={e => setCurrentProduct({...currentProduct, name: e.target.value})} />
                    </div>
                    <div className="md:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 mb-1">EAN / GTIN</label>
                        <input className="w-full border p-2 rounded text-sm" value={currentProduct.ean} onChange={e => setCurrentProduct({...currentProduct, ean: masks.ean(e.target.value)})} placeholder="Sem GTIN" />
                    </div>

                    <div className="md:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Preço Venda</label>
                        <input type="number" className="w-full border p-2 rounded text-sm font-bold" value={currentProduct.price} onChange={e => setCurrentProduct({...currentProduct, price: e.target.value})} />
                    </div>
                    <div className="md:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Estoque</label>
                        <input type="number" className="w-full border p-2 rounded text-sm" value={currentProduct.stock} onChange={e => setCurrentProduct({...currentProduct, stock: e.target.value})} />
                    </div>
                    <div className="md:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Unidade</label>
                        <select className="w-full border p-2 rounded text-sm" value={currentProduct.unit} onChange={e => setCurrentProduct({...currentProduct, unit: e.target.value})}>
                            <option value="UN">UN - Unidade</option>
                            <option value="KG">KG - Quilograma</option>
                            <option value="CX">CX - Caixa</option>
                            <option value="LT">LT - Litro</option>
                        </select>
                    </div>

                    <div className="md:col-span-12 my-2 border-t pt-2 bg-indigo-50 p-2 rounded border border-indigo-100">
                        <p className="text-xs font-bold text-indigo-700 mb-2 flex items-center gap-1"><BarChart3 size={14}/> Configuração Fiscal (NF-e)</p>
                        
                        <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-4">
                                <label className="block text-[10px] font-bold text-indigo-600 mb-1">NCM (8 dígitos)</label>
                                <input 
                                    className="w-full border border-indigo-200 p-2 rounded text-sm" 
                                    value={masks.ncm(currentProduct.ncm)} 
                                    onChange={e => setCurrentProduct({...currentProduct, ncm: e.target.value})} 
                                    placeholder="0000.00.00"
                                />
                                <a href="https://portalunico.siscomex.gov.br/classif/#/nomenclatura/ncm" target="_blank" rel="noreferrer" className="text-[9px] text-blue-500 underline ml-1">Consultar NCM</a>
                            </div>

                            <div className="col-span-8">
                                <label className="block text-[10px] font-bold text-indigo-600 mb-1">Perfil Tributário (Regra de Imposto)</label>
                                <select 
                                    className="w-full border border-indigo-200 p-2 rounded text-sm bg-white" 
                                    value={currentProduct.taxProfileId || ''} 
                                    onChange={e => setCurrentProduct({...currentProduct, taxProfileId: e.target.value})}
                                >
                                    <option value="">-- Selecione um Perfil --</option>
                                    {taxProfiles.map(tp => (
                                        <option key={tp.id} value={tp.id}>{tp.name} (Origem: {tp.origin})</option>
                                    ))}
                                </select>
                                {taxProfiles.length === 0 && <p className="text-[10px] text-red-500 mt-1">Nenhum perfil criado em Configurações.</p>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 flex justify-end gap-2 border-t">
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