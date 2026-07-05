const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT || 3001;
const bggToken = process.env.BGG_API_TOKEN || null;

const allowedHost = 'boardgamegeek.com';

function proxyRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const endpoint = url.searchParams.get('endpoint');
    if (!endpoint) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Missing endpoint parameter');
    }

    const targetUrl = new URL(`https://${allowedHost}/xmlapi2/${endpoint}`);
    url.searchParams.forEach((value, key) => {
      if (key !== 'endpoint') {
        targetUrl.searchParams.set(key, value);
      }
    });

    const requestOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'De Snuffelaars BGG Proxy/1.0',
        Accept: 'application/xml,text/xml'
      }
    };

    if (bggToken) {
      requestOptions.headers.Authorization = `Bearer ${bggToken}`;
    }

    https.get(targetUrl, requestOptions, (bgRes) => {
      res.writeHead(bgRes.statusCode, {
        'Content-Type': bgRes.headers['content-type'] || 'application/xml',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      bgRes.pipe(res);
    }).on('error', (error) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Proxy request failed: ${error.message}`);
    });
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Proxy error: ${error.message}`);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  proxyRequest(req, res);
});

server.listen(PORT, () => {
  console.log(`BGG proxy running on http://localhost:${PORT}`);
});