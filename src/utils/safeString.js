// src/utils/safeString.js
//
// Normaliza um valor que DEVERIA ser string (nome de produto/cliente/fornecedor/categoria/
// conta bancária etc., vindo do Firestore/Supabase) mas que pode chegar como undefined, null,
// ou até um objeto aninhado por bug de escrita em outro ponto do sistema — isso já aconteceu
// de verdade nesta base (categoria em Transactions.js, produto em PriceGroups.js e no
// dropdown de EntradaNotas.js: um `name: {name: "Aluguel"}` gravado por engano). Sem essa
// normalização, chamar métodos de string (.toUpperCase, .toLowerCase, .includes...) ou
// renderizar o valor cru no JSX quebra a tela inteira ("Objects are not valid as a React
// child" ou "Cannot read properties of undefined").
export const safeStr = (val, fallback = "") => {
  if (typeof val === "string") return val;
  if (val == null) return fallback;
  if (typeof val === "object" && typeof val.name === "string") return val.name;
  return fallback;
};
