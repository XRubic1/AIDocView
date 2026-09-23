/**
 * Builds a simple Credyx 2027 cost/earnings projection spreadsheet.
 * Revenue: Fee Schedule % of confirmed collections (platform fee $0 as currently marketed).
 * Costs: lean software stack from GO_GOLD_ROADMAP.
 */
const XLSX = require('xlsx');
const path = require('path');

const months = [
  'Jan 2027', 'Feb 2027', 'Mar 2027', 'Apr 2027', 'May 2027', 'Jun 2027',
  'Jul 2027', 'Aug 2027', 'Sep 2027', 'Oct 2027', 'Nov 2027', 'Dec 2027',
];

// Timeline: month 0 = Jan. First carrier after 1 mo lag; 1 mo trial; then paying.
// collections[m] = billable confirmed collections in that month (paying only used for fee).
const carriers = [
  {
    name: 'Small carrier 1',
    type: 'small',
    trialStart: 1,
    payStart: 2,
    collections: [0, 0, 28000, 30000, 32000, 30000, 35000, 38000, 36000, 40000, 42000, 40000],
    trialVolume: 15000,
  },
  {
    name: 'Small carrier 2',
    type: 'small',
    trialStart: 3,
    payStart: 4,
    collections: [0, 0, 0, 0, 22000, 25000, 28000, 30000, 32000, 30000, 35000, 38000],
    trialVolume: 12000,
  },
  {
    name: 'Small carrier 3',
    type: 'small',
    trialStart: 5,
    payStart: 6,
    collections: [0, 0, 0, 0, 0, 0, 20000, 24000, 26000, 28000, 30000, 32000],
    trialVolume: 10000,
  },
  {
    name: 'Small carrier 4',
    type: 'small',
    trialStart: 7,
    payStart: 8,
    collections: [0, 0, 0, 0, 0, 0, 0, 0, 18000, 22000, 25000, 28000],
    trialVolume: 10000,
  },
  {
    name: 'Small carrier 5',
    type: 'small',
    trialStart: 9,
    payStart: 10,
    collections: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20000, 24000],
    trialVolume: 10000,
  },
  {
    name: 'Mid/big carrier',
    type: 'big',
    trialStart: 6,
    payStart: 7,
    collections: [0, 0, 0, 0, 0, 0, 0, 150000, 170000, 180000, 190000, 200000],
    trialVolume: 80000,
  },
];

/** Fee schedule tier for monthly collected volume. */
function rateFor(vol) {
  if (vol < 100000) return 0.0125;
  if (vol < 250000) return 0.01;
  if (vol < 500000) return 0.009;
  return 0.008;
}

function status(c, m) {
  if (m < c.trialStart) return '—';
  if (m < c.payStart) return 'Trial';
  return 'Paying';
}

function feeFor(c, m) {
  if (status(c, m) !== 'Paying') return 0;
  const vol = c.collections[m];
  return Math.round(vol * rateFor(vol) * 100) / 100;
}

// Software-only costs ramp (GO_GOLD lean → higher with volume). No founder salary.
const costs = [180, 200, 220, 250, 280, 320, 380, 450, 500, 550, 600, 650];

const costNotes = [
  'No carriers — lean stack',
  'First trial starts',
  'First paying client',
  '2nd carrier on trial',
  '2 paying',
  '3rd on trial',
  '3 paying; big on trial',
  'Big converts — AI/storage up',
  '4 small + big paying',
  'Steady growth',
  '5th small converts',
  'Year-end peak volume',
];

const monthly = months.map((label, m) => {
  let paying = 0;
  let trial = 0;
  let collections = 0;
  let revenue = 0;
  const rows = [];

  for (const c of carriers) {
    const st = status(c, m);
    if (st === 'Paying') paying += 1;
    if (st === 'Trial') trial += 1;

    const payVol = st === 'Paying' ? c.collections[m] : 0;
    const shownVol = st === 'Paying' ? payVol : st === 'Trial' ? c.trialVolume : 0;
    collections += payVol;
    const f = feeFor(c, m);
    revenue += f;
    rows.push({
      name: c.name,
      type: c.type,
      status: st,
      volume: shownVol,
      fee: f,
      rate: st === 'Paying' ? rateFor(payVol) : 0,
    });
  }

  const cost = costs[m];
  const net = Math.round((revenue - cost) * 100) / 100;
  return {
    label,
    paying,
    trial,
    collections,
    revenue: Math.round(revenue * 100) / 100,
    cost,
    net,
    rows,
    costNote: costNotes[m],
  };
});

