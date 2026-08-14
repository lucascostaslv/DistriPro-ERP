// src/utils/BlingPayloadBuilder.js
// Monta o payload de `POST /nfe` ou `POST /nfce` a partir de uma venda do PDV.
// Diferente da BrasilNFe, o Bling calcula ICMS/PIS/COFINS/IPI automaticamente a partir
// da Natureza de Operação + dados fiscais enviados por item — não enviamos tributos aqui.

const getSafeDateTime = () => {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const y = brazilTime.getFullYear();
  const m = String(brazilTime.getMonth() + 1).padStart(2, '0');
  const d = String(brazilTime.getDate()).padStart(2, '0');
  const h = String(brazilTime.getHours()).padStart(2, '0');
  const min = String(brazilTime.getMinutes()).padStart(2, '0');
  const s = String(brazilTime.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
};

function mapPaymentMethodId(method, blingConfig) {
  const m = (method || '').toLowerCase();
  if (m.includes('dinheiro')) return blingConfig.forma_pagamento_dinheiro_id;
  if (m.includes('crédito') || m.includes('credito')) return blingConfig.forma_pagamento_credito_id;
  if (m.includes('débito') || m.includes('debito')) return blingConfig.forma_pagamento_debito_id;
  if (m.includes('pix')) return blingConfig.forma_pagamento_pix_id;
  return blingConfig.forma_pagamento_outros_id;
}

function buildContato(client) {
  if (!client || !client.tax_id) {
    return { nome: 'Consumidor Final', tipoPessoa: 'F', contribuinte: 9 };
  }

  const cleanDoc = String(client.tax_id).replace(/\D/g, '');
  const tipoPessoa = cleanDoc.length > 11 ? 'J' : 'F';

  return {
    nome: client.name?.substring(0, 60) || 'Consumidor Final',
    tipoPessoa,
    numeroDocumento: cleanDoc,
    ie: client.ie && client.ie_indicator !== '9' ? client.ie.replace(/\D/g, '') : undefined,
    contribuinte: client.ie_indicator === '1' || client.ie_indicator === '2' ? Number(client.ie_indicator) : 9,
    telefone: client.phone || undefined,
    email: client.email || undefined,
    endereco: client.address?.street
      ? {
          endereco: client.address.street,
          numero: client.address.number || 'SN',
          bairro: client.address.neighborhood || 'Centro',
          cep: client.address.zip_code?.replace(/\D/g, '') || undefined,
          municipio: client.address.city || undefined,
          uf: client.address.state || undefined,
          pais: 'Brasil',
        }
      : undefined,
  };
}

/**
 * @param {object} sale Venda do PDV (items, total, paymentMethod, id)
 * @param {object|null} client Cliente (fiscal_clients) ou null para consumidor final
 * @param {object} blingConfig Linha de `fiscal_bling_settings`
 * @param {'nfe'|'nfce'} tipoDocumento
 */
export const buildBlingNotaPayload = (sale, client, blingConfig, tipoDocumento = 'nfce') => {
  if (!sale.items || sale.items.length === 0) throw new Error('Venda sem itens.');

  const naturezaOperacaoId =
    tipoDocumento === 'nfe' ? blingConfig.natureza_operacao_nfe_id : blingConfig.natureza_operacao_nfce_id;

  if (!naturezaOperacaoId) {
    throw new Error(
      `Natureza de Operação não configurada para ${tipoDocumento === 'nfe' ? 'NF-e' : 'NFC-e'}. Configure em Configurações > Integração Fiscal.`,
    );
  }

  const formaPagamentoId = mapPaymentMethodId(sale.paymentMethod, blingConfig);
  if (!formaPagamentoId) {
    throw new Error(`Forma de pagamento "${sale.paymentMethod}" sem ID do Bling configurado.`);
  }

  const itens = sale.items.map((item) => {
    let ncm = item.ncm ? String(item.ncm).replace(/\D/g, '') : '';
    if (ncm.length !== 8) {
      throw new Error(`O produto "${item.name}" tem NCM inválido (${ncm || 'vazio'}). Corrija no cadastro.`);
    }

    const cest = item.cest ? String(item.cest).replace(/\D/g, '') : '';
    const qtd = Number(item.quantity || item.qty);
    // O Bling não tem campo de desconto discriminado neste payload — o desconto (por item e/ou
    // rateio do desconto geral do carrinho, ver App.js handleReview/item.discountTotal) precisa
    // ficar embutido no valor unitário para o total dos itens reconciliar com sale.total. Usar só
    // item.price aqui (sem subtrair o desconto geral) deixaria o total dos itens MAIOR que o total
    // da parcela sempre que houvesse desconto geral aplicado, arriscando rejeição da nota pelo Bling.
    const grossUnit = Number(item.originalPrice ?? item.unitPrice ?? item.price);
    const lineDiscount = Number(item.discountTotal || 0);
    const vUnit = qtd > 0 ? Math.max(0, (grossUnit * qtd - lineDiscount) / qtd) : grossUnit;

    return {
      codigo: item.id ? String(item.id).substring(0, 20) : undefined,
      descricao: item.name.substring(0, 120),
      unidade: item.unit || 'UN',
      quantidade: qtd,
      valor: vUnit,
      tipo: 'P',
      classificacaoFiscal: ncm,
      cest: cest || undefined,
      origem: Number(item.taxes?.origin ?? item.origin ?? 0),
    };
  });

  return {
    tipo: 1, // Saída
    dataOperacao: getSafeDateTime(),
    contato: buildContato(client),
    naturezaOperacao: { id: naturezaOperacaoId },
    ...(blingConfig.loja_id ? { loja: { id: blingConfig.loja_id } } : {}),
    finalidade: 1,
    itens,
    parcelas: [
      {
        data: getSafeDateTime().split(' ')[0],
        valor: Number(sale.total),
        observacoes: `Venda PDV #${sale.id}`,
        formaPagamento: { id: formaPagamentoId },
      },
    ],
  };
};
