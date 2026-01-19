import React, { useState, useMemo, useEffect } from 'react';
import { 
  Tags, Plus, Trash2, Search, Save, 
  CheckCircle, AlertTriangle, RefreshCw, Edit, X 
} from 'lucide-react';
import { 
  collection, doc, setDoc, updateDoc, 
  onSnapshot, writeBatch 
} from "firebase/firestore";
import { db } from './firebase'; // Importa a instância do banco

const formatCurrency = (val) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export default function PriceGroups({ 
  products, // Recebe a lista de produtos (que já vem do realtime do App.js ou pode ser consultada aqui também)
  showNotification 
}) {
  const [priceGroups, setPriceGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [newGroup, setNewGroup] = useState({ name: '', margin: '' });
  const [editingId, setEditingId] = useState(null); 
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Helper para pegar o ID da loja atual (mesma lógica do App.js)
  const getAppId = () => typeof window.__app_id !== 'undefined' ? String(window.__app_id) : 'default-app';

  // --- 1. LISTENER REALTIME (Consultar Grupos do Banco) ---
  useEffect(() => {
    const appId = getAppId();
    // Define a coleção 'priceGroups' dentro da estrutura de artifacts da loja
    const groupsRef = collection(db, 'artifacts', appId, 'public', 'data', 'priceGroups');

    const unsubscribe = onSnapshot(groupsRef, (snapshot) => {
      const groupsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPriceGroups(groupsData);
      setIsLoading(false);
    }, (error) => {
      console.error("Erro ao buscar grupos:", error);
      showNotification('Erro ao carregar grupos de preço.', 'error');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [showNotification]);

  // --- CRUD GRUPOS (Escrita no Banco) ---
  const handleSaveGroup = async () => {
    if (!newGroup.name || !newGroup.margin) return showNotification('Preencha nome e margem.', 'error');
    
    const marginValue = parseFloat(String(newGroup.margin).replace(',', '.'));
    const appId = getAppId();

    try {
      if (editingId) {
        // Edição: Atualiza documento existente
        const groupRef = doc(db, 'artifacts', appId, 'public', 'data', 'priceGroups', editingId);
        await updateDoc(groupRef, {
          name: newGroup.name,
          margin: marginValue
        });

        // Atualiza estado local de visualização se necessário
        if (activeGroup && activeGroup.id === editingId) {
            setActiveGroup({ ...activeGroup, name: newGroup.name, margin: marginValue });
        }
        showNotification('Grupo atualizado com sucesso!', 'success');
        setEditingId(null);
      } else {
        // Criação: Cria novo documento com ID gerado automaticamente ou timestamp
        const newId = Date.now().toString();
        const groupRef = doc(db, 'artifacts', appId, 'public', 'data', 'priceGroups', newId);
        
        await setDoc(groupRef, {
          id: newId,
          name: newGroup.name,
          margin: marginValue || 0
        });
        showNotification('Grupo criado com sucesso!', 'success');
      }
      setNewGroup({ name: '', margin: '' });

    } catch (error) {
      console.error("Erro ao salvar grupo:", error);
      showNotification('Erro ao salvar no banco de dados.', 'error');
    }
  };

  const handleDeleteGroup = async (id) => {
    if (!window.confirm("Ao excluir o grupo, os produtos vinculados perderão a automação. Continuar?")) return;
    
    const appId = getAppId();
    const batch = writeBatch(db);

    try {
      // 1. Deletar o grupo
      const groupRef = doc(db, 'artifacts', appId, 'public', 'data', 'priceGroups', id);
      batch.delete(groupRef);

      // 2. Desvincular produtos que pertencem a este grupo
      // Precisamos filtrar quais produtos tem esse ID e atualizar no banco
      const productsInGroup = products.filter(p => p.priceGroupId === id);
      
      productsInGroup.forEach(p => {
        const productRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', p.id);
        batch.update(productRef, { priceGroupId: null }); // Remove o campo ou seta null
      });

      await batch.commit(); // Executa tudo de uma vez
      
      if (activeGroup?.id === id) setActiveGroup(null);
      if (editingId === id) {
          setEditingId(null);
          setNewGroup({ name: '', margin: '' });
      }

      showNotification('Grupo removido e produtos desvinculados.', 'success');
    } catch (error) {
      console.error("Erro ao excluir:", error);
      showNotification('Erro ao excluir grupo.', 'error');
    }
  };

  const handleEditClick = (group, e) => {
    e.stopPropagation(); 
    setNewGroup({ name: group.name, margin: group.margin });
    setEditingId(group.id);
  };

  const handleCancelEdit = () => {
    setNewGroup({ name: '', margin: '' });
    setEditingId(null);
  };

  // --- VINCULAÇÃO DE PRODUTOS (Escrita Direta na Coleção Products) ---
  const handleAddProductToGroup = async (product) => {
    if (!activeGroup) return;
    const appId = getAppId();

    try {
      const productRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', product.id);
      await updateDoc(productRef, { priceGroupId: activeGroup.id });
      
      showNotification(`${product.name} adicionado ao grupo.`, 'success');
    } catch (error) {
      console.error("Erro ao vincular produto:", error);
      showNotification('Erro ao atualizar produto.', 'error');
    }
  };

  const handleRemoveProductFromGroup = async (productId) => {
    const appId = getAppId();
    try {
      const productRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', productId);
      await updateDoc(productRef, { priceGroupId: null });
      showNotification('Produto removido do grupo.', 'success');
    } catch (error) {
      console.error("Erro ao desvincular:", error);
      showNotification('Erro ao atualizar banco de dados.', 'error');
    }
  };

  // --- SINCRONIZAÇÃO EM LOTE (Batch Update) ---
  const handleBatchSync = async () => {
    if (!activeGroup) return;
    if (!window.confirm(`Atualizar preço de TODOS os produtos deste grupo (Margem ${activeGroup.margin}%)?`)) return;

    const appId = getAppId();
    const batch = writeBatch(db);
    let updateCount = 0;

    // Filtra produtos do grupo atual
    const productsInGroup = products.filter(p => p.priceGroupId === activeGroup.id);

    productsInGroup.forEach(p => {
      const cost = Number(p.cost) || 0;
      const newPrice = cost * (1 + (activeGroup.margin / 100));
      
      // Só atualiza se houver diferença de centavos
      if (Math.abs(newPrice - p.price) > 0.01) {
        const productRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', p.id);
        batch.update(productRef, { price: newPrice });
        updateCount++;
      }
    });

    if (updateCount > 0) {
        try {
          await batch.commit();
          showNotification(`${updateCount} produtos atualizados com sucesso!`, 'success');
        } catch (error) {
          console.error("Erro no batch:", error);
          showNotification('Erro ao sincronizar preços.', 'error');
        }
    } else {
        showNotification('Todos os produtos já estão com o preço correto.', 'info');
    }
  };

  // --- DADOS COMPUTADOS (Hooks) ---
  const groupProducts = useMemo(() => {
    if (!activeGroup) return [];
    return products.filter(p => p.priceGroupId === activeGroup.id);
  }, [products, activeGroup]);

  const searchResults = useMemo(() => {
    if (!searchTerm || !activeGroup) return [];
    const term = searchTerm.toLowerCase();
    // Filtra produtos que NÃO estão no grupo atual e batem com a busca
    return products.filter(p => 
      p.priceGroupId !== activeGroup.id && 
      (p.name.toLowerCase().includes(term) || String(p.cbaCode).includes(term))
    ).slice(0, 10);
  }, [products, searchTerm, activeGroup]);

  // --- RENDERIZAÇÃO ---
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
      
      {/* PAINEL ESQUERDO: LISTA E FORMULÁRIO */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col">
        <div className="p-4 border-b bg-slate-50">
           <h3 className="font-bold text-slate-700 flex items-center gap-2"><Tags size={18}/> Grupos de Preço</h3>
        </div>
        
        <div className={`p-4 border-b space-y-2 transition-colors ${editingId ? 'bg-amber-50' : 'bg-slate-50/50'}`}>
            <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold uppercase text-slate-500">
                    {editingId ? 'Editando Grupo' : 'Novo Grupo'}
                </span>
                {editingId && (
                    <button onClick={handleCancelEdit} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                        <X size={12}/> Cancelar
                    </button>
                )}
            </div>
            <input 
              className={`w-full border p-2 rounded text-sm outline-none ${editingId ? 'border-amber-300 ring-1 ring-amber-300' : 'border-slate-300'}`}
              placeholder="Nome (ex: Bebidas)"
              value={newGroup.name}
              onChange={e => setNewGroup({...newGroup, name: e.target.value})}
            />
            <div className="flex gap-2">
              <input 
                className={`w-24 border p-2 rounded text-sm outline-none ${editingId ? 'border-amber-300 ring-1 ring-amber-300' : 'border-slate-300'}`}
                placeholder="Margem %"
                type="number"
                value={newGroup.margin}
                onChange={e => setNewGroup({...newGroup, margin: e.target.value})}
              />
              <button 
                onClick={handleSaveGroup} 
                className={`flex-1 text-white rounded text-xs font-bold flex items-center justify-center gap-2 transition-colors ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-800 hover:bg-slate-700'}`}
              >
                {editingId ? <Save size={16}/> : <Plus size={16}/>}
                {editingId ? 'Salvar' : 'Criar'}
              </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {isLoading && <p className="text-center text-slate-400 text-sm mt-4">Carregando grupos...</p>}
            {!isLoading && priceGroups.length === 0 && <p className="text-center text-slate-400 text-sm mt-4">Nenhum grupo criado.</p>}
            
            {priceGroups.map(group => (
                <div 
                  key={group.id}
                  onClick={() => setActiveGroup(group)}
                  className={`group p-3 rounded border cursor-pointer transition-all flex justify-between items-center ${activeGroup?.id === group.id ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300' : 'bg-white border-slate-200 hover:border-indigo-200'}`}
                >
                    <div>
                        <div className="font-bold text-slate-800 text-sm">{group.name}</div>
                        <div className="text-xs text-slate-500">Markup: <span className="font-bold text-indigo-600">{group.margin}%</span></div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <button 
                          onClick={(e) => handleEditClick(group, e)}
                          className="p-1 text-slate-300 hover:text-amber-500 hover:bg-amber-50 rounded transition-colors"
                          title="Editar"
                        >
                            <Edit size={14} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                          className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Excluir"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
      </div>

      {/* PAINEL DIREITO: DETALHES */}
      <div className="md:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col">
          {!activeGroup ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                  <Tags size={48} className="mb-4 opacity-20"/>
                  <p>Selecione um grupo para gerenciar produtos e preços.</p>
              </div>
          ) : (
              <>
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800">{activeGroup.name}</h3>
                        <p className="text-xs text-slate-500">Produtos vinculados: {groupProducts.length}</p>
                    </div>
                    <button 
                      onClick={handleBatchSync}
                      className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-sm"
                    >
                        <RefreshCw size={16}/> Sincronizar Preços (Lote)
                    </button>
                </div>

                <div className="p-4 border-b bg-white">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                        <input 
                            className="w-full pl-9 pr-4 py-2 border rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Buscar produtos para adicionar..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {searchResults.length > 0 && (
                        <div className="mt-2 border rounded bg-slate-50 shadow-inner max-h-40 overflow-y-auto">
                            {searchResults.map(p => (
                                <div key={p.id} className="p-2 flex justify-between items-center hover:bg-white border-b last:border-0 text-sm">
                                    <span>{p.name}</span>
                                    <button onClick={() => handleAddProductToGroup(p)} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-bold hover:bg-green-200">
                                        Adicionar
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-0">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0 shadow-sm z-10">
                            <tr>
                                <th className="p-3">Produto</th>
                                <th className="p-3 text-right">Custo</th>
                                <th className="p-3 text-right">Venda Atual</th>
                                <th className="p-3 text-right text-indigo-600">Sugerido</th>
                                <th className="p-3 text-center">Status</th>
                                <th className="p-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {groupProducts.map(p => {
                                const cost = Number(p.cost) || 0;
                                const suggested = cost * (1 + (activeGroup.margin / 100));
                                const current = Number(p.price) || 0;
                                const diff = Math.abs(suggested - current);
                                const isDivergent = diff > 0.05;

                                return (
                                    <tr key={p.id} className="hover:bg-slate-50">
                                        <td className="p-3 font-medium text-slate-700">{p.name}</td>
                                        <td className="p-3 text-right text-slate-500">{formatCurrency(cost)}</td>
                                        <td className="p-3 text-right font-bold">{formatCurrency(current)}</td>
                                        <td className="p-3 text-right text-indigo-600 font-bold bg-indigo-50/30">
                                            {formatCurrency(suggested)}
                                        </td>
                                        <td className="p-3 text-center">
                                            {isDivergent ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-amber-100 text-amber-700" title="Preço diferente da margem do grupo">
                                                    <AlertTriangle size={10}/> Divergente
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-green-100 text-green-700">
                                                    <CheckCircle size={10}/> OK
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-right">
                                            <button 
                                                onClick={() => handleRemoveProductFromGroup(p.id)}
                                                className="text-slate-300 hover:text-red-500"
                                                title="Desvincular do grupo"
                                            >
                                                <Trash2 size={16}/>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {groupProducts.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center text-slate-400">
                                        Nenhum produto neste grupo.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
              </>
          )}
      </div>
    </div>
  );
}