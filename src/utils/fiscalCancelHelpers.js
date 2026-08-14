// src/utils/fiscalCancelHelpers.js
//
// Extrai os dados do EVENTO de cancelamento (protocolo próprio do evento, distinto do
// protocolo de autorização original; XML do evento; etc.) a partir da resposta da API de
// cancelamento (BrasilNFe ou Bling). Os nomes exatos de campo usados abaixo (Protocolo,
// nProtEvento, Base64XmlEvento...) NÃO estão 100% confirmados contra a documentação oficial —
// tentamos as variações mais plováveis com base no padrão já usado no restante do app
// (ver handleEmitNFeBrasilNFe em App.js), mas sempre guardamos a resposta bruta em
// `cancel_raw_response` para que nenhum dado retornado pela SEFAZ/Bling se perca, mesmo que
// os nomes de campo abaixo estejam errados — quem revisar depois consegue mapear certinho.
export const extractCancelEventData = (result, justification) => {
  const base = {
    cancel_justification: justification,
    canceled_at: new Date().toISOString(),
  };
  if (!result || typeof result !== "object") return base;

  const protocol =
    result.ProtocoloCancelamento ||
    result.ProtocoloEvento ||
    result.NumeroProtocolo ||
    result.Protocolo ||
    result.nProtEvento ||
    result.nProt ||
    null;

  const eventXml =
    result.Base64XmlEvento ||
    result.Base64Evento ||
    result.XmlEvento ||
    result.Base64Xml ||
    null;

  return {
    ...base,
    cancel_protocol: protocol,
    cancel_event_xml: eventXml,
    cancel_raw_response: result,
  };
};
