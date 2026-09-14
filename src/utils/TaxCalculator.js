// src/utils/TaxCalculator.js

// CFOP de consignação mercantil — tabela SEFAZ para remessa/retorno de mercadoria fora do estabelecimento.
// ATENÇÃO: CST/ICMS de suspensão para consignação não é calculado automaticamente (ver NFeBuilder.js) —
// exige validação de um contador antes de emitir em produção.
const CONSIGNMENT_CFOP_TABLE = {
    REMESSA_CONSIGNACAO: { internal: '5914', interstate: '6914' },
    RETORNO_CONSIGNACAO: { internal: '1918', interstate: '2918' },
};

export const calculateItemTaxes = (product, client, companyInfo, taxProfile, operationType = 'VENDA') => {

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

    // --- REMESSA/RETORNO DE CONSIGNAÇÃO: CFOP fixo por tabela, independente de perfil tributário ---
    // CST/ICMS de suspensão não é calculado aqui — precisa de validação contábil antes de ir para produção
    // (ver observação em NFeBuilder.js e no plano de implementação).
    if (operationType !== 'VENDA' && CONSIGNMENT_CFOP_TABLE[operationType]) {
        const clientStateConsign = client?.address?.state || companyInfo.address.state;
        const isInternalConsign = clientStateConsign === companyInfo.address.state;
        taxes.cfop = isInternalConsign
            ? CONSIGNMENT_CFOP_TABLE[operationType].internal
            : CONSIGNMENT_CFOP_TABLE[operationType].interstate;
        log(`CFOP de ${operationType} (consignação): ${taxes.cfop}`);
        if (taxProfile) {
            taxes.csosn = taxProfile.cst_nfe || '102';
            taxes.origin = String(taxProfile.origin || product.origin || '0');
        }
        return taxes;
    }

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

    // --- ICMS / ICMS-ST ---
    // CSOSN 102/103/300/400: Simples Nacional não destaca ICMS na nota (fica embutido no
    // DAS) — vICMS/vBC permanecem zero corretamente, nada a calcular.
    //
    // CSOSN 500: mercadoria já chegou com ICMS-ST retido por um elo anterior da cadeia
    // (indústria/importador) — o valor retido é só INFORMATIVO no bloco STRetido do XML,
    // não é um imposto novo cobrado por esta venda. Precisa da alíquota efetiva informada
    // pela contabilidade (`taxProfile.icms_st_rate`); sem ela, fica marcado como pendente
    // em vez de sair silenciosamente como zero.
    //
    // CSOSN 201/202/203: esta empresa É a responsável por reter o ICMS-ST desta venda para
    // o próximo elo — usa o bloco normal (BaseCalculo/AliquotaICMSST/ValorIcms), também
    // dependente de `taxProfile.icms_st_rate`.
    const STOSN_JA_RETIDO = ['500'];
    const CSOSN_RETEM_AGORA = ['201', '202', '203', '60', '70'];
    const icmsStRate = Number(taxProfile.icms_st_rate || 0);

    if (STOSN_JA_RETIDO.includes(taxes.csosn)) {
        if (icmsStRate > 0) {
            taxes.vBCSTRet = Number(totalValue.toFixed(2));
            taxes.vICMSSTRet = Number((totalValue * icmsStRate / 100).toFixed(2));
            log(`ICMS-ST já retido (CSOSN 500), informativo: ${icmsStRate}% = R$${taxes.vICMSSTRet}`);
        } else {
            taxes.icmsStPendente = true;
            log('ATENÇÃO: CSOSN 500 (ICMS-ST retido) sem alíquota configurada no perfil — confirmar com a contabilidade antes de emitir em produção.');
        }
    } else if (CSOSN_RETEM_AGORA.includes(taxes.csosn)) {
        if (icmsStRate > 0) {
            taxes.vBCST = Number(totalValue.toFixed(2));
            taxes.pICMSST = icmsStRate;
            taxes.vICMSST = Number((totalValue * icmsStRate / 100).toFixed(2));
            log(`ICMS-ST retido nesta venda (CSOSN ${taxes.csosn}): ${icmsStRate}% = R$${taxes.vICMSST}`);
        } else {
            taxes.icmsStPendente = true;
            log(`ATENÇÃO: CSOSN ${taxes.csosn} (com ST) sem alíquota configurada no perfil — confirmar com a contabilidade antes de emitir em produção.`);
        }
    }

    // ICMS normal destacado — só se aplica a perfis fora do "sem destaque" do Simples
    // Nacional (102/103/300/400/500) e com alíquota configurada.
    const icmsNormalRate = Number(taxProfile.icms_rate || 0);
    if (icmsNormalRate > 0 && !['102', '103', '300', '400', '500'].includes(taxes.csosn)) {
        taxes.vBC = Number(totalValue.toFixed(2));
        taxes.pICMS = icmsNormalRate;
        taxes.vICMS = Number((totalValue * icmsNormalRate / 100).toFixed(2));
        log(`ICMS normal: ${icmsNormalRate}% = R$${taxes.vICMS}`);
    }

    // PIS/COFINS — repassa CST e alíquotas do perfil tributário
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