// ManaLog Dispatch — courier & parcel dispatch for French Polynesia.
// Console (dispatcher), courier PWA, public tracking, printable label + CN23, JSON API (for ManaShop.app).
import {
  esc, nowIso, uid, trackingCode, int, num, clean, fmtXpf, fmtDateTime, todayTahiti, safeEqual,
  makeSession, readSession, sessionCookie, clearCookie, hashPin,
  ISLANDS, COUNTRIES, COMMUNES, STATUS, NEXT, DEST_LABEL, DEFAULT_TARIFFS, getTariffs, quote, ZONE_LABEL,
} from './lib.js';
import { page, consolePage, pill, flash, LEAFLET } from './ui.js';

const html = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const redirect = (to, headers = {}) => new Response(null, { status: 303, headers: { location: to, ...headers } });
const withMsg = (to, k, v) => `${to}${to.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(v)}`;
const notFound = () => html(page({ title: 'Introuvable', body: '<main class="main"><div class="card"><h1>Page introuvable</h1><a href="/">Accueil</a></div></main>' }), 404);
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

async function readForm(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) return request.formData();
  return new FormData();
}
// CSRF protection for cookie-authenticated POSTs: the request must come from our own origin.
function sameOrigin(request, url) {
  const o = request.headers.get('origin');
  return !o || o === url.origin;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const post = request.method === 'POST';
    if (post && !p.startsWith('/api/') && !sameOrigin(request, url)) return new Response('Origine refusée', { status: 403 });
    try {
      if (p === '/') return home();
      if (p === '/suivi') return url.searchParams.get('code') ? redirect(`/suivi/${encodeURIComponent(url.searchParams.get('code').trim().toUpperCase())}`) : trackingSearch();
      if (p.startsWith('/suivi/')) return trackingPage(env, decodeURIComponent(p.slice(7)));
      if (p.startsWith('/api/v1/')) return api(request, env, url, p.slice(8).split('/'));
      if (p === '/connexion') return post ? consoleLogin(request, env, url) : loginPage(url);
      if (p === '/deconnexion') return redirect('/', { 'set-cookie': clearCookie });
      if (p === '/chauffeur' || p.startsWith('/chauffeur/')) return courier(request, env, url, p.split('/').slice(2));
      if (p === '/console' || p.startsWith('/console/')) {
        const s = await readSession(request, env);
        if (s?.role !== 'console') return redirect('/connexion');
        return consoleRoute(request, env, url, p.split('/').slice(2));
      }
      return notFound();
    } catch (e) {
      console.error('Erreur', e && e.stack);
      return html(page({ title: 'Erreur', body: '<main class="main"><div class="card"><h1>Une erreur est survenue</h1><p>Réessayez dans un instant.</p></div></main>' }), 500);
    }
  },
};

// ───────── Public pages ─────────
function home() {
  return html(page({ title: 'Accueil', body: `<main class="main" style="max-width:560px;margin:0 auto;text-align:center">
    <div style="background:#050706;border-radius:20px;padding:16px;margin:20px 0"><img src="/manalog-logo.webp" alt="ManaLog" style="max-width:100%;height:150px;object-fit:contain"></div>
    <h1>Vos colis, du fenua vers le monde</h1><p class="muted">Ramassage, livraison à Tahiti, envois vers les îles et l’international.</p>
    <form action="/suivi" class="card" style="text-align:left"><label for="c">Suivre un colis</label><div style="display:flex;gap:8px"><input id="c" name="code" placeholder="ML-XXXXXX" required><button class="btn">Suivre</button></div></form>
    <p><a class="btn ghost" href="/chauffeur">📱 Espace coursier</a> <a class="btn ghost" href="/console">🖥️ Espace pro</a></p></main>` }));
}
function trackingSearch() {
  return html(page({ title: 'Suivi', body: `<main class="main" style="max-width:520px;margin:0 auto"><h1>Suivre un colis</h1><form class="card"><label for="c">Code de suivi</label><input id="c" name="code" placeholder="ML-XXXXXX" required><button class="btn" style="margin-top:10px">Suivre</button></form></main>` }));
}
async function trackingPage(env, code) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE code = ?').bind(code.toUpperCase()).first();
  if (!o) return html(page({ title: 'Suivi', body: `<main class="main" style="max-width:520px;margin:0 auto"><div class="card"><h1>Code introuvable</h1><p>Vérifiez le code « ${esc(code)} ».</p><a href="/suivi">Réessayer</a></div></main>` }), 404);
  const { results: ev = [] } = await env.DB.prepare('SELECT status, note, at FROM events WHERE order_id = ? ORDER BY id').bind(o.id).all();
  const dest = o.dest_type === 'international' ? o.dest_country : o.dest_type === 'iles' ? o.dest_island : (o.dest_commune || 'Tahiti');
  const steps = ['created', 'picked_up', ...(o.dest_type === 'tahiti' ? [] : ['in_transit']), 'delivered'];
  const reached = new Set(ev.map((e) => e.status));
  return html(page({ title: `Suivi ${o.code}`, body: `<main class="main" style="max-width:560px;margin:0 auto">
    <div style="background:#050706;border-radius:16px;padding:10px;text-align:center;margin-bottom:14px"><img src="/manalog-logo.webp" alt="ManaLog" style="height:90px"></div>
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><span class="code">${esc(o.code)}</span>${pill(o.status)}</div>
    <p class="muted small" style="margin:6px 0 0">Destination : ${esc(dest || '')} · ${o.parcels} colis</p></div>
    <div class="card"><div class="chips" style="margin-bottom:14px">${steps.map((s) => `<span class="chip" style="${reached.has(s) || (s === 'created') ? 'background:#0A0F0C;color:#8BFF2C;border-color:#0A0F0C' : ''}">${esc(STATUS[s].label)}</span>`).join('')}</div>
    <ul class="tl">${ev.slice().reverse().map((e) => `<li><b>${esc(STATUS[e.status]?.label || e.status)}</b> <span class="muted small">· ${esc(fmtDateTime(e.at))}</span>${e.note && ['picked_up', 'in_transit', 'delivered'].includes(e.status) ? `<div class="small">${esc(e.note)}</div>` : ''}</li>`).join('')}</ul></div>
    <p class="small muted" style="text-align:center">ManaLog · Hinova Digital</p></main>` }));
}

