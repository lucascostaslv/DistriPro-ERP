const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/bling-api', // Toda vez que alguém chamar /bling-api...
    createProxyMiddleware({
      target: 'https://api.bling.com.br/Api/v3', // ...manda para a API do Bling
      changeOrigin: true, // "Engana" a API dizendo que a requisição veio do domínio deles
      pathRewrite: { '^/bling-api': '' },
      secure: true,
      logLevel: 'debug', // Mostra no terminal o que está acontecendo
    })
  );
};
