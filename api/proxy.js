// api/proxy.js
export default async function handler(req, res) {
  // Configuração de CORS (Permitir acesso)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Token'
  );

  // Responde rápido para preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 1. Pega o endpoint que veio da URL (via vercel.json)
  const { endpoint } = req.query; 
  
  if (!endpoint) {
    return res.status(400).json({ Error: "Endpoint não especificado" });
  }

  // 2. Monta a URL real da BrasilNFe
  // Se o endpoint vier como array (alguns casos), junta com '/'
  const path = Array.isArray(endpoint) ? endpoint.join('/') : endpoint;
  const targetUrl = `https://api.brasilnfe.com.br/${path}`;

  console.log(`[Vercel Proxy] Redirecionando para: ${targetUrl}`);

  try {
    // 3. Repassa a requisição para a BrasilNFe
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        // Repassa o Token que veio do seu Front-end
        'Token': req.headers.token || req.headers.Token || '' 
      },
      // O req.body na Vercel já vem como objeto se for JSON, precisamos transformar em string de novo
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });

    // 4. Pega a resposta e devolve para o seu Front-end
    const data = await response.text();
    
    // Tenta fazer o parse para JSON para garantir que o Content-Type esteja certo, 
    // mas se falhar devolve como texto mesmo (ex: PDF ou XML puro)
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