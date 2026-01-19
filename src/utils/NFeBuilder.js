// src/utils/NFeBuilder.js

export const buildNFePayload = (sale, company, client, nfeConfig, targetModel = '65') => {
    // Validações Básicas
    if (!company.cnpj) throw new Error("Empresa sem CNPJ configurado.");
    if (!sale.items || sale.items.length === 0) throw new Error("Venda sem itens.");
    if (!nfeConfig?.api_token) throw new Error("Token da API não configurado.");

    // Limpeza de Dados
    const cleanToken = nfeConfig.api_token.trim();
    const cleanCNPJ = company.cnpj.replace(/\D/g, '');
    const cleanIE = company.ie ? company.ie.replace(/\D/g, '') : '';
    
    // Configuração de Ambiente (Garante Homologação se não for Produção explicita)
    const env = nfeConfig.environment === 'PRODUCAO' ? 1 : 2;

    // Lógica Inteligente do Destinatário
    let destinatarioPayload = null;
    const hasClient = client && client.tax_id; // Tem CPF/CNPJ?

    if (targetModel === '55') {
        // --- MODELO 55 (NF-e) ---
        // Exige destinatário. Se não tiver, usa "Consumidor Final" genérico (mas NF-e idealmente precisa de cadastro)
        if (!hasClient) {
             // Fallback para NF-e sem cadastro (alguns estados recusam, ideal é obrigar cadastro)
             destinatarioPayload = {
                "NmCliente": "CLIENTE CONSUMIDOR",
                "IndicadorIe": 9,
                "Endereco": {
                    "Cep": "00000000", "Logradouro": "Via Publica", "Numero": "SN",
                    "Bairro": "Centro", "CodMunicipio": "9999999", "NmMunicipio": "Exterior", "Uf": "EX"
                }
             };
        } else {
            destinatarioPayload = buildClientBlock(client);
        }
    } else {
        // --- MODELO 65 (NFC-e / Cupom) ---
        // Se tiver cliente cadastrado, envia. Se não tiver, envia NULL (Venda Anônima)
        if (hasClient) {
            destinatarioPayload = buildClientBlock(client);
        } else {
            destinatarioPayload = null; // Venda Anônima permitida na NFC-e
        }
    }

    // Retorno do Payload
    return {
        "Token": cleanToken,
        "TipoEnvio": 1, // JSON
        "Ambiente": env, 
        "Modelo": targetModel, // <--- Dinâmico (55 ou 65)
        "Serie": 1, // Certifique-se de ter Série 1 cadastrada para o mod. 65 também no painel
        "Numero": String(sale.id).substring(0, 9),
        "Lote": String(Math.floor(Date.now() / 1000)),
        "NaturezaOperacao": targetModel === '55' ? "VENDA DE MERCADORIA" : "VENDA A CONSUMIDOR",
        "Emitente": {
            "CpfCnpj": cleanCNPJ,
            "Ie": cleanIE
        },
        "Destinatario": destinatarioPayload,
        "Itens": sale.items.map((item, index) => {
            const taxes = item.taxes || item.taxDetails || {};
            return {
                "NumeroItem": index + 1,
                "Codigo": item.id ? String(item.id).substring(0, 20) : "ITEM"+index,
                "Descricao": item.name.substring(0, 120),
                "Ncm": item.ncm?.replace(/\D/g, '') || '00000000',
                "Cfop": targetModel === '65' ? "5102" : (taxes.cfop || "5102"), // NFC-e quase sempre é 5102/5405
                "Unidade": item.unit || "UN",
                "Quantidade": Number(item.quantity || item.qty),
                "VlUnitario": Number(item.unitPrice || item.price),
                "VlTotal": Number(item.total || (item.price * item.qty)),
                "Impostos": {
                    "Icms": {
                        "Cst": taxes.csosn || "102", // Simples Nacional
                        "Origem": taxes.origin || "0",
                        "Aliquota": 0, "ValorBase": 0, "Valor": 0
                    },
                    "Pis": { "Cst": "07" },
                    "Cofins": { "Cst": "07" }
                }
            };
        }),
        "Pagamentos": [{
            "IndicadorPagamento": 0, // A vista
            "FormaPagamento": mapPaymentMethod(sale.paymentMethod),
            "VlPago": Number(sale.total),
            "TipoIntegracao": 2
        }]
    };
};

// --- Helpers Internos ---

function buildClientBlock(client) {
    const isAnonymous = !client.tax_id;
    return {
        "CpfCnpj": client.tax_id.replace(/\D/g, ''),
        "NmCliente": client.name.substring(0, 60),
        "IndicadorIe": Number(client.ie_indicator || 9),
        "Ie": (client.ie && client.ie_indicator !== '9') ? client.ie.replace(/\D/g, '') : null,
        "Endereco": {
            "Cep": client.address?.zip_code?.replace(/\D/g, '') || '00000000',
            "Logradouro": client.address?.street || 'Nao Informado',
            "Numero": client.address?.number || 'SN',
            "Bairro": client.address?.neighborhood || 'Nao Informado',
            "CodMunicipio": client.address?.ibge_code || '9999999',
            "NmMunicipio": client.address?.city || 'Nao Informado',
            "Uf": client.address?.state || 'SP'
        }
    };
}

function mapPaymentMethod(method) {
    if (!method) return '01'; // Default Dinheiro
    const m = method.toLowerCase();
    if (m.includes('dinheiro')) return '01';
    if (m.includes('crédito') || m.includes('credito')) return '03';
    if (m.includes('débito') || m.includes('debito')) return '04';
    if (m.includes('pix')) return '17';
    return '99';
}