// ───────── Console login ─────────
function loginPage(url) {
  return html(page({ title: 'Connexion', body: `<main class="main" style="max-width:420px;margin:40px auto">
    <div style="background:#050706;border-radius:16px;padding:10px;text-align:center;margin-bottom:14px"><img src="/manalog-logo.webp" alt="ManaLog" style="height:100px"></div>
    ${flash(url)}<form method="post" class="card"><h1>Espace pro</h1><label for="pw">Mot de passe</label><input id="pw" name="password" type="password" required autocomplete="current-password"><button class="btn" style="margin-top:12px">Se connecter</button></form></main>` }));
}
async function consoleLogin(request, env, url) {
  const f = await readForm(request);
  if (!env.CONSOLE_PASSWORD || !env.SESSION_SECRET) return redirect(withMsg('/connexion', 'err', 'Console non configurée.'));
  if (!safeEqual(String(f.get('password') || ''), env.CONSOLE_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 600));
    return redirect(withMsg('/connexion', 'err', 'Mot de passe incorrect.'));
  }
  return redirect('/console', { 'set-cookie': sessionCookie(await makeSession(env, 'console', 'admin', 14), url.protocol === 'https:') });
}

// ───────── Orders: shared ─────────
async function createOrder(env, d, actor) {
  const t = await getTariffs(env);
  const q = quote(t, d);
  const id = uid();
  for (let i = 0; i < 5; i++) {
    const code = trackingCode();
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO orders (id, code, status, source, external_ref, shipper_name, shipper_phone, pickup_address, pickup_island, pickup_lat, pickup_lng,
          recipient_name, recipient_phone, recipient_email, dest_type, dest_address, dest_commune, dest_island, dest_country, dest_lat, dest_lng, zone, parcels, weight_kg,
          description, declared_value_xpf, hs_code, price_xpf, scheduled_for, notes) VALUES (?, ?, 'created', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id, code, d.source || 'console', d.external_ref || null, d.shipper_name, d.shipper_phone || null, d.pickup_address, d.pickup_island || 'Tahiti', d.pickup_lat, d.pickup_lng,
            d.recipient_name, d.recipient_phone || null, d.recipient_email || null, d.dest_type, d.dest_address, d.dest_commune || null, d.dest_island || null, d.dest_country || null, d.dest_lat, d.dest_lng,
            q.zone, d.parcels, d.weight_kg, d.description || null, d.declared_value_xpf ?? null, d.hs_code || null, q.total, d.scheduled_for || todayTahiti(), d.notes || null),
        env.DB.prepare(`INSERT INTO events (order_id, status, note, actor) VALUES (?, 'created', ?, ?)`).bind(id, 'Commande enregistrée', actor),
      ]);
      return { id, code, price_xpf: q.total, zone: q.zone };
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message)) || /external/i.test(String(e && e.message))) throw e;
    }
  }
  throw new Error('Code de suivi indisponible');
}

// Validates an order payload (form or JSON). Returns { error } or { data }.
function parseOrder(get) {
  const dest_type = ['tahiti', 'iles', 'international'].includes(get('dest_type')) ? get('dest_type') : null;
  const d = {
    shipper_name: clean(get('shipper_name'), 120), shipper_phone: clean(get('shipper_phone'), 30),
    pickup_address: clean(get('pickup_address'), 300), pickup_island: ISLANDS.includes(get('pickup_island')) ? get('pickup_island') : 'Tahiti',
    pickup_lat: num(get('pickup_lat')), pickup_lng: num(get('pickup_lng')),
    recipient_name: clean(get('recipient_name'), 120), recipient_phone: clean(get('recipient_phone'), 30), recipient_email: clean(get('recipient_email'), 160),
    dest_type, dest_address: clean(get('dest_address'), 300),
    dest_commune: COMMUNES.includes(get('dest_commune')) ? get('dest_commune') : null,
    dest_island: ISLANDS.includes(get('dest_island')) ? get('dest_island') : null,
    dest_country: COUNTRIES.includes(get('dest_country')) ? get('dest_country') : null,
    dest_lat: num(get('dest_lat')), dest_lng: num(get('dest_lng')),
    parcels: Math.min(50, Math.max(1, int(get('parcels'), 1))), weight_kg: Math.min(500, Math.max(0.1, num(get('weight_kg'), 1))),
    description: clean(get('description'), 300), declared_value_xpf: get('declared_value_xpf') ? Math.max(0, int(get('declared_value_xpf'), 0)) : null,
    hs_code: clean(get('hs_code'), 12).replace(/[^0-9.]/g, ''), scheduled_for: /^\d{4}-\d{2}-\d{2}$/.test(get('scheduled_for') || '') ? get('scheduled_for') : null,
    notes: clean(get('notes'), 500),
  };
  for (const k of ['pickup_lat', 'dest_lat']) if (d[k] !== null && (d[k] < -30 || d[k] > 0)) d[k] = null; // French Polynesia latitudes only
  for (const k of ['pickup_lng', 'dest_lng']) if (d[k] !== null && (d[k] < -155 || d[k] > -130)) d[k] = null;
  if (!d.shipper_name || !d.pickup_address) return { error: 'Expéditeur et adresse de ramassage obligatoires.' };
  if (!d.recipient_name || !d.dest_address) return { error: 'Destinataire et adresse de livraison obligatoires.' };
  if (!dest_type) return { error: 'Choisissez la destination : Tahiti, îles ou international.' };
  if (dest_type === 'tahiti' && !d.dest_commune) return { error: 'Choisissez la commune de livraison.' };
  if (dest_type === 'iles' && !d.dest_island) return { error: 'Choisissez l’île de destination.' };
  if (dest_type === 'international') {
    if (!d.dest_country) return { error: 'Choisissez le pays de destination.' };
    if (!d.description || !d.declared_value_xpf) return { error: 'International : contenu et valeur déclarée obligatoires (déclaration en douane CN23).' };
  }
  return { data: d };
}

async function addEvent(env, order, status, { note = null, lat = null, lng = null, photo_key = null, actor }) {
  const ok = (NEXT[order.status] || []).includes(status);
  if (!ok) return false;
  const r = await env.DB.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?`).bind(status, nowIso(), order.id, order.status).run();
  if (!r.meta.changes) return false;
  await env.DB.prepare(`INSERT INTO events (order_id, status, note, lat, lng, photo_key, actor) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(order.id, status, note, lat, lng, photo_key, actor).run();
  return true;
}

// ───────── Console ─────────
async function consoleRoute(request, env, url, sub) {
  const post = request.method === 'POST';
  const [section, id, action] = sub;
  if (!section) return board(env, url);
  if (section === 'nouvelle') return post ? newOrderPost(request, env) : newOrderPage(env, url);
  if (section === 'commandes' && id) {
    const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
    if (!o) return notFound();
    if (action === 'etiquette') return labelPage(o);
    if (action === 'cn23') return cn23Page(o);
    if (post && action === 'assigner') return assignPost(request, env, o);
    if (post && action === 'statut') return statusPost(request, env, o);
    if (!action) return orderPage(env, url, o);
    return notFound();
  }
  if (section === 'photo' && id) {
    const e = await env.DB.prepare('SELECT photo_key FROM events WHERE id = ?').bind(int(id)).first();
    const obj = e?.photo_key ? await env.FILES.get(e.photo_key) : null;
    return obj ? new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'image/jpeg', 'cache-control': 'private, no-store' } }) : notFound();
  }
  if (section === 'coursiers') return post ? driversPost(request, env) : driversPage(env, url);
  if (section === 'tarifs') return post ? tariffsPost(request, env) : tariffsPage(env, url);
  return notFound();
}

