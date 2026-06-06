import React, { useState, useMemo, useEffect } from "react";
import {
  TrendingUp,
  ShoppingCart,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Search,
  Truck,
  AlertCircle,
  Package,
  ArrowRight,
  X,
  Copy,
  Plus,
  FileText,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// --- UTILITÁRIOS ---
const formatCurrency = (val) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    val || 0,
  );

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("pt-BR");
};

export default function PurchaseSuggestion({ products, sales, suppliers }) {
  // --- CONFIGURAÇÕES DE ANÁLISE ---
  const [daysAnalysis, setDaysAnalysis] = useState(30);
  const [daysCoverage, setDaysCoverage] = useState(15);

  // --- ESTADOS DE UI ---
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [expandedProductId, setExpandedProductId] = useState(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  // --- CARRINHO INVISÍVEL ---
  const [cart, setCart] = useState({});

  // --- PAGINAÇÃO ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // --- 1. CÁLCULO DE GIRO E SUGESTÃO ---
  const suggestionData = useMemo(() => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAnalysis);

    // A. Mapear Vendas
    const salesMap = {};
    sales.forEach((sale) => {
      const saleDate = new Date(sale.date);
      if (saleDate >= cutoffDate && !sale.isLoss) {
        sale.items.forEach((item) => {
          const pid = item.productId || item.id;
          if (!salesMap[pid]) salesMap[pid] = 0;
          salesMap[pid] += Number(item.qty || item.quantity);
        });
      }
    });

    // B. Processar Produtos
    let list = products.map((prod) => {
      const totalSold = salesMap[prod.id] || 0;
      const dailySales = totalSold / daysAnalysis;

      const currentStock = Number(prod.stock || 0);
      let daysStock = dailySales > 0 ? currentStock / dailySales : 999;
      if (currentStock === 0 && dailySales === 0) daysStock = 999;

      let suggestedQty = 0;
      if (daysStock < daysCoverage) {
        const targetStock = dailySales * daysCoverage;
        suggestedQty = Math.ceil(targetStock - currentStock);
      }

      const minStock = Number(prod.minStock || 0);
      if (currentStock < minStock) {
        const diff = minStock - currentStock;
        if (suggestedQty < diff) suggestedQty = diff;
      }

      if (suggestedQty < 0) suggestedQty = 0;

      return {
        ...prod,
        stats: {
          totalSold,
          dailySales,
          daysStock,
          suggestedQty,
        },
      };
    });

    // C. Filtros
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(lower) || // ✨ Blindado!
          String(p.barcode || "").includes(lower),
      );
    }

    if (supplierFilter) {
      list = list.filter((p) => {
        if (!p.suppliersHistory) return false;
        return p.suppliersHistory.some(
          (h) =>
            h.supplierId === supplierFilter ||
            h.supplierName === supplierFilter,
        );
      });
    }

    list.sort((a, b) => {
      const inCartA = !!cart[a.id];
      const inCartB = !!cart[b.id];
      if (inCartA !== inCartB) return inCartA ? -1 : 1;

      if (b.stats.suggestedQty !== a.stats.suggestedQty) {
        return b.stats.suggestedQty - a.stats.suggestedQty;
      }
      
      // ✨ Blindado contra produtos sem nome na hora de ordenar de A a Z!
      return (a.name || "").localeCompare(b.name || ""); 
    });

    return list;
  }, [
    products,
    sales,
    daysAnalysis,
    daysCoverage,
    searchTerm,
    supplierFilter,
    cart,
  ]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, supplierFilter, daysAnalysis, daysCoverage]);

  const totalPages = Math.ceil(suggestionData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return suggestionData.slice(start, start + itemsPerPage);
  }, [suggestionData, currentPage]);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    let currentY = 15;

    doc.setFontSize(14);
    doc.text("Pedidos de Compra", 14, currentY);
    currentY += 7;
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      `Gerado em: ${new Date().toLocaleDateString("pt-BR")}`,
      14,
      currentY,
    );
    currentY += 8;

    Object.entries(generatedOrders).forEach(([supplierName, data]) => {
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(`Fornecedor: ${supplierName}`, 14, currentY);
      currentY += 2;

      autoTable(doc, {
        startY: currentY,
        head: [["Produto", "Qtd", "Un", "Vlr Base Unit.", "Total"]],
        body: data.items.map((i) => [
          i.productName,
          i.qty,
          i.productUnit || "UN",
          formatCurrency(i.basePrice ?? i.cost),
          formatCurrency(i.total),
        ]),
        foot: [
          [
            {
              content: "Total do Fornecedor",
              colSpan: 4,
              styles: { halign: "right", fontStyle: "bold" },
            },
            {
              content: formatCurrency(data.total),
              styles: { fontStyle: "bold", textColor: [5, 150, 105] },
            },
          ],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] },
        footStyles: { fillColor: [241, 245, 249] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      currentY = doc.lastAutoTable.finalY + 12;
    });

    doc.save(
      `pedidos_compra_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`,
    );
  };

  // --- AÇÕES DO CARRINHO ---
  const toggleCartItem = (
    product,
    supplierHistoryItem = null,
    customQty = null,
  ) => {
    const pid = product.id;

    // Se não houver fornecedor selecionado, cria dados genéricos
    const supId = supplierHistoryItem
      ? supplierHistoryItem.supplierId
      : "sem_fornecedor";
    const supName = supplierHistoryItem
      ? supplierHistoryItem.supplierName
      : "Sem Fornecedor";
    const cost = supplierHistoryItem
      ? supplierHistoryItem.lastCost
      : product.cost || product.costPrice || 0;

    if (cart[pid] && cart[pid].supplierId === supId) {
      const newCart = { ...cart };
      delete newCart[pid];
      setCart(newCart);
      return;
    }

    const qty =
      customQty !== null
        ? customQty
        : product.stats.suggestedQty > 0
          ? product.stats.suggestedQty
          : 10;

    setCart((prev) => ({
      ...prev,
      [pid]: {
        productName: product.name,
        productUnit: product.unit,
        productId: pid,
        supplierId: supId,
        supplierName: supName,
        cost: cost,
        basePrice: cost,
        qty: qty,
        total: qty * cost,
      },
    }));
  };

  const updateCartQty = (pid, newQty) => {
    if (!cart[pid]) return;
    const val = Number(newQty);
    setCart((prev) => ({
      ...prev,
      [pid]: {
        ...prev[pid],
        qty: val,
        total: val * prev[pid].cost,
      },
    }));
  };

  const updateCartBasePrice = (pid, newPrice) => {
    if (!cart[pid]) return;
    const val = parseFloat(newPrice) || 0;
    setCart((prev) => ({
      ...prev,
      [pid]: {
        ...prev[pid],
        basePrice: val,
        total: prev[pid].qty * val,
      },
    }));
  };

  const removeFromCart = (pid) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[pid];
      return next;
    });
  };

  const changeCartSupplier = (pid, supplierHistoryItem) => {
    if (!cart[pid]) return;
    setCart((prev) => ({
      ...prev,
      [pid]: {
        ...prev[pid],
        supplierId: supplierHistoryItem.supplierId,
        supplierName: supplierHistoryItem.supplierName,
        cost: supplierHistoryItem.lastCost,
        basePrice: supplierHistoryItem.lastCost,
        total: prev[pid].qty * supplierHistoryItem.lastCost,
      },
    }));
  };

  const generatedOrders = useMemo(() => {
    const grouped = {};
    Object.values(cart).forEach((item) => {
      const supName = item.supplierName || "Desconhecido";
      if (!grouped[supName]) grouped[supName] = { total: 0, items: [] };
      grouped[supName].items.push(item);
      grouped[supName].total += item.total;
    });
    return grouped;
  }, [cart]);

  const handleCopyOrder = (supplierName) => {
    const data = generatedOrders[supplierName];
    if (!data) return;

    let text = `*PEDIDO DE COMPRA - ${supplierName}*\n`;
    text += `Data: ${new Date().toLocaleDateString()}\n\n`;
    data.items.forEach((i) => {
      text += `- ${i.qty} ${i.productUnit || "UN"} x ${i.productName}\n`;
    });
    text += `\nValor Estimado: ${formatCurrency(data.total)}`;

    navigator.clipboard.writeText(text);
    alert(`Pedido para ${supplierName} copiado!`);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      {/* --- HEADER --- */}
      <div className="bg-white p-4 border-b shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap gap-4 items-end justify-between">
          {/* Métricas Configuráveis */}
          <div className="flex gap-4">
            <div className="bg-blue-50 p-2 rounded border border-blue-100 group focus-within:ring-2 ring-blue-200">
              <label
                className="text-[10px] uppercase font-bold text-blue-800 flex items-center gap-1 cursor-help"
                title="Quantos dias de vendas passadas o sistema deve olhar para calcular a média?"
              >
                <TrendingUp size={12} /> Análise (Dias)
              </label>
              <input
                type="number"
                className="bg-transparent font-bold text-blue-900 w-16 outline-none border-b border-blue-200 focus:border-blue-500 text-lg"
                value={daysAnalysis}
                onChange={(e) => setDaysAnalysis(Number(e.target.value))}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div className="bg-emerald-50 p-2 rounded border border-emerald-100 group focus-within:ring-2 ring-emerald-200">
              <label
                className="text-[10px] uppercase font-bold text-emerald-800 flex items-center gap-1 cursor-help"
                title="Por quantos dias você quer ficar sem precisar comprar de novo?"
              >
                <Package size={12} /> Cobertura (Meta)
              </label>
              <input
                type="number"
                className="bg-transparent font-bold text-emerald-900 w-16 outline-none border-b border-emerald-200 focus:border-emerald-500 text-lg"
                value={daysCoverage}
                onChange={(e) => setDaysCoverage(Number(e.target.value))}
                onFocus={(e) => e.target.select()}
              />
            </div>
          </div>

          {/* Filtros */}
          <div className="flex-1 flex gap-2 max-w-2xl">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-2.5 text-slate-400"
                size={18}
              />
              <input
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Buscar item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative w-1/3">
              <Filter
                className="absolute left-3 top-2.5 text-slate-400"
                size={18}
              />
              <select
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white truncate font-bold text-slate-600"
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
              >
                <option value="">Todos Fornecedores</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* --- LISTA DE PRODUTOS --- */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="space-y-3">
          {paginatedData.map((prod) => {
            const isInCart = !!cart[prod.id];
            const cartItem = cart[prod.id];
            const isExpanded = expandedProductId === prod.id;

            return (
              <div
                key={prod.id}
                className={`bg-white rounded-xl border transition-all duration-200 ${isInCart ? "border-emerald-500 shadow-md ring-1 ring-emerald-500 bg-emerald-50/10" : "border-slate-200 shadow-sm hover:shadow-md"}`}
              >
                {/* LINHA PRINCIPAL */}
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer select-none"
                  onClick={() =>
                    setExpandedProductId(isExpanded ? null : prod.id)
                  }
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${isInCart ? "bg-emerald-500 text-white shadow-emerald-200 shadow-lg" : "bg-slate-100 text-slate-400"}`}
                  >
                    {isInCart ? (
                      <CheckCircle size={20} />
                    ) : (
                      <ShoppingCart size={18} />
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="font-bold text-slate-800 flex items-center gap-2 text-base">
                      {prod.name}
                      {isInCart && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 font-bold tracking-wide flex items-center gap-1">
                          <Truck size={10} /> {cartItem.supplierName}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex gap-4 mt-1.5 items-center">
                      <div className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                        Estoque: <strong>{prod.stock}</strong>
                      </div>
                      <div>
                        Giro:{" "}
                        <strong>{prod.stats.dailySales.toFixed(2)}/dia</strong>
                      </div>
                      <div>
                        Cob. Atual:{" "}
                        <strong
                          className={
                            prod.stats.daysStock < daysCoverage
                              ? "text-red-500"
                              : "text-emerald-600"
                          }
                        >
                          {prod.stats.daysStock.toFixed(0)} dias
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div
                    className="text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1 tracking-wider">
                      Comprar
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        className={`w-24 text-center font-bold text-xl border-b-2 outline-none bg-transparent transition-colors ${isInCart ? "border-emerald-500 text-emerald-700" : "border-slate-300 text-slate-400"}`}
                        value={
                          isInCart ? cartItem.qty : prod.stats.suggestedQty
                        }
                        onChange={(e) =>
                          isInCart && updateCartQty(prod.id, e.target.value)
                        }
                        onFocus={(e) => e.target.select()}
                        readOnly={!isInCart}
                      />
                      <span className="text-[10px] text-slate-400 absolute top-1 -right-4 font-bold">
                        {prod.unit}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`p-2 rounded-full transition-colors ${isExpanded ? "bg-slate-100 text-slate-600" : "text-slate-300"}`}
                  >
                    <ChevronDown
                      size={20}
                      className={`transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </div>

                {/* ÁREA EXPANDIDA (LOV FORNECEDORES) */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 animate-in slide-in-from-top-2">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                        <Truck size={14} /> Melhores Ofertas
                      </h4>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleCartItem(prod, null)}
                          className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded border border-slate-300 font-bold transition-colors flex items-center gap-1 shadow-sm"
                        >
                          <Plus size={12} /> Adicionar|Remover s/ Fornecedor
                        </button>
                        <span className="text-[10px] text-slate-400 hidden sm:inline">
                          Selecione um card para adicionar ao pedido
                        </span>
                      </div>
                    </div>

                    {prod.suppliersHistory &&
                    prod.suppliersHistory.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[...prod.suppliersHistory]
                          .sort(
                            (a, b) =>
                              new Date(b.lastPurchaseDate) -
                              new Date(a.lastPurchaseDate),
                          )
                          .map((hist, idx) => {
                            const isSelected =
                              cartItem?.supplierId === hist.supplierId;

                            return (
                              <div
                                key={idx}
                                onClick={() => toggleCartItem(prod, hist)}
                                className={`
                                                                group relative p-3 rounded-lg border cursor-pointer transition-all duration-200 flex flex-col justify-between min-h-[80px]
                                                                ${
                                                                  isSelected
                                                                    ? "bg-white border-emerald-500 ring-2 ring-emerald-500 shadow-md transform -translate-y-0.5"
                                                                    : "bg-white border-slate-200 hover:border-indigo-400 hover:shadow-md hover:-translate-y-0.5"
                                                                }
                                                            `}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <div
                                    className={`font-bold text-sm truncate pr-6 ${isSelected ? "text-emerald-700" : "text-slate-700"}`}
                                  >
                                    {hist.supplierName}
                                  </div>
                                  {isSelected && (
                                    <div className="absolute top-3 right-3 text-emerald-500 bg-emerald-50 rounded-full p-0.5">
                                      <CheckCircle
                                        size={16}
                                        fill="currentColor"
                                        className="text-white"
                                      />
                                    </div>
                                  )}
                                </div>

                                <div className="flex justify-between items-end mt-auto">
                                  <div>
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">
                                      Custo Unit.
                                    </div>
                                    <div
                                      className={`font-mono text-lg font-bold ${isSelected ? "text-emerald-600" : "text-slate-800"}`}
                                    >
                                      {formatCurrency(hist.lastCost)}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">
                                      Data
                                    </div>
                                    <div className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                      {formatDate(hist.lastPurchaseDate)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
                        <AlertCircle
                          size={24}
                          className="mx-auto mb-2 opacity-50"
                        />
                        <p className="text-sm font-medium">
                          Sem histórico de compras.
                        </p>
                        <p className="text-xs">
                          Lance uma nota fiscal para alimentar este painel.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {suggestionData.length === 0 && (
            <div className="text-center py-20 text-slate-400">
              <Package size={64} className="mx-auto mb-4 opacity-10" />
              <p className="text-lg font-medium text-slate-500">
                Tudo em ordem!
              </p>
              <p className="text-sm">
                Nenhum produto precisando de reposição nos filtros atuais.
              </p>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">
              Página <span className="font-bold text-slate-800">{currentPage}</span> de{" "}
              <span className="font-bold text-slate-800">{totalPages}</span>
              <span className="hidden sm:inline"> ({suggestionData.length} itens)</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- RODAPÉ FLUTUANTE --- */}
      {Object.keys(cart).length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in">
          <button
            onClick={() => setIsOrderModalOpen(true)}
            className="bg-slate-900 text-white pl-3 pr-5 py-2.5 rounded-full shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-3 active:scale-95"
          >
            {/* Ícone Discreto com Contador */}
            <div className="relative bg-slate-800 p-1.5 rounded-full">
              <ShoppingCart size={16} />
              <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center border border-slate-900">
                {Object.keys(cart).length}
              </span>
            </div>

            {/* Texto Único e Limpo */}
            <span className="font-bold text-sm tracking-wide">
              Gerar Pedidos
            </span>

            <ArrowRight size={14} className="text-slate-500" />
          </button>
        </div>
      )}

      {/* --- MODAL DE PEDIDOS --- */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 overflow-hidden">
            <div className="p-5 border-b flex justify-between items-center bg-slate-50">
              <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Truck size={20} /> Pedidos Gerados (
                {Object.keys(generatedOrders).length})
              </h2>
              <button onClick={() => setIsOrderModalOpen(false)}>
                <X
                  size={20}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 bg-slate-100 space-y-4 custom-scrollbar">
              {Object.entries(generatedOrders).map(
                ([supplierName, data], idx) => (
                  <div
                    key={idx}
                    className="bg-white p-5 rounded-xl shadow-sm border border-slate-200"
                  >
                    <div className="flex justify-between items-start mb-4 pb-4 border-b border-slate-100">
                      <div>
                        <h3 className="font-bold text-slate-800 text-lg">
                          {supplierName}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          {data.items.length} itens • Total Estimado:{" "}
                          <span className="text-emerald-600 font-bold">
                            {formatCurrency(data.total)}
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={() => handleCopyOrder(supplierName)}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors border border-indigo-200"
                      >
                        <Copy size={16} /> Copiar
                      </button>
                    </div>

                    <ul className="space-y-2">
                      {data.items.map((item, i) => (
                        <li
                          key={i}
                          className="text-sm bg-slate-50 p-2 rounded border border-slate-100"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 flex-1 min-w-[120px]">
                              {item.productName}
                            </span>
                            <button
                              onClick={() => removeFromCart(item.productId)}
                              className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                              title="Remover item"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            <div>
                              <label className="text-[9px] uppercase font-bold text-slate-400 block">
                                Qtd
                              </label>
                              <input
                                type="number"
                                className="w-16 border rounded p-1 text-center text-sm font-bold"
                                value={item.qty}
                                onChange={(e) =>
                                  updateCartQty(item.productId, e.target.value)
                                }
                              />
                            </div>
                            <span className="text-slate-300 text-lg font-light mt-3">
                              ×
                            </span>
                            <div>
                              <label className="text-[9px] uppercase font-bold text-slate-400 block">
                                Vlr Base (R$)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                className="w-24 border rounded p-1 text-center text-sm font-bold text-indigo-700"
                                value={item.basePrice ?? item.cost}
                                onChange={(e) =>
                                  updateCartBasePrice(
                                    item.productId,
                                    e.target.value,
                                  )
                                }
                              />
                            </div>
                            <span className="text-slate-300 text-lg font-light mt-3">
                              =
                            </span>
                            <div className="mt-3">
                              <span className="font-mono font-bold text-emerald-600">
                                {formatCurrency(item.total)}
                              </span>
                            </div>
                            {/* Atrelar / Trocar fornecedor */}
                            <div className="ml-auto">
                              <label className="text-[9px] uppercase font-bold text-slate-400 block">
                                Fornecedor
                              </label>
                              <select
                                className="border rounded p-1 text-xs bg-white text-slate-700 font-bold max-w-[160px]"
                                value={item.supplierId}
                                onChange={(e) => {
                                  const sup = suppliers.find(
                                    (s) => String(s.id) === e.target.value,
                                  );
                                  if (sup)
                                    changeCartSupplier(item.productId, {
                                      supplierId: String(sup.id),
                                      supplierName: sup.name,
                                      lastCost: item.basePrice ?? item.cost,
                                    });
                                }}
                              >
                                <option value="sem_fornecedor">
                                  Sem Fornecedor
                                </option>
                                {suppliers.map((s) => (
                                  <option key={s.id} value={String(s.id)}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              )}
            </div>

            <div className="p-4 border-t bg-white flex justify-between items-center gap-3">
              <button 
                onClick={handleExportPDF}
                className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm"
              >
                <FileText size={16} /> Exportar PDF
              </button>
              <button
                onClick={() => setIsOrderModalOpen(false)}
                className="px-8 py-2.5 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900 transition-transform active:scale-95"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
