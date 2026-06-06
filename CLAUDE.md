# DistriPro-ERP — Contexto para Claude

## O que é este projeto

ERP web completo voltado para **distribuidoras e pontos de venda de bebidas no Brasil**. Multi-tenant (múltiplas lojas por instância), com PDV, estoque, fiscal (NF-e/NFC-e), financeiro e gestão de caixa. Stack: React 18 + Firebase Firestore + Supabase (PostgreSQL) + Tailwind CSS.

Deploy no Vercel. Sem backend próprio — toda lógica roda no cliente ou via Firebase/Supabase diretamente.

---

## Arquitetura geral

### Multi-tenancy
- Cada loja tem seu próprio Firebase App instance, cacheado em `appCache` dentro de `src/firebase.js`
- O contexto global `TenantContext` (`src/contexts/TenantContext.js`) gerencia qual loja está ativa e expõe `tenantDB`
- Caminho Firestore padrão: `/artifacts/{appId}/public/data/{coleção}`
- `tenantDAL` (Data Access Layer) em `firebase.js` abstrai todas as ops de leitura/escrita

### Duas bases de dados
| Base | Uso |
|------|-----|
| Firebase Firestore | Dados operacionais principais (produtos, vendas, caixa, clientes, notas fiscais, etc.) |
| Supabase (PostgreSQL) | Perfis de imposto fiscal (`fiscal_tax_profiles`) — mantido por compatibilidade |

O objeto `tenantDB` em `TenantContext` unifica os dois, expondo `.firestore.*` e `.supabase.*` com a mesma assinatura.

### Proxy para API fiscal
- Dev: `src/setupProxy.js` usa `http-proxy-middleware` — roteia `/services/*` para `https://api.brasilnfe.com.br`
- Prod (Vercel): `vercel.json` + `api/proxy.js` (serverless function) fazem o mesmo

---

## Mapa de arquivos — `src/`

```
src/
├── App.js                          # Componente principal (>5000 linhas) — login, PDV, navegação por abas
├── index.js                        # Entrada React — envolve com <TenantProvider>
├── index.css                       # CSS global + Tailwind imports
├── firebase.js                     # Config Firebase, tenantDAL, appCache multi-tenant
├── supabaseClient.js               # Instância Supabase (usa REACT_APP_SUPABASE_*)
├── setupProxy.js                   # Proxy dev para BrasilNFe API
├── DistriProERP.js                 # Placeholder legado — não usar
│
├── contexts/
│   └── TenantContext.js            # Context global: currentStore, currentUser, tenantDB
│
├── EntradaNotas/
│   ├── EntradaNotas.js             # Entrada de NF de compra — importação XML + manual
│   ├── AccountsPayable.js          # Contas a pagar — vencimentos, status de pagamento
│   ├── FiscalInvoices.js           # NF-e/NFC-e emitidas — consulta, download PDF/XML
│   └── Transactions.js             # Lançamento manual de transações financeiras
│
├── utils/
│   ├── NFeBuilder.js               # Monta payload XML para NF-e (mod 55) e NFC-e (mod 65)
│   ├── NFeService.js               # Comunica com BrasilNFe API (emissão, consulta, certificado)
│   └── TaxCalculator.js            # Calcula CFOP, ICMS, PIS, COFINS por regime tributário
│
├── InventoryWMS.js                 # WMS — estoque, ajustes, transferências, lotes, análises
├── ClientsManager.js               # CRUD clientes/fornecedores — CPF/CNPJ, contato, stats
├── BankAccountsManager.js          # Contas bancárias — saldos, transferências, extrato com conciliação fiscal
├── CashClosingManager.js           # Fechamento de caixa diário — conferência, sangria
├── CaixaService.js                 # Sessões de caixa — abertura/fechamento, movimentações
├── PriceGroups.js                  # Grupos de preço com margens dinâmicas
├── DoseManager.js                  # Controle de doses — garrafas abertas, doses servidas
├── PurchaseSuggestion.js           # Sugestão de compra — análise de giro, cobertura de estoque
├── TaxRulesManager.js              # Perfis de imposto — CSOSN, CFOP, origem
├── ComandaManager.js               # Gerenciamento de comandas (bar/restaurante)
│
└── img/
    ├── LOGO-MAQUINA-PNG.png
    └── logo-maquina-texto-branco.png
```

