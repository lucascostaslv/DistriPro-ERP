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

// Natureza da operação por etapa da consignação mercantil (SEFAZ) — venda normal não muda o comportamento atual.
const NATUREZA_OPERACAO_BY_TYPE = {
    REMESSA_CONSIGNACAO: 'REMESSA PARA VENDA FORA DO ESTABELECIMENTO',
    RETORNO_CONSIGNACAO: 'RETORNO DE MERCADORIA NAO VENDIDA (CONSIGNACAO)',
};

export const buildNFePayload = (sale, company, client, nfeConfig, targetModel = '65', operationType = 'VENDA') => {

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

    const dataAtual = getSafeDate();

    return {
        "Token": cleanToken,
        "IdentificadorInterno": sale.id,

        // Serie/Numero/Lote deliberadamente OMITIDOS: a própria documentação da Brasil NFe
        // recomenda deixá-los em branco sempre que possível ("controle automático pelo
        // painel Brasil NFe, próximo número disponível por empresa + modelo + série +
        // ambiente"). Calcular manualmente aqui (como antes) arrisca dessincronizar do
        // contador real da Brasil NFe e gerar rejeição por "chave de acesso duplicada".
        "DataEmissao": dataAtual,
        "DataEntradaSaida": dataAtual,
        "NaturezaOperacao": NATUREZA_OPERACAO_BY_TYPE[operationType]
            || (targetModel === '55' ? "VENDA DE MERCADORIA" : "VENDA A CONSUMIDOR"),
        "ModeloDocumento": Number(targetModel),
        "TipoAmbiente": env,
        "Finalidade": 1,
        // Remessa/retorno de consignação é operação B2B com o revendedor, não venda presencial a consumidor final
        "IndicadorPresenca": operationType === 'VENDA' ? 1 : 9,
        "ConsumidorFinal": operationType === 'VENDA',
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

            // Perfil com ICMS-ST (CSOSN 500/201/202/203/60/70) sem alíquota configurada —
            // melhor travar a emissão do que sair silenciosamente com ICMS-ST zerado
            // (ver TaxCalculator.js). Não se aplica ao Bling: ele calcula ICMS no servidor
            // dele a partir do cadastro fiscal do próprio produto, não deste payload.
            if (taxes.icmsStPendente) {
                throw new Error(`Produto "${item.name}" tem perfil de ICMS-ST (CSOSN ${taxes.csosn}) sem a alíquota configurada. Preencha em Configurações > Perfis Tributários antes de emitir.`);
            }

            const qtd = Number(item.quantity || item.qty);
            // Preço bruto (de tabela, antes de desconto) — cai de volta para o preço já líquido em vendas antigas sem originalPrice
            const vUnit = Number(item.originalPrice ?? item.unitPrice ?? item.price);
            const vTotal = Number(item.total || (qtd * vUnit));
            const valorDesconto = Number((item.discountTotal || 0).toFixed(2));
            const cfopCode = Number(taxes.cfop || "5102");
            const hasIPI = taxes.vIPI > 0;

            // PIS/COFINS: usa o CST do perfil tributário (nunca hardcode "07")
            const cstPisCofins = taxes.cst_pis_cofins || '49';
            const buildPisCofinsBock = (cst, rate, value) => {
                if (cst === '01' && rate > 0) {
                    // Tributável com alíquota — envia base de cálculo e valor
                    return { "CodSituacaoTributaria": cst, "BaseCalculo": vTotal, "Aliquota": rate, "Valor": value };
                }
                // CST 04 (monofásico), 07 (isento), 49 (outras), 06, 99 → alíquota zero
                return { "CodSituacaoTributaria": cst };
            };
            const pisBlock  = buildPisCofinsBock(cstPisCofins, taxes.pis_rate  || 0, taxes.vPIS  || 0);
            const cofinsBlock = buildPisCofinsBock(cstPisCofins, taxes.cofins_rate || 0, taxes.vCOFINS || 0);

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
                "ValorDesconto": valorDesconto,
                "ValorFrete": 0,
                "ValorSeguro": 0,
                "ValorOutrasDespesas": 0,

                "Imposto": {
                    "ICMS": {
                        "CodSituacaoTributaria": taxes.csosn || "102",
                        "AliquotaICMS": taxes.pICMS || 0,
                        "BaseCalculo": taxes.vBC || 0,
                        "ValorIcms": taxes.vICMS || 0,
                        // CSOSN 201/202/203/60/70 — esta empresa retém o ICMS-ST desta venda
                        ...(taxes.vICMSST ? {
                            "AliquotaICMSST": taxes.pICMSST,
                            "BaseCalculoST": taxes.vBCST,
                            "ValorIcmsST": taxes.vICMSST,
                        } : {}),
                        // CSOSN 500 — ICMS-ST já retido por elo anterior, só informativo
                        ...(taxes.vICMSSTRet ? {
                            "STRetido": {
                                "BaseCalculo": taxes.vBCSTRet,
                                "ValorICMSST": taxes.vICMSSTRet,
                            },
                        } : {}),
                        "AliquotaCredito": 0
                    },
                    "PIS": pisBlock,
                    "COFINS": cofinsBlock,
                    "IPI": {
                        "CodEnquadramento": "999",
                        "CodSituacaoTributaria": hasIPI ? "50" : "53",
                        "Aliquota": hasIPI ? taxes.pIPI : 0,
                        "ValorIPI": hasIPI ? taxes.vIPI : 0
                    }
                }
            };
        }),

        "Pagamentos": buildPagamentos(sale)
    };
};

// A Brasil NFe representa split de pagamento (ex: metade dinheiro, metade cartão) como um
// objeto por forma de pagamento em "Pagamentos[]" (cada um com seu próprio VlPago) — nunca um
// valor único coberto pela forma "dominante". `sale.paymentMethods` (quando existe) já tem essa
// quebra real vinda do PDV; sem ele, cai para um único pagamento pelo valor total.
function buildPagamentos(sale) {
    const entries = Array.isArray(sale.paymentMethods) && sale.paymentMethods.length > 0
        ? sale.paymentMethods
        : [{ method: sale.paymentMethod, amount: sale.total }];

    return entries.map((entry) => ({
        "IndicadorPagamento": 0,
        "FormaPagamento": mapPaymentMethod(entry.method),
        "VlPago": Number(entry.amount),
        "Descricao": `Pagamento PDV — ${entry.method}`
    }));
}

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