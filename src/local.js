// Local dev server: `npm start` → http://localhost:8787 (console) and http://localhost:8787/mcp (MCP).
import http from 'node:http';
import { handle } from './http.js';

const port = Number(process.env.PORT ?? 8787);

http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });
    const r = await handle(request);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}).listen(port, () => console.log(`ManaLog running → console http://localhost:${port}  |  MCP http://localhost:${port}/mcp`));
