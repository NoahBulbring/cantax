/* ── CanTax — calculation engine + UI ─────────────────────── */

function taxFromBrackets(income, brackets) {
  let tax = 0, prev = 0;
  const pieces = [];
  for (const b of brackets) {
    if (income <= prev) break;
    const slice = Math.min(income, b.upTo) - prev;
    const t = slice * b.rate;
    pieces.push({ from: prev, to: Math.min(income, b.upTo), rate: b.rate, amount: slice, tax: t });
    tax += t;
    prev = b.upTo;
  }
  return { tax, pieces };
}

function marginalRate(income, brackets) {
  for (const b of brackets) if (income <= b.upTo) return b.rate;
  return brackets[brackets.length - 1].rate;
}

function combinedBracketPieces(income, federalBrackets, provincialBrackets, federalRateMultiplier = 1) {
  if (income <= 0) return [];

  const thresholds = [...federalBrackets, ...provincialBrackets]
    .map((b) => b.upTo)
    .filter((upTo) => upTo < income);
  const boundaries = [0, ...new Set(thresholds), income].sort((a, b) => a - b);

  return boundaries.slice(1).map((to, index) => {
    const from = boundaries[index];
    const rate =
      marginalRate(to, federalBrackets) * federalRateMultiplier +
      marginalRate(to, provincialBrackets);
    const amount = to - from;
    return { from, to, rate, amount, tax: amount * rate };
  });
}

function federalBPA(netIncome) {
  const f = FEDERAL;
  if (netIncome <= f.bpaPhaseStart) return f.bpaMax;
  if (netIncome >= f.bpaPhaseEnd) return f.bpaMin;
  const frac = (netIncome - f.bpaPhaseStart) / (f.bpaPhaseEnd - f.bpaPhaseStart);
  return f.bpaMax - frac * (f.bpaMax - f.bpaMin);
}

function calcPayroll(income, provCode, include) {
  if (!include) return { cpp: 0, cpp2: 0, ei: 0, total: 0 };
  const p = PAYROLL, isQC = provCode === 'QC';
  const pensionRate = isQC ? p.cpp.qcRate : p.cpp.rate;
  const cpp = Math.max(0, Math.min(income, p.cpp.ympe) - p.cpp.exemption) * pensionRate;
  const cpp2 = Math.max(0, Math.min(income, p.cpp2.yampe) - p.cpp.ympe) * p.cpp2.rate;
  const ei = Math.min(income, p.ei.maxInsurable) * (isQC ? p.ei.qcRate : p.ei.rate);
  return { cpp, cpp2, ei, total: cpp + cpp2 + ei };
}

function calculate(gross, deductions, provCode, includePayroll) {
  const prov = PROVINCES[provCode];
  const taxable = Math.max(0, gross - deductions);

  // Federal
  const fed = taxFromBrackets(taxable, FEDERAL.brackets);
  let fedTax = Math.max(0, fed.tax - federalBPA(taxable) * FEDERAL.creditRate);
  if (prov.abatement) fedTax *= 1 - prov.abatement; // Quebec abatement
  // Provincial
  const pr = taxFromBrackets(taxable, prov.brackets);
  const provCreditRate = prov.brackets[0].rate;
  let provTax = Math.max(0, pr.tax - prov.bpa * provCreditRate);
  // Ontario surtax
  let surtax = 0;
  if (prov.surtax) {
    for (const s of prov.surtax) surtax += Math.max(0, provTax - s.over) * s.rate;
    provTax += surtax;
  }
  // Ontario health premium
  let healthPremium = prov.healthPremium ? ontarioHealthPremium(taxable) : 0;
  provTax += healthPremium;

  const payroll = calcPayroll(gross, provCode, includePayroll);
  const totalTax = fedTax + provTax;
  const totalDeducted = totalTax + payroll.total;
  const afterTax = gross - totalDeducted;

  const mFed = marginalRate(taxable, FEDERAL.brackets) * (prov.abatement ? 1 - prov.abatement : 1);
  const mProv = marginalRate(taxable, prov.brackets);

  return {
    gross, taxable, fedTax, provTax, surtax, healthPremium, payroll,
    totalTax, totalDeducted, afterTax,
    avgRate: gross > 0 ? totalDeducted / gross : 0,
    margRate: mFed + mProv,
    fedPieces: fed.pieces,
    provPieces: pr.pieces,
    overallPieces: combinedBracketPieces(
      taxable,
      FEDERAL.brackets,
      prov.brackets,
      prov.abatement ? 1 - prov.abatement : 1,
    ),
  };
}

