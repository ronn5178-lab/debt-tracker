// Pure calculation helpers shared by index.html and summary.html
const TH_ABBR = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TH_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const sum = (a, f = x => x.amount) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const ym = key => { const [y, m] = key.split('-').map(Number); return {y, m}; };
const keyAdd = (key, n) => { const {y, m} = ym(key), t = y * 12 + m - 1 + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
const labelOf = key => { const {y, m} = ym(key); return TH_ABBR[m - 1] + ' ' + y; };
const fullOf = key => { const {y, m} = ym(key); return TH_FULL[m - 1] + ' ' + y; };

// walk months in order, carrying cash, debt payments and savings forward
function compute(db) {
  const count = {}, paid = {};
  db.debts.forEach(d => { count[d.id] = +d.paid_before || 0; paid[d.id] = 0; });
  let carry = 0, sav = +(db.savings && db.savings.opening) || 0;
  return db.months.map((m, i) => {
    const carryIn = i === 0 ? (+m.opening_carry || 0) : carry;
    const lastPay = {};
    const fund = m.fund.map((f, idx) => {
      const v = {...f, idx};
      if (f.debt && f.debt in count) {
        count[f.debt]++; paid[f.debt] += +f.amount || 0; lastPay[f.debt] = (lastPay[f.debt] || 0) + (+f.amount || 0);
        const d = db.debts.find(x => x.id === f.debt);
        if (d.total_n) v.inst = [count[f.debt], d.total_n];
      }
      return v;
    });
    const debts = db.debts.map(d => {
      const n = count[d.id];
      const balance = d.kind === 'installment'
        ? Math.max(0, ((+d.total_n || 0) - n) * (+d.per || 0))
        : Math.max(0, (+d.opening || 0) - paid[d.id]);
      const monthly = lastPay[d.id] || +d.per || 0;
      const left = d.kind === 'installment' ? Math.max(0, (+d.total_n || 0) - n)
        : (balance <= 0 ? 0 : monthly ? Math.ceil(balance / monthly) : null);
      return {...d, paid_n: n, balance, monthly, left, thisMonth: lastPay[d.id] || 0};
    });
    const savStart = sav, savAdd = +(m.savings && m.savings.add) || 0, savItems = (m.savings && m.savings.items) || [];
    sav = savStart + savAdd - sum(savItems);
    const income = carryIn + sum(m.income), fundTotal = sum(m.fund);
    carry = income - fundTotal;
    return {
      key: m.key, label: labelOf(m.key), full: fullOf(m.key), raw: m, first: i === 0,
      carryIn, income: m.income.map((x, idx) => ({...x, idx})), fund, personal: m.personal.map((x, idx) => ({...x, idx})),
      debts, savings: {start: savStart, add: savAdd, out: sum(savItems), balance: sav, items: savItems},
      totals: {income, fund: fundTotal, personal: sum(m.personal), carry, debt: sum(debts, d => d.balance)},
    };
  });
}

function shiftDate(iso, key) {
  if (!iso) return '';
  const {y, m} = ym(key), day = Math.min(+iso.slice(8, 10), new Date(y, m, 0).getDate());
  return key + '-' + String(day).padStart(2, '0');
}

// safe arithmetic for amount fields: digits, + - * / ( ) . and commas only
function evalAmount(s) {
  s = String(s).replace(/,/g, '').trim();
  if (!s || !/^[\d.+\-*/() ]+$/.test(s)) return NaN;
  try { const v = Function('"use strict";return (' + s + ')')(); return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN; }
  catch (e) { return NaN; }
}

const CATS = {
  car:   {name: 'ค่างวดรถ',    icon: '🚗', color: '#F97316'},
  bang:  {name: 'คืนบัง',      icon: '🤝', color: '#14B8A6'},
  card:  {name: 'หนี้บัตร',    icon: '💳', color: '#22C55E'},
  kid:   {name: 'ลูก & ครรภ์', icon: '👶', color: '#F472B6'},
  phone: {name: 'ค่าโทรศัพท์', icon: '📱', color: '#3B82F6'},
  other: {name: 'อื่นๆ',       icon: '🛍️', color: '#E11D48'},
};
const baht = n => (n < 0 ? '−' : '') + '฿' + Math.abs(Math.round(n)).toLocaleString('th-TH');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const thDate = iso => { const d = new Date(iso + 'T00:00'); return d.getDate() + ' ' + TH_ABBR[d.getMonth()]; };
const cat = id => CATS[id] || CATS.other;
