const API = '';

let allPlots = [];
let allTransactions = [];
let allHarvest = [];
let charts = {};

const EXPENSE_CATS = ['ค่าปุ๋ย', 'ค่าเมล็ด', 'ค่าน้ำมัน', 'ค่าซ่อม', 'ค่าแรง', 'อื่นๆ'];
const INCOME_CATS  = ['ขายข้าว', 'ขายมัน', 'ขายข้าวโพด', 'อื่นๆ'];

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  renderOverview();
  setupTabs();
  updateCategories();
  populatePlotSelect();
});

async function loadAll() {
  const [plots, txns, harvest] = await Promise.all([
    fetch(`${API}/api/plots`).then(r => r.json()).catch(() => []),
    fetch(`${API}/api/transactions`).then(r => r.json()).catch(() => []),
    fetch(`${API}/api/harvest`).then(r => r.json()).catch(() => []),
  ]);
  allPlots        = plots;
  allTransactions = txns;
  allHarvest      = harvest;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const page = btn.dataset.page;
      document.getElementById(page).classList.add('active');

      if (page === 'page-plots')    renderPlots();
      if (page === 'page-harvest')  renderHarvest();
      if (page === 'page-analysis') renderAnalysis();
    });
  });
}

// ---------------------------------------------------------------------------
// Page 1: Overview
// ---------------------------------------------------------------------------
function renderOverview() {
  const month     = new Date().toISOString().slice(0, 7);
  const thisMonth = allTransactions.filter(r => (r.date || '').startsWith(month));

  const income  = sum(thisMonth, 'รายรับ');
  const expense = sum(thisMonth, 'รายจ่าย');
  const profit  = income - expense;

  setText('ov-income',  fmt(income));
  setText('ov-expense', fmt(expense));
  setText('ov-profit',  fmt(profit));
  setText('ov-count',   thisMonth.length);

  renderMonthlyChart(allTransactions);

  const plotExpense = groupByPlot(allTransactions.filter(r => r.type === 'รายจ่าย'));
  const topPlot     = topEntry(plotExpense);
  if (topPlot) {
    const name = allPlots.find(p => p.plot_id === topPlot[0])?.plot_name || topPlot[0];
    setText('ov-top-plot', `${name} (${fmt(topPlot[1])} บาท)`);
  }
}

function renderMonthlyChart(txns) {
  const months   = lastNMonths(6);
  const incomes  = months.map(m => sum(txns.filter(r => r.date?.startsWith(m)), 'รายรับ'));
  const expenses = months.map(m => sum(txns.filter(r => r.date?.startsWith(m)), 'รายจ่าย'));

  const ctx = document.getElementById('chart-monthly')?.getContext('2d');
  if (!ctx) return;
  if (charts.monthly) charts.monthly.destroy();
  charts.monthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(shortMonth),
      datasets: [
        { label: 'รายรับ',  data: incomes,  backgroundColor: '#66bb6a' },
        { label: 'รายจ่าย', data: expenses, backgroundColor: '#ef5350' },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: 'top' } } },
  });
}

// ---------------------------------------------------------------------------
// Page 2: Per Plot
// ---------------------------------------------------------------------------
function renderPlots() {
  const container = document.getElementById('plot-buttons');
  container.innerHTML = '';
  allPlots.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'plot-btn' + (i === 0 ? ' active' : '');
    btn.textContent = p.plot_name;
    btn.dataset.plotId = p.plot_id;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.plot-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPlotDetail(p.plot_id);
    });
    container.appendChild(btn);
  });
  if (allPlots.length) renderPlotDetail(allPlots[0].plot_id);
}

function renderPlotDetail(plotId) {
  const plot    = allPlots.find(p => p.plot_id === plotId);
  const txns    = allTransactions.filter(r => r.plot_id === plotId);
  const expense = sum(txns, 'รายจ่าย');
  const income  = sum(txns, 'รายรับ');
  const area    = parseFloat(plot?.area_rai) || 1;

  setText('plot-name',         plot?.plot_name || '');
  setText('plot-crop',         plot?.crop_type || '');
  setText('plot-area',         `${area} ไร่`);
  setText('plot-start',        plot?.start_date || '-');
  setText('plot-harvest-date', plot?.expected_harvest || '-');
  setText('plot-cost',         fmt(expense));
  setText('plot-cost-rai',     fmt(expense / area));
  setText('plot-income',       fmt(income));
  setText('plot-profit',       fmt(income - expense));

  const catMap = {};
  txns.filter(r => r.type === 'รายจ่าย').forEach(r => {
    catMap[r.category] = (catMap[r.category] || 0) + parseFloat(r.amount);
  });
  renderDoughnut('chart-category', Object.keys(catMap), Object.values(catMap));

  renderTxnTable('plot-txn-table', txns.slice(-20).reverse());
}

