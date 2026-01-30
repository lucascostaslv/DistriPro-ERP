import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Plus, Trash2, ArrowRight, User, 
  FileText, CheckSquare, Square, X, Lock, 
  AlertTriangle, Utensils, ChevronLeft
} from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from './firebase'; 

// Formatação Moeda
const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const ComandaManager = ({ storeConfig, products, onSendToCart, currentUser, showNotification, onClose }) => {
  const [comandas, setComandas] = useState([]);
  const [selectedComanda, setSelectedComanda] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados de Criação
  const [isCreating, setIsCreating] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newTableNumber, setNewTableNumber] = useState('');

  // Estados de Adição de Item
  const [productSearch, setProductSearch] = useState('');
  
  // Estados de Seleção para Pagamento
  const [selectedItemsToPay, setSelectedItemsToPay] = useState([]);

  // Modal de Senha para Exclusão
  const [deleteModal, setDeleteModal] = useState(null); // { comanda }
  const [deletePassword, setDeletePassword] = useState('');

  // --- 1. LISTENER REALTIME (Sincronização entre caixas) ---
  useEffect(() => {
      if(!storeConfig?.id) return;
      const q = query(
          collection(db, 'artifacts', String(storeConfig.id), 'public', 'data', 'tabs'), 
          // Pode filtrar por status se quiser arquivar as fechadas
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
          const loaded = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
          // Ordena por data (mais recentes primeiro)
          setComandas(loaded.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      });
      return () => unsubscribe();
  }, [storeConfig]);

  // --- 2. AÇÕES DE COMANDA ---
  
  const handleCreateComanda = async () => {
      if(!newCustomerName) return showNotification('Nome do cliente obrigatório', 'error');
      try {
          await addDoc(collection(db, 'artifacts', String(storeConfig.id), 'public', 'data', 'tabs'), {
              customerName: newCustomerName,
              tableNumber: newTableNumber,
              items: [],
              status: 'OPEN',
              createdAt: serverTimestamp(),
              createdBy: currentUser?.username || 'Sistema'
          });
          setNewCustomerName('');
          setNewTableNumber('');
          setIsCreating(false);
          showNotification('Comanda aberta!', 'success');
      } catch(e) {
          showNotification('Erro ao criar comanda', 'error');
      }
  };

  const handleAddItem = async (product) => {
      if(!selectedComanda) return;
      try {
          const comandaRef = doc(db, 'artifacts', String(storeConfig.id), 'public', 'data', 'tabs', selectedComanda.id);
          
          // Item a ser adicionado (com ID único para permitir parciais)
          const newItem = {
              uniqueId: Date.now() + Math.random().toString(36).substr(2, 9), // ID único do item na lista
              productId: product.id,
              name: product.name,
              price: Number(product.price),
              quantity: 1, // Sempre adiciona 1 por vez ou lógica de qtd
              addedAt: new Date().toISOString(),
              addedBy: currentUser?.username
          };

          await updateDoc(comandaRef, {
              items: arrayUnion(newItem)
          });
          
          // Atualiza localmente para feedback instantâneo (o snapshot vai confirmar depois)
          setSelectedComanda(prev => ({
              ...prev, 
              items: [...(prev.items || []), newItem]
          }));
          
          showNotification('Item adicionado!', 'success');
          setProductSearch('');
      } catch(e) {
          console.error(e);
          showNotification('Erro ao adicionar item', 'error');
      }
  };

  const handleRemoveItem = async (itemToRemove) => {
      if(!window.confirm(`Remover "${itemToRemove.name}" da comanda?`)) return;
      try {
          const comandaRef = doc(db, 'artifacts', String(storeConfig.id), 'public', 'data', 'tabs', selectedComanda.id);
          await updateDoc(comandaRef, {
              items: arrayRemove(itemToRemove)
          });
          // Atualiza visualização local
          setSelectedComanda(prev => ({
              ...prev,
              items: prev.items.filter(i => i.uniqueId !== itemToRemove.uniqueId)
          }));
          showNotification('Item removido.', 'success');
      } catch(e) {
          showNotification('Erro ao remover item', 'error');
      }
  };

  const handleDeleteComanda = async () => {
      // Verifica senha (aqui você pode colocar uma senha fixa ou validar user admin)
      // Exemplo: Senha fixa "1234" ou senha do admin logado
      if(deletePassword !== 'admin123' && deletePassword !== currentUser?.password) { 
          return showNotification('Senha incorreta!', 'error');
      }

      try {
          await deleteDoc(doc(db, 'artifacts', String(storeConfig.id), 'public', 'data', 'tabs', deleteModal.id));
          
          // Opcional: Logar quem deletou (Auditoria)
          // await addDoc(collection(db, 'logs'), { event: 'DELETE_TAB', user: currentUser.username, tab: deleteModal });

          setDeleteModal(null);
          setDeletePassword('');
          if(selectedComanda?.id === deleteModal.id) setSelectedComanda(null);
          showNotification('Comanda cancelada/excluída.', 'success');
      } catch(e) {
          showNotification('Erro ao excluir', 'error');
      }
  };

  // --- 3. CHECKOUT (ENVIAR PARA O PDV) ---
  const handleSendToCart = () => {
      if(selectedItemsToPay.length === 0) return showNotification('Selecione itens para pagar.', 'error');
      
      const itemsToSend = selectedComanda.items.filter(i => selectedItemsToPay.includes(i.uniqueId));
      
      // Mapeia para o formato do Carrinho do PDV
      // Adicionando flags importantes para o PDV saber que veio da comanda
      const cartItems = itemsToSend.map(i => ({
          id: i.productId, // ID do produto (para estoque)
          originalId: i.productId,
          name: i.name,
          price: i.price,
          qty: 1,
          
          // METADADOS DE RASTREIO (Importante para baixa na comanda)
          source: 'tab',
          tabId: selectedComanda.id,
          tabItemId: i.uniqueId 
      }));

      onSendToCart(cartItems);
      onClose(); // Fecha o gerenciador e volta pro PDV
  };

  const toggleSelectAll = () => {
      if(!selectedComanda?.items) return;
      if(selectedItemsToPay.length === selectedComanda.items.length) {
          setSelectedItemsToPay([]);
      } else {
          setSelectedItemsToPay(selectedComanda.items.map(i => i.uniqueId));
      }
  };

  // Filtros de produto para busca interna
  const filteredProducts = useMemo(() => {
      if(!productSearch) return [];
      const term = productSearch.toLowerCase();
      return products.filter(p => p.name.toLowerCase().includes(term) || p.cbaCode?.includes(term));
  }, [products, productSearch]);

  // --- RENDERIZAÇÃO ---

  return (
    <div className="flex h-full bg-slate-100 overflow-hidden">
      
      {/* COLUNA ESQUERDA: LISTA DE COMANDAS */}
      <div className={`flex-shrink-0 w-80 bg-white border-r border-slate-200 flex flex-col ${selectedComanda ? 'hidden md:flex' : 'flex w-full'}`}>
          <div className="p-4 border-b bg-slate-50">
              <div className="flex justify-between items-center mb-3">
                    <button 
                        onClick={onClose} 
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors"
                        title="Voltar ao Caixa"
                    >
                        <ChevronLeft size={24} />
                    </button>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><Utensils size={20}/> Comandas</h3>
                  <button onClick={onClose} className="md:hidden p-2 text-slate-400"><X/></button>
              </div>
              <div className="flex gap-2">
                  <input 
                      className="flex-1 border p-2 rounded text-sm outline-none focus:ring-1 focus:ring-indigo-500" 
                      placeholder="Buscar mesa/cliente..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                  />
                  <button onClick={() => setIsCreating(true)} className="bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700">
                      <Plus size={20}/>
                  </button>
              </div>
          </div>

          {isCreating && (
              <div className="p-4 bg-indigo-50 border-b border-indigo-100 animate-in slide-in-from-top-2">
                  <h4 className="text-xs font-bold text-indigo-700 uppercase mb-2">Nova Comanda</h4>
                  <input className="w-full border p-2 rounded text-sm mb-2" placeholder="Nome do Cliente *" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} autoFocus/>
                  <input className="w-full border p-2 rounded text-sm mb-2" placeholder="Mesa / Identificador" value={newTableNumber} onChange={e => setNewTableNumber(e.target.value)}/>
                  <div className="flex gap-2">
                      <button onClick={() => setIsCreating(false)} className="flex-1 py-1 text-xs font-bold text-slate-500 border rounded bg-white">Cancelar</button>
                      <button onClick={handleCreateComanda} className="flex-1 py-1 text-xs font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700">Abrir</button>
                  </div>
              </div>
          )}

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {comandas.filter(c => c.customerName.toLowerCase().includes(searchTerm.toLowerCase())).map(comanda => {
                  const total = comanda.items?.reduce((acc, i) => acc + (i.price || 0), 0) || 0;
                  return (
                      <div 
                          key={comanda.id} 
                          onClick={() => { setSelectedComanda(comanda); setSelectedItemsToPay([]); }}
                          className={`p-3 rounded border cursor-pointer hover:shadow-md transition-all ${selectedComanda?.id === comanda.id ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' : 'bg-white border-slate-200'}`}
                      >
                          <div className="flex justify-between items-start">
                              <div>
                                  <div className="font-bold text-slate-800">{comanda.customerName}</div>
                                  {comanda.tableNumber && <div className="text-xs text-slate-500 bg-slate-100 px-1.5 rounded w-fit mt-1">Mesa {comanda.tableNumber}</div>}
                              </div>
                              <div className="text-right">
                                  <div className="font-bold text-slate-700">{formatCurrency(total)}</div>
                                  <div className="text-[10px] text-slate-400">{comanda.items?.length || 0} itens</div>
                              </div>
                          </div>
                      </div>
                  );
              })}
              {comandas.length === 0 && <p className="text-center text-slate-400 text-sm py-10">Nenhuma comanda aberta.</p>}
          </div>
      </div>

      {/* COLUNA DIREITA: DETALHES DA COMANDA */}
      {selectedComanda ? (
          <div className="flex-1 flex flex-col h-full bg-white relative">
              {/* HEADER DETALHES */}
              <div className="p-4 border-b flex justify-between items-center bg-slate-50 shadow-sm z-10">
                  <div>
                      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <User size={20} className="text-indigo-600"/> {selectedComanda.customerName}
                          {selectedComanda.tableNumber && <span className="text-sm font-normal text-slate-500"> (Mesa {selectedComanda.tableNumber})</span>}
                      </h2>
                      <p className="text-xs text-slate-400">Aberta em {selectedComanda.createdAt?.seconds ? new Date(selectedComanda.createdAt.seconds * 1000).toLocaleString() : '...'}</p>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={() => setDeleteModal(selectedComanda)} className="text-red-400 hover:text-red-600 p-2 rounded border border-transparent hover:border-red-200 hover:bg-red-50" title="Cancelar Comanda">
                          <Trash2 size={20}/>
                      </button>
                      <button onClick={() => setSelectedComanda(null)} className="md:hidden bg-slate-200 text-slate-600 px-3 py-1 rounded text-sm font-bold">Voltar</button>
                  </div>
              </div>

              {/* BODY: LISTA DE ITENS */}
              <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
                  
                  {/* BARRA DE ADICIONAR PRODUTO */}
                  <div className="mb-4 relative">
                      <div className="flex gap-2">
                          <div className="relative flex-1">
                              <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
                              <input 
                                  className="w-full pl-10 pr-4 py-2 border rounded shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                                  placeholder="Adicionar produto à comanda (Nome ou Código)..."
                                  value={productSearch}
                                  onChange={e => setProductSearch(e.target.value)}
                              />
                          </div>
                      </div>
                      {/* Dropdown de Sugestões */}
                      {productSearch && (
                          <div className="absolute top-full left-0 right-0 bg-white border rounded shadow-xl mt-1 max-h-60 overflow-y-auto z-20">
                              {filteredProducts.map(p => (
                                  <div 
                                      key={p.id} 
                                      className="p-3 border-b hover:bg-indigo-50 cursor-pointer flex justify-between"
                                      onClick={() => handleAddItem(p)}
                                  >
                                      <span className="font-bold text-slate-700">{p.name}</span>
                                      <span className="text-indigo-600 font-bold">{formatCurrency(p.price)}</span>
                                  </div>
                              ))}
                              {filteredProducts.length === 0 && <div className="p-3 text-slate-400 text-sm">Nenhum produto encontrado.</div>}
                          </div>
                      )}
                  </div>

                  {/* LISTA DE ITENS DA COMANDA */}
                  <div className="bg-white rounded border shadow-sm overflow-hidden">
                      <div className="p-2 bg-slate-100 border-b flex justify-between items-center text-xs font-bold text-slate-500 uppercase">
                          <div className="flex items-center gap-2">
                              <button onClick={toggleSelectAll} className="hover:text-indigo-600">
                                  {selectedItemsToPay.length > 0 && selectedItemsToPay.length === selectedComanda.items?.length 
                                      ? <CheckSquare size={18} className="text-indigo-600"/> 
                                      : <Square size={18}/>}
                              </button>
                              <span>Itens ({selectedComanda.items?.length || 0})</span>
                          </div>
                          <span>Subtotal</span>
                      </div>
                      <div className="divide-y">
                          {(selectedComanda.items || []).map((item, idx) => (
                              <div key={item.uniqueId || idx} className="p-3 flex justify-between items-center hover:bg-slate-50 group">
                                  <div className="flex items-center gap-3">
                                      <button 
                                          onClick={() => {
                                              if(selectedItemsToPay.includes(item.uniqueId)) {
                                                  setSelectedItemsToPay(prev => prev.filter(id => id !== item.uniqueId));
                                              } else {
                                                  setSelectedItemsToPay(prev => [...prev, item.uniqueId]);
                                              }
                                          }}
                                          className="text-slate-400 hover:text-indigo-600 transition-colors"
                                      >
                                          {selectedItemsToPay.includes(item.uniqueId) 
                                              ? <CheckSquare size={20} className="text-indigo-600"/> 
                                              : <Square size={20}/>}
                                      </button>
                                      <div>
                                          <div className="font-bold text-slate-700">{item.name}</div>
                                          <div className="text-[10px] text-slate-400">{new Date(item.addedAt).toLocaleTimeString().slice(0,5)} • {item.addedBy || 'sistema'}</div>
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                      <span className="font-bold text-slate-800">{formatCurrency(item.price)}</span>
                                      <button onClick={() => handleRemoveItem(item)} className="text-red-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <Trash2 size={16}/>
                                      </button>
                                  </div>
                              </div>
                          ))}
                          {(!selectedComanda.items || selectedComanda.items.length === 0) && (
                              <div className="p-10 text-center text-slate-400 italic">Comanda vazia. Adicione itens acima.</div>
                          )}
                      </div>
                  </div>
              </div>

              {/* FOOTER: AÇÕES */}
              <div className="p-4 border-t bg-white z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                  <div className="flex justify-between items-end mb-4">
                      <div>
                          <p className="text-xs text-slate-500 uppercase font-bold">Total Geral</p>
                          <p className="text-2xl font-bold text-slate-800">
                              {formatCurrency((selectedComanda.items || []).reduce((a, b) => a + b.price, 0))}
                          </p>
                      </div>
                      <div className="text-right">
                          <p className="text-xs text-indigo-600 uppercase font-bold">Selecionado p/ Pagar</p>
                          <p className="text-xl font-bold text-indigo-700">
                              {formatCurrency(
                                  (selectedComanda.items || [])
                                  .filter(i => selectedItemsToPay.includes(i.uniqueId))
                                  .reduce((a, b) => a + b.price, 0)
                              )}
                          </p>
                      </div>
                  </div>
                  <button 
                      onClick={handleSendToCart}
                      disabled={selectedItemsToPay.length === 0}
                      className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-slate-900 disabled:bg-slate-300 disabled:cursor-not-allowed flex justify-center items-center gap-2 transition-colors"
                  >
                      <span>Ir para Pagamento (PDV)</span>
                      <ArrowRight size={20}/>
                  </button>
              </div>
          </div>
      ) : (
          <div className="flex-1 hidden md:flex items-center justify-center bg-slate-50 text-slate-400 flex-col gap-4">
              <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center">
                  <Utensils size={40} className="text-slate-400"/>
              </div>
              <p>Selecione ou abra uma comanda para começar.</p>
          </div>
      )}

      {/* MODAL EXCLUIR */}
      {deleteModal && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
              <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl">
                  <h3 className="font-bold text-red-600 flex items-center gap-2 mb-4"><AlertTriangle/> Cancelar Comanda?</h3>
                  <p className="text-sm text-slate-600 mb-4">Isso excluirá permanentemente a comanda de <strong>{deleteModal.customerName}</strong> e seus itens. Essa ação requer senha.</p>
                  
                  <label className="text-xs font-bold text-slate-500 uppercase">Senha de Autorização</label>
                  <div className="flex items-center border p-2 rounded mt-1 mb-6 focus-within:ring-2 ring-red-200">
                      <Lock size={16} className="text-slate-400 mr-2"/>
                      <input 
                          type="password" 
                          className="w-full outline-none text-sm"
                          placeholder="Senha Admin/Gerente"
                          value={deletePassword}
                          onChange={e => setDeletePassword(e.target.value)}
                          autoFocus
                      />
                  </div>
                  
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setDeleteModal(null)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded font-bold text-sm">Voltar</button>
                      <button onClick={handleDeleteComanda} className="px-4 py-2 bg-red-600 text-white rounded font-bold text-sm hover:bg-red-700">Confirmar Exclusão</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default ComandaManager;