---

## Coleções Firestore (por loja)

| Coleção | Conteúdo |
|---------|----------|
| `products` | Catálogo — preços, estoque, NCM, CEST, código de barras |
| `sales` | Transações de venda com itens, formas de pagamento, totais |
| `priceGroups` | Grupos de preço com margem percentual |
| `clients` | Clientes e fornecedores com CPF/CNPJ |
| `suppliers` | Dados de fornecedores |
| `bank_accounts` | Contas bancárias da empresa |
| `account_transactions` | Extrato bancário — campo `reconciled: boolean` indica se a transação foi conciliada |
| `financial_movements` | Despesas e receitas |
| `financial_settings` | Roteamento de formas de pagamento por conta |
| `caixa_sessoes` | Sessões de caixa abertas/fechadas |
| `caixa_movimentacoes` | Movimentos de caixa (sangrias) |
| `cash_closings` | Registros de fechamento diário |
| `transaction_categories` | Categorias de despesa |
| `fiscal_invoices` | NF-e/NFC-e emitidas (metadados + base64 do documento) |
| `nfe_settings` | Token API, certificado digital, CSC para NFC-e |
| `tax_profiles` | Regras CSOSN/CFOP por produto/regime |

**Supabase:** `fiscal_tax_profiles` — configurações de regime tributário em PostgreSQL.

---

## Integração Fiscal (BrasilNFe)

- **API base:** `https://api.brasilnfe.com.br/services/`
- **Autenticação:** header `token` + `UserToken` (configurados em `nfe_settings` no Firestore)
- **NF-e modelo 55** — nota fiscal padrão para vendas B2B
- **NFC-e modelo 65** — cupom fiscal para varejo (consumidor final, requer CSC)
- Certificado digital A1 (.pfx) enviado via `NFeService.js` → `empresa/AlterarCertificado`
- `NFeBuilder.js` gera o XML completo com tributos calculados por `TaxCalculator.js`

---

## Variáveis de ambiente

```
REACT_APP_SUPABASE_URL=...
REACT_APP_SUPABASE_PUBLISHABLE_KEY=...
```

As credenciais Firebase estão hardcoded em `src/firebase.js` (mover para env vars antes de produção segura).

---

## Comandos

```bash
npm install       # instalar dependências
npm start         # dev server em localhost:3000
npm run build     # build de produção (CI=false ignora warnings como erros)
```

---

## Pontos de atenção / dívida técnica

- **`App.js` tem +5000 linhas** — contém login, seleção de loja, PDV, gestão de produtos, configurações. Candidato prioritário para divisão em componentes menores durante refatoração.
- **Credenciais Firebase hardcoded** em `src/firebase.js` — devem ir para variáveis de ambiente.
- **`DistriProERP.js` na raiz e em `src/`** são placeholders legados sem uso funcional.
- **Arquivos na raiz do projeto** (`Dashboard.js`, `Sidebar.js`, `POS.js`, etc.) são versões antigas/duplicatas — a versão funcional está em `src/App.js`.
- Não há testes automatizados configurados.
- Não há gerenciamento de estado global (Redux/Zustand) — tudo por `useState` + `TenantContext`.

---

## Fluxo típico de uma venda (PDV)

1. Usuário faz login → seleciona loja (`App.js`)
2. Abre sessão de caixa via `CaixaService.js`
3. Adiciona produtos ao carrinho (busca em `products` no Firestore)
4. Seleciona forma de pagamento (dinheiro, cartão, Pix, fiado)
5. Se emitir NFC-e: `NFeBuilder.js` monta XML → `NFeService.js` envia para BrasilNFe → salva retorno em `fiscal_invoices`
6. Venda salva em `sales`; estoque decrementado em `products`
7. Fechamento de caixa via `CashClosingManager.js`
