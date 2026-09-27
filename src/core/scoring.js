// Transparent supplier scoring (0–100). Every point is explainable out loud — important for a voice agent.
import { distanceBand } from '../../data/duty-profiles.js';

const daysSince = (d, now) => (d ? Math.max(0, (now - new Date(d).getTime()) / 86400000) : 9999);

export function scoreSupplier(s, { destination = 'PF', quantity, now = Date.now(), priority = 'balanced' } = {}) {
  const reasons = [];
  // 1. Track record: proven US exporter (log-scaled shipment count)
  const vol = Math.min(30, Math.round(Math.log10((s.shipments12m ?? 0) + 1) * 13));
  reasons.push(`${s.shipments12m ?? 0} shipments in 12 months (+${vol})`);
  // 2. Recency: still active
  const age = daysSince(s.lastShipment, now);
  const rec = age < 45 ? 20 : age < 120 ? 12 : age < 365 ? 5 : 0;
  reasons.push(age < 9999 ? `last shipment ${Math.round(age)} days ago (+${rec})` : 'no recent shipment (+0)');
  // 3. Logistics proximity to destination
  const band = distanceBand(s.country, destination);
  const prox = { near: 20, mid: 12, far: 5 }[band];
  reasons.push(`${band} to ${destination} (+${prox})`);
  // 4. MOQ fit for small island businesses
  let moqPts = 10;
  if (s.moq && quantity) moqPts = quantity >= s.moq ? 15 : quantity >= s.moq / 2 ? 7 : 0;
  reasons.push(s.moq ? `MOQ ${s.moq} vs your ${quantity ?? '?'} (+${moqPts})` : `MOQ unknown (+${moqPts})`);
  // 5. Reachability
  const contact = (s.email ? 8 : 0) + (s.website ? 7 : 0);
  reasons.push(`contact data ${contact ? 'available' : 'missing'} (+${contact})`);

  let score = vol + rec + prox + moqPts + contact;
  if (priority === 'speed' && band === 'near') { score += 8; reasons.push('speed priority: nearby (+8)'); }
  if (priority === 'price' && s.unitPriceUsd && s.unitPriceUsd < 0.5) { score += 5; reasons.push('price priority: low unit price (+5)'); }
  return { score: Math.min(100, score), band, reasons };
}

export function rankScored(suppliers, opts) {
  return suppliers
    .map((s) => ({ ...s, ...scoreSupplier(s, opts) }))
    .sort((a, b) => b.score - a.score);
}
