// src/utils/NFeBuilder.js

/**
 * Constrói o Payload JSON para envio à API de Nota Fiscal
 * Compatível com padrão REST (Focus/BrasilNFe)
 */
export const buildNFePayload = (sale, company, client, nfeConfig) => {
    
    // 1. Validações de Segurança
    if (!company.cnpj) throw new Error("Empresa sem CNPJ configurado.");
    if (!client && !nfeConfig.allow_anonymous) throw new Error("Cliente não identificado para NF-e.");
    if (!sale.items || sale.items.length === 0) throw new Error("Venda sem itens.");

    // 2. Cabeçalho
    const payload = {
        natureza_operacao: "VENDA DE MERCADORIAS",
        data_emissao: new Date().toISOString(),
        tipo_documento: 1, // 1=Saída
        local_destino: 1,  // 1=Interna (Default, ajustável se UF for diferente)
        finalidade_emissao: 1, // 1=Normal
        consumidor_final: 1, // 1=Sim
        presenca_comprador: 1, // 1=Presencial
        
        // Emitente (Quem vende)
        cnpj_emitente: company.cnpj.replace(/\D/g, ''),
        
        // Destinatário (Quem compra)
        // Se não tiver cliente (NFC-e), não envia o objeto destinatário ou envia vazio dependendo da API
        destinatario: client ? {
            cpf_cnpj: client.tax_id.replace(/\D/g, ''),
            nome: client.name,
            indicador_inscricao_estadual: client.ie_indicator || '9',
            inscricao_estadual: client.ie ? client.ie.replace(/\D/g, '') : null,
            email: client.email,
            endereco: {
                logradouro: client.address?.street,
                numero: client.address?.number,
                bairro: client.address?.neighborhood,
                codigo_municipio: client.address?.ibge_code, // OBRIGATÓRIO
                nome_municipio: client.address?.city,
                uf: client.address?.state,
                cep: client.address?.zip ? client.address.zip.replace(/\D/g, '') : ''
            }
        } : null,

        items: []
    };

    // 3. Itens (Produtos)
    payload.items = sale.items.map((item, index) => {
        // Recupera o cálculo fiscal feito na Fase 6
        // Se a venda for antiga e não tiver taxDetails, isso vai falhar (correto, força editar)
        const taxes = item.taxDetails || {};

        if (!taxes.cfop) throw new Error(`Item ${index+1} (${item.name}) sem cálculo fiscal. Cancele e refaça a venda.`);

        return {
            numero_item: index + 1,
            codigo_produto: item.cbaCode || item.originalId || 'ITEM'+index,
            descricao: item.name,
            cfop: taxes.cfop, // Vem do TaxCalculator
            unidade_comercial: item.unit || 'UN',
            quantidade_comercial: item.qty,
            valor_unitario_comercial: item.price,
            valor_bruto: item.price * item.qty,
            codigo_ncm: taxes.ncm ? taxes.ncm.replace(/\D/g,'') : '',
            
            // Impostos (Simples Nacional)
            icms_origem: taxes.origin || '0',
            icms_situacao_tributaria: taxes.csosn, // 102, 500, etc.
            
            // PIS/COFINS (Geralmente 49 ou 99 no Simples)
            pis_situacao_tributaria: taxes.cst_pis_cofins || '49',
            cofins_situacao_tributaria: taxes.cst_pis_cofins || '49'
        };
    });

    // 4. Pagamento
    payload.formas_pagamento = [{
        forma_pagamento: getPaymentCode(sale.paymentMethod),
        valor_pagamento: sale.total,
        tipo_integracao: 2 // 2=Manual (Sem TEF)
    }];

    return payload;
};

// Helper para converter "Pix", "Dinheiro" em códigos da SEFAZ
function getPaymentCode(method) {
    const map = {
        'Dinheiro': '01',
        'Cheque': '02',
        'Cartão de Crédito': '03', 'Crédito': '03',
        'Cartão de Débito': '04', 'Débito': '04',
        'Crédito Loja': '05', 'Fiado': '05',
        'Boleto Bancário': '15',
        'Pix': '17', 'PIX': '17'
    };
    return map[method] || '99'; // 99=Outros
}