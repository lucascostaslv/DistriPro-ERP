// src/utils/NFeBuilder.js

export const buildNFePayload = (sale, company, client, nfeConfig) => {
    
    // 1. Validações Básicas
    if (!company.cnpj) throw new Error("Empresa sem CNPJ configurado.");
    if (!sale.items || sale.items.length === 0) throw new Error("Venda sem itens.");

    // LÓGICA CONSUMIDOR FINAL (Notinha)
    // Se não veio cliente, criamos um objeto 'fictício' de consumidor
    let finalClient = client;
    let isAnonymous = false;

    if (!finalClient) {
        isAnonymous = true;
        finalClient = {
            name: 'CONSUMIDOR FINAL',
            ie_indicator: '9', // Não Contribuinte
            ie: 'ISENTO',
            tax_id: null, // Sem CPF
            address: null // Sem endereço
        };
    }

    const tipoAmbiente = nfeConfig.environment === 'PRODUCAO' ? "1" : "2";

    // 2. Estrutura Base
    const payload = {
        "Token": nfeConfig.api_token,
        "Serie": 1,
        "Numero": sale.id, // Em produção deve ser sequencial, cuidado aqui
        "Lote": new Date().getFullYear().toString() + new Date().getMonth().toString(),
        "Codigo": sale.id.toString().slice(-8),
        "DataEmissao": new Date().toISOString(),
        "DataEntradaSaida": new Date().toISOString(),
        "NaturezaOperacao": "Venda a Consumidor",
        "ModeloDocumento": 55, // NFe (Se fosse NFC-e seria 65)
        "Finalidade": 1,
        "TipoAmbiente": tipoAmbiente, 
        "IndicadorPresenca": 1, 
        "ConsumidorFinal": true, // Sempre true para varejo simples
        "IdentificadorInterno": String(sale.id),
        "Observacao": "Trib. aprox. conf. lei da transparencia.",

        // --- PRODUTOS ---
        "Produtos": sale.items.map((item, index) => {
            const taxes = item.taxDetails || {};
            const valorTotal = item.price * item.qty;

            return {
                "NmProduto": item.name,
                "CodProdutoServico": item.cbaCode || item.id,
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
                        "AliquotaCredito": taxes.pCredSN || 0,
                        "ValorCreditoICMSSN": taxes.vCredICMSSN || 0
                    },
                    "PIS": { "CodSituacaoTributaria": "49", "Aliquota": 0 },
                    "COFINS": { "CodSituacaoTributaria": "49", "Aliquota": 0 }
                }
            };
        }),

        // --- PAGAMENTOS ---
        "Pagamentos": [{
            "IndicadorPagamento": 0,
            "FormaPagamento": getPaymentCode(sale.paymentMethod),
            "VlPago": sale.total,
            "TipoIntegracao": false
        }]
    };

    // --- DADOS DO CLIENTE (CONDICIONAL) ---
    // Se for anônimo, a Brasil NFe aceita enviar o objeto Cliente simplificado ou nulo dependendo da config.
    // Vamos enviar o mínimo necessário.
    
    if (!isAnonymous) {
        payload.Cliente = {
            "CpfCnpj": finalClient.tax_id ? finalClient.tax_id.replace(/\D/g, '') : null,
            "NmCliente": finalClient.name,
            "IndicadorIe": Number(finalClient.ie_indicator || 9),
            "Ie": finalClient.ie ? finalClient.ie.replace(/\D/g, '') : "ISENTO",
            "Endereco": {
                "Cep": finalClient.address?.zip_code ? finalClient.address.zip_code.replace(/\D/g, '') : '',
                "Logradouro": finalClient.address?.street || '',
                "Numero": finalClient.address?.number || 'S/N',
                "Complemento": finalClient.address?.complement || '',
                "Bairro": finalClient.address?.neighborhood || '',
                "CodMunicipio": finalClient.address?.ibge_code || '',
                "Municipio": finalClient.address?.city || '',
                "Uf": finalClient.address?.state || '',
                "CodPais": 1058,
                "Pais": "BRASIL"
            }
        };
    } else {
        // Para consumidor final anônimo na NF-e 55, algumas UFs exigem CPF ou pelo menos nome.
        // Tentamos enviar apenas o nome "CONSUMIDOR FINAL".
        payload.Cliente = {
            "NmCliente": "CONSUMIDOR FINAL",
            "IndicadorIe": 9,
            "CpfCnpj": null // Sem CPF
        };
        // Endereço muitas vezes pode ser omitido ou enviado o da própria loja como contingência
    }

    return payload;
};

function getPaymentCode(method) {
    const map = {
        'Dinheiro': '01', 'Cheque': '02', 'Cartão de Crédito': '03',
        'Cartão de Débito': '04', 'Crédito Loja': '05', 'Fiado': '05',
        'Boleto Bancário': '15', 'Sem Pagamento': '90', 'Pix': '17', 'PIX': '17'
    };
    return map[method] || '99';
}