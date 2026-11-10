import http from 'node:http';
const port = Number(process.env.PORT);
if (!port) {
  console.log(`worker ready ${process.env.RIG_ID ?? ''}`);
  setInterval(() => console.log('worker heartbeat'), 10000);
} else {
  const server = http.createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ ok: true, api: process.env.API_URL, cors: process.env.CORS_ORIGIN }));
  });
  server.listen(port, '127.0.0.1', () => console.log(`listening 127.0.0.1:${port}; API=${process.env.API_URL ?? ''}; CORS=${process.env.CORS_ORIGIN ?? ''}`));
}

const metricsPort = Number(process.env.METRICS_PORT);
if (metricsPort) http.createServer((_request, response) => response.end('fixture_metric 1\n'))
  .listen(metricsPort, '127.0.0.1', () => console.log(`metrics 127.0.0.1:${metricsPort}`));
