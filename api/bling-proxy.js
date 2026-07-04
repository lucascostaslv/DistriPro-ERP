export default async function handler(req, res) {
  // Configuração de CORS para aceitar requisições do seu Front-end
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { path, ...restQuery } = req.query;

  if (!path) {
    return res.status(400).json({ error: { message: 'Path não especificado' } });
  }

  // Se o path vier como array, junta com '/'
  let cleanPath = Array.isArray(path) ? path.join('/') : path;
  cleanPath = cleanPath.replace(/^\/?bling-api\//, '').replace(/^\/+/, '');

  const qs = new URLSearchParams(restQuery).toString();
  const targetUrl = `https://api.bling.com.br/Api/v3/${cleanPath}${qs ? `?${qs}` : ''}`;

  const isFormEncoded = (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Accept': req.headers['accept'] || 'application/json',
        ...(req.headers['authorization'] ? { 'Authorization': req.headers['authorization'] } : {}),
      },
      body:
        req.method === 'GET' || req.method === 'HEAD'
          ? undefined
          : isFormEncoded
            ? new URLSearchParams(req.body).toString()
            : JSON.stringify(req.body),
    });

    const data = await response.text();

    try {
      const json = JSON.parse(data);
      res.status(response.status).json(json);
    } catch (e) {
      res.status(response.status).send(data);
    }
  } catch (error) {
    console.error('[Bling Proxy Error]', error);
    res.status(500).json({ error: { message: 'Erro interno no proxy Vercel', details: error.message } });
  }
}
