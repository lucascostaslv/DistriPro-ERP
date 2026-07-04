# Guia de Integração com a API do Bling para Emissão de Notas Fiscais

> Baseado na documentação oficial do Bling Developers (developer.bling.com.br) — API v3, REST, autenticação OAuth 2.0.

---

## 1. Visão geral da arquitetura

A API do Bling (v3) segue o padrão **REST**:

- Métodos HTTP: `GET` (obter), `POST` (criar/executar ação), `PUT` (atualizar tudo), `PATCH` (atualizar parcialmente), `DELETE` (remover).
- Formato de dados: **JSON**.
- Autenticação: **OAuth 2.0**, com tokens do tipo **Bearer**.
- Host de produção: `https://api.bling.com.br/Api/v3`
- Exemplo de requisição:

```
GET https://api.bling.com.br/Api/v3/produtos
Authorization: Bearer {access_token}
```

Ponto importante para quem vai emitir notas fiscais: **a API não recebe o arquivo do certificado digital**. O certificado é cadastrado diretamente na conta do Bling (interface web), e é o próprio Bling quem assina e transmite o XML para a SEFAZ. A API é usada para criar/consultar a nota e disparar o envio — não para lidar com criptografia do certificado. Isso é detalhado na seção 4.

---

## 2. Passo 1 — Criar o aplicativo (client_id / client_secret)

Antes de qualquer chamada à API é preciso cadastrar um "aplicativo" no Bling, que gera as credenciais OAuth.

1. Ter uma conta no Bling (ou criar uma em bling.com.br).
2. Acessar a **Central de Extensões > Área do Integrador** e clicar em **Criar aplicativo**.
3. Preencher os dados do app:
   - Nome, logo, categoria, descrição
   - **Link de redirecionamento** (`redirect_uri`) — usado no fluxo OAuth
   - Link da homepage / manual / vídeo demonstrativo
   - Dados de contato do desenvolvedor
   - **Lista de escopos** — as permissões que o app vai usar (ex.: Notas Fiscais, Produtos, Contatos). O app só acessa os dados dos escopos marcados.
4. Salvar. A partir daí, a aba **"Informações do app"** exibe o **Client ID** e o **Client Secret** (o secret fica oculto até clicar no ícone de olho, e pode ser redefinido a qualquer momento).

> Recomenda-se criar um usuário específico no Bling só para gerenciar aplicativos (**Preferências > Sistema > Usuários**, com a permissão "Cadastro de aplicativos"), em vez de usar o usuário administrador.

Guarde `client_id` e `client_secret` com segurança — eles nunca devem ser expostos no front-end ou em repositórios públicos.

---

## 3. Passo 2 — Autenticação OAuth 2.0

O Bling usa exclusivamente o fluxo **Authorization Code** do OAuth 2.0.

### 3.1 Fluxo resumido

1. O app redireciona o usuário para o endpoint de autorização do Bling.
2. O usuário faz login no Bling e autoriza o app.
3. O Bling redireciona de volta para a `redirect_uri` cadastrada, com um `authorization_code` (válido por **1 minuto**).
4. O app troca esse `code` por um `access_token` + `refresh_token`, via requisição **server-to-server**.
5. O app usa o `access_token` (Bearer) nas chamadas à API.

### 3.2 Requisição de autorização

```
GET https://www.bling.com.br/Api/v3/oauth/authorize
    ?response_type=code
    &client_id={client_id}
    &state={valor_aleatorio}
```

- `redirect_uri` e `scope` são opcionais na URL — o Bling sempre usa os valores cadastrados no app.
- `state` é obrigatório e deve ser um valor aleatório único por requisição, para você validar que o retorno corresponde à sua solicitação (proteção contra CSRF).

O Bling redireciona de volta para sua `redirect_uri` com:

```
https://seuapp.com.br/callback?code={authorization_code}&state={mesmo_state}
```

### 3.3 Troca do código por tokens (`access_token` / `refresh_token`)

```
POST https://api.bling.com.br/Api/v3/oauth/token
Content-Type: application/x-www-form-urlencoded
Accept: 1.0
Authorization: Basic {base64(client_id:client_secret)}

grant_type=authorization_code&code={authorization_code}
```

Regras importantes:

- As credenciais vão no **header** (`Authorization: Basic`), nunca no body.
- `client_id:client_secret` deve ser concatenado com `:` e codificado em **base64**.
- Essa chamada deve ser feita **inteiramente no backend** (server-to-server), nunca no navegador/app cliente — para não expor `client_secret`.
- Use sempre **HTTPS/TLS**.