/* ── UI ── */
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
const fmtC = (n) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => (n * 100).toFixed(1) + '%';
let activeBreakdown = 'overall';

function populateProvinces() {
  const sel = $('province');
  Object.entries(PROVINCES)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .forEach(([code, p]) => {
      const o = document.createElement('option');
      o.value = code; o.textContent = p.name;
      sel.appendChild(o);
    });
  sel.value = 'ON';
}

function render() {
  const gross = parseFloat($('income').value) || 0;
  const deductions = parseFloat($('deductions').value) || 0;
  const provCode = $('province').value;
  const includePayroll = $('payroll').checked;
  const r = calculate(gross, deductions, provCode, includePayroll);
  const taxWithoutDeductions = calculate(gross, 0, provCode, false).totalTax;
  const deductionSavings = Math.max(0, taxWithoutDeductions - r.totalTax);

  $('after-tax').textContent = fmt(r.afterTax);
  $('monthly').textContent = fmtC(r.afterTax / 12);
  $('biweekly').textContent = fmtC(r.afterTax / 26);
  $('deduction-savings').textContent = fmt(deductionSavings);
  $('fed-tax').textContent = fmt(r.fedTax);
  $('prov-tax').textContent = fmt(r.provTax);
  $('cpp-ei').textContent = fmt(r.payroll.total);
  $('total-tax').textContent = fmt(r.totalDeducted);
  $('avg-rate').textContent = pct(r.avgRate);
  $('marg-rate').textContent = pct(r.margRate);
  $('prov-label').textContent = PROVINCES[provCode].name + ' tax';

  // stacked take-home bar
  const bar = $('split-bar');
  bar.innerHTML = '';
  if (r.gross > 0) {
    const segs = [
      { v: r.afterTax, cls: 'seg-net', label: 'Take-home' },
      { v: r.fedTax, cls: 'seg-fed', label: 'Federal' },
      { v: r.provTax, cls: 'seg-prov', label: 'Provincial' },
      { v: r.payroll.total, cls: 'seg-cpp', label: 'CPP/EI' },
    ];
    for (const s of segs) {
      if (s.v <= 0) continue;
      const d = document.createElement('div');
      d.className = 'seg ' + s.cls;
      d.style.width = (s.v / r.gross * 100) + '%';
      d.title = `${s.label}: ${fmt(s.v)}`;
      bar.appendChild(d);
    }
  }

  const breakdowns = {
    overall: { title: 'Overall bracket breakdown', pieces: r.overallPieces },
    provincial: { title: `${PROVINCES[provCode].name} bracket breakdown`, pieces: r.provPieces },
    federal: { title: 'Federal bracket breakdown', pieces: r.fedPieces },
  };
  const breakdown = breakdowns[activeBreakdown];
  $('breakdown-title').textContent = breakdown.title;
  $('breakdown-panel').setAttribute('aria-labelledby', `tab-${activeBreakdown}`);

  const tbody = $('brackets');
  tbody.innerHTML = '';
  for (const p of breakdown.pieces) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${fmt(p.from)} – ${p.to === Infinity ? '∞' : fmt(p.to)}</td>` +
      `<td class="num">${(p.rate * 100).toFixed(1)}%</td>` +
      `<td class="num">${fmt(p.amount)}</td>` +
      `<td class="num accent">${fmt(p.tax)}</td>`;
    tbody.appendChild(tr);
  }
}

populateProvinces();
document.querySelectorAll('.breakdown-tab').forEach((tab, index, tabs) => {
  tab.addEventListener('click', () => {
    activeBreakdown = tab.dataset.breakdown;
    tabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', active);
      item.tabIndex = active ? 0 : -1;
    });
    render();
  });
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    tabs[(index + direction + tabs.length) % tabs.length].click();
    tabs[(index + direction + tabs.length) % tabs.length].focus();
  });
});
['income', 'deductions', 'province', 'payroll'].forEach((id) =>
  $(id).addEventListener('input', render));
render();
