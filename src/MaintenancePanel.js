// src/MaintenancePanel.js
// Reset de dados operacionais de UMA loja específica. Extraído de SettingsManager (App.js)
// para ficar acessível apenas pelo painel de Super Admin (cadastro de lojas), e não pelo
// Gerente da loja — são ações permanentes e destrutivas.
import React, { useState } from "react";
import { AlertTriangle, Trash2, Boxes, Loader2 } from "lucide-react";
import { useTenant } from "./contexts/TenantContext";

const RESETTABLE_COLLECTIONS = [
  { id: "sales", label: "Vendas" },
  { id: "financial_movements", label: "Despesas / Receitas Lançadas" },
  { id: "account_transactions", label: "Extrato das Contas Bancárias" },
  { id: "caixa_sessoes", label: "Sessões de Caixa" },
  { id: "caixa_movimentacoes", label: "Movimentações de Caixa (Sangrias)" },
  { id: "cash_closings", label: "Histórico de Fechamentos de Caixa" },
  { id: "fiscal_invoices", label: "Notas Fiscais Emitidas (NF-e/NFC-e)" },
];

const MaintenancePanel = ({ showNotification }) => {
  const { tenantDB } = useTenant();

  const [selectedResetCollections, setSelectedResetCollections] = useState([]);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResettingDashboard, setIsResettingDashboard] = useState(false);
  const [isClearingStock, setIsClearingStock] = useState(false);

  const toggleResetCollection = (id) => {
    setSelectedResetCollections((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  // Apaga em lotes de 450 (limite do Firestore é 500 operações por batch)
  const deleteCollectionInBatches = async (collectionName) => {
    const docs = await tenantDB.firestore.getAll(collectionName);
    for (let i = 0; i < docs.length; i += 450) {
      const chunk = docs.slice(i, i + 450);
      const batch = tenantDB.firestore.batch();
      chunk.forEach((d) => batch.delete(collectionName, d.id));
      await batch.commit();
    }
    return docs.length;
  };

  const handleResetDashboard = async () => {
    if (selectedResetCollections.length === 0) {
      return showNotification("Selecione ao menos uma coleção para resetar.", "error");
    }
    if (resetConfirmText !== "RESETAR") {
      return showNotification('Digite "RESETAR" para confirmar.', "error");
    }
    if (
      !window.confirm(
        `Tem certeza? Isso vai apagar PERMANENTEMENTE os dados de: ${selectedResetCollections.join(", ")}.\n\nProdutos e Comandas NÃO serão afetados. Esta ação não pode ser desfeita.`,
      )
    )
      return;

    setIsResettingDashboard(true);
    try {
      let totalDeleted = 0;
      for (const collectionId of selectedResetCollections) {
        totalDeleted += await deleteCollectionInBatches(collectionId);
      }
      showNotification(`Reset concluído! ${totalDeleted} registro(s) removido(s).`, "success");
      setSelectedResetCollections([]);
      setResetConfirmText("");
    } catch (e) {
      console.error(e);
      showNotification("Erro ao resetar dados: " + e.message, "error");
    } finally {
      setIsResettingDashboard(false);
    }
  };

  // Zera SOMENTE o campo de quantidade em estoque dos produtos.
  // O produto em si (nome, preço, NCM, código de barras etc.) é mantido intacto.
  const handleClearStockQuantities = async () => {
    if (
      !window.confirm(
        "Isso vai zerar a QUANTIDADE EM ESTOQUE de todos os produtos. Os produtos em si (cadastro, preço, NCM etc.) serão mantidos. Confirma?",
      )
    )
      return;

    setIsClearingStock(true);
    try {
      const allProducts = await tenantDB.firestore.getAll("products");
      for (let i = 0; i < allProducts.length; i += 450) {
        const chunk = allProducts.slice(i, i + 450);
        const batch = tenantDB.firestore.batch();
        chunk.forEach((p) => batch.update("products", p.id, { stock: 0 }));
        await batch.commit();
      }
      showNotification(`Estoque zerado em ${allProducts.length} produto(s).`, "success");
    } catch (e) {
      console.error(e);
      showNotification("Erro ao zerar estoque: " + e.message, "error");
    } finally {
      setIsClearingStock(false);
    }
  };

  if (!tenantDB) return null;

  return (
    <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in space-y-8">
      <div className="bg-amber-50 border border-amber-200 rounded p-4 flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          Área restrita a administradores. As ações abaixo são <strong>permanentes e não podem ser desfeitas</strong>.
          Produtos e Comandas nunca são excluídos por essas ferramentas.
        </p>
      </div>

      {/* Bloco 1: Reset de dados operacionais */}
      <div>
        <h3 className="font-bold mb-1 flex items-center gap-2 text-red-700">
          <Trash2 size={20} /> Reset de Dados do Dashboard
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Selecione quais coleções deseja apagar permanentemente. Produtos e Comandas estão sempre protegidos e nunca aparecem nesta lista.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
          {RESETTABLE_COLLECTIONS.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2 p-3 border rounded cursor-pointer hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={selectedResetCollections.includes(c.id)}
                onChange={() => toggleResetCollection(c.id)}
              />
              <span className="text-sm font-medium text-slate-700">{c.label}</span>
            </label>
          ))}
        </div>

        <div className="bg-red-50 border border-red-200 rounded p-4 space-y-3">
          <label className="text-xs font-bold text-red-700 uppercase block">
            Digite RESETAR para confirmar
          </label>
          <input
            className="w-full max-w-xs border p-2 rounded text-sm"
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            placeholder="RESETAR"
          />
          <button
            onClick={handleResetDashboard}
            disabled={isResettingDashboard || resetConfirmText !== "RESETAR" || selectedResetCollections.length === 0}
            className="bg-red-600 text-white px-6 py-2 rounded font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isResettingDashboard ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {isResettingDashboard ? "Apagando..." : "Apagar Dados Selecionados"}
          </button>
        </div>
      </div>

      {/* Bloco 2: Zerar apenas quantidade em estoque */}
      <div className="border-t pt-6">
        <h3 className="font-bold mb-1 flex items-center gap-2 text-slate-800">
          <Boxes size={20} className="text-slate-600" /> Zerar Quantidade em Estoque
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Zera apenas o campo de quantidade em estoque de cada produto. O cadastro do produto (nome, preço, NCM, código de barras etc.) é mantido intacto.
        </p>
        <button
          onClick={handleClearStockQuantities}
          disabled={isClearingStock}
          className="bg-slate-800 text-white px-6 py-2 rounded font-bold hover:bg-slate-900 disabled:opacity-40 flex items-center gap-2"
        >
          {isClearingStock ? <Loader2 size={16} className="animate-spin" /> : <Boxes size={16} />}
          {isClearingStock ? "Zerando..." : "Zerar Estoque de Todos os Produtos"}
        </button>
      </div>
    </div>
  );
};

export default MaintenancePanel;