Exemplo com cURL:

```bash
curl --location --request POST 'https://api.bling.com.br/Api/v3/oauth/token' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --header 'Accept: 1.0' \
  --header 'Authorization: Basic BASE64_CLIENT_ID_SECRET' \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode 'code=SEU_AUTHORIZATION_CODE'
```

Resposta (JSON) — contém `access_token`, `token_type` (`Bearer`), `expires_in`, `scope` e `refresh_token`.

> ⚠️ O Bling descontinuou a autenticação com token opaco (API v2). Toda integração nova deve usar o modelo JWT/OAuth 2.0 da API v3.

### 3.4 Renovando o token (`refresh_token`)

Quando o `access_token` expira, use o `refresh_token` (validade de **30 dias**) para obter um novo par de tokens, sem precisar repetir o login do usuário:

```
POST https://api.bling.com.br/Api/v3/oauth/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {base64(client_id:client_secret)}

grant_type=refresh_token&refresh_token={refresh_token}
```

A resposta segue o mesmo formato da troca do `authorization_code`.

### 3.5 Usando o token nas requisições

```
GET /Api/v3/{recurso}
Host: https://api.bling.com.br
Authorization: Bearer {access_token}
```

Exemplo:

```bash
curl --location --request GET 'https://api.bling.com.br/Api/v3/contatos' \
  --header 'Authorization: Bearer 4a9de71b8aaf91c8ebbf830888354d5479e83a01'
```

### 3.6 Revogando tokens

```
POST https://api.bling.com.br/Api/v3/oauth/revoke
Authorization: Basic {base64(client_id:client_secret)}
```

Existem parâmetros de "revogação avançada" (`revoke_action`, `revoke_target`) para revogar todos os tokens de um usuário/empresa de uma vez — útil quando o cliente desinstala a integração.

### 3.7 Boas práticas de segurança recomendadas pelo Bling

- Nunca compartilhe `client_secret`, `access_token` ou `refresh_token`.
- Gere um `state` único por requisição de autorização e valide-o no retorno.
- Sempre faça a troca de tokens server-to-server.
- Use HTTPS em 100% das chamadas.

---

## 4. Passo 3 — Certificado digital (fora da API)

Este é o ponto que costuma gerar confusão: **o certificado digital NÃO é enviado via API**. Ele é cadastrado uma única vez, diretamente na conta Bling (via navegador), e passa a valer para toda a emissão fiscal daquela conta — seja feita manualmente na tela do Bling, seja disparada via API.

### 4.1 O que você precisa antes

- Um certificado digital **e-CNPJ**, do tipo **A1** (arquivo `.pfx`/`.p12`) ou **A3** (token/cartão físico), vinculado ao mesmo CNPJ cadastrado na conta Bling.
- A senha do certificado, definida pela certificadora no momento da emissão (o Bling **não tem acesso e não recupera essa senha**).
- Empresa habilitada para emissão de NF-e junto à SEFAZ do seu estado, com Inscrição Estadual cadastrada.

O Bling também vende certificado A1 em parceria com a Certisign, caso você ainda não tenha um.

### 4.2 Onde configurar

No painel do Bling (não na API):

```
Ícone de perfil da empresa > Todas as configurações
  > Certificado Digital > Configurações de certificado digital
```

- Escolha o tipo: **A1 – Servidor** é o recomendado (armazena o certificado no Bling, liberando a emissão de qualquer dispositivo/local — inclusive das chamadas feitas pela sua integração via API). As opções A1 – Máquina Cliente e A3 dependem de instalação local e podem ter incompatibilidades com macOS.
- Clique em **Adicionar/Anexar certificado**, envie o arquivo `.pfx`/`.p12` (ou arraste para a área indicada).
- Informe a senha e clique em **Testar**. Se a validação for bem-sucedida, o Bling exibirá o CNPJ e a validade do certificado — confira se correspondem à empresa correta.
- Salve.

A partir daqui, qualquer nota emitida pela API (ou pela tela do Bling) usará automaticamente esse certificado para assinar e enviar o XML à SEFAZ.

### 4.3 Ambientes de homologação e produção

O Bling permite configurar a emissão em:

- **Homologação**: notas de teste, sem valor fiscal — útil para validar a integração antes de ir ao ar.
- **Produção**: notas reais, autorizadas pela SEFAZ.

Essa configuração fica em `Preferências/Configurações > Notas fiscais > Configurações de NF-e`.