const totals = monthly.reduce(
  (a, r) => ({
    collections: a.collections + r.collections,
    revenue: a.revenue + r.revenue,
    cost: a.cost + r.cost,
    net: a.net + r.net,
  }),
  { collections: 0, revenue: 0, cost: 0, net: 0 }
);

const money = (n) => Math.round(n * 100) / 100;

// --- Sheet: Monthly P&L ---
const pnlHeader = [
  'Month',
  'Paying clients',
  'On trial',
  'Billable collections',
  'Credyx revenue',
  'Software costs',
  'Net (ex-salary)',
  'Notes',
];
const pnlRows = monthly.map((r) => [
  r.label,
  r.paying,
  r.trial,
  r.collections,
  r.revenue,
  r.cost,
  r.net,
  r.paying === 0 && r.trial === 0
    ? 'No carriers yet — outreach / setup'
    : r.trial > 0 && r.paying === 0
      ? 'Trial month — fees waived'
      : r.costNote,
]);
pnlRows.push([]);
pnlRows.push([
  'YEAR TOTAL',
  '',
  '',
  totals.collections,
  money(totals.revenue),
  totals.cost,
  money(totals.net),
  '',
]);
const wsPnl = XLSX.utils.aoa_to_sheet([pnlHeader, ...pnlRows]);
wsPnl['!cols'] = [
  { wch: 12 },
  { wch: 14 },
  { wch: 10 },
  { wch: 18 },
  { wch: 16 },
  { wch: 14 },
  { wch: 16 },
  { wch: 36 },
];

// --- Sheet: Per carrier ---
const detail = [['Month', 'Carrier', 'Status', 'Collections that month', 'Rate', 'Credyx fee']];
monthly.forEach((r) => {
  r.rows.forEach((row) => {
    if (row.status === '—') return;
    detail.push([
      r.label,
      row.name,
      row.status,
      row.volume,
      row.rate ? `${(row.rate * 100).toFixed(2)}%` : 'Waived',
      row.fee,
    ]);
  });
});
const wsDetail = XLSX.utils.aoa_to_sheet(detail);
wsDetail['!cols'] = [
  { wch: 12 },
  { wch: 18 },
  { wch: 10 },
  { wch: 22 },
  { wch: 10 },
  { wch: 12 },
];

