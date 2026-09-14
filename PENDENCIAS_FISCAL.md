# Pendências Fiscais — DistriPro-ERP

> Checklist vivo. Marque `[x]` conforme for resolvendo. Nasceu da auditoria fiscal de
> 2026-09-14 (relatório completo em Artifact — link no histórico da conversa) — este
> documento é a versão "pra ir marcando", não a versão de apresentação.
>
> Tudo que dependia só de código já foi corrigido (ver `git log` desta data). O que
> resta aqui depende de: (1) rodar uma migration SQL, (2) uma decisão/número da
> contadora, ou (3) configuração dentro da própria conta do Bling — nenhum desses eu
> consigo fazer sozinho.

---

## 0. Correções da 3ª rodada (guia oficial da Brasil NFe atualizado)

Você atualizou `brasilnfe_guia_api_nfe_nfce.txt` com seções novas (Eventos NF-e/NFC-e
e Empresas) que não existiam na 1ª leitura. Cruzei com o código e corrigi o que dava
pra corrigir com segurança:

- [x] **Numeração da nota parava de ser confiável** — o código calculava o "próximo
      número" consultando nossa própria tabela `fiscal_invoices` no Supabase, e
      enviava esse número pra Brasil NFe manualmente. A documentação é explícita:
      "deixar Serie/Numero/Lote em branco sempre que possível... enviar valores
      manuais arrisca conflitos de numeração". Se nossa tabela local ficasse
      dessincronizada da Brasil NFe por qualquer motivo (um insert que falhou, uma
      nota emitida direto pelo painel deles, etc.), a próxima emissão seria
      REJEITADA por "chave de acesso duplicada". Corrigido: paramos de calcular e
      enviar número — a Brasil NFe controla isso automaticamente agora, e só lemos de
      volta o número que ela atribuiu.
- [x] **`AlterarCertificado`/`VerificarCertificado` enviavam o campo errado** —
      mandavam `Base64File`, mas o nome real do campo é `Base64CertificateFile`. Esse
      é o fluxo ativo do botão "Salvar Certificado" em Configurações — corrigido.
- [x] **Dois endpoints de evento não existiam** — `CartaCorrecaoNotaFiscal` (correto:
      `EnviarCartaCorrecao`) e `InutilizarNumeracaoNotaFiscal` (correto:
      `InutilizarNumeracao`). O segundo nem está ligado a nenhuma tela ainda, mas
      corrigi os dois já.

Encontrei mais 2 pontos que **não** corrigi, porque exigem informação que não tenho:

- [ ] **Header `UserToken`** — a seção "Empresas" (certificado, numeração, cadastro)
      exige um header `UserToken` além do `Token`, e o sistema nunca guardou esse
      dado separadamente (só existe `api_token`). Sem ele, `AlterarCertificado` /
      `VerificarCertificado` podem ser rejeitados pela API real. Preciso saber onde
      no painel da Brasil NFe esse `UserToken` aparece antes de adicionar um campo
      pra ele.
- [ ] **CSC de NFC-e é configurado na Brasil NFe, não no nosso sistema** — a
      documentação mostra que o CSC (Código de Segurança do Contribuinte) é definido
      uma vez direto no cadastro da empresa na Brasil NFe (`AdicionarEmpresa`/
      `EditarEmpresa`, campos `IdCSCProducao`/`CSCProducao`/`IdCSCHomologacao`/
      `CSCHomologacao` — um par POR AMBIENTE). Nosso `fiscal_settings.csc_id`/
      `csc_token` só bloqueiam a emissão se estiverem vazios aqui — nunca chegam a
      ser enviados pra Brasil NFe. Ou seja: preencher esse campo no nosso sistema não
      configura nada de verdade lá; o CSC real precisa ser cadastrado direto no
      painel da Brasil NFe.
- [ ] **CRT "Normal" (3) não é suportado pelos Perfis Tributários hoje** — a
      documentação confirma que CRT 1/2/4 usam CSOSN e CRT 3 usa CST, e que a Brasil
      NFe REJEITA a nota se o código enviado for incompatível com o CRT da empresa.
      `TaxRulesManager.js` só tem opções de CSOSN. Não é urgente (a empresa é CRT 1 —
      Simples Nacional), mas se isso mudar um dia, os perfis tributários vão precisar
      de uma opção CST também.

---

## 1. Migrations no Supabase (você/Lucas — SQL Editor do Supabase)

Sem acesso de DDL (só a chave publishable), preciso que você rode estas 3 no
**Supabase → SQL Editor**. O código já funciona sem elas (com fallback automático),
mas os recursos abaixo só valem de verdade depois.

- [ ] `supabase_migration_icms_st.sql` — sem isso, a emissão via BrasilNFe fica
      **bloqueada** para qualquer produto com perfil de ICMS-ST (ex.: cerveja).
- [ ] `supabase_migration_fiscal_invoices_client_document.sql` — sem isso, o CPF/CNPJ
      informado na nota não fica salvo/visível na tela "Notas Fiscais Emitidas".
- [ ] `supabase_migration_bling_sync_estoque.sql` — sem isso, o checkbox novo de
      estoque duplicado no Bling não salva.

---

## 2. Perguntas para a contadora