async function board(env, url) {
  const st = Object.keys(STATUS).includes(url.searchParams.get('statut')) ? url.searchParams.get('statut') : null;
  const { results: counts = [] } = await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM orders GROUP BY status`).all();
  const c = Object.fromEntries(counts.map((r) => [r.status, r.n]));
  const active = ['created', 'assigned', 'picked_up', 'in_transit'];
  const where = st ? 'o.status = ?' : `o.status IN (${active.map(() => '?').join(',')})`;
  const { results: orders = [] } = await env.DB.prepare(`SELECT o.*, d.name AS driver_name FROM orders o LEFT JOIN drivers d ON d.id = o.driver_id WHERE ${where} ORDER BY o.created_at DESC LIMIT 200`).bind(...(st ? [st] : active)).all();
  const pts = orders.flatMap((o) => [
    o.pickup_lat ? { lat: o.pickup_lat, lng: o.pickup_lng, k: 'p', t: `${o.code} · ramassage`, u: `/console/commandes/${o.id}` } : null,
    o.dest_lat ? { lat: o.dest_lat, lng: o.dest_lng, k: 'd', t: `${o.code} · livraison`, u: `/console/commandes/${o.id}` } : null,
  ]).filter(Boolean);
  const stat = (k, label, n) => `<a class="stat ${st === k ? 'on' : ''}" href="/console?statut=${k}"><b>${n || 0}</b><span>${label}</span></a>`;
  const body = `${flash(url)}<div class="top"><h1 style="margin:0">Commandes${st ? ` · ${esc(STATUS[st].label)}` : ' en cours'}</h1><div>${st ? '<a class="btn ghost small" href="/console">Toutes en cours</a> ' : ''}<a class="btn" href="/console/nouvelle">➕ Nouvelle commande</a></div></div>
    <div class="stats">${stat('created', 'Nouvelles', c.created)}${stat('assigned', 'Assignées', c.assigned)}${stat('picked_up', 'Ramassées', c.picked_up)}${stat('in_transit', 'Chez le transporteur', c.in_transit)}${stat('delivered', 'Livrées', c.delivered)}</div>
    <div class="board"><div class="list">${orders.map((o) => `<a class="item" href="/console/commandes/${o.id}">
      <div class="row"><span class="code">${esc(o.code)}</span>${pill(o.status)}</div>
      <div style="margin-top:4px"><b>${esc(o.shipper_name)}</b> → ${esc(o.recipient_name)}</div>
      <div class="small muted">${esc(DEST_LABEL[o.dest_type])} · ${esc(o.dest_type === 'tahiti' ? o.dest_commune : o.dest_type === 'iles' ? o.dest_island : o.dest_country)} · ${o.parcels} colis · ${esc(fmtXpf(o.price_xpf))}</div>
      <div class="small muted">🛵 ${esc(o.driver_name || 'Non assignée')} · ${esc(fmtDateTime(o.created_at))}</div></a>`).join('') || '<div class="card muted">Aucune commande ici.</div>'}</div>
    <div id="map"></div></div>`;
  return html(consolePage({ title: 'Commandes', active: '/console', body, head: LEAFLET, scripts: mapScript('map', pts) }));
}

function mapScript(elId, pts, pick = null) {
  // Map of Tahiti & Moorea (OpenStreetMap tiles: free). pick = { lat: inputId, lng: inputId } for click-to-place.
  return `<script>(function(){if(!window.L)return;var m=L.map('${elId}').setView([-17.6,-149.45],10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(m);
var pts=${JSON.stringify(pts).replace(/</g, '\\u003c')};var b=[];
pts.forEach(function(p){var c=p.k==='p'?'#F2C230':'#2E9E5B';var mk=L.circleMarker([p.lat,p.lng],{radius:8,color:'#0A0F0C',weight:2,fillColor:c,fillOpacity:1}).addTo(m);mk.bindPopup(p.u?'<a href="'+p.u+'">'+p.t+'</a>':p.t);b.push([p.lat,p.lng]);});
if(b.length>1)m.fitBounds(b,{padding:[30,30]});else if(b.length)m.setView(b[0],13);
${pick ? `var mk2=null;var la=document.getElementById('${pick.lat}'),ln=document.getElementById('${pick.lng}');
if(la.value&&ln.value){mk2=L.marker([+la.value,+ln.value]).addTo(m);m.setView([+la.value,+ln.value],14);}
m.on('click',function(e){la.value=e.latlng.lat.toFixed(6);ln.value=e.latlng.lng.toFixed(6);if(mk2)mk2.setLatLng(e.latlng);else mk2=L.marker(e.latlng).addTo(m);});` : ''}
setTimeout(function(){m.invalidateSize()},200);})()</script>`;
}

const options = (list, sel, placeholder) => `${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}${list.map((x) => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('')}`;

async function newOrderPage(env, url) {
  const t = await getTariffs(env);
  const body = `${flash(url)}<h1>Nouvelle commande</h1><form method="post" id="fo">
  <div class="grid2"><div class="card"><h2>📦 Ramassage</h2>
    <label for="sn">Expéditeur (boutique, artisan…)</label><input id="sn" name="shipper_name" required maxlength="120">
    <label for="sp">Téléphone</label><input id="sp" name="shipper_phone" inputmode="tel" placeholder="87 12 34 56">
    <label for="pa">Adresse de ramassage</label><input id="pa" name="pickup_address" required placeholder="Ex. PK 12,5 côté mer, Punaauia, portail bleu">
    <label for="pi">Île</label><select id="pi" name="pickup_island">${options(ISLANDS, 'Tahiti')}</select>
    <p class="small muted" style="margin:8px 0 4px">Pas de numéro de rue ? Touchez la carte pour placer le point exact.</p><div id="mp" class="mapmini"></div>
    <input type="hidden" id="plat" name="pickup_lat"><input type="hidden" id="plng" name="pickup_lng"></div>
  <div class="card"><h2>🏁 Livraison</h2>
    <label>Destination</label><div class="chips" id="dt">
      <label class="chip"><input type="radio" name="dest_type" value="tahiti" checked> Tahiti</label>
      <label class="chip"><input type="radio" name="dest_type" value="iles"> Îles</label>
      <label class="chip"><input type="radio" name="dest_type" value="international"> International</label></div>
    <label for="rn">Destinataire</label><input id="rn" name="recipient_name" required maxlength="120">
    <div class="grid2"><div><label for="rp">Téléphone</label><input id="rp" name="recipient_phone" inputmode="tel"></div><div><label for="re">E-mail (pour le suivi)</label><input id="re" name="recipient_email" type="email"></div></div>
    <label for="da">Adresse de livraison</label><input id="da" name="dest_address" required placeholder="Ex. Servitude Teriierooiterai, PK 4 côté montagne">
    <div data-d="tahiti"><label for="dc">Commune</label><select id="dc" name="dest_commune">${options(COMMUNES, null, 'Choisir…')}</select>
      <div id="md" class="mapmini" style="margin-top:8px"></div><input type="hidden" id="dlat" name="dest_lat"><input type="hidden" id="dlng" name="dest_lng"></div>
    <div data-d="iles" class="hide"><label for="di">Île</label><select id="di" name="dest_island">${options(ISLANDS.filter((i) => i !== 'Tahiti'), null, 'Choisir…')}</select>
      <p class="small muted">Dépôt au bateau ou au fret aérien par le coursier. Le transport inter-îles est facturé en plus, sur devis.</p></div>
    <div data-d="international" class="hide"><label for="dco">Pays</label><select id="dco" name="dest_country">${options(COUNTRIES, null, 'Choisir…')}</select>
      <p class="small muted">Dépôt à l’OPT avec la déclaration en douane CN23 préremplie. L’affranchissement est facturé en plus, au tarif OPT.</p></div></div></div>
  <div class="card"><h2>📋 Colis</h2><div class="grid3">
    <div><label for="pc">Nombre de colis</label><input id="pc" name="parcels" type="number" min="1" max="50" value="1"></div>
    <div><label for="wk">Poids total (kg)</label><input id="wk" name="weight_kg" type="number" min="0.1" step="0.1" value="1"></div>
    <div><label for="sf">Date de ramassage</label><input id="sf" name="scheduled_for" type="date" value="${todayTahiti()}"></div></div>
    <label for="ds">Contenu</label><input id="ds" name="description" maxlength="300" placeholder="Ex. 2 flacons de monoï, 1 paréo">
    <div data-d="international" class="hide"><div class="grid2"><div><label for="dv">Valeur déclarée (XPF)</label><input id="dv" name="declared_value_xpf" type="number" min="0"></div>
      <div><label for="hs">Code SH (facultatif)</label><input id="hs" name="hs_code" placeholder="Ex. 3304.99"></div></div></div>
    <label for="nt">Consignes</label><textarea id="nt" name="notes" rows="2" placeholder="Ex. appeler avant, chien gentil"></textarea></div>
  <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div><div class="muted small">Prix de la course (hors transport inter-îles / affranchissement)</div><div class="price" id="px">—</div><div class="small muted" id="pz"></div></div>
    <button class="btn" type="submit">Créer la commande</button></div></form>`;
  const scripts = `${mapScript('mp', [], { lat: 'plat', lng: 'plng' })}${mapScript('md', [], { lat: 'dlat', lng: 'dlng' })}
<script>(function(){var T=${JSON.stringify(t)},Z=${JSON.stringify(ZONE_LABEL)},ILE=${JSON.stringify(['Paea', 'Papara', 'Teva I Uta', 'Taiarapu-Est', 'Taiarapu-Ouest', 'Papenoo', 'Hitiaa O Te Ra'])};var f=document.getElementById('fo');
function v(n){var e=f.querySelector('[name='+n+']:checked')||f.elements[n];return e?e.value:''}
function upd(){var d=v('dest_type');f.querySelectorAll('[data-d]').forEach(function(x){x.classList.toggle('hide',x.getAttribute('data-d')!==d)});
var z=d==='international'?'international':d==='iles'?(v('dest_island')==='Moorea'?'moorea':'iles'):(ILE.indexOf(v('dest_commune'))>=0?'ile':'urbain');
var kg=Math.max(0,Math.ceil((+v('weight_kg')||0)-T.kg_included)),pc=Math.max(0,(+v('parcels')||1)-1);var tot=T[z]+kg*T.per_extra_kg+pc*T.per_extra_parcel;
document.getElementById('px').textContent=tot.toLocaleString('fr-FR')+' F';document.getElementById('pz').textContent=Z[z]+(kg?' · +'+kg+' kg':'')+(pc?' · +'+pc+' colis':'');}
f.addEventListener('input',upd);f.addEventListener('change',upd);upd();})()</script>`;
  return html(consolePage({ title: 'Nouvelle commande', active: '/console/nouvelle', body, head: LEAFLET, scripts }));
}
async function newOrderPost(request, env) {
  const f = await readForm(request);
  const r = parseOrder((k) => f.get(k));
  if (r.error) return redirect(withMsg('/console/nouvelle', 'err', r.error));
  const o = await createOrder(env, r.data, 'console');
  return redirect(withMsg(`/console/commandes/${o.id}`, 'ok', `Commande ${o.code} créée : ${fmtXpf(o.price_xpf)}.`));
}

async function orderPage(env, url, o) {
  const [{ results: ev = [] }, { results: drivers = [] }] = await Promise.all([
    env.DB.prepare('SELECT * FROM events WHERE order_id = ? ORDER BY id').bind(o.id).all(),
    env.DB.prepare('SELECT id, name, vehicle FROM drivers WHERE active = 1 ORDER BY name').all(),
  ]);
  const driver = drivers.find((d) => d.id === o.driver_id) || (o.driver_id ? await env.DB.prepare('SELECT id, name FROM drivers WHERE id = ?').bind(o.driver_id).first() : null);
  const destLine = o.dest_type === 'tahiti' ? `${o.dest_commune}, Tahiti` : o.dest_type === 'iles' ? o.dest_island : o.dest_country;
  const next = (NEXT[o.status] || []).filter((s) => s !== 'assigned');
  const pts = [o.pickup_lat ? { lat: o.pickup_lat, lng: o.pickup_lng, k: 'p', t: 'Ramassage' } : null, o.dest_lat ? { lat: o.dest_lat, lng: o.dest_lng, k: 'd', t: 'Livraison' } : null].filter(Boolean);
  const body = `${flash(url)}<div class="top"><div><a href="/console" class="small">← Commandes</a><h1 style="margin:4px 0 0"><span class="code">${esc(o.code)}</span> ${pill(o.status)}</h1></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn ghost small" href="/console/commandes/${o.id}/etiquette" target="_blank">🏷️ Étiquette</a>${o.dest_type === 'international' ? `<a class="btn ghost small" href="/console/commandes/${o.id}/cn23" target="_blank">🛃 CN23</a>` : ''}<a class="btn ghost small" href="/suivi/${esc(o.code)}" target="_blank">🔗 Page de suivi</a></div></div>
  <div class="grid2"><div>
    <div class="card"><h2>Trajet</h2><p><b>📦 ${esc(o.shipper_name)}</b> ${o.shipper_phone ? `· <a href="tel:${esc(o.shipper_phone)}">${esc(o.shipper_phone)}</a>` : ''}<br><span class="small">${esc(o.pickup_address)} (${esc(o.pickup_island)})</span></p>
      <p><b>🏁 ${esc(o.recipient_name)}</b> ${o.recipient_phone ? `· <a href="tel:${esc(o.recipient_phone)}">${esc(o.recipient_phone)}</a>` : ''}<br><span class="small">${esc(o.dest_address)} · ${esc(destLine || '')}</span></p>
      ${pts.length ? '<div id="mo" class="mapmini"></div>' : '<p class="small muted">Pas de point GPS : adresse texte uniquement.</p>'}</div>
    <div class="card"><h2>Colis</h2><table><tr><td class="muted">Colis</td><td>${o.parcels} · ${o.weight_kg} kg</td></tr><tr><td class="muted">Contenu</td><td>${esc(o.description || '—')}</td></tr>
      ${o.dest_type === 'international' ? `<tr><td class="muted">Valeur déclarée</td><td>${esc(fmtXpf(o.declared_value_xpf))}${o.hs_code ? ` · SH ${esc(o.hs_code)}` : ''}</td></tr>` : ''}
      <tr><td class="muted">Tarif</td><td><b>${esc(fmtXpf(o.price_xpf))}</b> · ${esc(ZONE_LABEL[o.zone] || '')}${o.dest_type !== 'tahiti' ? ' <span class="small muted">(+ transport / affranchissement)</span>' : ''}</td></tr>
      <tr><td class="muted">Ramassage prévu</td><td>${esc(o.scheduled_for || '')}</td></tr>${o.notes ? `<tr><td class="muted">Consignes</td><td>${esc(o.notes)}</td></tr>` : ''}
      <tr><td class="muted">Origine</td><td>${esc(o.source)}${o.external_ref ? ` · réf. ${esc(o.external_ref)}` : ''}</td></tr></table></div></div>
  <div><div class="card"><h2>Coursier</h2>${['created', 'assigned'].includes(o.status) ? `<form method="post" action="/console/commandes/${o.id}/assigner" style="display:flex;gap:8px"><select name="driver_id" required>${drivers.length ? drivers.map((d) => `<option value="${d.id}" ${d.id === o.driver_id ? 'selected' : ''}>${esc(d.name)}${d.vehicle ? ` · ${esc(d.vehicle)}` : ''}</option>`).join('') : '<option value="">Ajoutez d’abord un coursier</option>'}</select><button class="btn small">${o.driver_id ? 'Réassigner' : 'Assigner'}</button></form>` : `<p>🛵 ${esc(driver?.name || '—')}</p>`}</div>
    ${next.length ? `<div class="card"><h2>Mettre à jour</h2><form method="post" action="/console/commandes/${o.id}/statut"><input name="note" placeholder="Note (facultatif)" maxlength="300"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${next.map((s) => `<button class="btn small ${s === 'cancelled' ? 'danger' : 'green'}" name="status" value="${s}" ${s === 'cancelled' ? "onclick=\"return confirm('Annuler cette commande ?')\"" : ''}>${esc(STATUS[s].label)}</button>`).join('')}</div></form></div>` : ''}
    <div class="card"><h2>Historique</h2><ul class="tl">${ev.slice().reverse().map((e) => `<li><b>${esc(STATUS[e.status]?.label || e.status)}</b> <span class="small muted">· ${esc(fmtDateTime(e.at))} · ${esc(e.actor || '')}</span>
      ${e.note ? `<div class="small">${esc(e.note)}</div>` : ''}${e.lat ? `<div class="small muted">📍 ${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}</div>` : ''}${e.photo_key ? `<a href="/console/photo/${e.id}" target="_blank"><img src="/console/photo/${e.id}" alt="Photo" style="margin-top:6px;max-width:160px;border-radius:8px"></a>` : ''}</li>`).join('')}</ul></div></div></div>`;
  return html(consolePage({ title: o.code, active: '/console', body, head: pts.length ? LEAFLET : '', scripts: pts.length ? mapScript('mo', pts) : '' }));
}
async function assignPost(request, env, o) {
  const f = await readForm(request);
  const d = await env.DB.prepare('SELECT id, name FROM drivers WHERE id = ? AND active = 1').bind(String(f.get('driver_id') || '')).first();
  if (!d) return redirect(withMsg(`/console/commandes/${o.id}`, 'err', 'Coursier introuvable.'));
  if (!['created', 'assigned'].includes(o.status)) return redirect(withMsg(`/console/commandes/${o.id}`, 'err', 'Commande déjà en route.'));
  await env.DB.prepare('UPDATE orders SET driver_id = ?, updated_at = ? WHERE id = ?').bind(d.id, nowIso(), o.id).run();
  if (o.status === 'created') await addEvent(env, o, 'assigned', { note: `Assignée à ${d.name}`, actor: 'console' });
  else await env.DB.prepare(`INSERT INTO events (order_id, status, note, actor) VALUES (?, 'assigned', ?, 'console')`).bind(o.id, `Réassignée à ${d.name}`).run();
  return redirect(withMsg(`/console/commandes/${o.id}`, 'ok', `Assignée à ${d.name}.`));
}
async function statusPost(request, env, o) {
  const f = await readForm(request);
  const s = String(f.get('status') || '');
  const ok = s !== 'assigned' && await addEvent(env, o, s, { note: clean(f.get('note'), 300) || null, actor: 'console' });
  return redirect(withMsg(`/console/commandes/${o.id}`, ok ? 'ok' : 'err', ok ? `Statut : ${STATUS[s].label}.` : 'Changement de statut impossible.'));
}

// Printable 10×15 cm label with QR code to the tracking page.
function labelPage(o) {
  const dest = o.dest_type === 'tahiti' ? `${o.dest_commune} – TAHITI` : o.dest_type === 'iles' ? String(o.dest_island).toUpperCase() : String(o.dest_country).toUpperCase();
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Étiquette ${esc(o.code)}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>@page{size:100mm 150mm;margin:0}body{margin:0;font:12px Arial,sans-serif}.l{width:100mm;height:150mm;padding:5mm;box-sizing:border-box;display:flex;flex-direction:column;gap:3mm}
.h{display:flex;justify-content:space-between;align-items:center;background:#0A0F0C;color:#8BFF2C;padding:2mm 3mm;border-radius:2mm;font-weight:900;font-size:16px}
.b{border:0.4mm solid #000;border-radius:2mm;padding:2.5mm}.k{font-size:9px;text-transform:uppercase;color:#555}.big{font-size:20px;font-weight:900}.dest{font-size:24px;font-weight:900;text-align:center;border:0.8mm solid #000;padding:2mm}
.f{display:flex;gap:3mm;align-items:center}.code{font:900 22px monospace}@media screen{body{background:#ddd}.l{background:#fff;margin:10px auto}}</style></head>
<body onload="window.print&&setTimeout(function(){},0)"><div class="l"><div class="h"><span>MANALOG</span><span>${esc(DEST_LABEL[o.dest_type]).toUpperCase()}</span></div>
<div class="b"><div class="k">Expéditeur</div><b>${esc(o.shipper_name)}</b> ${esc(o.shipper_phone || '')}<br>${esc(o.pickup_address)}</div>
<div class="b"><div class="k">Destinataire</div><div class="big">${esc(o.recipient_name)}</div>${esc(o.recipient_phone || '')}<br>${esc(o.dest_address)}</div>
<div class="dest">${esc(dest)}</div>
<div class="f"><div id="qr"></div><div><div class="k">Suivi</div><div class="code">${esc(o.code)}</div><div>${o.parcels} colis · ${o.weight_kg} kg</div>${o.dest_type === 'international' ? '<div><b>CN23 jointe</b></div>' : ''}</div></div></div>
<script>new QRCode(document.getElementById('qr'),{text:location.origin+'/suivi/${esc(o.code)}',width:110,height:110});</script></body></html>`);
}

// CN23 customs declaration, pre-filled (to be checked and signed by the sender; the OPT may require its official form).
function cn23Page(o) {
  if (o.dest_type !== 'international') return notFound();
  const eur = Math.round((o.declared_value_xpf || 0) / 119.33 * 100) / 100;
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>CN23 ${esc(o.code)}</title><style>
body{font:12px Arial,sans-serif;max-width:190mm;margin:10mm auto}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse;margin-top:4mm}td,th{border:0.3mm solid #000;padding:2mm;text-align:left;vertical-align:top}
.n{font-size:10px;color:#444}.box{display:inline-block;width:3mm;height:3mm;border:0.3mm solid #000;margin-right:1mm;vertical-align:middle}.x{background:#000}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:end"><div><h1>DÉCLARATION EN DOUANE · CN 23</h1><div class="n">Pré-remplie par ManaLog · à vérifier et signer par l’expéditeur. L’OPT peut exiger son formulaire officiel.</div></div><div><b>${esc(o.code)}</b></div></div>
<table><tr><td style="width:50%"><div class="n">Expéditeur</div><b>${esc(o.shipper_name)}</b><br>${esc(o.pickup_address)}<br>${esc(o.pickup_island)}, Polynésie française<br>${esc(o.shipper_phone || '')}</td>
<td><div class="n">Destinataire</div><b>${esc(o.recipient_name)}</b><br>${esc(o.dest_address)}<br>${esc(o.dest_country)}<br>${esc(o.recipient_phone || '')} ${esc(o.recipient_email || '')}</td></tr></table>
<table><tr><th>Description détaillée du contenu</th><th>Quantité</th><th>Poids net (kg)</th><th>Valeur</th><th>N° tarifaire SH</th><th>Pays d’origine</th></tr>
<tr><td>${esc(o.description)}</td><td>${o.parcels}</td><td>${o.weight_kg}</td><td>${esc(fmtXpf(o.declared_value_xpf))}<br><span class="n">≈ ${eur.toLocaleString('fr-FR')} €</span></td><td>${esc(o.hs_code || '')}</td><td>Polynésie française</td></tr>
<tr><td colspan="2"><b>Poids brut total</b></td><td>${o.weight_kg}</td><td colspan="3"><b>Valeur totale</b> ${esc(fmtXpf(o.declared_value_xpf))}</td></tr></table>
<p><span class="box"></span>Cadeau <span class="box"></span>Document <span class="box"></span>Échantillon commercial <span class="box"></span>Retour <span class="box x"></span>Vente de marchandises <span class="box"></span>Autre</p>
<p class="n">Je certifie que les renseignements donnés dans la présente déclaration sont exacts et que cet envoi ne contient aucun objet dangereux ou interdit par la réglementation.</p>
<p>Date et signature de l’expéditeur : ____________________________</p></body></html>`);
}

async function driversPage(env, url) {
  const { results: ds = [] } = await env.DB.prepare(`SELECT d.*, (SELECT COUNT(*) FROM orders o WHERE o.driver_id = d.id AND o.status IN ('assigned','picked_up','in_transit')) AS en_cours FROM drivers d ORDER BY active DESC, name`).all();
  const body = `${flash(url)}<h1>Coursiers</h1><div class="grid2"><div class="card"><table><tr><th>Nom</th><th>Véhicule</th><th>En cours</th><th></th></tr>
    ${ds.map((d) => `<tr><td><b>${esc(d.name)}</b><br><span class="small muted">${esc(d.phone || '')}</span></td><td>${esc(d.vehicle || '')}</td><td>${d.en_cours}</td><td><form method="post"><input type="hidden" name="toggle" value="${d.id}"><button class="btn small ghost">${d.active ? 'Désactiver' : 'Réactiver'}</button></form></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Aucun coursier pour l’instant.</td></tr>'}</table></div>
    <form method="post" class="card"><h2>Ajouter un coursier</h2><label for="n">Nom</label><input id="n" name="name" required maxlength="80"><label for="t">Téléphone</label><input id="t" name="phone" inputmode="tel">
    <label for="v">Véhicule</label><select id="v" name="vehicle"><option>Scooter</option><option>Voiture</option><option>Camionnette</option><option>Vélo</option></select>
    <label for="pin">Code PIN (4 à 6 chiffres)</label><input id="pin" name="pin" inputmode="numeric" pattern="[0-9]{4,6}" required>
    <p class="small muted">Le coursier se connecte à l’app avec son nom et ce code. Donnez-le-lui de vive voix.</p><button class="btn">Ajouter</button></form></div>`;
  return html(consolePage({ title: 'Coursiers', active: '/console/coursiers', body }));
}
async function driversPost(request, env) {
  const f = await readForm(request);
  if (f.get('toggle')) {
    await env.DB.prepare('UPDATE drivers SET active = 1 - active WHERE id = ?').bind(String(f.get('toggle'))).run();
    return redirect('/console/coursiers');
  }
  const name = clean(f.get('name'), 80), pin = String(f.get('pin') || '');
  if (!name || !/^\d{4,6}$/.test(pin)) return redirect(withMsg('/console/coursiers', 'err', 'Nom et code PIN de 4 à 6 chiffres obligatoires.'));
  const h = await hashPin(pin);
  await env.DB.prepare('INSERT INTO drivers (id, name, phone, vehicle, pin_hash, pin_salt) VALUES (?, ?, ?, ?, ?, ?)').bind(uid(), name, clean(f.get('phone'), 30) || null, clean(f.get('vehicle'), 30) || null, h.hash, h.salt).run();
  return redirect(withMsg('/console/coursiers', 'ok', `${name} ajouté(e).`));
}

async function tariffsPage(env, url) {
  const t = await getTariffs(env);
  const field = (k, label, hint = '') => `<label for="${k}">${label}</label><input id="${k}" name="${k}" type="number" min="0" value="${t[k]}">${hint ? `<p class="small muted" style="margin:2px 0 0">${hint}</p>` : ''}`;
  const body = `${flash(url)}<h1>Tarifs (XPF)</h1><div class="flash" style="background:#FFF8E1;border-color:#F2D98A">Tarifs provisoires, à fixer avec la coursière. Chaque nouvelle commande utilise les tarifs enregistrés ici.</div>
  <form method="post" class="card" style="max-width:640px"><div class="grid2"><div>${field('urbain', 'Tahiti – zone urbaine', 'Papeete, Pirae, Arue, Faa’a, Punaauia, Mahina')}${field('ile', 'Tahiti – reste de l’île', 'Paea, Papara, Taravao, Presqu’île…')}${field('moorea', 'Moorea', 'Ramassage + dépôt au ferry')}</div>
  <div>${field('iles', 'Autres îles', 'Ramassage + dépôt bateau/fret aérien (transport en plus)')}${field('international', 'International', 'Ramassage + dépôt OPT + CN23 (affranchissement en plus)')}</div></div>
  <div class="grid3">${field('kg_included', 'Kg inclus')}${field('per_extra_kg', 'Par kg en plus')}${field('per_extra_parcel', 'Par colis en plus')}</div><button class="btn" style="margin-top:12px">Enregistrer</button></form>`;
  return html(consolePage({ title: 'Tarifs', active: '/console/tarifs', body }));
}
async function tariffsPost(request, env) {
  const f = await readForm(request);
  const t = Object.fromEntries(Object.keys(DEFAULT_TARIFFS).map((k) => [k, Math.max(0, int(f.get(k), DEFAULT_TARIFFS[k]))]));
  await env.DB.prepare(`INSERT INTO config (key, value) VALUES ('tariffs', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(t)).run();
  return redirect(withMsg('/console/tarifs', 'ok', 'Tarifs enregistrés.'));
}

// ───────── Courier PWA ─────────
async function courier(request, env, url, sub) {
  const post = request.method === 'POST';
  if (sub[0] === 'connexion' && post) return courierLogin(request, env, url);
  const s = await readSession(request, env);
  const d = s?.role === 'driver' ? await env.DB.prepare('SELECT * FROM drivers WHERE id = ? AND active = 1').bind(s.sub).first() : null;
  if (!d) return courierLoginPage(env, url);
  if (sub[0] === 'commandes' && sub[1] && sub[2] === 'etape' && post) return courierStep(request, env, d, sub[1]);
  if (sub.length) return notFound();
  const { results: os = [] } = await env.DB.prepare(`SELECT * FROM orders WHERE driver_id = ? AND status IN ('assigned','picked_up','in_transit') ORDER BY status = 'picked_up' DESC, scheduled_for, created_at`).bind(d.id).all();
  const { n: done } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM events e JOIN orders o ON o.id = e.order_id WHERE o.driver_id = ? AND e.status = 'delivered' AND e.at >= ?`).bind(d.id, todayTahiti()).first();
  const stepBtn = (o) => {
    const opts = { assigned: [['picked_up', '📦 Colis ramassé']], picked_up: o.dest_type === 'tahiti' ? [['delivered', '✅ Livré']] : [['in_transit', o.dest_type === 'international' ? '🏤 Déposé à l’OPT' : '🚢 Déposé au transporteur']], in_transit: [['delivered', '✅ Livré / remis']] }[o.status] || [];
    return opts.map(([st, label]) => `<form method="post" action="/chauffeur/commandes/${o.id}/etape" enctype="multipart/form-data" class="step" style="margin-top:10px">
      <input type="hidden" name="status" value="${st}"><input type="hidden" name="lat"><input type="hidden" name="lng">
      <label class="small" style="font-weight:600">📷 Photo (preuve)<input type="file" name="photo" accept="image/*" capture="environment" style="margin-top:4px"></label>
      <input name="note" placeholder="Note (facultatif)" maxlength="300" style="margin-top:6px"><button class="btn green" style="width:100%;justify-content:center;margin-top:8px;padding:13px">${label}</button></form>`).join('');
  };
  const body = `<main class="main" style="max-width:560px;margin:0 auto">${flash(url)}
    <div style="display:flex;justify-content:space-between;align-items:center;background:#0A0F0C;color:#CFE0D6;border-radius:16px;padding:10px 14px;margin-bottom:12px">
    <img src="/manalog-logo.webp" alt="ManaLog" style="height:46px"><div style="text-align:right"><b style="color:#8BFF2C">${esc(d.name)}</b><br><span class="small">${os.length} en cours · ${done} livrée(s) aujourd’hui</span></div></div>
    ${os.map((o) => `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><span class="code">${esc(o.code)}</span>${pill(o.status)}</div>
      <p style="margin:8px 0 4px">${o.status === 'assigned' ? `<b>📦 Ramasser chez ${esc(o.shipper_name)}</b><br>${esc(o.pickup_address)}` : `<b>🏁 ${o.dest_type === 'tahiti' ? `Livrer ${esc(o.recipient_name)}` : o.dest_type === 'iles' ? `Pour ${esc(o.dest_island)} : ${esc(o.recipient_name)}` : `International (${esc(o.dest_country)}) : ${esc(o.recipient_name)}`}</b><br>${esc(o.dest_address)}${o.dest_commune ? `, ${esc(o.dest_commune)}` : ''}`}</p>
      <p class="small muted" style="margin:0">${o.parcels} colis · ${o.weight_kg} kg${o.notes ? ` · ${esc(o.notes)}` : ''}</p>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">${(o.status === 'assigned' ? o.shipper_phone : o.recipient_phone) ? `<a class="btn small ghost" href="tel:${esc(o.status === 'assigned' ? o.shipper_phone : o.recipient_phone)}">📞 Appeler</a>` : ''}
      ${(o.status === 'assigned' ? o.pickup_lat : o.dest_lat) ? `<a class="btn small ghost" target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=${o.status === 'assigned' ? `${o.pickup_lat},${o.pickup_lng}` : `${o.dest_lat},${o.dest_lng}`}">🧭 Itinéraire</a>` : ''}</div>
      ${stepBtn(o)}</div>`).join('') || '<div class="card" style="text-align:center"><p style="font-size:2rem;margin:0">🌺</p><p>Aucune course pour le moment.</p></div>'}
    <form method="post" action="/deconnexion" style="text-align:center"><button class="btn small ghost">Se déconnecter</button></form></main>`;
  const scripts = `<script>
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js');
document.querySelectorAll('form.step').forEach(function(f){f.addEventListener('submit',function(ev){if(f.dataset.geo)return;ev.preventDefault();var b=f.querySelector('button');b.disabled=true;b.textContent='Envoi…';
function go(){f.dataset.geo=1;f.submit();}
if(!navigator.geolocation)return go();navigator.geolocation.getCurrentPosition(function(p){f.lat.value=p.coords.latitude;f.lng.value=p.coords.longitude;go();},go,{enableHighAccuracy:true,timeout:6000});});});
</script>`;
  return html(page({ title: 'Mes courses', body, scripts }));
}
async function courierLoginPage(env, url) {
  const { results: ds = [] } = await env.DB.prepare('SELECT id, name FROM drivers WHERE active = 1 ORDER BY name').all();
  return html(page({ title: 'Coursier', body: `<main class="main" style="max-width:420px;margin:30px auto">
    <div style="background:#050706;border-radius:16px;padding:10px;text-align:center;margin-bottom:14px"><img src="/manalog-logo.webp" alt="ManaLog" style="height:100px"></div>${flash(url)}
    <form method="post" action="/chauffeur/connexion" class="card"><h1>Espace coursier</h1><label for="d">Votre nom</label><select id="d" name="driver_id" required>${ds.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select>
    <label for="p">Code PIN</label><input id="p" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" required autocomplete="one-time-code"><button class="btn" style="margin-top:12px;width:100%;justify-content:center">Entrer</button></form></main>` }));
}
async function courierLogin(request, env, url) {
  const f = await readForm(request);
  const id = String(f.get('driver_id') || '');
  const d = await env.DB.prepare('SELECT * FROM drivers WHERE id = ? AND active = 1').bind(id).first();
  // Brute-force guard: 5 wrong PINs → 15-minute lock for this courier.
  const lockKey = `pinfail:${id}`;
  const lock = JSON.parse((await env.DB.prepare('SELECT value FROM config WHERE key = ?').bind(lockKey).first())?.value || '{"n":0,"t":0}');
  if (lock.n >= 5 && Date.now() - lock.t < 15 * 60000) return redirect(withMsg('/chauffeur', 'err', 'Trop d’essais. Réessayez dans 15 minutes.'));
  const ok = d && safeEqual((await hashPin(String(f.get('pin') || ''), d.pin_salt)).hash, d.pin_hash);
  if (!ok) {
    const n = lock.n >= 5 ? 1 : lock.n + 1;
    await env.DB.prepare(`INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).bind(lockKey, JSON.stringify({ n, t: Date.now() })).run();
    return redirect(withMsg('/chauffeur', 'err', 'Code incorrect.'));
  }
  await env.DB.prepare('DELETE FROM config WHERE key = ?').bind(lockKey).run();
  return redirect('/chauffeur', { 'set-cookie': sessionCookie(await makeSession(env, 'driver', d.id, 30), url.protocol === 'https:') });
}
async function courierStep(request, env, d, orderId) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND driver_id = ?').bind(orderId, d.id).first();
  if (!o) return redirect(withMsg('/chauffeur', 'err', 'Course introuvable.'));
  const f = await readForm(request);
  const status = String(f.get('status') || '');
  if (status === 'cancelled' || status === 'assigned') return redirect('/chauffeur');
  let photo_key = null;
  const file = f.get('photo');
  if (file && typeof file !== 'string' && file.size) {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size > 8 * 1024 * 1024) return redirect(withMsg('/chauffeur', 'err', 'Photo : JPG, PNG ou WebP, 8 Mo maximum.'));
    photo_key = `proofs/${o.id}/${uid()}`;
    await env.FILES.put(photo_key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  }
  const lat = num(f.get('lat')), lng = num(f.get('lng'));
  const ok = await addEvent(env, o, status, { note: clean(f.get('note'), 300) || null, lat, lng, photo_key, actor: `coursier:${d.name}` });
  return redirect(withMsg('/chauffeur', ok ? 'ok' : 'err', ok ? `${o.code} : ${STATUS[status].label}.` : 'Étape impossible pour cette course.'));
}

// ───────── JSON API (ManaShop.app and partners) ─────────
async function api(request, env, url, parts) {
  const key = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.API_KEY || !safeEqual(key, env.API_KEY)) return json({ error: 'unauthorized' }, 401);
  if (parts[0] === 'orders' && !parts[1] && request.method === 'POST') {
    let body = {}; try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    const r = parseOrder((k) => (body[k] === undefined || body[k] === null ? '' : String(body[k])));
    if (r.error) return json({ error: 'invalid_order', message: r.error }, 422);
    const source = ['manashop', 'api'].includes(body.source) ? body.source : 'api';
    const external_ref = clean(body.external_ref, 80) || null;
    if (external_ref) {
      const ex = await env.DB.prepare('SELECT id, code, price_xpf, status FROM orders WHERE source = ? AND external_ref = ?').bind(source, external_ref).first();
      if (ex) return json({ id: ex.id, code: ex.code, status: ex.status, price_xpf: ex.price_xpf, tracking_url: `${url.origin}/suivi/${ex.code}`, duplicate: true });
    }
    const o = await createOrder(env, { ...r.data, source, external_ref }, source);
    return json({ id: o.id, code: o.code, status: 'created', price_xpf: o.price_xpf, zone: o.zone, tracking_url: `${url.origin}/suivi/${o.code}` }, 201);
  }
  if (parts[0] === 'orders' && parts[1] && request.method === 'GET') {
    const o = await env.DB.prepare('SELECT id, code, status, price_xpf, dest_type, created_at, updated_at FROM orders WHERE code = ?').bind(parts[1].toUpperCase()).first();
    if (!o) return json({ error: 'not_found' }, 404);
    const { results: ev = [] } = await env.DB.prepare('SELECT status, note, at FROM events WHERE order_id = ? ORDER BY id').bind(o.id).all();
    return json({ ...o, tracking_url: `${url.origin}/suivi/${o.code}`, events: ev });
  }
  if (parts[0] === 'quote' && request.method === 'POST') {
    let body = {}; try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    const q = quote(await getTariffs(env), { dest_type: body.dest_type, dest_commune: body.dest_commune, dest_island: body.dest_island, weight_kg: body.weight_kg, parcels: body.parcels });
    return json({ ...q, label: ZONE_LABEL[q.zone] });
  }
  return json({ error: 'not_found' }, 404);
}
