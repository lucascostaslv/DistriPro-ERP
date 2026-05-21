import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Calendar,
  Search,
  CheckCircle,
  Eye,
  X,
  Package,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  RefreshCw,
  Trash2,
  Landmark,
  Clock,
} from "lucide-react";
import { useTenant } from "../contexts/TenantContext";

const formatCurrency = (val) => {
  const numberVal = Number(val);
  if (isNaN(numberVal)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numberVal);
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  try {
    if (dateStr.includes("T")) dateStr = dateStr.split("T")[0];
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  } catch (e) {
    return dateStr;
  }
};

const AccountsPayable = ({ products }) => {
  const { tenantDB, currentUser } = useTenant();

  const [rawInvoices, setRawInvoices] = useState([]);
  const [rawExpenses, setRawExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [detailsModal, setDetailsModal] = useState(null);

  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const selectedMonthStr = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }, [currentDate]);

  // Carrega as contas bancárias para o seletor
  useEffect(() => {
    if (!tenantDB) return;
    const fetchAccounts = async () => {
      const accs = await tenantDB.firestore.getAll("bank_accounts");
      setBankAccounts(accs);
    };
    fetchAccounts();
  }, [tenantDB, isPayModalOpen]);

  const handleConfirmPayment = async () => {
    if (!selectedAccountId)
      return alert("Selecione uma conta para o pagamento.");
    if (!pendingPayment) return;

    const { type, id, inst, invoice, expense } = pendingPayment;
    const batch = tenantDB.firestore.batch(); // ✨ Usa o batch da DAL
    const amount = Number(inst?.value || expense?.amount || 0);
    const description =
      type === "INVOICE"
        ? `PGTO FORNECEDOR: ${invoice.header.entityName} (Parc. ${inst.number})`
        : `PGTO DESPESA: ${expense.description}`;

    try {
      batch.add("account_transactions", {
        accountId: selectedAccountId,
        type: "OUT",
        amount: amount,
        description: description,
        category: "Contas a Pagar",
        date: new Date().toISOString(),
        createdAt: tenantDB.firestore.utils.serverTimestamp(), // ✨
        userName: currentUser?.name || currentUser?.username || "Gerente",
      });

      batch.update("bank_accounts", selectedAccountId, {
        currentBalance: tenantDB.firestore.utils.increment(-amount), // ✨
      });

      if (type === "INVOICE") {
        const updatedFinancials = invoice.financials.map((f) =>
          f.number === inst.number
            ? {
                ...f,
                status: "PAGO",
                paymentDate: new Date().toISOString(),
                accountId: selectedAccountId,
              }
            : f,
        );
        batch.update("invoices", id, { financials: updatedFinancials });
      } else {
        batch.update("financial_movements", id, {
          status: "PAGO",
          accountId: selectedAccountId,
        });
      }

      await batch.commit();
      alert("Pagamento processado com sucesso!");
      setIsPayModalOpen(false);
      setPendingPayment(null);
      setSelectedAccountId("");
    } catch (e) {
      console.error(e);
      alert("Erro ao processar pagamento.");
    }
  };

  const handlePrevMonth = () =>
    setCurrentDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
    );
  const handleNextMonth = () =>
    setCurrentDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
    );

  const handleYearChange = (e) => {
    const newYear = parseInt(e.target.value, 10);
    setCurrentDate((prev) => new Date(newYear, prev.getMonth(), 1));
  };

  const handleSelectMonthSpecific = (monthIndex) => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), monthIndex, 1));
    setShowMonthPicker(false);
  };

  const categories = useMemo(() => {
    const cats = new Set(
      (products || []).map((p) => p.category).filter(Boolean),
    );
    return ["ALL", ...Array.from(cats)];
  }, [products]);

  // --- BUSCA DE DADOS EM TEMPO REAL BLINDADA ---
  useEffect(() => {
    if (!tenantDB) return;
    setLoading(true);

    const unsubInvoices = tenantDB.firestore.subscribe(
      "invoices",
      (data) => {
        setRawInvoices(
          data.map((d) => ({ id: d.id, source: "invoice", ...d })),
        );
        setLoading(false);
      },
      [tenantDB.firestore.utils.orderBy("createdAt", "desc")],
    );

    const unsubExpenses = tenantDB.firestore.subscribe(
      "financial_movements",
      (data) => {
        const mapped = data.map((item) => {
          let computedStatus = item.status || "PENDENTE";
          if (!item.status) {
            const today = new Date().toISOString().split("T")[0];
            if (item.date < today) computedStatus = "ATRASADO";
          }
          return {
            id: item.id,
            source: "expense",
            header: {
              number: "DESP",
              entityName:
                (item.category || "Geral") +
                " - " +
                (item.description || "Sem Descrição"),
              issueDate: item.createdAt?.toDate
                ? item.createdAt.toDate().toISOString()
                : item.date,
              total: Number(item.amount) || 0,
            },
            items: [],
            financials: [
              {
                number: "1",
                dueDate: item.date,
                value: Number(item.amount) || 0,
                status: computedStatus,
              },
            ],
            category: item.category,
          };
        });
        setRawExpenses(mapped);
      },
      [tenantDB.firestore.utils.where("type", "==", "EXPENSE")],
    );

    return () => {
      unsubInvoices();
      unsubExpenses();
    };
  }, [tenantDB]);

  const handleDeleteDocument = async (modalData) => {
    const isExpense = modalData.source === "expense";
    const confirm = window.confirm(
      `Tem certeza que deseja excluir esta ${isExpense ? "Despesa" : "Nota Fiscal"}?\nIsso apagará o registro permanentemente.`,
    );
    if (!confirm) return;

    if (!tenantDB) return;

    try {
      const collectionName = isExpense ? "financial_movements" : "invoices";
      await tenantDB.firestore.delete(collectionName, modalData.id);

      setDetailsModal(null);
      alert(`${isExpense ? "Despesa" : "Nota"} excluída com sucesso!`);
    } catch (error) {
      console.error("Erro ao excluir documento:", error);
      alert("Erro ao excluir o documento: " + error.message);
    }
  };

  // --- PROCESSAMENTO ---
  const payableItems = useMemo(() => {
    const allRecords = [...rawInvoices, ...rawExpenses];
    let items = [];

    allRecords.forEach((inv) => {
      if (selectedCategory !== "ALL") {
        if (inv.source === "invoice") {
          const hasCategory = inv.items?.some((i) => {
            const prod = (products || []).find((p) => p.id === i.productId);
            return prod && prod.category === selectedCategory;
          });
          if (!hasCategory) return;
        } else {
          if (inv.category !== selectedCategory) return;
        }
      }

      if (!inv.financials || inv.financials.length === 0) return;

      inv.financials.forEach((inst) => {
        if (!inst.dueDate) return;
        if (!inst.dueDate.startsWith(selectedMonthStr)) return;

        const searchLower = searchTerm.toLowerCase();
        if (
          searchTerm &&
          !inv.header.entityName.toLowerCase().includes(searchLower) &&
          !String(inv.header.number).toLowerCase().includes(searchLower)
        ) {
          return;
        }

        const safeValue = Number(inst.value) || 0;

        items.push({
          uniqueId: `${inv.id}_${inst.number}`,
          invoiceId: inv.id,
          invoiceNumber: inv.header.number,
          supplier: inv.header.entityName,
          issueDate: inv.header.issueDate,
          fullInvoice: inv,
          installmentNum: inst.number,
          dueDate: inst.dueDate,
          value: safeValue,
          status: inst.status || "PENDENTE",
          source: inv.source,
          daysToDue: Math.ceil(
            (new Date(inst.dueDate) - new Date()) / (1000 * 60 * 60 * 24),
          ),
        });
      });
    });

    return items.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [
    rawInvoices,
    rawExpenses,
    selectedMonthStr,
    selectedCategory,
    searchTerm,
    products,
  ]);

  // --- ESTADOS DO AGENDAMENTO AUTOMÁTICO ---
  const [autoPayModal, setAutoPayModal] = useState(null);
  const processingAuto = useRef(false);

  // --- ROBÔ DE PAGAMENTO AUTOMÁTICO (Vigia e liquida as contas no dia certo) ---
  useEffect(() => {
    const processAutoPays = async () => {
      if (!tenantDB || payableItems.length === 0 || processingAuto.current)
        return;

      const todayStr = new Date().toISOString().split("T")[0];

      // Filtra quem está agendado para HOJE ou antes, e ainda está pendente
      const toProcess = payableItems.filter((item) => {
        if (item.status === "PAGO") return false;
        if (item.source === "expense") {
          return (
            item.fullInvoice?.isAutoPay &&
            item.fullInvoice?.autoPayDate <= todayStr
          );
        } else {
          const inst = item.fullInvoice?.financials?.find(
            (f) => f.number === item.installmentNum,
          );
          return inst?.isAutoPay && inst?.autoPayDate <= todayStr;
        }
      });

      if (toProcess.length > 0) {
        processingAuto.current = true;
        try {
          const batch = tenantDB.firestore.batch(); // ✨ Usa o batch da DAL

          for (const item of toProcess) {
            const inst =
              item.source === "invoice"
                ? item.fullInvoice.financials.find(
                    (f) => f.number === item.installmentNum,
                  )
                : item.fullInvoice;
            const accId = inst.autoPayAccount;
            const amount = item.value;
            if (!accId) continue;

            const description = `PGTO AUTO: ${item.supplier} ${item.source === "invoice" ? `(Parc. ${item.installmentNum})` : ""}`;

            // 1. Extrato bancário
            batch.add("account_transactions", {
              accountId: accId,
              type: "OUT",
              amount: amount,
              description: description,
              category: "Contas a Pagar",
              date: new Date().toISOString(),
              createdAt: tenantDB.firestore.utils.serverTimestamp(), // ✨
              userName: "Sistema Automático",
            });

            // 2. Desconta Saldo
            batch.update("bank_accounts", accId, {
              currentBalance: tenantDB.firestore.utils.increment(-amount), // ✨
            });

            // 3. Muda Status da Dívida
            if (item.source === "invoice") {
              const updatedFinancials = item.fullInvoice.financials.map((f) =>
                f.number === item.installmentNum
                  ? {
                      ...f,
                      status: "PAGO",
                      paymentDate: new Date().toISOString(),
                      accountId: accId,
                      isAutoPay: false,
                    }
                  : f,
              );
              batch.update("invoices", item.invoiceId, {
                financials: updatedFinancials,
              });
            } else {
              batch.update("financial_movements", item.invoiceId, {
                status: "PAGO",
                accountId: accId,
                isAutoPay: false,
              });
            }
          }
          await batch.commit();
          console.log(
            `${toProcess.length} pagamentos automáticos liquidados com sucesso!`,
          );
        } catch (e) {
          console.error("Erro no auto-pay em lote:", e);
        } finally {
          processingAuto.current = false;
        }
      }
    };
    processAutoPays();
  }, [payableItems, tenantDB]);

  // --- FUNÇÃO PARA SALVAR O AGENDAMENTO (Acionada no Modal) ---
  const handleSaveAutoPay = async () => {
    if (!autoPayModal.accountId || !autoPayModal.date)
      return alert("Preencha a data e a conta.");

    const { source, invoiceId, installmentNum, fullInvoice } =
      autoPayModal.item;
    const batch = tenantDB.firestore.batch(); // ✨ Usa o batch da DAL

    if (source === "invoice") {
      const updatedFinancials = fullInvoice.financials.map((f) =>
        f.number === installmentNum
          ? {
              ...f,
              isAutoPay: true,
              autoPayDate: autoPayModal.date,
              autoPayAccount: autoPayModal.accountId,
            }
          : f,
      );
      batch.update("invoices", invoiceId, { financials: updatedFinancials });
    } else {
      batch.update("financial_movements", invoiceId, {
        isAutoPay: true,
        autoPayDate: autoPayModal.date,
        autoPayAccount: autoPayModal.accountId,
      });
    }

    await batch.commit();
    alert("Pagamento automático agendado com sucesso!");
    setAutoPayModal(null);
  };

  const totalDueMonth = payableItems.reduce(
    (acc, item) =>
      acc +
      (item.status === "PENDENTE" || item.status === "ATRASADO"
        ? item.value
        : 0),
    0,
  );
  const totalPaidMonth = payableItems.reduce(
    (acc, item) => acc + (item.status === "PAGO" ? item.value : 0),
    0,
  );
  const itemsToShow = payableItems;
  const years = Array.from(
    { length: 6 },
    (_, i) => new Date().getFullYear() - 2 + i,
  );

  const pickerRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setShowMonthPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      {/* 1. SELETOR DE DATA */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-full">
            <CalendarDays size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-700">
              Período Financeiro
            </h3>
            <p className="text-xs text-slate-500">Mês de Referência</p>
          </div>
        </div>

        <div className="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-200">
          <button
            onClick={handlePrevMonth}
            className="p-2 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500 hover:text-indigo-600"
          >
            <ChevronLeft size={20} />
          </button>

          <div
            className="flex items-center px-4 gap-2 relative"
            ref={pickerRef}
          >
            <div className="relative">
              <button
                onClick={() => setShowMonthPicker(!showMonthPicker)}
                className="text-lg font-bold text-slate-800 capitalize w-28 text-center hover:text-indigo-600 transition-colors flex justify-center items-center gap-1"
              >
                {monthNames[currentDate.getMonth()]}
              </button>

              {showMonthPicker && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 bg-white border border-slate-200 shadow-xl rounded-lg p-3 z-50 w-64 animate-in fade-in zoom-in-95 duration-200">
                  <div className="grid grid-cols-3 gap-2">
                    {monthNames.map((m, idx) => (
                      <button
                        key={m}
                        onClick={() => handleSelectMonthSpecific(idx)}
                        className={`p-2 text-xs font-bold rounded hover:bg-indigo-50 hover:text-indigo-600 transition-colors
                                            ${currentDate.getMonth() === idx ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm" : "text-slate-600 bg-slate-50"}
                                        `}
                      >
                        {m.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <select
              value={currentDate.getFullYear()}
              onChange={handleYearChange}
              className="bg-transparent text-sm font-bold text-slate-500 cursor-pointer outline-none border-none hover:text-indigo-600"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleNextMonth}
            className="p-2 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500 hover:text-indigo-600"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-xs text-slate-500 uppercase font-bold">
            A Pagar (Pendente)
          </p>
          <p className="text-2xl font-bold text-slate-800 mt-1">
            {formatCurrency(totalDueMonth)}
          </p>
        </div>
        <div className="bg-emerald-50 p-4 rounded border border-emerald-100 shadow-sm flex flex-col justify-between">
          <p className="text-xs text-emerald-600 uppercase font-bold">
            Já Pago
          </p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">
            {formatCurrency(totalPaidMonth)}
          </p>
        </div>
      </div>

      {/* 3. Filtros Secundários */}
      <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-auto flex-1">
          <label className="text-xs font-bold text-slate-500 block mb-1">
            Buscar
          </label>
          <div className="relative">
            <Search
              className="absolute left-2 top-2.5 text-slate-400"
              size={16}
            />
            <input
              className="border p-2 pl-8 rounded text-sm w-full outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Nome, número ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="w-full md:w-auto">
          <label className="text-xs font-bold text-slate-500 block mb-1">
            Categoria
          </label>
          <select
            className="border p-2 rounded text-sm w-full md:w-48 outline-none focus:ring-1 focus:ring-indigo-500"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">Todas</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. Grid de Contas */}
      {loading ? (
        <div className="text-center py-10 text-slate-500 flex flex-col items-center gap-2">
          <RefreshCw className="animate-spin text-indigo-500" size={24} />
          <p>Sincronizando contas...</p>
        </div>
      ) : itemsToShow.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded border border-dashed border-slate-300 text-slate-400">
          Nenhuma conta encontrada para{" "}
          <strong>{monthNames[currentDate.getMonth()]}</strong>.
        </div>
      ) : (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b">
              <tr>
                <th className="p-3">Vencimento</th>
                <th className="p-3">Descrição / Fornecedor</th>
                <th className="p-3 text-center">Parcela</th>
                <th className="p-3 text-right">Valor</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {itemsToShow.map((item) => (
                <tr
                  key={item.uniqueId}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="p-3 font-medium text-slate-700">
                    {formatDate(item.dueDate)}
                  </td>
                  <td className="p-3">
                    <p className="font-bold text-slate-700 truncate w-48">
                      {item.supplier}
                    </p>
                    <p className="text-[10px] text-slate-400 uppercase">
                      {item.source === "expense" ? "Despesa" : "Nota Fiscal"}
                    </p>
                  </td>
                  <td className="p-3 text-center text-slate-500">
                    {item.installmentNum}ª
                  </td>
                  <td className="p-3 text-right font-bold text-slate-900">
                    {formatCurrency(item.value)}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.status === "PAGO" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                    >
                      {item.status}
                    </span>
                    {/* Badge de Automático */}
                    {(item.source === "expense"
                      ? item.fullInvoice?.isAutoPay
                      : item.fullInvoice?.financials?.find(
                          (f) => f.number === item.installmentNum,
                        )?.isAutoPay) &&
                      item.status !== "PAGO" && (
                        <span className="mt-1 text-[9px] text-indigo-600 font-bold bg-indigo-50 rounded px-1.5 py-0.5 flex justify-center items-center gap-1 w-fit mx-auto border border-indigo-100">
                          <Clock size={10} /> Agendado
                        </span>
                      )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      {item.status !== "PAGO" && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAutoPayModal({
                                item,
                                date: item.dueDate,
                                accountId: "",
                              });
                            }}
                            className="p-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 transition-colors shadow-sm"
                            title="Agendar Pagamento Automático"
                          >
                            <Clock size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingPayment({
                                type:
                                  item.source === "expense"
                                    ? "EXPENSE"
                                    : "INVOICE",
                                id: item.invoiceId,
                                inst: {
                                  number: item.installmentNum,
                                  value: item.value,
                                },
                                invoice: item.fullInvoice,
                                expense:
                                  item.source === "expense"
                                    ? {
                                        description: item.supplier,
                                        amount: item.value,
                                      }
                                    : null,
                              });
                              setIsPayModalOpen(true);
                            }}
                            className="p-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors shadow-sm"
                            title="Pagar agora (Manual)"
                          >
                            <CheckCircle size={14} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setDetailsModal(item.fullInvoice)}
                        className="p-1.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Detalhes */}
      {detailsModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Package size={18} className="text-indigo-600" />
                Detalhes: {detailsModal.header.entityName}
              </h3>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleDeleteDocument(detailsModal)}
                  className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition-colors flex items-center gap-1 text-xs font-bold border border-red-200"
                >
                  <Trash2 size={16} /> Excluir
                </button>
                <button
                  onClick={() => setDetailsModal(null)}
                  className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-1.5 rounded"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-50 p-3 rounded border">
                  <p className="text-xs text-slate-500 font-bold uppercase">
                    Origem
                  </p>
                  <p className="font-medium text-slate-800">
                    {detailsModal.source === "expense"
                      ? "Movimento Manual"
                      : "Nota Fiscal"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Data: {formatDate(detailsModal.header.issueDate)}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded border">
                  <p className="text-xs text-slate-500 font-bold uppercase">
                    Valor Total
                  </p>
                  <p className="font-bold text-lg text-emerald-700">
                    {formatCurrency(detailsModal.header.total)}
                  </p>
                </div>
              </div>

              {detailsModal.items && detailsModal.items.length > 0 && (
                <div>
                  <h4 className="font-bold text-sm text-slate-700 mb-2 border-b pb-1">
                    Itens
                  </h4>
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
                          <td className="p-2">{item.productName}</td>
                          <td className="p-2 text-right">{item.quantity}</td>
                          <td className="p-2 text-right">
                            {formatCurrency(item.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <h4 className="font-bold text-sm text-slate-700 mb-2 border-b pb-1">
                  Financeiro
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {detailsModal.financials.map((inst, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded border text-sm ${inst.status === "PAGO" ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-600">
                          {inst.number}ª Parcela
                        </span>
                        {inst.status === "PAGO" && (
                          <CheckCircle size={12} className="text-emerald-500" />
                        )}
                      </div>
                      <div className="text-slate-500 text-xs mt-1">
                        Vence: {formatDate(inst.dueDate)}
                      </div>
                      <div className="font-bold text-slate-800">
                        {formatCurrency(Number(inst.value))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PAGAMENTO */}
      {isPayModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
              <Landmark size={20} className="text-indigo-600" /> Confirmar
              Pagamento
            </h3>
            <div className="space-y-4">
              <p className="text-sm">
                Selecione a conta para debitar{" "}
                <strong>
                  {formatCurrency(
                    pendingPayment?.inst?.value ||
                      pendingPayment?.expense?.amount,
                  )}
                </strong>
                :
              </p>
              <select
                className="w-full border p-2 rounded text-sm bg-white"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                <option value="">-- Escolha a conta --</option>
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} (Saldo: {formatCurrency(acc.currentBalance)})
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmPayment}
                  className="px-4 py-2 bg-emerald-600 text-white rounded text-sm font-bold"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE AGENDAMENTO AUTOMÁTICO */}
      {autoPayModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
              <Clock size={20} className="text-indigo-600" /> Agendar Pagamento
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              O sistema descontará o valor automaticamente na data programada,
              sem precisar de aprovação manual.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  Data da Efetivação
                </label>
                <input
                  type="date"
                  className="w-full border p-2 rounded text-sm bg-white focus:ring-2 outline-none border-slate-200 focus:ring-indigo-200"
                  value={autoPayModal.date}
                  onChange={(e) =>
                    setAutoPayModal({ ...autoPayModal, date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  Conta de Saída
                </label>
                <select
                  className="w-full border p-2 rounded text-sm bg-white focus:ring-2 outline-none border-slate-200 focus:ring-indigo-200"
                  value={autoPayModal.accountId}
                  onChange={(e) =>
                    setAutoPayModal({
                      ...autoPayModal,
                      accountId: e.target.value,
                    })
                  }
                >
                  <option value="">-- Escolha a conta --</option>
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (Saldo: {formatCurrency(acc.currentBalance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => setAutoPayModal(null)}
                  className="px-4 py-2 text-sm font-bold text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveAutoPay}
                  className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-bold flex items-center gap-2"
                >
                  <CheckCircle size={16} /> Programar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountsPayable;
