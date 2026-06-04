#!/usr/bin/env node
import http from 'node:http';
import net from 'node:net';

const proxyPort = Number(process.env.EVENT_PROXY_PORT ?? 8787);
const webPort = Number(process.env.EVENT_WEB_PORT ?? 3000);
const serverPort = Number(process.env.EVENT_SERVER_PORT ?? 3001);
const host = process.env.EVENT_PROXY_HOST ?? '0.0.0.0';

function targetForPath(path = '/') {
  return path.startsWith('/socket.io') || path === '/healthz' ? serverPort : webPort;
}

const proxy = http.createServer((req, res) => {
  const targetPort = targetForPath(req.url);
  const headers = {
    ...req.headers,
    host: `127.0.0.1:${targetPort}`,
    'x-forwarded-host': req.headers.host ?? '',
    'x-forwarded-proto': req.headers['x-forwarded-proto'] ?? 'https',
  };

  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: targetPort,
      method: req.method,
      path: req.url,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`Upstream ${targetPort} is not reachable: ${error.message}\n`);
  });

  req.pipe(upstream);
});

proxy.on('upgrade', (req, socket, head) => {
  const targetPort = targetForPath(req.url);
  const upstream = net.connect(targetPort, '127.0.0.1');

  upstream.on('connect', () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    const headers = {
      ...req.headers,
      host: `127.0.0.1:${targetPort}`,
      'x-forwarded-host': req.headers.host ?? '',
      'x-forwarded-proto': req.headers['x-forwarded-proto'] ?? 'https',
    };
    for (const [name, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const item of value) upstream.write(`${name}: ${item}\r\n`);
      } else if (value !== undefined) {
        upstream.write(`${name}: ${value}\r\n`);
      }
    }
    upstream.write('\r\n');
    if (head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });

  upstream.on('error', () => {
    socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
  });
});

proxy.listen(proxyPort, host, () => {
  console.log(
    `[event-proxy] listening on ${host}:${proxyPort} -> web:${webPort}, socket:${serverPort}`
  );
});
