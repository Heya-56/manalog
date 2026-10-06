// Customs document check for Pacific destinations, backed by the open-source pacific-customs-kit.
// The arithmetic is deterministic (integer cents, official FRCS formula); no LLM computes any tax here.
import { checkInvoice, crossCheck, computeImportCharges, compareCharges, cifValue, getProfile } from 'pacific-customs-kit';
import { guessCategory } from './landed-cost.js';

/**
 * @param {object} i
 * @param {object} i.invoice           commercial invoice (pacific-customs-kit schema)
 * @param {object} [i.billOfLading]
 * @param {object} [i.declared]        { fiscalDuty?, importExcise?, vat? } in the destination currency
 * @param {string} [i.country='FJ']
 * @param {number} [i.fxRate]          destination currency per 1 unit of the invoice currency
 * @param {number} [i.fiscalDutyRate]  exact tariff rate if known
 * @param {number} [i.importExciseRate]
 */
export function checkCustomsDocuments({ invoice, billOfLading, declared, country = 'FJ', fxRate, fiscalDutyRate, importExciseRate }) {
  const profile = getProfile(country);
  const inv = checkInvoice(invoice);
  const cross = billOfLading ? crossCheck(invoice, billOfLading) : null;
  const issues = [...inv.issues, ...(cross?.issues ?? []).filter((x) => !inv.issues.some((y) => y.message === x.message))];
  const notes = [];

  let charges = null;
  let comparison = null;
  if (inv.invoice) {
    const d = inv.invoice;
    let rate = fxRate;
    if (d.currency === profile.currency) rate = 1;
    else if (rate == null && d.currency === 'USD') {
      rate = profile.fx.indicativeFjdPerUsd;
      notes.push(`Converted at an indicative ${rate} ${profile.currency} per USD; customs uses the weekly ASYCUDA rate.`);
    }
    if (rate == null) {
      notes.push(`No exchange rate for ${d.currency}: charges not computed.`);
    } else {
      const goods = d.lines.reduce((a, l) => a + l.lineTotal, 0);
      const valueForDuty = cifValue({ goods, freight: d.freight ?? 0, insurance: d.insurance ?? 0, fxRate: rate });
      if (d.freight == null) notes.push('No freight on the invoice: the value for duty is understated until freight is added.');
      charges = computeImportCharges({ country, valueForDuty, fiscalDutyRate, importExciseRate, category: guessCategory(d.lines.map((l) => l.description).join(' ')) });
      if (declared) {
        comparison = compareCharges(declared, charges);
        issues.push(...comparison.issues);
      }
    }
  }
  const errors = issues.filter((x) => x.severity === 'error');
  const warnings = issues.filter((x) => x.severity === 'warning');
  return {
    country: profile.code, countryName: profile.name, ok: errors.length === 0,
    invoiceNumber: inv.invoice?.invoiceNumber ?? invoice?.invoiceNumber ?? null,
    errors, warnings, charges, notes,
    lodgement: profile.lodgement.note,
    poweredBy: 'pacific-customs-kit (MIT)',
  };
}

/** One to three short sentences for voice. */
export function speakCheck(r) {
  // Say port names, not UN/LOCODEs.
  const ports = Object.fromEntries(getProfile(r.country).offices.map((o) => [o.unlocode, o.name.replace(/ port$/, '')]));
  const spoken = (m) => m.replace(/\b[A-Z]{2}[A-Z2-9]{3}\b/g, (code) => ports[code] ?? code).replace(/\bB\/L\b/g, 'bill of lading');
  const head = `I checked invoice ${r.invoiceNumber ?? ''} for ${r.countryName}`.replace('  ', ' ');
  const count = r.errors.length || r.warnings.length
    ? `: ${[r.errors.length && `${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}`, r.warnings.length && `${r.warnings.length} point${r.warnings.length === 1 ? '' : 's'} to verify`].filter(Boolean).join(' and ')}.`
    : ': everything adds up.';
  const first = r.errors.slice(0, 2).map((e) => spoken(e.message)).join(' ');
  const c = r.charges;
  const vat = c?.lines.find((l) => l.code === 'vat');
  const tail = c ? ` Expected charges: about ${Math.round(c.totalCharges).toLocaleString('en-US')} ${c.currency}, including ${Math.round(vat.amount).toLocaleString('en-US')} ${c.currency} of VAT at ${vat.rate * 100} percent.` : '';
  return `${head}${count}${first ? ` ${first}` : ''}${tail}`;
}
