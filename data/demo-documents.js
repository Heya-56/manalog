// Fictional trade documents for the Fiji customs-check demo. Companies are invented and marked "(demo)".
// The scenario: a draft customs entry was prepared with the pre-August-2025 VAT rate (15% instead of 12.5%),
// and the bill of lading was issued for the wrong port. ManaLog should catch both.

export const demoDocuments = {
  'bula-bottles': {
    title: 'Glass bottles for Bula Naturals (demo) — Ningbo → Suva',
    invoice: {
      documentType: 'commercial_invoice',
      invoiceNumber: 'CPI-2026-0142',
      invoiceDate: '2026-09-28',
      seller: { name: 'Coral Pack Industries (demo)', country: 'CN' },
      buyer: { name: 'Bula Naturals Ltd (demo)', country: 'FJ', tin: '50-12345-0-1' },
      currency: 'USD',
      incoterm: 'CIF',
      lines: [
        { description: 'Amber glass bottle 100 ml', hsCode: '7010.90', originCountry: 'CN', quantity: 20000, unit: 'pcs', unitPrice: 0.18, lineTotal: 3600 },
        { description: 'Aluminium screw cap 24 mm', hsCode: '8309.90', originCountry: 'CN', quantity: 20000, unit: 'pcs', unitPrice: 0.02, lineTotal: 400 },
      ],
      freight: 350,
      insurance: 21.85,
      total: 4371.85,
      grossWeightKg: 4200,
      portOfDischarge: 'FJSUV',
    },
    billOfLading: {
      documentType: 'bill_of_lading',
      blNumber: 'NGBSUV260931',
      shipper: { name: 'Coral Pack Industries (demo)' },
      consignee: { name: 'Bula Naturals Ltd (demo)' },
      vessel: 'Southern Cross Trader (demo)',
      portOfLoading: 'CNNGB',
      portOfDischarge: 'FJLTK',
      packages: 420,
      grossWeightKg: 4180,
      containers: [{ number: 'MSCU1234567', type: '20GP' }],
      freightTerms: 'prepaid',
    },
    // Charges written on a draft entry prepared from an old template (VAT at 15%).
    declared: { fiscalDuty: 1475.5, vat: 1696.82 },
    fxRate: 2.25,
    fiscalDutyRate: 0.15,
  },
};

export const DEFAULT_DEMO_DOCUMENT = 'bula-bottles';
