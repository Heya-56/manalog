// Layout and styles. Console layout inspired by Fleetbase (dark sidebar, list + live map), ManaLog colours.
import { esc, STATUS } from './lib.js';

export const LEAFLET = `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>`;

const CSS = `
:root{--ink:#0A0F0C;--ink2:#14201A;--line:#DDE7E1;--bg:#F3F6F2;--card:#fff;--muted:#6B7B72;--green:#2E9E5B;--lime:#8BFF2C;--silver:#9FB0A6;--warn:#F2C230;--err:#D9483B;--r:14px}
*{box-sizing:border-box}html,body{margin:0}
body{font:15px/1.45 Inter,'Segoe UI',system-ui,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--green)}h1{font-size:1.5rem;margin:0 0 14px}h2{font-size:1.1rem;margin:0 0 10px}
.app{display:grid;grid-template-columns:232px 1fr;min-height:100vh}
.side{background:var(--ink);color:#CFE0D6;padding:18px 14px;display:flex;flex-direction:column;gap:4px;position:sticky;top:0;height:100vh}
.side .logo{display:block;background:#050706;border-radius:12px;padding:8px;margin-bottom:14px;text-align:center}.side .logo img{max-width:100%;height:84px;object-fit:contain}
.side a{color:#CFE0D6;text-decoration:none;padding:9px 12px;border-radius:10px;display:flex;gap:10px;align-items:center;font-weight:600}
.side a:hover{background:var(--ink2)}.side a.on{background:var(--ink2);color:var(--lime);box-shadow:inset 3px 0 0 var(--lime)}
.side .grow{flex:1}.side small{color:#6E8278;padding:0 12px}
.main{padding:22px 26px;min-width:0}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;margin-bottom:14px}
.btn{display:inline-flex;align-items:center;gap:6px;background:var(--ink);color:var(--lime);border:0;border-radius:999px;padding:9px 16px;font:700 14px Inter,system-ui,sans-serif;cursor:pointer;text-decoration:none}
.btn.ghost{background:#fff;color:var(--ink);border:1.5px solid var(--ink)}.btn.green{background:var(--green);color:#fff}.btn.small{padding:6px 12px;font-size:13px}.btn.danger{background:#fff;color:var(--err);border:1.5px solid var(--err)}
label{display:block;font-weight:700;font-size:13px;margin:10px 0 4px}
input,select,textarea{width:100%;padding:10px 12px;border:1.5px solid var(--line);border-radius:10px;font:inherit;background:#fff}
input:focus,select:focus,textarea:focus{outline:2px solid var(--lime);border-color:var(--green)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
.stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;text-decoration:none;color:inherit}.stat b{display:block;font-size:1.5rem}.stat span{font-size:12.5px;color:var(--muted)}
.stat.on{outline:2px solid var(--green)}
.board{display:grid;grid-template-columns:minmax(360px,460px) 1fr;gap:14px;align-items:start}
.list{display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 230px);overflow:auto}
.item{display:block;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;text-decoration:none;color:inherit}
.item:hover{border-color:var(--green)}.item .row{display:flex;justify-content:space-between;gap:8px;align-items:center}
.code{font-family:ui-monospace,monospace;font-weight:700}
.pill{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700;color:#0A0F0C}
.muted{color:var(--muted)}.small{font-size:13px}
#map{height:calc(100vh - 230px);min-height:380px;border-radius:var(--r);border:1px solid var(--line)}
.mapmini{height:240px;border-radius:12px;border:1px solid var(--line)}
table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.flash{border-radius:12px;padding:10px 14px;margin-bottom:12px;background:#EAF7EF;border:1px solid #BFE5CD}.flash.err{background:#FDECEA;border-color:#F3C3BD}
.tl{list-style:none;padding:0;margin:0}.tl li{position:relative;padding:0 0 14px 22px;border-left:2px solid var(--line);margin-left:6px}
.tl li:before{content:'';position:absolute;left:-7px;top:2px;width:12px;height:12px;border-radius:50%;background:var(--green)}
.price{font-size:1.6rem;font-weight:800}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{border:1.5px solid var(--line);border-radius:999px;padding:6px 12px;font-weight:600;font-size:13px;cursor:pointer;background:#fff}
.chip input{display:none}.chip:has(input:checked){background:var(--ink);color:var(--lime);border-color:var(--ink)}
.hide{display:none}
@media (max-width:900px){.app{grid-template-columns:1fr}.side{position:static;height:auto;flex-direction:row;flex-wrap:wrap;padding:10px}.side .logo{display:none}.side .grow,.side small{display:none}
 .board{grid-template-columns:1fr}.stats{grid-template-columns:repeat(3,1fr)}.grid2,.grid3{grid-template-columns:1fr}.main{padding:14px}#map{height:320px}.list{max-height:none}}
`;

export const pill = (s) => `<span class="pill" style="background:${STATUS[s]?.color || '#ddd'}">${esc(STATUS[s]?.label || s)}</span>`;

export function page({ title, body, head = '', scripts = '' }) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ManaLog</title><meta name="theme-color" content="#0A0F0C"><link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/manalog-logo.webp"><style>${CSS}</style>${head}</head><body>${body}${scripts}</body></html>`;
}

export function consolePage({ title, active, body, head = '', scripts = '' }) {
  const nav = [['/console', '📋', 'Commandes'], ['/console/nouvelle', '➕', 'Nouvelle commande'], ['/console/coursiers', '🛵', 'Coursiers'], ['/console/tarifs', '💰', 'Tarifs']];
  return page({ title, head, scripts, body: `<div class="app"><nav class="side"><a class="logo" href="/console"><img src="/manalog-logo.webp" alt="ManaLog"></a>
    ${nav.map(([h, i, l]) => `<a href="${h}" class="${active === h ? 'on' : ''}">${i} ${l}</a>`).join('')}
    <div class="grow"></div><a href="/chauffeur">📱 App coursier</a><form method="post" action="/deconnexion"><button class="btn small ghost" style="margin:8px 12px">Déconnexion</button></form><small>ManaLog Dispatch · Polynésie</small></nav>
    <main class="main">${body}</main></div>` });
}

export function flash(url) {
  const ok = url.searchParams.get('ok'), err = url.searchParams.get('err');
  return ok ? `<div class="flash">${esc(ok)}</div>` : err ? `<div class="flash err">${esc(err)}</div>` : '';
}
