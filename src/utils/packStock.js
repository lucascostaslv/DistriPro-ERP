// Resolve o produto que realmente guarda o estoque de um item do carrinho/estoque.
//
// Regra de negócio (decidida em 2026-09-14 — ver Apêndice A do documento de
// elicitação): um produto tipo "pack" (caixa/fardo) aponta seu estoque para o
// produto pai via `parentId` + `conversionFactor`. Se esse pai não existir
// mais no cadastro (órfão — o vínculo quebrou em algum momento), o pack deixa
// de ser tratado como pack: passa a ser uma unidade normal, com estoque
// próprio (`factor: 1`), em vez de travar a operação com "No document to
// update" ou de escrever silenciosamente em um documento inexistente.
export const resolveStockTarget = (product, allProducts) => {
  if (product?.itemType === "pack" && product.parentId) {
    const parent = allProducts.find((p) => p.id === product.parentId);
    if (parent) {
      return { target: parent, factor: product.conversionFactor || product.packQuantity || 1 };
    }
  }
  return { target: product, factor: 1 };
};

// Estoque disponível para exibição, já aplicando a mesma regra acima e
// descontando `reserved_stock` (fiado). Substitui as implementações
// duplicadas que existiam em App.js, InventoryWMS.js e PurchaseSuggestion.js.
export const getDisplayStock = (product, allProducts) => {
  if (!product) return 0;
  const { target, factor } = resolveStockTarget(product, allProducts);
  if (!target) return 0;
  const available = Math.max(0, (target.stock || 0) - (target.reserved_stock || 0));
  return factor === 1 ? available : Math.floor(available / factor);
};