Além disso, a própria API v3 tem um fluxo de **homologação de aplicativos** (endpoints `GET/POST /homologacao/produtos`) que o Bling usa para validar que seu app segue as boas práticas antes de liberá-lo para produção — isso é relevante se você pretende publicar o app na Central de Extensões, e é separado da homologação fiscal da NF-e.

---

## 5. Passo 4 — Pré-requisitos fiscais na conta Bling

Antes de emitir a primeira nota pela API, a conta Bling precisa estar com:

1. **Dados da empresa completos**, incluindo **Inscrição Estadual (IE)** — `Preferências > Empresa > Alterar dados da empresa`.
2. **Certificado digital configurado** (seção 4).
3. **Natureza de operação** cadastrada — define as regras de tributação (ICMS, IPI, PIS, COFINS, ISSQN etc.) aplicadas a cada tipo de nota. Sem isso, o cálculo de impostos falha.
4. **Produtos com NCM/CST preenchidos** — sem NCM, a emissão de NF-e é bloqueada.
5. Série e numeração inicial da nota, definidas nas configurações de NF-e.

---

## 6. Passo 5 — Endpoints da API para Notas Fiscais

O Bling separa a emissão fiscal em três famílias de recursos, todas sob o `x-api-resource: NotasFiscais`:

| Tipo de documento | Caminho base | Uso |
|---|---|---|
| **NF-e** (nota fiscal de produto) | `/nfe` | Vendas de produtos entre empresas/consumidores fora do varejo presencial |
| **NFC-e** (nota fiscal de consumidor) | `/nfce` | Venda no varejo/PDV |
| **NFS-e** (nota fiscal de serviço) | `/nfse` | Prestação de serviços |

As três seguem o mesmo padrão de operações (confirmado na especificação oficial para `/nfce`, e replicado para `/nfe`/`/nfse`):

### 6.1 Operações do recurso `/nfe`

