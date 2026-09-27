// Polite, safe supplier-website scraper.
// - Respects robots.txt, identifies itself with a clear User-Agent, one page per call.
// - SSRF-hardened: http(s) only, DNS-resolved addresses must be public, redirects re-validated.
// - Optional Bedrock pass turns raw page text into a structured supplier card.
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { config } from './config.js';
import { bedrockEnabled, generate, parseJson } from './bedrock.js';

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

export async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http(s) URLs are allowed');
  if (u.username || u.password) throw new Error('Credentials in URL are not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('URL resolves to a private or reserved address');
  return u;
}

async function safeFetch(raw, { maxRedirects = 3 } = {}) {
  let url = await assertPublicUrl(raw);
  for (let i = 0; i <= maxRedirects; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), config.scraper.timeoutMs);
    let res;
    try {
      res = await fetch(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': config.scraper.userAgent, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' } });
    } finally { clearTimeout(t); }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).toString());
      continue;
    }
    const reader = res.body?.getReader();
    let size = 0; const chunks = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > config.scraper.maxBytes) { await reader.cancel(); break; }
        chunks.push(value);
      }
    }
    return { url: url.toString(), status: res.status, text: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8') };
  }
  throw new Error('Too many redirects');
}

export function robotsAllows(robotsTxt, path, ua = 'ManaLogBot') {
  const groups = []; let cur = null;
  for (const line of String(robotsTxt).split(/\r?\n/)) {
    const [k, ...rest] = line.replace(/#.*/, '').split(':');
    const key = k?.trim().toLowerCase(); const val = rest.join(':').trim();
    if (!key) continue;
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if (cur && (key === 'disallow' || key === 'allow')) cur.rules.push({ allow: key === 'allow', path: val });
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && ua.toLowerCase().includes(a))) ?? groups.find((g) => g.agents.includes('*'));
  if (!mine) return true;
  let best = null;
  for (const r of mine.rules) if (r.path && path.startsWith(r.path) && (!best || r.path.length > best.path.length)) best = r;
  return !best || best.allow;
}

export function extractFromHtml(html, baseUrl) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim().replace(/\s+/g, ' ');
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] ?? '';
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const emails = [...new Set((html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).filter((e) => !/\.(png|jpg|gif|webp|svg)$/i.test(e)))].slice(0, 5);
  const phones = [...new Set((text.match(/\+\d[\d\s().-]{7,18}\d/g) ?? []).map((p) => p.replace(/\s+/g, ' ')))].slice(0, 5);
  const links = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(([, href, label]) => ({ href, label: label.replace(/<[^>]+>/g, '').trim() }))
    .filter((l) => /contact|product|catalog|catalogue|export|wholesale|about/i.test(l.href + ' ' + l.label))
    .slice(0, 12)
    .map((l) => { try { return { label: l.label.slice(0, 60), url: new URL(l.href, baseUrl).toString() }; } catch { return null; } })
    .filter(Boolean);
  return { title, description, emails, phones, links, textSample: text.slice(0, 4000) };
}

export async function scrapeSupplierSite(rawUrl, { product } = {}) {
  const u = await assertPublicUrl(rawUrl);
  let robots = '';
  try { robots = (await safeFetch(`${u.origin}/robots.txt`)).text; } catch { /* no robots.txt → allowed */ }
  if (!robotsAllows(robots, u.pathname, 'ManaLogBot')) {
    return { url: u.toString(), allowed: false, message: 'robots.txt disallows this page for automated agents — ManaLog will not fetch it.' };
  }
  const page = await safeFetch(u.toString());
  const data = extractFromHtml(page.text, page.url);
  let card = null;
  if (bedrockEnabled()) {
    const out = await generate(
      'You extract B2B supplier facts from website text. Reply ONLY with JSON: {"company":"","country":"","products":[],"moq":null,"certifications":[],"exportsTo":[],"contactEmail":null,"summary":""}. Use null when unknown; never invent.',
      `Product of interest: ${product ?? 'unspecified'}\nURL: ${page.url}\nTitle: ${data.title}\nText:\n${data.textSample}`,
      { maxTokens: 600 },
    );
    card = parseJson(out);
  }
  return { url: page.url, status: page.status, allowed: true, ...data, textSample: data.textSample.slice(0, 600), aiCard: card };
}
