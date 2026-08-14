import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  User,
  FileText,
  CheckSquare,
  Square,
  X,
  Lock,
  AlertTriangle,
  Utensils,
  ChevronLeft,
  Wine,
} from "lucide-react";
import { useTenant } from "./contexts/TenantContext";

// Formatação Moeda
const formatCurrency = (val) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    val,
  );

const ComandaManager = ({
  storeConfig,
  products,
  onSendToCart,
  currentUser,
  showNotification,
  onClose,
  renderDosePanel,
}) => {
  const { tenantDB } = useTenant();

  const [comandas, setComandas] = useState([]);
  const [selectedComanda, setSelectedComanda] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Estados de Criação
  const [isCreating, setIsCreating] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newTableNumber, setNewTableNumber] = useState("");
  const [addQty, setAddQty] = useState(1);

  // Estados de Adição de Item
  const [productSearch, setProductSearch] = useState("");

  // Estados de Seleção para Pagamento
  const [selectedItemsToPay, setSelectedItemsToPay] = useState([]);

  // Modal de Senha para Exclusão
  const [deleteModal, setDeleteModal] = useState(null); // { comanda }
  const [deletePassword, setDeletePassword] = useState("");

  // NOVO: Estado para controlar a exibição do Modal de Doses dentro das comandas
  const [isDosePanelOpen, setIsDosePanelOpen] = useState(false);

  const searchInputRef = React.useRef(null);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(-1);

  // Reseta índice quando a busca muda
  useEffect(() => {
    setSelectedSearchIndex(-1);
  }, [productSearch]);

  // Listener para F9 e F12
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const isTyping =
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable;

      if (e.key === "F9" && !isTyping) {
        e.preventDefault();
        setIsDosePanelOpen((prev) => !prev);
      }
      // Localize o handleGlobalKeyDown dentro do ComandaManager.js
      if (e.key === "F12") {
        e.preventDefault();

        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current.blur();
          setProductSearch(""); // Opcional: limpa o texto ao sair
        } else {
          searchInputRef.current?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const handleSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSearchIndex((prev) =>
        Math.min(prev + 1, filteredProducts.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSearchIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedSearchIndex >= 0 && filteredProducts[selectedSearchIndex]) {
        handleAddItem(filteredProducts[selectedSearchIndex]);
      } else if (filteredProducts.length === 1) {
        handleAddItem(filteredProducts[0]);
      }
    }
  };

  // 3. Função que processa a dose escolhida no modal
  const handleAddDose = async (doseItem) => {
    if (!selectedComanda)
      return showNotification("Selecione uma comanda primeiro.", "error");

    try {

      // Agrupa se já tiver a MESMA dose (mesma garrafa) na comanda
      const existingItemIndex = (selectedComanda.items || []).findIndex(
        (i) => i.bottleId === doseItem.bottleId,
      );
      let newItems = [...(selectedComanda.items || [])];

      if (existingItemIndex >= 0) {
        newItems[existingItemIndex].quantity =
          (newItems[existingItemIndex].quantity || 1) + doseItem.qty;
      } else {
        newItems.push({
          uniqueId: Date.now() + Math.random().toString(36).substr(2, 9),
          productId: doseItem.id, // ID original
          bottleId: doseItem.bottleId, // Crucial para não bugar
          isDose: true, // Avisa o sistema que é dose
          name: doseItem.name,
          price: Number(doseItem.price),
          quantity: doseItem.qty,
          addedAt: new Date().toISOString(),
          addedBy: currentUser?.username,
        });
      }

      await tenantDB.firestore.update('tabs', selectedComanda.id, { items: newItems });
      setSelectedComanda((prev) => ({ ...prev, items: newItems }));
      showNotification(`Dose adicionada com sucesso!`, "success");
    } catch (e) {
      showNotification("Erro ao adicionar dose", "error");
    }
  };

  // --- 1. LISTENER REALTIME (Sincronização entre caixas) ---
  useEffect(() => {
    if (!tenantDB) return;

    const unsubscribe = tenantDB.firestore.subscribe("tabs", (loaded) => {
      // Ordena por data (mais recentes primeiro)
      setComandas(
        loaded.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
        ),
      );
    });

    return () => unsubscribe();
  }, [tenantDB]);

  // Resincroniza a comanda aberta neste terminal sempre que a lista realtime mudar — sem isso,
  // uma edição concorrente em outro caixa (ou terminal) na MESMA comanda nunca chegava até aqui,
  // e a próxima mutação local (handleAddItem/handleUpdateQty/handleRemoveItem/handleAddDose)
  // recalculava `items` a partir do estado antigo e sobrescrevia a edição do outro terminal.
  useEffect(() => {
    if (!selectedComanda) return;
    const updated = comandas.find((c) => c.id === selectedComanda.id);
    if (updated) setSelectedComanda(updated);
  }, [comandas]);

  // --- 2. AÇÕES DE COMANDA ---
  const handleCreateComanda = async () => {
    if (!newCustomerName)
      return showNotification("Nome do cliente obrigatório", "error");
    try {
      await tenantDB.firestore.add("tabs", {
        customerName: newCustomerName,
        tableNumber: newTableNumber,
        items: [],
        status: "OPEN",
        createdAt: tenantDB.firestore.utils.serverTimestamp(), // Usa o timestamp do Contexto!
        createdBy: currentUser?.username || "Sistema",
      });
      setNewCustomerName("");
      setNewTableNumber("");
      setIsCreating(false);
      showNotification("Comanda aberta!", "success");
    } catch (e) {
      showNotification("Erro ao criar comanda", "error");
    }
  };

  const handleAddItem = async (product) => {
    if (!selectedComanda) return;
    try {

      const existingItem = (selectedComanda.items || []).find(
        (i) => i.productId === product.id,
      );
      let newItems;

      if (existingItem) {
        // Se já tem, soma a quantidade do multiplicador
        newItems = selectedComanda.items.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: (i.quantity || 1) + addQty }
            : i,
        );
      } else {
        // Se não tem, cria um novo com a quantidade do multiplicador
        const newItem = {
          uniqueId: Date.now() + Math.random().toString(36).substr(2, 9),
          productId: product.id,
          name: product.name,
          price: Number(product.price),
          quantity: addQty,
          addedAt: new Date().toISOString(),
          addedBy: currentUser?.username,
        };
        newItems = [...(selectedComanda.items || []), newItem];
      }

      await tenantDB.firestore.update('tabs', selectedComanda.id, { items: newItems });
      setSelectedComanda((prev) => ({ ...prev, items: newItems }));
      showNotification(`Item adicionado (${addQty}x)!`, "success");
      setProductSearch("");
      setAddQty(1); // Reseta a quantidade após adicionar
    } catch (e) {
      console.error(e);
      showNotification("Erro ao adicionar item", "error");
    }
  };

  const handleUpdateQty = async (itemUniqueId, delta) => {
    if (!selectedComanda) return;
    const item = selectedComanda.items.find((i) => i.uniqueId === itemUniqueId);
    if (!item) return;

    const newQty = (item.quantity || 1) + delta;

    if (newQty <= 0) {
      handleRemoveItem(item);
      return;
    }

    const newItems = selectedComanda.items.map((i) =>
      i.uniqueId === itemUniqueId ? { ...i, quantity: newQty } : i,
    );

    try {
    await tenantDB.firestore.update('tabs', selectedComanda.id, { items: newItems });
      setSelectedComanda((prev) => ({ ...prev, items: newItems }));
    } catch (e) {
      showNotification("Erro ao atualizar quantidade", "error");
    }
  };

  const handleRemoveItem = async (itemToRemove) => {
    if (!window.confirm(`Remover "${itemToRemove.name}" da comanda?`)) return;
    try {
      const newItems = selectedComanda.items.filter(
        (i) => i.uniqueId !== itemToRemove.uniqueId,
      );


      await tenantDB.firestore.update('tabs', selectedComanda.id, { items: newItems });
      setSelectedComanda((prev) => ({ ...prev, items: newItems }));
      setSelectedItemsToPay((prev) =>
        prev.filter((id) => id !== itemToRemove.uniqueId),
      );
      showNotification("Item removido.", "success");
    } catch (e) {
      showNotification("Erro ao remover item", "error");
    }
  };

  const handleDeleteComanda = async () => {
    // Verifica senha
    if (
      deletePassword !== "admin123" &&
      deletePassword !== currentUser?.password
    ) {
      return showNotification("Senha incorreta!", "error");
    }

    try {
      await tenantDB.firestore.delete("tabs", deleteModal.id);

      setDeleteModal(null);
      setDeletePassword("");
      if (selectedComanda?.id === deleteModal.id) setSelectedComanda(null);
      showNotification("Comanda cancelada/excluída.", "success");
    } catch (e) {
      showNotification("Erro ao excluir", "error");
    }
  };

  // --- 3. CHECKOUT (ENVIAR PARA O PDV) ---
  const handleSendToCart = () => {
    if (selectedItemsToPay.length === 0)
      return showNotification("Selecione itens para pagar.", "error");

    const itemsToSend = selectedComanda.items.filter((i) =>
      selectedItemsToPay.includes(i.uniqueId),
    );

    const cartItems = itemsToSend.map((i) => {
      // Encontra o produto em tempo real para obter o preço de cartão atualizado
      const liveProd = products.find(p => p.id === i.productId);
      
      return {
        id: i.productId,
        originalId: i.productId,
        name: i.name,
        price: i.price, // Preço padrão da comanda
        cardPrice: liveProd ? (Number(liveProd.cardPrice) || 0) : 0, // ✨ Envia o preço de cartão oculto para o PDV
        qty: i.quantity || 1,
        bottleId: i.bottleId,
        isDose: i.isDose,
        source: "tab",
        tabId: selectedComanda.id,
        tabItemId: i.uniqueId,
      };
    });

    onSendToCart(cartItems);
    onClose();
  };

  const toggleSelectAll = () => {
    if (!selectedComanda?.items) return;
    if (selectedItemsToPay.length === selectedComanda.items.length) {
      setSelectedItemsToPay([]);
    } else {
      setSelectedItemsToPay(selectedComanda.items.map((i) => i.uniqueId));
    }
  };

  // Filtros de produto para busca interna
  const filteredProducts = useMemo(() => {
    if (!productSearch) return [];
    const term = productSearch.toLowerCase();
    return products.filter(
      // ✨ Blindagem: (p.name || "")
      (p) => (p.name || "").toLowerCase().includes(term) || p.cbaCode?.includes(term),
    );
  }, [products, productSearch]);

  return (
    <div className="flex h-full bg-slate-100 overflow-hidden">
      {/* COLUNA ESQUERDA: LISTA DE COMANDAS */}
      <div
        className={`flex-shrink-0 w-80 bg-white border-r border-slate-200 flex flex-col ${selectedComanda ? "hidden md:flex" : "flex w-full"}`}
      >
        <div className="p-4 border-b bg-slate-50">
          <div className="flex justify-between items-center mb-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors"
              title="Voltar ao Caixa"
            >
              <ChevronLeft size={24} />
            </button>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Utensils size={20} /> Comandas
            </h3>
            <button onClick={onClose} className="md:hidden p-2 text-slate-400">
              <X />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 border p-2 rounded text-sm outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Buscar mesa/cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button
              onClick={() => setIsCreating(true)}
              className="bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {isCreating && (
          <div className="p-4 bg-indigo-50 border-b border-indigo-100 animate-in slide-in-from-top-2">
            <h4 className="text-xs font-bold text-indigo-700 uppercase mb-2">
              Nova Comanda
            </h4>
            <input
              className="w-full border p-2 rounded text-sm mb-2"
              placeholder="Nome do Cliente *"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              autoFocus
            />
            <input
              className="w-full border p-2 rounded text-sm mb-2"
              placeholder="Mesa / Identificador"
              value={newTableNumber}
              onChange={(e) => setNewTableNumber(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setIsCreating(false)}
                className="flex-1 py-1 text-xs font-bold text-slate-500 border rounded bg-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateComanda}
                className="flex-1 py-1 text-xs font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700"
              >
                Abrir
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {comandas
            .filter((c) =>
              c.customerName.toLowerCase().includes(searchTerm.toLowerCase()),
            )
            .map((comanda) => {
              const total =
                comanda.items?.reduce(
                  (acc, i) => acc + (i.price || 0) * (i.quantity || 1),
                  0,
                ) || 0;
              return (
                <div
                  key={comanda.id}
                  onClick={() => {
                    setSelectedComanda(comanda);
                    setSelectedItemsToPay([]);
                  }}
                  className={`p-3 rounded border cursor-pointer hover:shadow-md transition-all ${selectedComanda?.id === comanda.id ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500" : "bg-white border-slate-200"}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-slate-800">
                        {comanda.customerName}
                      </div>
                      {comanda.tableNumber && (
                        <div className="text-xs text-slate-500 bg-slate-100 px-1.5 rounded w-fit mt-1">
                          Mesa {comanda.tableNumber}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-700">
                        {formatCurrency(total)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {comanda.items?.length || 0} itens
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          {comandas.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-10">
              Nenhuma comanda aberta.
            </p>
          )}
        </div>
      </div>

      {/* COLUNA DIREITA: DETALHES DA COMANDA */}
      {selectedComanda ? (
        <div className="flex-1 flex flex-col h-full bg-white relative">
          {/* HEADER DETALHES */}
          <div className="p-4 border-b flex justify-between items-center bg-slate-50 shadow-sm z-10">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <User size={20} className="text-indigo-600 shrink-0" />
                <span className="truncate">{selectedComanda.customerName}</span>
                {selectedComanda.tableNumber && (
                  <span className="text-sm font-normal text-slate-500 shrink-0">
                    {" "}
                    (Mesa {selectedComanda.tableNumber})
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Aberta em{" "}
                {selectedComanda.createdAt?.seconds
                  ? new Date(
                      selectedComanda.createdAt.seconds * 1000,
                    ).toLocaleString()
                  : "..."}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteModal(selectedComanda)}
                className="text-red-400 hover:text-red-600 p-2 rounded border border-transparent hover:border-red-200 hover:bg-red-50"
                title="Cancelar Comanda"
              >
                <Trash2 size={20} />
              </button>
              <button
                onClick={() => setSelectedComanda(null)}
                className="md:hidden bg-slate-200 text-slate-600 px-3 py-1 rounded text-sm font-bold"
              >
                Voltar
              </button>
            </div>
          </div>

          {/* BODY: LISTA DE ITENS */}
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
            {/* BARRA DE ADICIONAR PRODUTO (REFEITA) */}
            <div className="mb-4 relative">
              <div className="flex gap-2 h-10">
                {/* Seletor Visual de Quantidade */}
                <div className="flex items-center bg-slate-100 rounded border border-slate-200 h-full transition-colors focus-within:border-indigo-400">
                  <button
                    onClick={() => setAddQty(Math.max(1, addQty - 1))}
                    className="px-2 h-full text-slate-500 hover:text-indigo-600 hover:bg-slate-200 rounded-l font-bold"
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    className="w-10 h-full text-center bg-transparent outline-none font-bold text-indigo-700 text-sm appearance-none"
                    value={addQty}
                    onChange={(e) =>
                      setAddQty(Math.max(1, parseInt(e.target.value) || 1))
                    }
                    min="1"
                  />
                  <button
                    onClick={() => setAddQty(addQty + 1)}
                    className="px-2 h-full text-slate-500 hover:text-indigo-600 hover:bg-slate-200 rounded-r font-bold"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="relative flex-1 h-full">
                  <Search
                    className="absolute left-3 top-2.5 text-slate-400"
                    size={18}
                  />
                  <input
                    className="w-full h-full pl-10 pr-4 py-2 border rounded shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Ex: 5* e busque (Nome ou Cód)...F[12]"
                    value={productSearch}
                    onKeyDown={handleSearchKeyDown}
                    onChange={(e) => {
                      const val = e.target.value;
                      const match = val.match(/^(\d+)[*xX]$/);
                      if (match) {
                        setAddQty(parseInt(match[1]));
                        setProductSearch("");
                      } else {
                        setProductSearch(val);
                      }
                    }}
                  />
                </div>

                {/* BOTÃO DOSES (MENOR, ROXO E NA MESMA LINHA) */}
                <button
                  onClick={() => setIsDosePanelOpen(true)}
                  className="h-full px-3 bg-purple-50 text-purple-700 border border-purple-200 rounded font-bold flex items-center justify-center gap-2 hover:bg-purple-100 transition-colors shadow-sm"
                  title="Adicionar Doses [F9]"
                >
                  <Wine size={16} />{" "}
                  <span className="hidden md:inline text-sm">Doses</span>
                </button>
              </div>

              {/* Dropdown de Sugestões */}
              {productSearch && (
                <div className="absolute top-full left-0 right-0 bg-white border rounded shadow-xl mt-1 max-h-60 overflow-y-auto z-20">
                  {filteredProducts.map((p, index) => (
                    <div
                      key={p.id}
                      // Adicione a classe de cor condicional:
                      className={`p-3 border-b hover:bg-indigo-50 cursor-pointer flex justify-between ${selectedSearchIndex === index ? "bg-indigo-100 ring-2 ring-indigo-400" : ""}`}
                      onClick={() => handleAddItem(p)}
                    >
                      <span className="font-bold text-slate-700">{p.name}</span>
                      <span className="text-indigo-600 font-bold">
                        {formatCurrency(p.price)}
                      </span>
                    </div>
                  ))}
                  {filteredProducts.length === 0 && (
                    <div className="p-3 text-slate-400 text-sm">
                      Nenhum produto encontrado.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* LISTA DE ITENS DA COMANDA */}
            <div className="bg-white rounded border shadow-sm overflow-hidden">
              <div className="p-2 bg-slate-100 border-b flex justify-between items-center text-xs font-bold text-slate-500 uppercase">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSelectAll}
                    className="hover:text-indigo-600"
                  >
                    {selectedItemsToPay.length > 0 &&
                    selectedItemsToPay.length ===
                      selectedComanda.items?.length ? (
                      <CheckSquare size={18} className="text-indigo-600" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                  <span>Itens ({selectedComanda.items?.length || 0})</span>
                </div>
                <span>Subtotal</span>
              </div>
              <div className="divide-y">
                {(selectedComanda.items || []).map((item, idx) => (
                  <div
                    key={item.uniqueId || idx}
                    className="p-3 flex justify-between items-center hover:bg-slate-50 group"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (selectedItemsToPay.includes(item.uniqueId)) {
                            setSelectedItemsToPay((prev) =>
                              prev.filter((id) => id !== item.uniqueId),
                            );
                          } else {
                            setSelectedItemsToPay((prev) => [
                              ...prev,
                              item.uniqueId,
                            ]);
                          }
                        }}
                        className="text-slate-400 hover:text-indigo-600 transition-colors"
                      >
                        {selectedItemsToPay.includes(item.uniqueId) ? (
                          <CheckSquare size={20} className="text-indigo-600" />
                        ) : (
                          <Square size={20} />
                        )}
                      </button>
                      <div>
                        <div className="font-bold text-slate-700 flex items-center gap-2">
                          {item.name}
                          {item.isDose && (
                            <span className="bg-purple-100 text-purple-700 text-[9px] px-1 rounded uppercase">
                              Dose
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(item.addedAt)
                            .toLocaleTimeString()
                            .slice(0, 5)}{" "}
                          • {item.addedBy || "sistema"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center bg-white border border-slate-200 rounded shadow-sm h-8">
                        <button
                          onClick={() => handleUpdateQty(item.uniqueId, -1)}
                          className="w-7 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-red-500 transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center font-bold text-sm text-slate-800">
                          {item.quantity || 1}
                        </span>
                        <button
                          onClick={() => handleUpdateQty(item.uniqueId, 1)}
                          className="w-7 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-green-500 transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <span className="font-bold text-slate-800 w-16 text-right">
                        {formatCurrency(item.price * (item.quantity || 1))}
                      </span>
                      <button
                        onClick={() => handleRemoveItem(item)}
                        className="text-red-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {(!selectedComanda.items ||
                  selectedComanda.items.length === 0) && (
                  <div className="p-10 text-center text-slate-400 italic">
                    Comanda vazia. Adicione itens acima.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* FOOTER: AÇÕES */}
          <div className="p-4 border-t bg-white z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold">
                  Total Geral
                </p>
                <p className="text-2xl font-bold text-slate-800">
                  {formatCurrency(
                    (selectedComanda.items || []).reduce(
                      (a, b) => a + (b.price || 0) * (b.quantity || 1),
                      0,
                    ),
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-indigo-600 uppercase font-bold">
                  Selecionado p/ Pagar
                </p>
                <p className="text-xl font-bold text-indigo-700">
                  {formatCurrency(
                    (selectedComanda.items || [])
                      .filter((i) => selectedItemsToPay.includes(i.uniqueId))
                      .reduce(
                        (a, b) => a + (b.price || 0) * (b.quantity || 1),
                        0,
                      ),
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
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center bg-slate-50 text-slate-400 flex-col gap-4">
          <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center">
            <Utensils size={40} className="text-slate-400" />
          </div>
          <p>Selecione ou abra uma comanda para começar.</p>
        </div>
      )}

      {/* MODAL EXCLUIR */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-red-600 flex items-center gap-2 mb-4">
              <AlertTriangle /> Cancelar Comanda?
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Isso excluirá permanentemente a comanda de{" "}
              <strong>{deleteModal.customerName}</strong> e seus itens. Essa
              ação requer senha.
            </p>

            <label className="text-xs font-bold text-slate-500 uppercase">
              Senha de Autorização
            </label>
            <div className="flex items-center border p-2 rounded mt-1 mb-6 focus-within:ring-2 ring-red-200">
              <Lock size={16} className="text-slate-400 mr-2" />
              <input
                type="password"
                className="w-full outline-none text-sm"
                placeholder="Senha Admin/Gerente"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded font-bold text-sm"
              >
                Voltar
              </button>
              <button
                onClick={handleDeleteComanda}
                className="px-4 py-2 bg-red-600 text-white rounded font-bold text-sm hover:bg-red-700"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENDERIZAÇÃO DO MODAL DE DOSES */}
      {isDosePanelOpen &&
        renderDosePanel(() => setIsDosePanelOpen(false), handleAddDose)}
    </div>
  );
};

export default ComandaManager;