- [ ] **Alíquota efetiva de ICMS-ST** para cerveja (DF) — já considerando MVA/redução
      de base, se houver. Assim que tiver o número: Configurações → **Perfis
      Tributários** → editar "REVENDA CERVEJA" → campo "Alíquota efetiva de ICMS-ST
      (%)" → Salvar. (Repita para qualquer outra categoria com Substituição Tributária
      que ela apontar.)
- [ ] Isso vale pra **outras categorias além de cerveja**? (refrigerante, água, energético
      etc. — confirmar quais têm ST de fato, e não só monofásico de PIS/COFINS, que são
      coisas diferentes).
- [ ] **Confirmar CFOPs de consignação mercantil** (5914/6914 remessa, 1918/2918
      retorno) e a suspensão de ICMS nessas etapas — os códigos já são o padrão
      nacional (Convênio ICMS 19/91) e o sistema já não cobra ICMS nessas etapas; é
      mais confirmação do que mudança.
- [ ] **Esta empresa precisa continuar uma numeração antiga** de NF-e/NFC-e de outro
      sistema/emissor? Só é relevante se sim — a numeração já é automática e já separa
      homologação de produção sozinha (não precisa de decisão no caso comum).
- [ ] Confirmar que **CST PIS/COFINS 04 (monofásico)** se aplica a todas as bebidas
      vendidas, não só cerveja (refrigerante, energético, água com gás também entram
      na lista de monofásico por lei — vale conferir produto a produto).

---

## 3. Configuração dentro da conta do Bling (quem administra a conta)

Guia completo já está em `integracao-api-bling-notas-fiscais.md` neste repositório.
Passos que faltam, na ordem:

- [ ] **Criar o aplicativo no Bling** (Central de Extensões → Área do Integrador →
      Criar aplicativo) e obter `client_id`/`client_secret`, se ainda não feito.
- [ ] **Conectar a integração** em Super Admin → Integração Fiscal → Bling (fluxo
      OAuth — clicar em conectar e autorizar).
- [ ] **Configurar o certificado digital A1** direto na conta do Bling (não pela API):
      ícone de perfil da empresa → Todas as configurações → Certificado Digital.
      Confirmar que o CNPJ exibido depois do teste é o correto (60.333.850/0001-33).
- [ ] **Cadastrar a Natureza de Operação** (define a tributação calculada pelo Bling)
      — uma para NF-e, uma para NFC-e — e mapear os IDs em Super Admin → Integração
      Fiscal → Bling (`natureza_operacao_nfe_id` / `natureza_operacao_nfce_id`, hoje
      `null`).
- [ ] **Mapear a Loja** (`loja_id`, hoje `null`) — opcional, mas recomendado.
- [ ] **Mapear as 5 Formas de Pagamento** (Dinheiro, Crédito, Débito, Pix, Outros —
      hoje todas `null`) contra o cadastro de "Formas de Pagamentos" do Bling.
- [ ] **Trocar o ambiente de HOMOLOG para PRODUÇÃO** quando estiver tudo validado
      (`Preferências/Configurações > Notas fiscais > Configurações de NF-e`, dentro do
      Bling, + o campo `environment` em `fiscal_bling_settings`).
- [ ] **Conferir o cadastro fiscal de cada produto com ICMS-ST dentro do Bling**
      (NCM + regra fiscal do produto) — é o Bling que calcula ICMS/ICMS-ST quando a
      nota sai por ele, não o nosso sistema. Começar pelos 21 produtos do perfil
      "REVENDA CERVEJA".
- [ ] **Testar o cancelamento de nota em Homologação** antes de contar com o botão em
      produção — troquei o endpoint usado (`PUT /nfe/{id}` com `situacao: 2`), mas
      nem o guia interno nem a referência oficial confirmam 100% que esse é o
      mecanismo certo (só que `/cancelar` não existe). Se falhar, cancelar direto na
      tela do Bling por enquanto.
- [ ] **Decidir**: o estoque do Bling é usado para algo (relatório, outro canal de
      venda)? Se sim, marcar o checkbox novo "Também dar baixa de estoque dentro do
      Bling" em Super Admin → Integração Fiscal. Se não, deixar desmarcado (padrão).

---

## 4. Fora de escopo por ora (projetos grandes, não uma correção pontual)

- [ ] **Hash de senha** (login de loja + confirmação de exclusão de nota fiscal) —
      hoje compara texto puro direto numa query do Firestore. Migrar exige mudar a
      lógica de login e reprocessar todos os usuários existentes; fazer só com uma
      janela de manutenção dedicada, não de passagem.
- [ ] **Exportação SPED real** — hoje é um esqueleto (modelo fixo em "55", maioria dos
      campos tributários zerados). Implementar EFD ICMS/IPI de verdade é um projeto
      próprio (dezenas de registros/blocos do layout oficial). **Antes de começar,
      confirmar com a contadora se a empresa é sequer obrigada a entregar EFD
      ICMS/IPI completo** — muita empresa do Simples Nacional não é, depende do
      estado e de regras específicas. Decisão explícita em 2026-09-14: aguardar essa
      confirmação antes de iniciar.

---

## 5. Avaliado e mantido como está (não é bug, decisão consciente)

- Duas chamadas independentes a `fiscal_clients` (fornecedores) em `InventoryWMS.js` e
  `App.js` — redundante, mas o cadastro rápido de fornecedor dentro do WMS depende do
  estado local pra aparecer na hora. Unificar arriscaria essa funcionalidade por um
  ganho pequeno (evitar 1 requisição). Não fiscal, não prioritário.
