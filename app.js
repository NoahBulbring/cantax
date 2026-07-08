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
  };
}

/* ── UI ── */
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
const fmtC = (n) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => (n * 100).toFixed(1) + '%';

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

  $('after-tax').textContent = fmt(r.afterTax);
  $('monthly').textContent = fmtC(r.afterTax / 12);
  $('biweekly').textContent = fmtC(r.afterTax / 26);
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

  // federal bracket breakdown
  const tbody = $('brackets');
  tbody.innerHTML = '';
  for (const p of r.fedPieces) {
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
['income', 'deductions', 'province', 'payroll'].forEach((id) =>
  $(id).addEventListener('input', render));
render();
