// src/utils/NFeBuilder.js

export const buildNFePayload = (sale, company, client, nfeConfig) => {
    
    // 1. Validações
    if (!company.cnpj) throw new Error("Empresa sem CNPJ configurado.");
    if (!sale.items || sale.items.length === 0) throw new Error("Venda sem itens.");

    // Consumidor Final
    let finalClient = client;
    let isAnonymous = false;

    if (!finalClient) {
        isAnonymous = true;
        finalClient = {
            name: 'CONSUMIDOR FINAL',
            ie_indicator: '9', 
            ie: 'ISENTO',
            tax_id: null,
            address: null 
        };
    }

    // --- TRUQUE: Se estiver usando Token de Produção para testar, 
    // force o ambiente 1 (Produção) mas use o nome de cliente específico abaixo.
    // Por enquanto, vamos respeitar a config do banco:
    const tipoAmbiente = nfeConfig.environment === 'PRODUCAO' ? "1" : "2";

    const payload = {
        // --- ATENÇÃO: NENHUM CAMPO "Token" PODE ESTAR AQUI ---
        
        "Serie": 1,
        "Numero": sale.id, 
        "Lote": "1", // Lote simples
        "Codigo": sale.id.toString().slice(-8),
        "DataEmissao": new Date().toISOString(),
        "DataEntradaSaida": new Date().toISOString(),
        "NaturezaOperacao": "VENDA DE MERCADORIA", // Texto padrão seguro
        "ModeloDocumento": 55, 
        "Finalidade": 1,
        "TipoAmbiente": tipoAmbiente, 
        "IndicadorPresenca": 1, 
        "ConsumidorFinal": true,
        "IdentificadorInterno": String(sale.id),
        "Observacao": "",

        // Produtos
        "Produtos": sale.items.map((item, index) => {
            const taxes = item.taxDetails || {};
            const valorTotal = item.price * item.qty;

            return {
                "NmProduto": item.name,
                "CodProdutoServico": String(item.id).substring(0, 20), // Limite de chars
                "EAN": item.ean || "SEM GTIN",
                "NCM": taxes.ncm ? taxes.ncm.replace(/\D/g, '') : "00000000",
                "CEST": taxes.cest || null,
                "Quantidade": item.qty,
                "UnidadeComercial": item.unit || "UN",
                "ValorUnitario": item.price,
                "ValorTotal": valorTotal,
                "ValorDesconto": 0,
                "CFOP": parseInt(taxes.cfop || 5102),
                "NItemPed": index + 1,
                "OrigemProduto": parseInt(taxes.origin || 0),
                
                "Imposto": {
                    "ICMS": {
                        "CodSituacaoTributaria": taxes.csosn || "102",
                        "Origem": parseInt(taxes.origin || 0),
                        "AliquotaICMS": 0,
                        "AliquotaCredito": 0,
                        "ValorCreditoICMSSN": 0
                    },
                    "PIS": { "CodSituacaoTributaria": "49", "Aliquota": 0 },
                    "COFINS": { "CodSituacaoTributaria": "49", "Aliquota": 0 }
                }
            };
        }),

        // Pagamentos
        "Pagamentos": [{
            "IndicadorPagamento": 0,
            "FormaPagamento": "01", // Dinheiro (Evita validação de cartão)
            "VlPago": sale.total,
            "TipoIntegracao": false
        }]
    };

    // Cliente
    if (!isAnonymous) {
        payload.Cliente = {
            "CpfCnpj": finalClient.tax_id ? finalClient.tax_id.replace(/\D/g, '') : null,
            "NmCliente": finalClient.name,
            "IndicadorIe": 9,
            "Ie": "ISENTO",
            "Endereco": {
                "Cep": finalClient.address?.zip_code ? finalClient.address.zip_code.replace(/\D/g, '') : '70000000',
                "Logradouro": finalClient.address?.street || 'Rua Teste',
                "Numero": finalClient.address?.number || '0',
                "Bairro": finalClient.address?.neighborhood || 'Centro',
                "CodMunicipio": finalClient.address?.ibge_code || '5300108', // Brasília (Genérico se falhar)
                "Municipio": finalClient.address?.city || 'Brasilia',
                "Uf": finalClient.address?.state || 'DF',
                "CodPais": 1058,
                "Pais": "BRASIL"
            }
        };
    } else {
        payload.Cliente = {
            "NmCliente": "CONSUMIDOR FINAL",
            "IndicadorIe": 9,
            "CpfCnpj": null
        };
    }

    return payload;
};