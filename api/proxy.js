export default async function handler(req, res) {
  // Configuração de CORS para aceitar requisições do seu Front-end
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Token'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { endpoint } = req.query; 
  
  if (!endpoint) {
    return res.status(400).json({ Error: "Endpoint não especificado" });
  }

  // --- CORREÇÃO AQUI ---
  // O vercel.json remove o "/services", então nós o colocamos de volta manualmente.
  // Se o endpoint vier como array, junta com '/'
  let path = Array.isArray(endpoint) ? endpoint.join('/') : endpoint;
  
  // Garante que não estamos duplicando "services" se por acaso ele vier
  path = path.replace(/^\/?services\//, ''); 

  // Monta a URL EXATAMENTE como no seu setupProxy.js local
  // Alvo: https://api.brasilnfe.com.br/services/fiscal/...
  const targetUrl = `https://api.brasilnfe.com.br/services/${path}`;

  console.log(`[Vercel Proxy] Redirecionando para: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Token': req.headers.token || req.headers.Token || '' 
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });

    const data = await response.text();
    
    try {
        const json = JSON.parse(data);
        res.status(response.status).json(json);
    } catch (e) {
        res.status(response.status).send(data);
    }

  } catch (error) {
    console.error('[Proxy Error]', error);
    res.status(500).json({ Error: "Erro interno no proxy Vercel", Details: error.message });
  }
}