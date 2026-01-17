// src/utils/TaxCalculator.js

/**
 * Motor Fiscal Robusto para Simples Nacional
 */
export const calculateItemTaxes = (product, client, companyInfo, taxProfile) => {
    
    // 1. Sanitização e Valores Básicos
    const quantity = Number(product.qty || product.quantity || 1);
    const unitPrice = Number(product.price || product.unitPrice || 0);
    const totalValue = quantity * unitPrice;
    
    // Objeto de Retorno Padrão (Zerado)
    let taxes = {
        cfop: '',
        csosn: '102', // Padrão
        cst_pis_cofins: '49', // Padrão Simples
        origin: '0', 
        ncm: product.ncm ? String(product.ncm).replace(/\D/g, '') : '',
        cest: product.cest ? String(product.cest).replace(/\D/g, '') : '',
        
        // Valores
        vBC: 0, pICMS: 0, vICMS: 0,
        vIPI: 0, vPIS: 0, vCOFINS: 0,
        
        // Crédito Simples (CSOSN 101)
        pCredSN: 0, vCredICMSSN: 0,

        // Mensagem de depuração (útil para entender o cálculo)
        auditLog: [] 
    };

    const log = (msg) => taxes.auditLog.push(msg);

    // Validações Críticas
    if (!companyInfo?.address?.state) {
        log("ERRO: Estado da empresa não configurado.");
        return { ...taxes, error: "Empresa sem UF configurada" };
    }
    
    if (!taxProfile) {
        log("ALERTA: Produto sem perfil fiscal. Usando padrão 102/5102.");
        // Fallback seguro para venda interna
        taxes.cfop = '5102';
        return taxes; 
    }

    // --- VARIÁVEIS DE DECISÃO ---
    // Se cliente for null (Consumidor Balcão), assume mesmo estado (Venda Interna)
    const clientState = client?.address?.state || companyInfo.address.state;
    const companyState = companyInfo.address.state;
    const isInternal = clientState === companyState;
    
    // Indicador de IE do Cliente (1=Contribuinte, 2=Isento, 9=Não Contribuinte)
    // Se cliente não existe (Balcão), assume 9 (Não Contribuinte)
    const indIEDest = client?.ie_indicator || '9'; 
    const isContribuinte = indIEDest === '1' || indIEDest === '2';

    log(`Operação: ${isInternal ? 'Interna' : 'Interestadual'} (${companyState} -> ${clientState})`);
    log(`Cliente: ${isContribuinte ? 'Contribuinte' : 'Não Contribuinte'}`);

    // --- LÓGICA DE CFOP (MATRIZ DE DECISÃO) ---
    // Verifica se o perfil é de Substituição Tributária (ST)
    // CSOSNs típicos de ST: 201, 202, 203, 500
    // CSOSNs típicos normais: 101, 102, 900
    const isSTProfile = ['500', '201', '202', '203', '60', '70'].includes(taxProfile.cst_nfe);
    
    let cfopBase = '';

    if (isInternal) {
        // --- VENDA DENTRO DO ESTADO (5.XXX) ---
        if (isSTProfile) {
            // 5.405: Venda de mercadoria adquirida com ST (Revenda de algo que já pagou imposto)
            // Se fosse indústria seria 5.403
            cfopBase = '5405'; 
        } else {
            // 5.102: Venda de mercadoria de terceiros
            cfopBase = '5102'; 
        }
    } else {
        // --- VENDA INTERESTADUAL (6.XXX) ---
        if (isSTProfile) {
            if (isContribuinte) {
                // 6.403/6.404: Venda com ST para contribuinte
                cfopBase = '6404'; 
            } else {
                // Para não contribuinte fora do estado, a ST geralmente não se aplica na saída do Simples (regras complexas de convênio)
                // Por segurança, muitos sistemas usam 6.108 (Venda a não contribuinte)
                cfopBase = '6108'; 
                log("Aviso: Venda Interestadual ST para Não Contribuinte -> Convertido para 6108");
            }
        } else {
            if (isContribuinte) {
                cfopBase = '6102'; // Venda normal para contribuinte
            } else {
                cfopBase = '6108'; // Venda normal para NÃO contribuinte (Consumidor Final outro estado)
            }
        }
    }
    
    taxes.cfop = cfopBase;
    log(`CFOP Definido: ${cfopBase}`);

    // --- APLICAÇÃO DO PERFIL ---
    taxes.csosn = taxProfile.cst_nfe;
    taxes.cst_pis_cofins = taxProfile.cst_pis_cofins || '49';
    taxes.origin = String(taxProfile.origin || product.origin || '0');

    // --- CÁLCULO DE IMPOSTOS (SIMPLES NACIONAL) ---
    
    // IPI (Raríssimo em revenda, mas suportado)
    if (product.ipiRate && product.ipiRate > 0) {
        taxes.vIPI = Number((totalValue * (product.ipiRate / 100)).toFixed(2));
        log(`IPI calculado: R$ ${taxes.vIPI}`);
    }

    // Crédito de ICMS (CSOSN 101) - Apenas se destinado a comercialização
    if (taxes.csosn === '101' && companyInfo.icmsCreditRate && isContribuinte) {
        taxes.pCredSN = Number(companyInfo.icmsCreditRate);
        taxes.vCredICMSSN = Number((totalValue * (taxes.pCredSN / 100)).toFixed(2));
        log(`Crédito ICMS destacado: R$ ${taxes.vCredICMSSN}`);
    }

    // PIS/COFINS (Geralmente zerado no Simples na nota)
    // Se precisar destacar (Monofásico de Bebidas/Autopeças), a lógica entraria aqui.
    // Para simplificar e evitar erro: Mantemos 0.00 (padrão COTEPE para Simples)

    return taxes;
};