Confirmado na referência interativa oficial (developer.bling.com.br/referencia):

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/nfe` | Lista notas fiscais (paginado) |
| `POST` | `/nfe` | Cria uma nota fiscal (situação **Pendente**) |
| `GET` | `/nfe/{idNotaFiscal}` | Obtém uma nota específica pelo ID |
| `PUT` | `/nfe/{idNotaFiscal}` | Altera uma nota. **Notas autorizadas não podem ter dados fiscais alterados** (valores, impostos, destinatário, ou qualquer dado transmitido no XML) |
| `DELETE` | `/nfe` | Remove múltiplas notas por IDs (`idsNotas[]`) — **apenas notas pendentes podem ser excluídas** |
| `GET` | `/nfe/documento/{chaveAcesso}` | Obtém o **DANFE (PDF)** ou o **XML** da nota, pela chave de acesso (44 dígitos), via `?formato=pdf` ou `?formato=xml` |
| `POST` | `/nfe/{idNotaFiscal}/enviar` | **Envia a nota para emissão na SEFAZ** — aceita o parâmetro opcional `enviarEmail` (boolean, default `false`) para já disparar o e-mail ao destinatário |
| `POST` | `/nfe/{idNotaFiscal}/lancar-contas` | Gera o lançamento financeiro (contas a receber) da nota |
| `POST` | `/nfe/{idNotaFiscal}/estornar-contas` | Estorna o lançamento financeiro |
| `POST` | `/nfe/{idNotaFiscal}/lancar-estoque` | Dá baixa no estoque (depósito padrão) |
| `POST` | `/nfe/{idNotaFiscal}/lancar-estoque/{idDeposito}` | Dá baixa no estoque em um depósito específico |
| `POST` | `/nfe/{idNotaFiscal}/estornar-estoque` | Estorna a baixa de estoque |

### 6.2 Parâmetros de consulta (`GET /nfe`)

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `pagina` | integer | Nº da página (default `1`) |
| `limite` | integer | Registros por página (default `100`) |
| `numeroLoja` | string | Número do pedido na loja |
| `idTransportador` | integer | ID do contato transportador |
| `chaveAcesso` | integer | Chave de acesso da NF-e |
| `numero` | integer | Número da nota fiscal |
| `serie` | integer | Série |
| `situacao` | integer | Ver códigos abaixo — **se omitido, notas canceladas não entram na consulta** |
| `tipo` | string | `0` Entrada / `1` Saída (default `1`) |
| `dataEmissaoInicial` / `dataEmissaoFinal` | date | Intervalo de emissão |

### 6.3 Códigos de situação da nota fiscal

| Código | Situação |
|---|---|
| 1 | Pendente |
| 2 | Cancelada |
| 3 | Aguardando recibo |
| 4 | Rejeitada |
| 5 | Autorizada |
| 6 | Emitida DANFE |
| 7 | Registrada |
| 8 | Aguardando protocolo |
| 9 | Denegada |
| 10 | Consulta situação |
| 11 | Bloqueada |

Fluxo típico: `POST /nfe` (cria em **Pendente**) → `POST /nfe/{id}/enviar` (assina com o certificado configurado na conta e transmite à SEFAZ) → `GET /nfe/{id}` até `situacao` virar **Autorizada** (5) — ou tratar rejeição (4) / denegação (9).

### 6.4 Payload completo — `POST /nfe` (criar nota fiscal)

Schema oficial e completo, direto da referência interativa do Bling:

```json
{
  "tipo": 1,
  "numero": "6541",
  "dataOperacao": "2023-01-12 09:52:12",
  "contato": {
    "nome": "Contato do Bling",
    "tipoPessoa": "J",
    "numeroDocumento": "30188025000121",
    "ie": "7364873393",
    "rg": "451838701",
    "contribuinte": 1,
    "telefone": "54 3771-7278",
    "email": "pedrosilva@bling.com.br",
    "endereco": {
      "endereco": "Olavo Bilac",
      "numero": "914",
      "complemento": "Sala 101",
      "bairro": "Imigrante",
      "cep": "95702-000",
      "municipio": "Bento Gonçalves",
      "uf": "RS",
      "pais": ""
    }
  },
  "naturezaOperacao": {
    "id": 12345678
  },
  "loja": {
    "id": 12345678,
    "numero": "LOJA_8864"
  },
  "operacaoComExterior": false,
  "exportacao": {
    "localEmbarque": "Aeroporto Internacional de Viracopos",
    "ufEmbarque": "SP"
  },
  "finalidade": 1,
  "tipoNota": "01",
  "seguro": 1.15,
  "despesas": 5.08,
  "desconto": 10.12,
  "observacoes": "Observação da nota.",
  "documentoReferenciado": {
    "modelo": "55",
    "data": "2401",
    "numero": "123",
    "serie": "1",
    "contadorOrdemOperacao": "1",
    "chaveAcesso": "62634519764512837946527549134679858182373412"
  },
  "documentosReferenciados": [
    {
      "modelo": "55",
      "data": "2401",
      "numero": "123",
      "serie": "1",
      "contadorOrdemOperacao": "1",
      "chaveAcesso": "62634519764512837946527549134679858182373412"
    }
  ],
  "itens": [
    {
      "codigo": "BLG-5",
      "descricao": "Produto do Bling",
      "unidade": "UN",
      "quantidade": 1,
      "valor": 4.9,
      "tipo": "P",
      "pesoBruto": 0.5,
      "pesoLiquido": 0.5,
      "numeroPedidoCompra": "235",
      "classificacaoFiscal": "9999.99.99",
      "cest": "99.999.99",
      "codigoServico": "99.99",
      "origem": 0,
      "informacoesAdicionais": "Descrição do item",
      "documentoReferenciado": {
        "chaveAcesso": "62634519764512837946527549134679858182373412",
        "numeroItem": "1"
      },
      "unidadeTributavel": {
        "unidade": "KG",
        "quantidade": 10.5
      },
      "exportacao": {
        "drawback": "12345678901",
        "registroExportacao": "12345678901234567890",
        "chaveAcessoNFe": "12345678901234567890123456789012345678901234"
      }
    }
  ],
  "parcelas": [
    {
      "data": "2023-01-12",
      "valor": 123.45,
      "observacoes": "Observação da parcela.",
      "caut": "123456789",
      "formaPagamento": {
        "id": 12345678
      }
    }
  ],
  "transporte": {
    "fretePorConta": 0,
    "frete": 20,
    "veiculo": {
      "placa": "LDO-2373",
      "uf": "RS",
      "marca": "Volvo"
    },
    "transportador": {
      "nome": "Transportador",
      "numeroDocumento": "30188025000121",
      "ie": "949895756023",
      "endereco": {
        "endereco": "Olavo Bilac",
        "municipio": "Bento Gonçalves",
        "uf": "RS"
      }
    },
    "volume": {
      "quantidade": 5,
      "especie": 1,
      "numero": "1",
      "pesoBruto": 0.5,
      "pesoLiquido": 0.35
    },
    "volumes": [
      {
        "servico": "ALIAS_123",
        "codigoRastreamento": "COD123BR"
      }
    ],
    "etiqueta": {
      "nome": "Transportador",
      "endereco": "Olavo Bilac",
      "numero": "914",
      "complemento": "Sala 101",
      "municipio": "Bento Gonçalves",
      "uf": "RS",
      "cep": "95702-000",
      "bairro": "Imigrante"
    }
  },
  "notaFiscalProdutorRuralReferenciada": {
    "numero": "125",
    "serie": "1",
    "data": "2023-01-12"
  },
  "intermediador": {
    "cnpj": "13921649000197",
    "nomeUsuario": "usuario"
  }
}
```

`PUT /nfe/{idNotaFiscal}` usa exatamente o mesmo schema (lembrando que campos fiscais de notas já autorizadas não podem mais ser alterados).

#### Notas sobre os principais campos

- **`tipo`**: `0` Entrada / `1` Saída.
- **`contato`**: pode ser enviado **inline** (nome, documento, endereço completo — como no exemplo, útil quando o cliente ainda não existe no cadastro do Bling) ou referenciado só por `{ "id": ... }` quando já é um contato existente.
- **`naturezaOperacao.id`**: obrigatório — referencia a natureza de operação cadastrada (define a tributação).
- **`loja`**: usado em integrações com canais de venda; `numero` é o identificador do pedido na loja/marketplace.
- **`finalidade`**: finalidade da emissão (ex.: `1` = normal).
- **`tipoNota`**: código do tipo de documento (`"01"` no exemplo).
- **`seguro`, `despesas`, `desconto`**: valores adicionais da nota.
- **`documentoReferenciado` / `documentosReferenciados`**: referência a outra NF-e (ex.: em devoluções, complementares).
- **`itens[]`**: cada item aceita `codigo`, `descricao`, `unidade`, `quantidade`, `valor`, `tipo` (`P` produto), `pesoBruto`, `pesoLiquido`, `classificacaoFiscal` (NCM), `cest`, `origem`, `unidadeTributavel`, dados de `exportacao` etc. **Os campos de imposto (ICMS, IPI, PIS/COFINS) não são enviados no POST — o Bling calcula automaticamente** com base na natureza de operação e no cadastro fiscal do produto (eles só aparecem no `GET`, dentro de `itens[].impostos`, como retorno).
- **`parcelas[]`**: condições de pagamento, cada uma com `data`, `valor`, `formaPagamento.id`.
- **`transporte`**: dados de frete, transportador, volumes e etiqueta.
- **`intermediador`**: usado quando a venda passou por um marketplace/intermediador (CNPJ + nome de usuário).

### 6.5 Payload de resposta (`GET /nfe/{id}`)

O `GET` retorna a nota completa, incluindo campos calculados que não existem no `POST`:

```json
{
  "data": {
    "id": 12345678,
    "tipo": 1,
    "situacao": 1,
    "numero": "6541",
    "dataEmissao": "2023-01-12 09:52:12",
    "dataOperacao": "2023-01-12 09:52:12",
    "chaveAcesso": "string",
    "contato": { "...": "..." },
    "naturezaOperacao": { "id": 12345678 },
    "loja": { "id": 12345678 },
    "serie": 1,
    "valorNota": 10.3,
    "valorFrete": 10.3,
    "finalidade": 1,
    "tipoNota": "01",
    "xml": "string",
    "linkDanfe": "string",
    "linkPDF": "string",
    "optanteSimplesNacional": true,
    "numeroPedidoLoja": "string",
    "itens": [
      {
        "...": "... (mesmos campos do POST, mais 'impostos' e 'valorTotal')",
        "impostos": {
          "valorAproximadoTotalTributos": 1.2,
          "icms": {
            "st": 60,
            "origem": 0,
            "modalidade": 0,
            "aliquota": 5,
            "valor": 10.5
          }
        }
      }
    ]
  }
}
```

Campos úteis para acompanhar a nota depois de emitida: `chaveAcesso`, `xml`, `linkDanfe`, `linkPDF`, e `itens[].impostos` (tributos calculados pelo Bling).

### 6.6 Baixando o DANFE/XML pela chave de acesso

```
GET /nfe/documento/{chaveAcesso}?formato=pdf
GET /nfe/documento/{chaveAcesso}?formato=xml
```

Retorna o conteúdo do arquivo **em base64** (comprimido), dentro de `data[].conteudo`.

### 6.7 Removendo notas (`DELETE /nfe`)

```
DELETE /nfe?idsNotas[]=12345678&idsNotas[]=87654321
```

**Só é possível excluir notas com situação Pendente.** Notas já enviadas/autorizadas devem ser canceladas (fluxo fiscal), não excluídas.

### 6.8 Resposta de criação/erro

- `POST /nfe` → `201`, retorna `{ "data": { "id", "numero", "serie", "contato": { "nome" } } }`.
- `POST /nfe/{id}/enviar` → `200`, retorna `{ "data": { "xml": "..." } }`.
- Erros (`400`/`404`) seguem o padrão:

```json
{
  "error": {
    "type": "VALIDATION_ERROR",
    "message": "Não foi possível salvar a venda",
    "description": "A venda não pode ser salva, pois ocorreram problemas em sua validação.",
    "fields": [
      {
        "code": 49,
        "msg": "Uma ou mais parcelas da venda possuem erros de validação",
        "element": "parcelas",
        "namespace": "VENDAS",
        "collection": [
          {
            "index": 1,
            "code": 12,
            "msg": "Id da forma de pagamento inválido.",
            "element": "formaPagamento",
            "namespace": "VENDAS"
          }
        ]
      }
    ]
  }
}
```

O campo `fields[].element` indica exatamente qual campo do payload causou o erro — útil para mapear validações no seu formulário/integração.

---

## 7. Como testar (Postman)

O Bling fornece a collection completa da API v3 em OpenAPI/Swagger, prontinha para importar:

1. Baixe o arquivo: `https://developer.bling.com.br/build/assets/openapi-7KN4xqKn.json`
2. No Postman: **Import** → selecione o arquivo.
3. Na collection importada (**Bling API**), aba **Authorization**:
   - **Type**: `OAuth 2.0`
   - **Callback URL**: igual ao "Link de redirecionamento" cadastrado no app
   - **Client ID** / **Client Secret**: os do seu app
   - **State**: qualquer valor não vazio