// --- Sheet: Assumptions ---
const assumptions = [
  ['Credyx 2027 projection — assumptions'],
  [],
  ['Period', 'Jan 1, 2027 – Dec 31, 2027'],
  [],
  ['TIMELINE (as requested)'],
  ['Jan 2027', 'No first carrier yet (1 month to land first)'],
  ['Feb 2027', 'First small carrier starts 1-month trial ($0 fees)'],
  ['Mar 2027', 'First carrier converts to paying'],
  ['Ongoing', 'Each new carrier: ~1 month trial, then paying'],
  ['Jul–Aug 2027', 'One mid/big carrier: trial then paying'],
  [],
  ['REVENUE MODEL (Fee Schedule)'],
  ['Platform / app fee', '$0/mo (current enrollment — A/R fee only)'],
  ['Collections under $100k/mo', '1.25% of confirmed collections'],
  ['Collections $100k–$250k/mo', '1.00%'],
  ['Collections $250k–$500k/mo', '0.90%'],
  ['Trial', 'Platform + collection fees waived'],
  ['What % applies to', 'Confirmed collections only (not pending/uncollected)'],
  [],
  ['CLIENT MIX (illustrative, realistic early year)'],
  ['Small carriers', 'Owner-op / small fleet ≈ $20k–$40k collected/mo'],
  ['Mid/big carrier', 'One account ≈ $150k–$200k collected/mo'],
  ['Ramp', '5 small + 1 mid/big by year end (not all start day 1)'],
  [],
  ['COSTS (software only — GO_GOLD lean stack)'],
  ['Includes', 'Supabase, email, OpenAI DocSort, hosting, misc tools'],
  ['Excludes', 'Founder salary / your time (biggest real cost early)'],
  ['Ramp', '~$180/mo lean → ~$650/mo with 6 active accounts'],
  [],
  ['HOW TO READ'],
  ['Paying clients', 'Carriers past trial, generating Credyx revenue'],
  ['On trial', 'Active but $0 Credyx fee that month'],
  ['Net', 'Revenue − software costs (before your labor)'],
  [],
  ['SENSITIVITY NOTES'],
  ['If small carriers stay at ~$15k/mo', 'Revenue roughly 40–50% lower'],
  ['If $99 platform fee is agreed', 'Add $99 × paying clients each month'],
  ['If big carrier never closes', 'Lose ~$1.5k–$2k/mo from Aug onward'],
  ['Churn', 'Not modeled — assumes all who convert stay through Dec'],
];
const wsAssumptions = XLSX.utils.aoa_to_sheet(assumptions);
wsAssumptions['!cols'] = [{ wch: 36 }, { wch: 70 }];

// --- Sheet: Year snapshot ---
const smallRev = monthly.reduce(
  (s, r) => s + r.rows.filter((x) => x.type === 'small').reduce((a, x) => a + x.fee, 0),
  0
);
const bigRev = monthly.reduce(
  (s, r) => s + r.rows.filter((x) => x.type === 'big').reduce((a, x) => a + x.fee, 0),
  0
);
const firstProfit = monthly.find((r) => r.net > 0);

const summary = [
  ['2027 YEAR SNAPSHOT'],
  [],
  ['Total Credyx revenue', money(totals.revenue)],
  ['Total software costs', totals.cost],
  ['Net (ex-salary)', money(totals.net)],
  [],
  ['Revenue from small carriers', money(smallRev)],
  ['Revenue from mid/big carrier', money(bigRev)],
  ['Big carrier share of revenue', `${((bigRev / totals.revenue) * 100).toFixed(0)}%`],
  [],
  ['First dollar of revenue', 'Mar 2027 (after Jan lag + Feb trial)'],
  ['First profitable month (ex-salary)', firstProfit ? firstProfit.label : 'None'],
  ['Peak month revenue', Math.max(...monthly.map((r) => r.revenue))],
  ['Peak month net', Math.max(...monthly.map((r) => r.net))],
  [],
  ['Typical small carrier (paying month)'],
  ['Collections', '$25,000 – $40,000'],
  ['Credyx fee @ 1.25%', '$312 – $500'],
  [],
  ['Mid/big carrier (paying month)'],
  ['Collections', '$150,000 – $200,000'],
  ['Credyx fee @ 1.00%', '$1,500 – $2,000'],
];
const wsSummary = XLSX.utils.aoa_to_sheet(summary);
wsSummary['!cols'] = [{ wch: 40 }, { wch: 40 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsPnl, 'Monthly P&L');
XLSX.utils.book_append_sheet(wb, wsSummary, 'Year snapshot');
XLSX.utils.book_append_sheet(wb, wsDetail, 'Per carrier');
XLSX.utils.book_append_sheet(wb, wsAssumptions, 'Assumptions');

const out = path.join(__dirname, '..', 'docs', 'Credyx_2027_Projection.xlsx');
XLSX.writeFile(wb, out);

console.log('Wrote', out);
console.log('YEAR revenue', money(totals.revenue), 'cost', totals.cost, 'net', money(totals.net));
console.log('Small', money(smallRev), 'Big', money(bigRev));
monthly.forEach((r) => {
  console.log(
    r.label,
    'pay',
    r.paying,
    'trial',
    r.trial,
    'rev',
    r.revenue,
    'cost',
    r.cost,
    'net',
    r.net
  );
});
