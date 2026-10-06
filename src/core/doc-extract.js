// Read a trade document (photo or PDF) with Amazon Bedrock, using a strict JSON Schema for the output.
// The model only TRANSCRIBES what is printed; every check and every tax is then computed by code
// (pacific-customs-kit). Bad scans are expected: unreadable fields come back as null with a low confidence.
import { z } from 'zod';
import { structured, bedrockEnabled } from './bedrock.js';
import { demoDocuments, DEFAULT_DEMO_DOCUMENT } from '../../data/demo-documents.js';

const n = (t) => t.nullable();
const party = z.object({
  name: n(z.string()).describe('Company name exactly as printed'),
  address: n(z.string()).optional(),
  country: n(z.string()).describe('ISO 3166-1 alpha-2 code if the country is printed or obvious from the address, else null'),
  tin: n(z.string()).describe('Tax Identification Number if printed (Fiji: TIN), else null'),
});

/** What the model must return. Everything nullable: never guess. */
export const ExtractionSchema = z.object({
  documentType: z.enum(['commercial_invoice', 'bill_of_lading', 'other']),
  invoiceNumber: n(z.string()).optional(),
  invoiceDate: n(z.string()).optional().describe('YYYY-MM-DD'),
  blNumber: n(z.string()).optional(),
  seller: party.optional().describe('Invoice seller / exporter'),
  buyer: party.optional().describe('Invoice buyer / importer'),
  shipper: party.optional().describe('B/L shipper'),
  consignee: party.optional().describe('B/L consignee'),
  currency: n(z.string()).optional().describe('ISO 4217 code, e.g. USD, FJD, AUD, NZD, CNY'),
  incoterm: n(z.string()).optional().describe('e.g. FOB, CIF, EXW'),
  lines: z.array(z.object({
    description: n(z.string()),
    hsCode: n(z.string()).describe('HS / tariff code digits as printed, else null'),
    originCountry: n(z.string()).describe('ISO alpha-2 if printed'),
    quantity: n(z.number()),
    unit: n(z.string()),
    unitPrice: n(z.number()),
    lineTotal: n(z.number()).describe('Line amount as printed — do NOT recompute it'),
  })).optional(),
  freight: n(z.number()).optional(),
  insurance: n(z.number()).optional(),
  total: n(z.number()).optional().describe('Grand total as printed — do NOT recompute it'),
  grossWeightKg: n(z.number()).optional(),
  portOfLoading: n(z.string()).optional().describe('Port name as printed, e.g. "Ningbo"'),
  portOfDischarge: n(z.string()).optional().describe('Port name as printed, e.g. "Suva" or "Lautoka"'),
  vessel: n(z.string()).optional(),
  voyage: n(z.string()).optional(),
  packages: n(z.number()).optional(),
  containers: z.array(z.object({ number: n(z.string()), seal: n(z.string()), type: n(z.string()) })).optional(),
  declaredCharges: z.object({ fiscalDuty: n(z.number()), importExcise: n(z.number()), vat: n(z.number()) }).optional()
    .describe('Only if the page itself shows customs duty / excise / VAT amounts (e.g. a draft customs entry)'),
  lowConfidenceFields: z.array(z.string()).describe('Paths of fields that were hard to read (blur, glare, fold, handwriting), e.g. "lines.1.unitPrice"'),
  unreadable: z.array(z.string()).describe('What could not be read at all, in a few words each'),
  imageQuality: z.enum(['good', 'fair', 'poor']),
});

export const EXTRACTION_SYSTEM = `You transcribe trade documents for customs work in the Pacific Islands (Fiji, French Polynesia, Samoa, Tonga...).
Inputs are often phone photos taken on a wharf: skewed, folded, glare, stamps over text, handwriting, several pages.
Rules:
- Transcribe ONLY what is printed or written on the document. Never invent, infer or compute a value.
- If a field is missing, cut off or unreadable, use null and list it in "unreadable". If you are unsure, still give your best reading but list its path in "lowConfidenceFields".
- Copy amounts exactly as printed (no rounding, no recomputing totals). Use a dot as the decimal separator; remove thousands separators.
- HS codes: digits only as printed. Dates: YYYY-MM-DD. Countries: ISO 3166-1 alpha-2. Currencies: ISO 4217.
- Ports: the name as printed (e.g. "Suva", "Lautoka", "Ningbo"), not a code.
- Never compute or "correct" duties or VAT. If customs charges are printed (for example on a draft entry), copy them into declaredCharges.`;

// Deterministic normalisation of what the model transcribed.
const PORTS = {
  suva: 'FJSUV', lautoka: 'FJLTK', nadi: 'FJNAN', 'nadi airport': 'FJNAN', papeete: 'PFPPT', noumea: 'NCNOU', 'nouméa': 'NCNOU', apia: 'WSAPW',
  "nuku'alofa": 'TONUK', nukualofa: 'TONUK', auckland: 'NZAKL', brisbane: 'AUBNE', sydney: 'AUSYD', melbourne: 'AUMEL', ningbo: 'CNNGB', shanghai: 'CNSHA',
  shenzhen: 'CNSZX', yantian: 'CNYTN', qingdao: 'CNTAO', 'hong kong': 'HKHKG', singapore: 'SGSIN', 'los angeles': 'USLAX', 'long beach': 'USLGB',
};
const port = (p) => {
  if (!p) return undefined;
  const k = String(p).toLowerCase().replace(/,.*$/, '').replace(/\b(port|harbour|harbor|wharf)\b/g, '').trim();
  if (/^[a-z]{2}[a-z2-9]{3}$/.test(k)) return k.toUpperCase();
  return PORTS[k];
};
const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === null ? undefined : v)));
const partyOut = (p) => (p?.name ? clean({ name: p.name, address: p.address, country: p.country?.toUpperCase(), tin: p.tin }) : undefined);

