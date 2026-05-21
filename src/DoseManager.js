import React, { useState, useEffect, useRef } from "react";
import {
  Wine,
  X,
  Search,
  Trash2,
  ShoppingCart,
  AlertTriangle,
} from "lucide-react";
import { useTenant } from "./contexts/TenantContext";

// --- COMPONENTE DO CARD DA GARRAFA ---
const BottleCard = ({
  bottle,
  onSell,
  onDiscard,
  editingBottle,
  setEditingBottle,
  onUpdateField,
  isSelected,
  isEditingQty,
  keyboardQty,
}) => {
  const [doseQty, setDoseQty] = useState(1);
  const pct =
    bottle.maxDoses > 0 ? (bottle.remainingDoses / bottle.maxDoses) * 100 : 0;
  const barColor =
    pct > 50 ? "bg-green-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";

  const currentQty = isSelected && isEditingQty ? keyboardQty : doseQty;
  const borderClass = isSelected
    ? isEditingQty
      ? "ring-4 ring-amber-400 border-amber-500 bg-amber-50 transform scale-[1.02] z-10"
      : "ring-4 ring-purple-400 border-purple-500 transform scale-[1.02] z-10"
    : "border-purple-100 hover:shadow-md";

  return (
    <div
      className={`bg-white border rounded-xl p-4 shadow-sm transition-all flex flex-col h-full relative overflow-hidden group ${borderClass}`}
    >
      {/* Faixa superior de cor */}
      <div className="absolute top-0 left-0 w-full h-1 bg-purple-500"></div>

      <div className="flex items-start justify-between mb-2">
        <div className="pr-6">
          <p
            className="font-bold text-slate-800 text-sm leading-tight line-clamp-2"
            title={bottle.productName}
          >
            {bottle.productName}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Aberta em{" "}
            {bottle.openedAt?.toDate
              ? bottle.openedAt.toDate().toLocaleDateString("pt-BR")
              : "—"}
          </p>
        </div>
        <button
          onClick={() => onDiscard(bottle)}
          className="absolute top-3 right-3 text-slate-300 hover:text-red-500 transition-colors bg-white rounded-full p-1 shadow-sm border border-transparent hover:border-red-100"
          title="Descartar garrafa"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          {bottle.maxDoses === 0 ? (
            <span className="text-red-500 font-bold flex items-center gap-1">
              <AlertTriangle size={12} /> Configure os volumes
            </span>
          ) : (
            <>
              <span className="text-slate-500 font-bold">
                {bottle.remainingDoses} doses restam
              </span>
              <span className="text-slate-400">{bottle.maxDoses} máx</span>
            </>
          )}
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
          <div
            className={`h-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Inputs de Configuração */}
      <div className="grid grid-cols-2 gap-2 mb-auto border-t border-slate-100 pt-3">
        {[
          { field: "dosePrice", label: "Preço/Dose", prefix: "R$ " },
          {
            field: "bottleVolumeMl",
            label: "Vol. Garrafa",
            prefix: "",
            suffix: "ml",
          },
          {
            field: "doseVolumeMl",
            label: "Vol. Dose",
            prefix: "",
            suffix: "ml",
          },
        ].map(({ field, label, prefix, suffix }) => (
          <div
            key={field}
            className={field === "dosePrice" ? "col-span-2" : "col-span-1"}
          >
            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">
              {label}
            </label>
            {editingBottle?.id === bottle.id &&
            editingBottle?.field === field ? (
              <input
                autoFocus
                type="number"
                className="w-full border-2 border-purple-400 rounded-lg p-1.5 text-xs font-bold text-center focus:outline-none bg-purple-50 text-purple-900"
                defaultValue={bottle[field]}
                onBlur={(e) => onUpdateField(bottle, field, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    onUpdateField(bottle, field, e.target.value);
                  if (e.key === "Escape") setEditingBottle(null);
                }}
              />
            ) : (
              <button
                onClick={() => setEditingBottle({ id: bottle.id, field })}
                className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg p-1.5 hover:border-purple-400 hover:bg-purple-50 hover:text-purple-700 transition-colors text-center truncate"
              >
                {prefix}
                {bottle[field] || "0"} {suffix}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Ação de Venda */}
      <div className="pt-3 mt-3 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center bg-white border rounded-lg h-9 overflow-hidden flex-shrink-0 transition-colors ${isSelected && isEditingQty ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"}`}
          >
            <button
              onClick={() => setDoseQty((q) => Math.max(1, q - 1))}
              className="w-8 h-full text-slate-500 hover:bg-slate-200 font-bold transition-colors"
            >
              −
            </button>
            <input
              type="number"
              min="1"
              value={currentQty}
              onChange={(e) => setDoseQty(Math.max(1, Number(e.target.value)))}
              readOnly={isSelected && isEditingQty}
              className={`w-8 h-full text-center text-sm font-bold bg-transparent outline-none appearance-none ${isSelected && isEditingQty ? "text-amber-700" : ""}`}
            />
            <button
              onClick={() => setDoseQty((q) => q + 1)}
              className="w-8 h-full text-slate-500 hover:bg-slate-200 font-bold transition-colors"
            >
              +
            </button>
          </div>

          <button
            onClick={() => onSell(bottle, currentQty)}
            disabled={bottle.maxDoses === 0}
            className={`flex-1 h-9 rounded-lg text-xs font-bold disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${isSelected && isEditingQty ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-purple-600 text-white hover:bg-purple-700"}`}
          >
            <ShoppingCart size={14} />{" "}
            {isSelected && isEditingQty ? "Confirmar" : "Vender"} R${" "}
            {((bottle.dosePrice || 0) * currentQty).toFixed(2)}
          </button>
        </div>

        {/* Instruções Dinâmicas p/ Teclado */}
        <div className="h-4 mt-2 text-[9px] text-center text-slate-400 transition-opacity">
          {isSelected && !isEditingQty && (
            <span>
              Aperte <b>Shift+Enter</b> para alterar a Qtd
            </span>
          )}
          {isSelected && isEditingQty && (
            <span className="text-amber-600 font-bold">
              Use as <b>Setas</b>. <b>Enter</b> para vender.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL DO MODAL ---
const DoseManager = ({
  isOpen,
  onClose,
  products,
  storeConfig,
  showNotification,
  onAddDoseToCart,
}) => {
  const { tenantDB } = useTenant();

  const [search, setSearch] = useState("");
  const [openBottles, setOpenBottles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingBottle, setEditingBottle] = useState(null);

  // Navegação por teclado global do DoseManager
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isEditingQty, setIsEditingQty] = useState(false);
  const [keyboardQty, setKeyboardQty] = useState(1);
  const searchInputRef = useRef(null);

  const filteredOpenBottles = openBottles.filter((b) =>
    b.productName.toLowerCase().includes(search.toLowerCase()),
  );
  const productsToOpen = products.filter(
    (p) =>
      p.itemType !== "pack" &&
      (p.name.toLowerCase().includes(search.toLowerCase()) ||
        String(p.barcode || "").includes(search)),
  );

  // Reseta navegação quando a busca muda
  useEffect(() => {
    setSelectedIndex(-1);
    setIsEditingQty(false);
  }, [search]);

  // Listener de Navegação (Setas e Enter)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      // F12 Toggle Busca
      if (e.key === "F12") {
        e.preventDefault();
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current.blur();
          setSearch("");
        } else {
          searchInputRef.current?.focus();
        }
        return;
      }

      // Ignorar navegação se focado em outro input numérico (exceto a barra de pesquisa)
      if (e.target.tagName === "INPUT" && e.target !== searchInputRef.current)
        return;

      const totalOpen = filteredOpenBottles.length;
      const totalSearch = productsToOpen.length;
      const totalItems = totalOpen + totalSearch;

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        // Deixa as setas funcionarem livremente dentro do input de busca (esquerda/direita)
        if (
          document.activeElement === searchInputRef.current &&
          (e.key === "ArrowLeft" || e.key === "ArrowRight")
        ) {
          return;
        }
        e.preventDefault();
      }

      if (totalItems === 0) return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (isEditingQty) {
          setKeyboardQty((q) => q + 1);
        } else {
          setSelectedIndex((prev) =>
            prev + 1 >= totalItems ? prev : prev + 1,
          );
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (isEditingQty) {
          setKeyboardQty((q) => Math.max(1, q - 1));
        } else {
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        // 1. Shift+Enter nas garrafas ABERTAS
        if (e.shiftKey && selectedIndex >= 0 && selectedIndex < totalOpen) {
          setIsEditingQty(true);
          setKeyboardQty(1);
        }
        // 2. Enter no modo de EDIÇÃO de qtd
        else if (
          isEditingQty &&
          selectedIndex >= 0 &&
          selectedIndex < totalOpen
        ) {
          handleSellDoses(filteredOpenBottles[selectedIndex], keyboardQty);
          setIsEditingQty(false);
        }
        // 3. Enter NORMAL (Navegação Padrão)
        else if (!isEditingQty) {
          if (selectedIndex >= 0 && selectedIndex < totalOpen) {
            // Enter direto = Vende 1 dose automaticamente (opcional) ou você pode exigir Shift+Enter.
            // Configuramos para vender 1 direto para manter a agilidade caso não queira alterar a qtd.
            handleSellDoses(filteredOpenBottles[selectedIndex], 1);
          } else if (selectedIndex >= totalOpen && selectedIndex < totalItems) {
            handleOpenBottle(productsToOpen[selectedIndex - totalOpen]);
          }
        }
      } else if (e.key === "Escape") {
        if (isEditingQty) {
          setIsEditingQty(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    filteredOpenBottles,
    productsToOpen,
    selectedIndex,
    isEditingQty,
    keyboardQty,
  ]);

  // Carrega garrafas abertas
  useEffect(() => {
    if (!tenantDB) return;
    const unsub = tenantDB.firestore.subscribe("open_bottles", (data) => {
      setOpenBottles(data);
      setLoading(false);
    });
    return () => unsub();
  }, [tenantDB, isOpen]);

  if (!isOpen) return null;

  // AÇÕES DO BANCO
  const handleOpenBottle = async (product) => {
    const bottleVol = parseFloat(product.bottleVolumeMl) || 0;
    const doseVol = parseFloat(product.doseVolumeMl) || 0;
    const maxDoses = doseVol > 0 ? Math.floor(bottleVol / doseVol) : 0;
    const storeId = String(storeConfig.id);

    try {
      await tenantDB.firestore.update("products", product.id, {
        stock: tenantDB.firestore.utils.increment(-1),
      });

      await tenantDB.firestore.add("open_bottles", {
        productId: product.id,
        productName: product.name,
        dosePrice: parseFloat(product.dosePrice) || 0,
        bottleVolumeMl: bottleVol,
        doseVolumeMl: doseVol,
        maxDoses,
        remainingDoses: maxDoses,
        openedAt: tenantDB.firestore.utils.serverTimestamp(),
      });
      showNotification(`Garrafa de ${product.name} aberta!`, "success");
      setSearch("");
    } catch (error) {
      showNotification("Erro ao abrir garrafa.", "error");
    }
  };

  const handleSellDoses = async (bottle, qty) => {
    if (qty <= 0) return;
    if (
      bottle.maxDoses === 0 ||
      !bottle.bottleVolumeMl ||
      !bottle.doseVolumeMl
    ) {
      return showNotification(
        "Configure os volumes (Garrafa e Dose) antes de vender.",
        "error",
      );
    }

    const storeId = String(storeConfig.id);
    const newRemaining = bottle.remainingDoses - qty;

    onAddDoseToCart({
      id: bottle.productId,
      name: `${bottle.productName} (Dose ${bottle.doseVolumeMl}ml)`,
      price: bottle.dosePrice,
      cost: 0,
      qty,
      isDose: true,
      bottleId: bottle.id,
    });

    try {
      if (newRemaining <= 0) {
        await tenantDB.firestore.delete("open_bottles", bottle.id);
        showNotification(
          `Garrafa de ${bottle.productName} esvaziada!`,
          "success",
        );
        const product = products.find((p) => p.id === bottle.productId);
        if (
          product &&
          window.confirm(
            `Garrafa esvaziada! Deseja abrir outra de ${bottle.productName}?`,
          )
        ) {
          await handleOpenBottle(product);
        }
      } else {
        await tenantDB.firestore.update("open_bottles", bottle.id, {
          remainingDoses: newRemaining,
        });
      }
    } catch (error) {
      showNotification("Erro ao processar dose.", "error");
    }
  };

  const handleDiscard = async (bottle) => {
    if (
      !window.confirm(
        `Descartar garrafa de ${bottle.productName} com ${bottle.remainingDoses} doses restantes?`,
      )
    )
      return;
    const storeId = String(storeConfig.id);
    await tenantDB.firestore.delete("open_bottles", bottle.id);
    showNotification("Garrafa descartada.", "success");
  };

  const handleUpdateBottleField = async (bottle, field, value) => {
    const storeId = String(storeConfig.id);

    const parsed = parseFloat(value) || 0;
    const update = { [field]: parsed };

    if (field === "bottleVolumeMl" || field === "doseVolumeMl") {
      const newBottleVol =
        field === "bottleVolumeMl" ? parsed : bottle.bottleVolumeMl;
      const newDoseVol =
        field === "doseVolumeMl" ? parsed : bottle.doseVolumeMl;
      if (newDoseVol > 0) {
        const newMax = Math.floor(newBottleVol / newDoseVol);
        const usedDoses = bottle.maxDoses - bottle.remainingDoses;
        update.maxDoses = newMax;
        update.remainingDoses = Math.max(0, newMax - usedDoses);
      }
    }
    await tenantDB.firestore.update("open_bottles", bottle.id, update);
    setEditingBottle(null);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-50 w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-purple-700 text-white p-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600 rounded-lg shadow-inner">
              <Wine size={24} />
            </div>
            <div>
              <h2 className="font-bold text-xl leading-tight text-white">
                Gerenciador de Doses
              </h2>
              <p className="text-purple-200 text-xs mt-0.5">
                {openBottles.length} garrafa(s) em uso no momento
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-purple-800/50 hover:bg-purple-600 rounded-full transition-colors border border-purple-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="bg-white border-b border-slate-200 p-4 flex-shrink-0 shadow-sm z-10">
          <div className="relative max-w-2xl mx-auto">
            <Search
              className="absolute left-4 top-3 text-slate-400"
              size={20}
            />
            <input
              ref={searchInputRef}
              autoFocus
              className="w-full pl-12 pr-4 py-3 bg-slate-100 border-transparent rounded-xl text-sm font-medium focus:bg-white focus:border-purple-400 focus:ring-4 focus:ring-purple-100 transition-all outline-none"
              placeholder="Buscar garrafa aberta ou produto para abrir... [F12]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="flex justify-center items-center h-40 text-purple-600">
              <span className="animate-pulse font-bold">
                Carregando garrafas...
              </span>
            </div>
          ) : (
            <div className="space-y-8">
              {(search === "" || filteredOpenBottles.length > 0) && (
                <section>
                  <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span>
                    {search
                      ? "Garrafas Abertas Encontradas"
                      : "Garrafas em Uso"}
                  </h3>

                  {openBottles.length === 0 && search === "" ? (
                    <div className="bg-white border border-slate-200 border-dashed rounded-xl p-8 text-center text-slate-400">
                      <Wine size={32} className="mx-auto mb-3 opacity-30" />
                      <p className="font-medium text-sm">
                        Nenhuma garrafa aberta no momento.
                      </p>
                      <p className="text-xs mt-1">
                        Pesquise um produto acima para iniciar uma nova garrafa.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredOpenBottles.map((bottle, index) => (
                        <BottleCard
                          key={bottle.id}
                          bottle={bottle}
                          isSelected={selectedIndex === index}
                          isEditingQty={isEditingQty}
                          keyboardQty={keyboardQty}
                          onSell={handleSellDoses}
                          onDiscard={handleDiscard}
                          editingBottle={editingBottle}
                          setEditingBottle={setEditingBottle}
                          onUpdateField={handleUpdateBottleField}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {search.length > 1 && (
                <section className="pt-4 border-t border-slate-200">
                  <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2">
                    <Search size={14} />
                    Abrir Nova Garrafa do Estoque
                  </h3>

                  {productsToOpen.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">
                      Nenhum produto correspondente no estoque.
                    </p>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      {productsToOpen.slice(0, 10).map((p, index) => {
                        const maxDoses =
                          p.doseVolumeMl > 0
                            ? Math.floor(
                                (p.bottleVolumeMl || 0) / p.doseVolumeMl,
                              )
                            : 0;
                        const hasOpen = openBottles.some(
                          (ob) => ob.productId === p.id,
                        );
                        // O Índice das pesquisadas começa onde terminam as abertas
                        const isSelected =
                          selectedIndex === filteredOpenBottles.length + index;

                        return (
                          <div
                            key={p.id}
                            className={`p-4 border-b border-slate-100 last:border-0 hover:bg-purple-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${isSelected ? "bg-purple-100 ring-2 ring-purple-400 z-10 relative" : ""}`}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-800">
                                  {p.name}
                                </p>
                                {hasOpen && (
                                  <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                                    Já Possui Aberta
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                {maxDoses > 0 ? (
                                  <span>
                                    Rende {maxDoses} doses de {p.doseVolumeMl}ml
                                    · R$ {(p.dosePrice || 0).toFixed(2)}/dose
                                  </span>
                                ) : (
                                  <span className="text-amber-500 font-medium">
                                    ⚠ Configuração de dose incompleta no
                                    cadastro
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                              <div className="text-xs text-slate-500 text-right">
                                <span className="block font-medium">
                                  Estoque Físico
                                </span>
                                <span
                                  className={`font-bold ${p.stock <= 0 ? "text-red-500" : "text-slate-700"}`}
                                >
                                  {p.stock || 0} un
                                </span>
                              </div>
                              <button
                                onClick={() => handleOpenBottle(p)}
                                disabled={p.stock <= 0}
                                className={`px-4 py-2 rounded-lg font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${isSelected ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-700 hover:bg-purple-200"}`}
                              >
                                {isSelected
                                  ? "Enter para Abrir"
                                  : "+ Abrir Garrafa"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoseManager;
