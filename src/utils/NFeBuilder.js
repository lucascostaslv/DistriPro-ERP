// src/utils/NFeBuilder.js

const getSafeDate = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 2); 
    const brazilTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
    const y = brazilTime.getFullYear();
    const m = String(brazilTime.getMonth() + 1).padStart(2, '0');
    const d = String(brazilTime.getDate()).padStart(2, '0');
    const h = String(brazilTime.getHours()).padStart(2, '0');
    const min = String(brazilTime.getMinutes()).padStart(2, '0');
    const s = String(brazilTime.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}:${s}-03:00`;
};

export const buildNFePayload = (sale, company, client, nfeConfig, targetModel = '65', customNumber = 0) => {
    
    if (!company.cnpj) throw new Error("Empresa sem CNPJ configurado.");
    if (!sale.items || sale.items.length === 0) throw new Error("Venda sem itens.");
    if (!nfeConfig?.api_token) throw new Error("Token da API não configurado.");

    const cleanToken = nfeConfig.api_token.trim();
    const env = nfeConfig.environment === 'PRODUCAO' ? "1" : "2"; 

    // --- VALIDAÇÃO NFC-e (CSC) ---
    // Se for NFC-e (65), o CSC é obrigatório
    if (targetModel === '65') {
        if (!nfeConfig.csc_id || !nfeConfig.csc_token) {
            throw new Error("Para emitir NFC-e, configure o ID e o Código CSC em Configurações > Certificado.");
        }
    }

    // Cliente
    let clientePayload = null;
    const hasClient = client && client.tax_id; 

    if (targetModel === '55') { 
        if (!hasClient) {
             clientePayload = {
                "NmCliente": "CLIENTE CONSUMIDOR",
                "IndicadorIe": 9,
                "Endereco": {
                    "Cep": "00000000", "Logradouro": "Via Publica", "Numero": "SN",
                    "Bairro": "Centro", "CodMunicipio": "9999999", "Municipio": "Exterior", "Uf": "EX", "CodPais": 1058, "Pais": "BRASIL"
                }
             };
        } else {
            clientePayload = buildClientBlock(client);
        }
    } else { 
        if (hasClient) clientePayload = buildClientBlock(client);
        else clientePayload = null; 
    }

    const serieCorreta = targetModel === '55' ? 55 : 65;
    const dataAtual = getSafeDate(); 
    const numeroFinal = customNumber > 0 ? customNumber : 1;

    return {
        "Token": cleanToken,
        "IdentificadorInterno": sale.id,
    
        

        "Serie": serieCorreta,
        "Numero": numeroFinal, 
        "Lote": String(Math.floor(Date.now() / 1000)),
        "DataEmissao": dataAtual,
        "DataEntradaSaida": dataAtual,
        "NaturezaOperacao": targetModel === '55' ? "VENDA DE MERCADORIA" : "VENDA A CONSUMIDOR",
        "ModeloDocumento": Number(targetModel),
        "TipoAmbiente": env, 
        "Finalidade": 1,
        "IndicadorPresenca": 1,
        "ConsumidorFinal": true,
        "Cliente": clientePayload,

        "Produtos": sale.items.map((item, index) => {
            const taxes = item.taxes || item.taxDetails || {};
            
            let ncmRaw = item.ncm ? String(item.ncm).replace(/\D/g, '') : '';
            let cestRaw = item.cest ? String(item.cest).replace(/\D/g, '') : ''; 

            if (ncmRaw.length !== 8 || ncmRaw === '00000000') {
                if (env === "2") { 
                    ncmRaw = '39231090'; 
                    console.warn(`⚠️ Produto "${item.name}" com NCM inválido. Usando ${ncmRaw} para teste.`);
                } else {
                    throw new Error(`O produto "${item.name}" tem NCM inválido (${ncmRaw}). Corrija no cadastro.`);
                }
            }

            const qtd = Number(item.quantity || item.qty);
            const vUnit = Number(item.unitPrice || item.price);
            const vTotal = Number(item.total || (qtd * vUnit));
            const cfopCode = Number(taxes.cfop || (targetModel === '65' ? "5102" : "5102"));
            const hasIPI = taxes.vIPI > 0;

            return {
                "NItemPed": index + 1,
                "CodProdutoServico": item.id ? String(item.id).substring(0, 20) : "ITEM"+index,
                "NmProduto": item.name.substring(0, 120),
                "NCM": ncmRaw,
                "CEST": cestRaw.length > 0 ? cestRaw : null, 
                "CFOP": cfopCode,
                "UnidadeComercial": item.unit || "UN",
                "Quantidade": qtd,
                "ValorUnitario": vUnit,
                "ValorTotal": vTotal,
                "OrigemProduto": Number(taxes.origin || 0),
                "ValorDesconto": 0,
                "ValorFrete": 0,
                "ValorSeguro": 0,
                "ValorOutrasDespesas": 0,

                "Imposto": {
                    "ICMS": {
                        "CodSituacaoTributaria": taxes.csosn || "102", 
                        "AliquotaICMS": 0, 
                        "AliquotaCredito": 0
                    },
                    "PIS": { "CodSituacaoTributaria": "07" },
                    "COFINS": { "CodSituacaoTributaria": "07" },
                    "IPI": {
                        "CodEnquadramento": "999", 
                        "CodSituacaoTributaria": hasIPI ? "50" : "53", 
                        "Aliquota": hasIPI ? taxes.pIPI : 0,
                        "ValorIPI": hasIPI ? taxes.vIPI : 0
                    }
                }
            };
        }),

        "Pagamentos": [{
            "IndicadorPagamento": 0, 
            "FormaPagamento": mapPaymentMethod(sale.paymentMethod),
            "VlPago": Number(sale.total),
            "Descricao": "Pagamento PDV"
        }]
    };
};

function buildClientBlock(client) {
    return {
        "CpfCnpj": client.tax_id.replace(/\D/g, ''),
        "NmCliente": client.name.substring(0, 60),
        "IndicadorIe": Number(client.ie_indicator || 9),
        "Ie": (client.ie && client.ie_indicator !== '9') ? client.ie.replace(/\D/g, '') : null,
        "Email": client.email || null,
        "Endereco": {
            "Cep": client.address?.zip_code?.replace(/\D/g, '') || '00000000',
            "Logradouro": client.address?.street || 'Nao Informado',
            "Numero": client.address?.number || 'SN',
            "Bairro": client.address?.neighborhood || 'Nao Informado',
            "CodMunicipio": client.address?.ibge_code || '9999999',
            "Municipio": client.address?.city || 'Nao Informado',
            "Uf": client.address?.state || 'SP',
            "CodPais": 1058,
            "Pais": "BRASIL"
        }
    };
}

function mapPaymentMethod(method) {
    if (!method) return '01'; 
    const m = method.toLowerCase();
    if (m.includes('dinheiro')) return '01';
    if (m.includes('crédito') || m.includes('credito')) return '03';
    if (m.includes('débito') || m.includes('debito')) return '04';
    if (m.includes('pix')) return '17';
    return '99'; 
}