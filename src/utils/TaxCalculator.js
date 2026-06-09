// src/utils/TaxCalculator.js

export const calculateItemTaxes = (product, client, companyInfo, taxProfile) => {
    
    // 1. Sanitização
    const quantity = Number(product.qty || product.quantity || 1);
    const unitPrice = Number(product.price || product.unitPrice || 0);
    const totalValue = quantity * unitPrice;
    
    // Objeto Base
    let taxes = {
        cfop: '', // Será preenchido abaixo
        csosn: '102',
        cst_pis_cofins: '49',
        origin: '0', 
        ncm: product.ncm ? String(product.ncm).replace(/\D/g, '') : '',
        cest: product.cest ? String(product.cest).replace(/\D/g, '') : '',
        vBC: 0, pICMS: 0, vICMS: 0, vIPI: 0, pIPI: 0, vPIS: 0, vCOFINS: 0,
        auditLog: [] 
    };

    const log = (msg) => taxes.auditLog.push(msg);

    // Fallback se não tiver empresa/perfil
    if (!companyInfo?.address?.state) return { ...taxes, cfop: '5102', error: "Empresa sem UF" };
    if (!taxProfile) {
        taxes.cfop = '5102'; // Sem perfil = Padrão
        return taxes; 
    }

    // --- LÓGICA DE CFOP (AQUI ESTÁ A CORREÇÃO) ---
    const clientState = client?.address?.state || companyInfo.address.state;
    const companyState = companyInfo.address.state;
    const isInternal = clientState === companyState;
    const indIEDest = client?.ie_indicator || '9'; 
    const isContribuinte = indIEDest === '1' || indIEDest === '2';

    // REGRA DE OURO: Se o perfil tem CFOP manual (cfop_state), USE ELE!
    // Verificamos tanto 'cfop_state' (banco) quanto 'cfop' (memória)
    const manualCFOP = taxProfile.cfop_state || taxProfile.cfop;

    if (isInternal && manualCFOP && String(manualCFOP).length === 4) {
        taxes.cfop = String(manualCFOP);
        log(`CFOP forçado pelo perfil: ${taxes.cfop}`);
    } 
    else {
        // Cálculo Automático (Apenas se não tiver manual)
        const isSTProfile = ['500', '201', '202', '203', '60', '70'].includes(taxProfile.cst_nfe);
        
        if (isInternal) {
            taxes.cfop = isSTProfile ? '5405' : '5102';
        } else {
            // Interestadual
            if (isSTProfile) taxes.cfop = isContribuinte ? '6404' : '6108';
            else taxes.cfop = isContribuinte ? '6102' : '6108';
        }
        log(`CFOP calculado automaticamente: ${taxes.cfop}`);
    }

    // Outros campos do ICMS
    taxes.csosn = taxProfile.cst_nfe || '102';
    taxes.origin = String(taxProfile.origin || product.origin || '0');

    // PIS/COFINS — repassa CST e alíquotas do perfil para o NFeBuilder
    taxes.cst_pis_cofins = taxProfile.cst_pis_cofins || '49';
    taxes.is_monofasico   = taxProfile.is_monofasico ?? (taxes.cst_pis_cofins === '04');
    taxes.pis_rate        = Number(taxProfile.pis_rate   || 0);
    taxes.cofins_rate     = Number(taxProfile.cofins_rate || 0);

    // Calcula valores de PIS/COFINS apenas quando CST 01 (tributável)
    if (taxes.cst_pis_cofins === '01' && taxes.pis_rate > 0) {
        taxes.vPIS    = Number((totalValue * taxes.pis_rate    / 100).toFixed(2));
        taxes.vCOFINS = Number((totalValue * taxes.cofins_rate / 100).toFixed(2));
        log(`PIS ${taxes.pis_rate}% = R$${taxes.vPIS} | COFINS ${taxes.cofins_rate}% = R$${taxes.vCOFINS}`);
    } else {
        // Monofásico (04), isento (07), outras (49): PIS/COFINS = 0
        taxes.vPIS    = 0;
        taxes.vCOFINS = 0;
        if (taxes.is_monofasico) log('PIS/COFINS monofásico: alíquota zero (CST 04)');
    }

    // IPI (se configurado no produto)
    if (product.ipiRate > 0) {
        taxes.vIPI = Number((totalValue * (product.ipiRate / 100)).toFixed(2));
        taxes.pIPI = product.ipiRate;
    }

    return taxes;
};