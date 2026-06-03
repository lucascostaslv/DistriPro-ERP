# DistriPro-ERP

ERP web para distribuidoras e pontos de venda de bebidas no Brasil. Inclui PDV, gestão de estoque (WMS), emissão de NF-e/NFC-e, controle financeiro e fechamento de caixa.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| UI | React 18 + Tailwind CSS + Lucide React |
| Banco principal | Firebase Firestore (real-time) |
| Banco auxiliar | Supabase (PostgreSQL) — perfis fiscais |
| Documentos | jsPDF + jsPDF-AutoTable |
| Fiscal | BrasilNFe API (NF-e mod 55 / NFC-e mod 65) |
| Deploy | Vercel (serverless proxy para API fiscal) |

## Pré-requisitos

- Node.js 18+
- Conta Firebase com Firestore habilitado
- Conta Supabase (para perfis de imposto)
- Token BrasilNFe + certificado digital A1 (para emissão fiscal)

## Instalação e execução

```bash
npm install
npm start        # dev em http://localhost:3000
npm run build    # build de produção
```

## Variáveis de ambiente

Crie um arquivo `.env` na raiz:

```
REACT_APP_SUPABASE_URL=sua_url_supabase
REACT_APP_SUPABASE_PUBLISHABLE_KEY=sua_chave_publica
```

> As credenciais Firebase estão em `src/firebase.js`. Mova-as para variáveis de ambiente antes de expor o repositório publicamente.

## Módulos principais

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/App.js` | Aplicação principal — login, PDV, navegação (>5000 linhas) |
| `src/contexts/TenantContext.js` | Estado global: loja ativa, usuário, acesso ao banco |
| `src/firebase.js` | Config Firebase multi-tenant, Data Access Layer |
| `src/InventoryWMS.js` | Estoque — ajustes, lotes, transferências, análises |
| `src/ClientsManager.js` | Clientes e fornecedores (CPF/CNPJ, contato) |
| `src/BankAccountsManager.js` | Contas bancárias, transferências, extrato |
| `src/CashClosingManager.js` | Fechamento de caixa diário |
| `src/CaixaService.js` | Sessões de caixa (abertura/fechamento) |
| `src/PriceGroups.js` | Grupos de preço com margem percentual |
| `src/DoseManager.js` | Controle de doses para bar/restaurante |
| `src/PurchaseSuggestion.js` | Sugestão de compra por análise de giro |
| `src/TaxRulesManager.js` | Perfis fiscais — CSOSN, CFOP, origem |
| `src/ComandaManager.js` | Comandas para bar/restaurante |
| `src/EntradaNotas/EntradaNotas.js` | Entrada de NF de compra (XML ou manual) |
| `src/EntradaNotas/AccountsPayable.js` | Contas a pagar |
| `src/EntradaNotas/FiscalInvoices.js` | NF-e/NFC-e emitidas — consulta e download |
| `src/EntradaNotas/Transactions.js` | Lançamentos financeiros manuais |
| `src/utils/NFeBuilder.js` | Monta XML de NF-e/NFC-e |
| `src/utils/NFeService.js` | Comunicação com BrasilNFe API |
| `src/utils/TaxCalculator.js` | Cálculo de CFOP, ICMS, PIS, COFINS |

## Arquitetura multi-tenant

Cada loja tem um Firebase App próprio (cacheado em `appCache`). O `TenantContext` mantém qual loja está ativa e expõe `tenantDB` com métodos unificados para Firestore e Supabase.

Caminho Firestore por loja: `/artifacts/{appId}/public/data/{coleção}`

## Emissão fiscal

O fluxo de emissão de NFC-e/NF-e é:

```
NFeBuilder.js  →  monta XML com tributos calculados pelo TaxCalculator
      ↓
NFeService.js  →  envia para BrasilNFe API via /services/fiscal/nfce ou nfe
      ↓
Resultado salvo em fiscal_invoices no Firestore
```

Em desenvolvimento, `/services/*` é proxiado por `src/setupProxy.js`. Em produção (Vercel), por `api/proxy.js`.

## Deploy (Vercel)

O `vercel.json` redireciona `/services/*` para a serverless function `api/proxy.js`, que repassa as requisições para a BrasilNFe API com os headers corretos. Não são necessárias configurações adicionais além das variáveis de ambiente Supabase.
