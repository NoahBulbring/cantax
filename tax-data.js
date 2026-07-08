/* ── CanTax — 2025 tax year data ─────────────────────────────
   Sources: CRA indexation factors for 2025, provincial budgets.
   Federal first-bracket rate shown as 14.5% — the legislated
   mid-2025 rate cut (15% Jan–Jun, 14% Jul–Dec) averages to
   14.5% for the 2025 tax year.                                */

const TAX_YEAR = 2025;

const FEDERAL = {
  brackets: [
    { upTo: 57375,    rate: 0.145 },
    { upTo: 114750,   rate: 0.205 },
    { upTo: 177882,   rate: 0.26  },
    { upTo: 253414,   rate: 0.29  },
    { upTo: Infinity, rate: 0.33  },
  ],
  // Basic personal amount: $16,129, reduced to $14,538 as net
  // income rises from $177,882 to $253,414.
  bpaMax: 16129,
  bpaMin: 14538,
  bpaPhaseStart: 177882,
  bpaPhaseEnd: 253414,
  creditRate: 0.145,
};

const PROVINCES = {
  AB: { name: 'Alberta', bpa: 22323, brackets: [
    { upTo: 60000, rate: 0.08 }, { upTo: 151234, rate: 0.10 },
    { upTo: 181481, rate: 0.12 }, { upTo: 241974, rate: 0.13 },
    { upTo: 362961, rate: 0.14 }, { upTo: Infinity, rate: 0.15 } ] },
  BC: { name: 'British Columbia', bpa: 12932, brackets: [
    { upTo: 49279, rate: 0.0506 }, { upTo: 98560, rate: 0.077 },
    { upTo: 113158, rate: 0.105 }, { upTo: 137407, rate: 0.1229 },
    { upTo: 186306, rate: 0.147 }, { upTo: 259829, rate: 0.168 },
    { upTo: Infinity, rate: 0.205 } ] },
  MB: { name: 'Manitoba', bpa: 15780, brackets: [
    { upTo: 47564, rate: 0.108 }, { upTo: 101200, rate: 0.1275 },
    { upTo: Infinity, rate: 0.174 } ] },
  NB: { name: 'New Brunswick', bpa: 13396, brackets: [
    { upTo: 51306, rate: 0.094 }, { upTo: 102614, rate: 0.14 },
    { upTo: 190060, rate: 0.16 }, { upTo: Infinity, rate: 0.195 } ] },
  NL: { name: 'Newfoundland and Labrador', bpa: 11067, brackets: [
    { upTo: 44192, rate: 0.087 }, { upTo: 88382, rate: 0.145 },
    { upTo: 157792, rate: 0.158 }, { upTo: 220910, rate: 0.178 },
    { upTo: 282214, rate: 0.198 }, { upTo: 564429, rate: 0.208 },
    { upTo: 1128858, rate: 0.213 }, { upTo: Infinity, rate: 0.218 } ] },
  NS: { name: 'Nova Scotia', bpa: 11744, brackets: [
    { upTo: 30507, rate: 0.0879 }, { upTo: 61015, rate: 0.1495 },
    { upTo: 95883, rate: 0.1667 }, { upTo: 154650, rate: 0.175 },
    { upTo: Infinity, rate: 0.21 } ] },
  NT: { name: 'Northwest Territories', bpa: 17842, brackets: [
    { upTo: 51964, rate: 0.059 }, { upTo: 103930, rate: 0.086 },
    { upTo: 168967, rate: 0.122 }, { upTo: Infinity, rate: 0.1405 } ] },
  NU: { name: 'Nunavut', bpa: 19274, brackets: [
    { upTo: 54707, rate: 0.04 }, { upTo: 109413, rate: 0.07 },
    { upTo: 177881, rate: 0.09 }, { upTo: Infinity, rate: 0.115 } ] },
  ON: { name: 'Ontario', bpa: 12747, brackets: [
    { upTo: 52886, rate: 0.0505 }, { upTo: 105775, rate: 0.0915 },
    { upTo: 150000, rate: 0.1116 }, { upTo: 220000, rate: 0.1216 },
    { upTo: Infinity, rate: 0.1316 } ],
    surtax: [ { over: 5710, rate: 0.20 }, { over: 7307, rate: 0.36 } ],
    healthPremium: true },
  PE: { name: 'Prince Edward Island', bpa: 14250, brackets: [
    { upTo: 33328, rate: 0.095 }, { upTo: 64656, rate: 0.1347 },
    { upTo: 105000, rate: 0.166 }, { upTo: 140000, rate: 0.1762 },
    { upTo: Infinity, rate: 0.19 } ] },
  QC: { name: 'Quebec', bpa: 18571, abatement: 0.165, brackets: [
    { upTo: 53255, rate: 0.14 }, { upTo: 106495, rate: 0.19 },
    { upTo: 129590, rate: 0.24 }, { upTo: Infinity, rate: 0.2575 } ] },
  SK: { name: 'Saskatchewan', bpa: 18991, brackets: [
    { upTo: 53463, rate: 0.105 }, { upTo: 152750, rate: 0.125 },
    { upTo: Infinity, rate: 0.145 } ] },
  YT: { name: 'Yukon', bpa: 16129, brackets: [
    { upTo: 57375, rate: 0.064 }, { upTo: 114750, rate: 0.09 },
    { upTo: 177882, rate: 0.109 }, { upTo: 500000, rate: 0.128 },
    { upTo: Infinity, rate: 0.15 } ] },
};

const PAYROLL = {
  cpp:  { ympe: 71300, exemption: 3500, rate: 0.0595, qcRate: 0.064 },
  cpp2: { yampe: 81200, rate: 0.04 },
  ei:   { maxInsurable: 65700, rate: 0.0164, qcRate: 0.0131 },
};

/* Ontario health premium — piecewise on taxable income */
function ontarioHealthPremium(ti) {
  if (ti <= 20000) return 0;
  if (ti <= 36000) return Math.min(300, (ti - 20000) * 0.06);
  if (ti <= 48000) return Math.min(450, 300 + (ti - 36000) * 0.06);
  if (ti <= 72000) return Math.min(600, 450 + (ti - 48000) * 0.25);
  if (ti <= 200000) return Math.min(750, 600 + (ti - 72000) * 0.25);
  return Math.min(900, 750 + (ti - 200000) * 0.25);
}