4. Clique em **Get New Access Token** → faça login no Bling → autorize o app.
5. Clique em **Use Token** e depois `Ctrl+S` para salvar — o token passa a ser usado automaticamente em todas as chamadas da collection.

A partir daí você pode testar `GET /contatos`, `POST /nfe`, etc., direto no Postman antes de programar sua integração.

---

## 8. Boas práticas gerais (recomendadas pelo Bling)

- **Paginação**: use os parâmetros `pagina` e `limite` (padrão: 100 registros/página) em endpoints de listagem.
- **Tratamento de erros**: sempre verifique o HTTP status code. Qualquer código fora de `2xx` deve ser tratado; erros `4xx` trazem detalhes no corpo da resposta.
- Centralize o consumo da API em um client/serviço próprio, em vez de espalhar chamadas cURL/fetch pelo código.
- Nunca faça chamadas que exponham `client_secret` no front-end.

---

## 9. Referências oficiais

- Documentação geral / autenticação: https://developer.bling.com.br/bling-api
- Aplicativos e fluxo OAuth: https://developer.bling.com.br/aplicativos
- Boas práticas: https://developer.bling.com.br/boas-praticas
- Como testar (Postman): https://developer.bling.com.br/como-testar
- Referência interativa completa da API (todos os endpoints e schemas): https://developer.bling.com.br/referencia
- Especificação OpenAPI (importável no Postman): https://developer.bling.com.br/build/assets/openapi-7KN4xqKn.json
- Certificado digital A1 no Bling (passo a passo): https://ajuda.bling.com.br/hc/pt-br/articles/360034994013
- Emitir NF-e — manual do Bling: https://blog.bling.com.br/passos-para-emitir-nota-fiscal-pelo-bling/

---

### Resumo do fluxo completo, do zero até a nota emitida

1. Criar conta no Bling → cadastrar aplicativo → obter `client_id`/`client_secret`.
2. Implementar o fluxo OAuth 2.0 (Authorization Code) e guardar `access_token`/`refresh_token`.
3. Configurar o certificado digital (A1) **na interface do Bling** — não pela API.
4. Cadastrar dados fiscais da empresa, natureza de operação e produtos com NCM.
5. Via API: `POST /nfe` (criar) → `POST /nfe/{id}/enviar` (emitir na SEFAZ) → `GET /nfe/{id}` (acompanhar `situacao`).
6. Opcional: `lancar-contas` e `lancar-estoque` para refletir a nota no financeiro/estoque.