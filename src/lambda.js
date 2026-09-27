// AWS Lambda entry point (Function URL, payload v2.0) → web-standard Request/Response.
import { handle } from './http.js';

export async function handler(event) {
  const host = event.headers?.host ?? 'localhost';
  const qs = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const method = event.requestContext?.http?.method ?? 'GET';
  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body) : undefined;
  const req = new Request(`https://${host}${event.rawPath ?? '/'}${qs}`, {
    method, headers: event.headers ?? {}, body: ['GET', 'HEAD'].includes(method) ? undefined : body,
  });
  const res = await handle(req);
  const headers = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  return { statusCode: res.status, headers, body: await res.text() };
}