/** Turn the model's transcription into pacific-customs-kit documents. */
export function toKitDocuments(x) {
  const out = {};
  if (x.documentType === 'commercial_invoice') {
    out.invoice = clean({
      documentType: 'commercial_invoice', invoiceNumber: x.invoiceNumber, invoiceDate: x.invoiceDate,
      seller: partyOut(x.seller), buyer: partyOut(x.buyer), currency: x.currency?.toUpperCase(), incoterm: x.incoterm?.toUpperCase(),
      lines: (x.lines ?? []).map((l) => clean({ ...l, originCountry: l.originCountry?.toUpperCase() })),
      freight: x.freight, insurance: x.insurance, total: x.total, grossWeightKg: x.grossWeightKg, portOfDischarge: port(x.portOfDischarge),
    });
  }
  if (x.documentType === 'bill_of_lading') {
    out.billOfLading = clean({
      documentType: 'bill_of_lading', blNumber: x.blNumber, shipper: partyOut(x.shipper), consignee: partyOut(x.consignee),
      vessel: x.vessel, voyage: x.voyage, portOfLoading: port(x.portOfLoading), portOfDischarge: port(x.portOfDischarge),
      packages: x.packages, grossWeightKg: x.grossWeightKg, containers: (x.containers ?? []).map(clean),
    });
  }
  const d = x.declaredCharges ? clean(x.declaredCharges) : null;
  if (d && Object.keys(d).length) out.declared = d;
  return out;
}

const FORMATS = { 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
export const MAX_DOCUMENT_BYTES = 3_750_000; // Bedrock image limit; the console downsizes photos before upload

/**
 * @param {object} i
 * @param {Uint8Array} [i.bytes]
 * @param {string} [i.mediaType]
 * @param {boolean} i.useBedrock   false → bundled demo transcription (no AI cost)
 * (_structured / _enabled are injectable for tests)
 */
export async function extractDocument({ bytes, mediaType, useBedrock, _structured = structured, _enabled = bedrockEnabled }) {
  if (!bytes || !useBedrock || !_enabled()) return demoExtraction(bytes ? 'Bedrock is not enabled for this plan, so the bundled demo transcription is used instead of your file.' : null);
  const format = FORMATS[String(mediaType).toLowerCase()];
  if (!format) throw new Error(`Unsupported file type ${mediaType}. Use JPEG, PNG, WebP or PDF.`);
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('File too large (max 3.75 MB). Take the photo at a lower resolution.');
  const block = format === 'pdf'
    ? { document: { format: 'pdf', name: 'trade-document', source: { bytes } } }
    : { image: { format, source: { bytes } } };
  const schema = (() => { const { $schema, ...s } = z.toJSONSchema(ExtractionSchema, { io: 'input' }); return s; })();
  const ask = { system: EXTRACTION_SYSTEM, name: 'record_trade_document', description: 'Record the transcription of the trade document shown.', schema };

  let attempt = 0; let history = []; let content = [block, { text: 'Transcribe this trade document.' }]; let last;
  while (attempt < 2) {
    attempt++;
    const r = await _structured({ ...ask, content, history });
    const parsed = ExtractionSchema.safeParse(r.input ?? {});
    if (parsed.success) return { engine: 'bedrock', attempts: attempt, transcription: parsed.data, ...toKitDocuments(parsed.data), note: null };
    last = parsed.error;
    // One repair round: show the model its own answer and the schema errors.
    history = [...history, { role: 'user', content }, r.message];
    const toolUseId = r.message?.content?.find((b) => b.toolUse)?.toolUse?.toolUseId;
    content = toolUseId
      ? [{ toolResult: { toolUseId, status: 'error', content: [{ text: `Schema errors: ${last.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}. Call record_trade_document again with a corrected object.` }] } }]
      : [{ text: 'Your answer did not match the schema. Try again.' }];
  }
  throw new Error(`Could not read the document in a valid format: ${last?.issues?.[0]?.message ?? 'unknown error'}`);
}

function demoExtraction(note) {
  const d = demoDocuments[DEFAULT_DEMO_DOCUMENT];
  return {
    engine: 'demo', attempts: 0,
    transcription: { documentType: 'commercial_invoice', lowConfidenceFields: ['lines.1.hsCode'], unreadable: ['stamp over the bottom-right corner'], imageQuality: 'fair' },
    invoice: d.invoice, billOfLading: d.billOfLading, declared: d.declared,
    note: note ?? 'Demo transcription of the bundled sample invoice (fictional companies).',
  };
}