// ---------------------------------------------------------------------------
// Page 3: Harvest
// ---------------------------------------------------------------------------
function renderHarvest() {
  const tbody = document.querySelector('#harvest-table tbody');
  tbody.innerHTML = '';

  allHarvest.forEach(h => {
    const plot   = allPlots.find(p => p.plot_id === h.plot_id);
    const txns   = allTransactions.filter(r => r.plot_id === h.plot_id);
    const cost   = sum(txns, 'รายจ่าย');
    const profit = parseFloat(h.total_revenue) - cost;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${plot?.plot_name || h.plot_id}</td>
      <td>${h.harvest_date}</td>
      <td>${fmt(h.quantity_kg)} กก.</td>
      <td>${fmt(h.price_per_kg)}</td>
      <td>${fmt(h.total_revenue)}</td>
      <td>${fmt(cost)}</td>
      <td style="color:${profit >= 0 ? '#2e7d32' : '#c62828'}">${fmt(profit)}</td>
    `;
    tbody.appendChild(tr);
  });

  if (!allHarvest.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:24px">ยังไม่มีรายการเก็บเกี่ยว</td></tr>';
  }
}

// ---------------------------------------------------------------------------
// Page 4: Analysis
// ---------------------------------------------------------------------------
function renderAnalysis() {
  const container = document.getElementById('analysis-content');
  container.innerHTML = '';

  allPlots.forEach(p => {
    const txns    = allTransactions.filter(r => r.plot_id === p.plot_id);
    const expense = sum(txns, 'รายจ่าย');
    const area    = parseFloat(p.area_rai) || 1;

    const yieldMap = { 'ข้าว': 500, 'มันสำปะหลัง': 3500, 'ข้าวโพด': 800 };
    const estYield = (yieldMap[p.crop_type] || 500) * area;
    const breakEvenPrice = estYield > 0 ? expense / estYield : 0;

    const box = document.createElement('div');
    box.className = 'breakeven';
    box.innerHTML = `
      <h3>📐 ${p.plot_name} (${p.crop_type}, ${area} ไร่)</h3>
      <p>💸 ต้นทุนรวม: <strong>${fmt(expense)} บาท</strong></p>
      <p>📦 ประมาณการผลผลิต: <strong>${fmt(estYield)} กก.</strong></p>
      <p>⚖️ ราคาขายขั้นต่ำคุ้มทุน: <strong>${fmt(breakEvenPrice)} บาท/กก.</strong></p>
      <p>🌾 ต้นทุนต่อไร่: <strong>${fmt(expense / area)} บาท/ไร่</strong></p>
    `;
    container.appendChild(box);
  });

  if (!allPlots.length) {
    container.innerHTML = '<p style="color:#aaa;text-align:center;padding:32px">ยังไม่มีข้อมูลแปลง</p>';
  }
}

// ---------------------------------------------------------------------------
// Modal: เพิ่มรายการ
// ---------------------------------------------------------------------------
function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('txn-form').reset();
  updateCategories();
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay')) {
    document.getElementById('modal-overlay').classList.remove('open');
  }
}

function updateCategories() {
  const type = document.getElementById('f-type').value;
  const cats = type === 'รายจ่าย' ? EXPENSE_CATS : INCOME_CATS;
  const sel  = document.getElementById('f-category');
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function populatePlotSelect() {
  const sel = document.getElementById('f-plot');
  sel.innerHTML = allPlots.map(p =>
    `<option value="${p.plot_id}">${p.plot_name}</option>`
  ).join('');
}

async function submitTxn(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';

  const body = {
    type:        document.getElementById('f-type').value,
    category:    document.getElementById('f-category').value,
    amount:      document.getElementById('f-amount').value,
    plot_id:     document.getElementById('f-plot').value,
    recorded_by: document.getElementById('f-by').value || 'เว็บ',
  };

  try {
    const res = await fetch(`${API}/api/transactions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    closeModal();
    await loadAll();
    renderOverview();
    alert(`✅ บันทึกแล้วครับ (${data.txn_id})`);
  } catch {
    alert('เกิดข้อผิดพลาด ลองใหม่อีกครั้งครับ');
  } finally {
    btn.disabled = false;
    btn.textContent = 'บันทึก';
  }
}

// ---------------------------------------------------------------------------
// Delete transaction
// ---------------------------------------------------------------------------
async function deleteTxn(txnId) {
  if (!confirm(`ลบรายการ ${txnId} ใช่ไหมครับ?`)) return;
  try {
    await fetch(`${API}/api/transactions/${txnId}`, { method: 'DELETE' });
    await loadAll();
    renderOverview();
    const active = document.querySelector('.plot-btn.active');
    if (active) renderPlotDetail(active.dataset.plotId);
  } catch {
    alert('เกิดข้อผิดพลาด ลองใหม่อีกครั้งครับ');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sum(arr, type) {
  return arr
    .filter(r => !type || r.type === type)
    .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
}

function fmt(n) {
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function lastNMonths(n) {
  const months = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(m.toISOString().slice(0, 7));
  }
  return months;
}

function shortMonth(ym) {
  const [, m] = ym.split('-');
  const names = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return names[parseInt(m, 10) - 1];
}

function groupByPlot(txns) {
  const map = {};
  txns.forEach(r => { map[r.plot_id] = (map[r.plot_id] || 0) + parseFloat(r.amount); });
  return map;
}

function topEntry(obj) {
  const entries = Object.entries(obj);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0];
}

function renderDoughnut(canvasId, labels, data) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  const COLORS = ['#66bb6a','#ef5350','#42a5f5','#ffa726','#ab47bc','#26c6da'];
  charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: COLORS.slice(0, labels.length) }],
    },
    options: { responsive: true, plugins: { legend: { position: 'right' } } },
  });
}

function renderTxnTable(tbodyId, txns) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';
  txns.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${(r.date || '').slice(0, 10)}</td>
      <td>${r.type}</td>
      <td>${r.category}</td>
      <td style="text-align:right">${fmt(r.amount)}</td>
      <td>${r.recorded_by || ''}</td>
      <td><button class="btn-del" onclick="deleteTxn('${r.id}')">ลบ</button></td>
    `;
    tbody.appendChild(tr);
  });
  if (!txns.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px">ยังไม่มีรายการ</td></tr>';
  }
}
