// Shared helpers: escaping, ids, sessions (HMAC-signed cookies), PIN hashing, French Polynesia reference data, tariffs.
const enc = new TextEncoder();

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nowIso = () => new Date().toISOString();
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const uid = () => hex(crypto.getRandomValues(new Uint8Array(12)));
const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I: easy to read over the phone
export const trackingCode = () => 'ML-' + [...crypto.getRandomValues(new Uint8Array(6))].map((b) => ALPHA[b % ALPHA.length]).join('');
export const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
export const num = (v, d = null) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d; };
export const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
export const fmtXpf = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;
export const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Pacific/Tahiti', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
export const todayTahiti = () => new Date(Date.now() - 10 * 3600000).toISOString().slice(0, 10);

async function hmac(secret, data) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// Session cookie: "<role>.<subject>.<expiry>.<hmac>"
export async function makeSession(env, role, sub, days = 30) {
  const exp = Date.now() + days * 86400000;
  const body = `${role}.${sub}.${exp}`;
  return `${body}.${await hmac(env.SESSION_SECRET, body)}`;
}
export async function readSession(request, env) {
  const m = /(?:^|;\s*)mls=([^;]+)/.exec(request.headers.get('cookie') || '');
  if (!m || !env.SESSION_SECRET) return null;
  const parts = decodeURIComponent(m[1]).split('.');
  if (parts.length !== 4) return null;
  const [role, sub, exp, sig] = parts;
  if (Number(exp) < Date.now()) return null;
  if (!safeEqual(sig, await hmac(env.SESSION_SECRET, `${role}.${sub}.${exp}`))) return null;
  return { role, sub };
}
export const sessionCookie = (value, secure) => `mls=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure ? '; Secure' : ''}`;
export const clearCookie = 'mls=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

export async function hashPin(pin, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return { hash: hex(bits), salt };
}

// ── French Polynesia reference data ──
export const ISLANDS = ['Tahiti', 'Moorea', 'Bora Bora', 'Raiatea', 'Tahaa', 'Huahine', 'Maupiti', 'Rangiroa', 'Tikehau', 'Fakarava',
  'Manihi', 'Nuku Hiva', 'Hiva Oa', 'Ua Pou', 'Tubuai', 'Rurutu', 'Raivavae', 'Rimatara', 'Makemo', 'Hao', 'Autre île'];
export const COUNTRIES = ['France (métropole)', 'Nouvelle-Calédonie', 'Wallis-et-Futuna', 'États-Unis', 'Canada', 'Nouvelle-Zélande', 'Australie',
  'Japon', 'Chine', 'Hawaï (États-Unis)', 'Fidji', 'Belgique', 'Suisse', 'Allemagne', 'Royaume-Uni', 'Autre pays'];
// Tahiti communes grouped by courier zone (Papeete urban area vs. rest of the island and Presqu'île)
export const TAHITI_ZONES = {
  urbain: { label: 'Tahiti – zone urbaine', communes: ['Papeete', 'Pirae', 'Arue', 'Faa\'a', 'Punaauia', 'Mahina'] },
  ile: { label: 'Tahiti – reste de l’île', communes: ['Paea', 'Papara', 'Teva I Uta', 'Taiarapu-Est', 'Taiarapu-Ouest', 'Papenoo', 'Hitiaa O Te Ra'] },
};
export const COMMUNES = [...TAHITI_ZONES.urbain.communes, ...TAHITI_ZONES.ile.communes];

export const STATUS = {
  created: { label: 'Nouvelle', color: '#9FB0A6' },
  assigned: { label: 'Assignée', color: '#F2C230' },
  picked_up: { label: 'Ramassée', color: '#2E9E5B' },
  in_transit: { label: 'Chez le transporteur', color: '#3D8BFD' },
  delivered: { label: 'Livrée', color: '#8BFF2C' },
  cancelled: { label: 'Annulée', color: '#FF7A59' },
};
// Allowed forward transitions (driver & console)
export const NEXT = {
  created: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'cancelled'],
  picked_up: ['in_transit', 'delivered'],
  in_transit: ['delivered'],
  delivered: [], cancelled: [],
};
export const DEST_LABEL = { tahiti: 'Tahiti', iles: 'Îles', international: 'International' };

// ── Tariffs (XPF). Provisional defaults, editable in /console/tarifs and stored in config.tariffs ──
export const DEFAULT_TARIFFS = {
  urbain: 1000,          // Tahiti, Papeete urban area
  ile: 1500,             // rest of Tahiti
  moorea: 2500,          // Moorea (ferry)
  iles: 3000,            // other islands: pickup + drop at boat/air freight (carrier cost added on quote)
  international: 2000,   // pickup + packing check + drop at OPT + CN23 (postage added on quote)
  kg_included: 5,
  per_extra_kg: 200,
  per_extra_parcel: 300,
};
export async function getTariffs(env) {
  const row = await env.DB.prepare(`SELECT value FROM config WHERE key = 'tariffs'`).first();
  try { return { ...DEFAULT_TARIFFS, ...(row ? JSON.parse(row.value) : {}) }; } catch { return { ...DEFAULT_TARIFFS }; }
}
export function zoneOf(o) {
  if (o.dest_type === 'international') return 'international';
  if (o.dest_type === 'iles') return o.dest_island === 'Moorea' ? 'moorea' : 'iles';
  const commune = String(o.dest_commune || '');
  return TAHITI_ZONES.ile.communes.includes(commune) ? 'ile' : 'urbain';
}
export function quote(t, o) {
  const zone = zoneOf(o);
  const base = t[zone] || 0;
  const extraKg = Math.max(0, Math.ceil((Number(o.weight_kg) || 0) - t.kg_included));
  const extraParcels = Math.max(0, (int(o.parcels, 1)) - 1);
  return { zone, base, extraKg, extraParcels, total: base + extraKg * t.per_extra_kg + extraParcels * t.per_extra_parcel };
}
export const ZONE_LABEL = { urbain: 'Tahiti – zone urbaine', ile: 'Tahiti – reste de l’île', moorea: 'Moorea', iles: 'Autres îles', international: 'International' };
