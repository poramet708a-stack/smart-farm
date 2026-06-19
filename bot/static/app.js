const API = '';

let allPlots        = [];
let allTransactions = [];
let allHarvest      = [];
let allActivities   = [];
let yieldEstimates  = {};
let charts          = {};

const EXPENSE_CATS = ['ค่าปุ๋ย', 'ค่าเมล็ด', 'ค่าน้ำมัน', 'ค่าซ่อม', 'ค่าแรง', 'อื่นๆ'];
const INCOME_CATS  = ['ขายข้าว', 'ขายมัน', 'ขายข้าวโพด', 'อื่นๆ'];
const MONTH_TH     = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                      'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const DAY_TH       = ['อา','จ','อ','พ','พฤ','ศ','ส'];

// calendar state
let calYear        = new Date().getFullYear();
let calMonth       = new Date().getMonth();
let calPlotFilter  = '';
let currentDayDate = null;

// plot modal state
let editingPlotId  = null;

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
  const [plots, txns, harvest, acts] = await Promise.all([
    fetch(`${API}/api/plots`).then(r => r.json()).catch(() => []),
    fetch(`${API}/api/transactions`).then(r => r.json()).catch(() => []),
    fetch(`${API}/api/harvest`).then(r => r.json()).catch(() => []),
    fetch(`${API}/api/activities`).then(r => r.json()).catch(() => []),
  ]);
  allPlots        = plots;
  allTransactions = txns;
  allHarvest      = harvest;
  allActivities   = acts;
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
      if (page === 'page-calendar') renderCalendarPage();
      if (page === 'page-map')      renderMapPage();
    });
  });
}

// ---------------------------------------------------------------------------
// Page 1: Overview
// ---------------------------------------------------------------------------
function renderOverview() {
  const month     = new Date().toISOString().slice(0, 7);
  const thisMonth = allTransactions.filter(r => (r.date || '').startsWith(month));
  const income    = sum(thisMonth, 'รายรับ');
  const expense   = sum(thisMonth, 'รายจ่าย');

  setText('ov-income',  fmt(income));
  setText('ov-expense', fmt(expense));
  setText('ov-profit',  fmt(income - expense));
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
  const ctx      = document.getElementById('chart-monthly')?.getContext('2d');
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
    btn.className    = 'plot-btn' + (i === 0 ? ' active' : '');
    btn.textContent  = p.plot_name;
    btn.dataset.plotId = p.plot_id;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.plot-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPlotDetail(p.plot_id);
    });
    container.appendChild(btn);
  });
  if (allPlots.length) renderPlotDetail(allPlots[0].plot_id);
  else {
    document.getElementById('plot-actions').innerHTML = '';
    setText('plot-name', '');
  }
}

function renderPlotDetail(plotId) {
  const plot    = allPlots.find(p => p.plot_id === plotId);
  const txns    = allTransactions.filter(r => r.plot_id === plotId);
  const expense = sum(txns, 'รายจ่าย');
  const income  = sum(txns, 'รายรับ');
  const area    = parseFloat(plot?.area_rai) || 1;

  setText('plot-name',         plot?.plot_name       || '');
  setText('plot-crop',         plot?.crop_type        || '—');
  setText('plot-area',         `${area} ไร่`);
  setText('plot-start',        plot?.start_date       || '—');
  setText('plot-harvest-date', plot?.expected_harvest || '—');
  setText('plot-cost',         fmt(expense));
  setText('plot-cost-rai',     fmt(expense / area));
  setText('plot-income',       fmt(income));
  setText('plot-profit',       fmt(income - expense));
  setText('plot-status',       plot?.status           || '—');
  setText('plot-notes-text',   plot?.notes            || '—');

  document.getElementById('plot-actions').innerHTML = `
    <button class="btn-edit-plot" onclick="openPlotModal('${plotId}')">✏️ แก้ไข</button>
    <button class="btn-del-plot"  onclick="deletePlotConfirm('${plotId}')">🗑️ ลบ</button>
  `;

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
    const cost   = sum(allTransactions.filter(r => r.plot_id === h.plot_id), 'รายจ่าย');
    const profit = parseFloat(h.total_revenue) - cost;
    const tr     = document.createElement('tr');
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
async function renderAnalysis() {
  if (!Object.keys(yieldEstimates).length) {
    try { yieldEstimates = await fetch(`${API}/api/yields`).then(r => r.json()); }
    catch { yieldEstimates = {}; }
  }

  const container = document.getElementById('analysis-content');
  container.innerHTML = '';

  if (!allPlots.length) {
    container.innerHTML = '<p style="color:#aaa;text-align:center;padding:32px">ยังไม่มีข้อมูลแปลง</p>';
    return;
  }

  allPlots.forEach(p => {
    const txns    = allTransactions.filter(r => r.plot_id === p.plot_id);
    const expense = sum(txns, 'รายจ่าย');
    const area    = parseFloat(p.area_rai) || 1;
    const estKg   = yieldEstimates[p.plot_id] || 0;

    const box = document.createElement('div');
    box.className = 'analysis-box';
    box.id = `abox-${p.plot_id}`;
    box.innerHTML = `
      <h3>📐 ${p.plot_name} · ${p.crop_type} · ${area} ไร่</h3>
      <div class="an-row"><span>💸 ต้นทุนรวม</span><strong>${fmt(expense)} บาท</strong></div>
      <div class="an-row"><span>🌾 ต้นทุนต่อไร่</span><strong>${fmt(expense / area)} บาท/ไร่</strong></div>
      <div class="an-input-row">
        <label>📦 ประมาณการผลผลิต</label>
        <input class="yield-input" type="number" min="0" placeholder="กรอก กก."
               data-plot="${p.plot_id}" data-expense="${expense}"
               value="${estKg || ''}"
               oninput="recalcPlot(this)">
        <span>กก.</span>
      </div>
      <div id="acalc-${p.plot_id}">
        ${estKg ? _calcHtml(expense, estKg, p.plot_id) : '<p class="an-hint">← กรอกประมาณการผลผลิตเพื่อคำนวณ</p>'}
      </div>
    `;
    container.appendChild(box);
  });

  const btn = document.createElement('button');
  btn.className = 'btn-save';
  btn.id        = 'yield-save-btn';
  btn.style     = 'width:100%;margin-top:8px;padding:14px';
  btn.textContent = '💾 บันทึกการประเมิน';
  btn.onclick   = saveYieldEstimates;
  container.appendChild(btn);
}

function _calcHtml(expense, estKg, plotId) {
  const breakEven = estKg > 0 ? expense / estKg : 0;
  return `
    <div class="an-row highlight">
      <span>⚖️ ราคาคุ้มทุน</span><strong>${fmt(breakEven)} บาท/กก.</strong>
    </div>
    <div class="an-input-row" style="margin-top:8px">
      <label>💰 จำลอง ถ้าขายที่</label>
      <input class="price-input" type="number" min="0" placeholder="บาท/กก."
             data-plot="${plotId}" data-expense="${expense}" data-est="${estKg}"
             oninput="recalcProfit(this)">
      <span>บาท/กก.</span>
    </div>
    <div id="aprofit-${plotId}"></div>
  `;
}

function recalcPlot(input) {
  const plotId  = input.dataset.plot;
  const expense = parseFloat(input.dataset.expense) || 0;
  const estKg   = parseFloat(input.value) || 0;
  yieldEstimates[plotId] = estKg;
  document.getElementById(`acalc-${plotId}`).innerHTML =
    estKg ? _calcHtml(expense, estKg, plotId) : '<p class="an-hint">← กรอกประมาณการผลผลิตเพื่อคำนวณ</p>';
}

function recalcProfit(input) {
  const price   = parseFloat(input.value) || 0;
  const expense = parseFloat(input.dataset.expense) || 0;
  const estKg   = parseFloat(input.dataset.est) || 0;
  const plotId  = input.dataset.plot;
  const profit  = price * estKg - expense;
  const el      = document.getElementById(`aprofit-${plotId}`);
  if (!price) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="an-row"><span>📈 รายได้ประมาณ</span><strong>${fmt(price * estKg)} บาท</strong></div>
    <div class="an-row ${profit >= 0 ? 'an-profit' : 'an-loss'}">
      <span>${profit >= 0 ? '✅ กำไร' : '❌ ขาดทุน'}</span>
      <strong>${profit >= 0 ? '+' : ''}${fmt(profit)} บาท</strong>
    </div>
  `;
}

async function saveYieldEstimates() {
  document.querySelectorAll('.yield-input').forEach(inp => {
    const v = parseFloat(inp.value);
    if (v > 0) yieldEstimates[inp.dataset.plot] = v;
    else delete yieldEstimates[inp.dataset.plot];
  });
  const btn = document.getElementById('yield-save-btn');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    await fetch(`${API}/api/yields`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(yieldEstimates),
    });
    btn.textContent = '✅ บันทึกแล้ว';
    setTimeout(() => { btn.textContent = '💾 บันทึกการประเมิน'; }, 2000);
  } catch { alert('บันทึกไม่ได้ ลองใหม่'); btn.textContent = '💾 บันทึกการประเมิน'; }
  finally { btn.disabled = false; }
}

// ---------------------------------------------------------------------------
// Page 5: Calendar
// ---------------------------------------------------------------------------
function renderCalendarPage() {
  const sel = document.getElementById('cal-plot-filter');
  sel.innerHTML = '<option value="">ทุกแปลง</option>' +
    allPlots.map(p => `<option value="${p.plot_id}">${p.plot_name}</option>`).join('');
  sel.value    = calPlotFilter;
  sel.onchange = () => { calPlotFilter = sel.value; renderCalendar(); };
  renderCalendar();
}

function renderCalendar() {
  const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  setText('cal-title', `${MONTH_TH[calMonth]} ${calYear + 543}`);

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  DAY_TH.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-day-name';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today       = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < firstDay; i++)
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'cal-day other-month' }));

  const txns = allTransactions.filter(r => {
    return (r.date || '').startsWith(monthStr) &&
           (!calPlotFilter || r.plot_id === calPlotFilter);
  });
  const dayMap = {};
  txns.forEach(r => {
    const d = (r.date || '').slice(0, 10);
    if (!dayMap[d]) dayMap[d] = { income: 0, expense: 0 };
    if (r.type === 'รายรับ')  dayMap[d].income  += parseFloat(r.amount || 0);
    if (r.type === 'รายจ่าย') dayMap[d].expense += parseFloat(r.amount || 0);
  });
  const actMap = {};
  allActivities.forEach(a => { if (a.note) actMap[a.date] = a.note; });

  for (let day = 1; day <= daysInMonth; day++) {
    const ds  = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const el  = document.createElement('div');
    el.className = 'cal-day' + (ds === today ? ' today' : '');

    let html = `<div class="cal-day-num">${day}</div>`;
    const d  = dayMap[ds];
    if (d) {
      html += '<div class="cal-dots">';
      if (d.income)  html += '<span class="cal-dot income"></span>';
      if (d.expense) html += '<span class="cal-dot expense"></span>';
      html += '</div>';
    }
    if (actMap[ds])
      html += `<div class="cal-note-preview">${actMap[ds].slice(0, 12)}</div>`;

    el.innerHTML = html;
    el.addEventListener('click', () => openDayModal(ds));
    grid.appendChild(el);
  }
}

function calPrev() { if (--calMonth < 0)  { calMonth = 11; calYear--; } renderCalendar(); }
function calNext() { if (++calMonth > 11) { calMonth = 0;  calYear++; } renderCalendar(); }

function openDayModal(dateStr) {
  currentDayDate = dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  setText('day-modal-date', `${d} ${MONTH_TH[m - 1]} ${y + 543}`);

  const txns = allTransactions.filter(r =>
    (r.date || '').slice(0, 10) === dateStr &&
    (!calPlotFilter || r.plot_id === calPlotFilter)
  );
  const listEl = document.getElementById('day-txn-list');
  if (!txns.length) {
    listEl.innerHTML = '<p class="day-no-txn">ไม่มีรายการวันนี้</p>';
  } else {
    listEl.innerHTML = txns.map(r => {
      const plot  = allPlots.find(p => p.plot_id === r.plot_id);
      const color = r.type === 'รายรับ' ? '#2e7d32' : '#c62828';
      return `<div class="day-txn-item">
        <span>${plot?.plot_name || r.plot_id} · ${r.category}</span>
        <span style="color:${color};font-weight:700">${r.type === 'รายจ่าย' ? '-' : '+'}${fmt(r.amount)}</span>
      </div>`;
    }).join('');
  }

  document.getElementById('day-note-input').value =
    allActivities.find(a => a.date === dateStr)?.note || '';
  document.getElementById('day-modal').classList.add('open');
}

function closeDayModal(e) {
  if (!e || e.target === document.getElementById('day-modal'))
    document.getElementById('day-modal').classList.remove('open');
}

async function saveDayNote() {
  if (!currentDayDate) return;
  const note = document.getElementById('day-note-input').value.trim();
  const btn  = document.getElementById('day-save-btn');
  btn.disabled = true;
  try {
    await fetch(`${API}/api/activities`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: currentDayDate, note }),
    });
    const idx = allActivities.findIndex(a => a.date === currentDayDate);
    if (idx >= 0) allActivities[idx].note = note;
    else if (note) allActivities.push({ date: currentDayDate, note });
    closeDayModal();
    renderCalendar();
  } catch { alert('บันทึกไม่ได้ ลองใหม่'); }
  finally  { btn.disabled = false; }
}

// ---------------------------------------------------------------------------
// Plot CRUD
// ---------------------------------------------------------------------------
function openPlotModal(plotId = null) {
  editingPlotId = plotId;
  setText('plot-modal-title', plotId ? '✏️ แก้ไขแปลง' : '➕ เพิ่มแปลงใหม่');
  document.getElementById('plot-form').reset();
  if (plotId) {
    const p = allPlots.find(x => x.plot_id === plotId);
    if (p) {
      document.getElementById('pf-name').value    = p.plot_name        || '';
      document.getElementById('pf-crop').value    = p.crop_type         || '';
      document.getElementById('pf-area').value    = p.area_rai          || '';
      document.getElementById('pf-start').value   = p.start_date        || '';
      document.getElementById('pf-harvest').value = p.expected_harvest  || '';
      document.getElementById('pf-status').value  = p.status            || 'กำลังปลูก';
      document.getElementById('pf-notes').value   = p.notes             || '';
    }
  }
  document.getElementById('plot-modal').classList.add('open');
}

function closePlotModal(e) {
  if (!e || e.target === document.getElementById('plot-modal'))
    document.getElementById('plot-modal').classList.remove('open');
}

async function submitPlot(e) {
  e.preventDefault();
  const btn  = document.getElementById('plot-save-btn');
  btn.disabled = true;
  const body = {
    plot_name:        document.getElementById('pf-name').value,
    crop_type:        document.getElementById('pf-crop').value,
    area_rai:         document.getElementById('pf-area').value,
    start_date:       document.getElementById('pf-start').value,
    expected_harvest: document.getElementById('pf-harvest').value,
    status:           document.getElementById('pf-status').value,
    notes:            document.getElementById('pf-notes').value,
  };
  try {
    if (editingPlotId) {
      await fetch(`${API}/api/plots/${editingPlotId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await fetch(`${API}/api/plots`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    closePlotModal();
    await loadAll();
    renderPlots();
    populatePlotSelect();
  } catch { alert('เกิดข้อผิดพลาด ลองใหม่'); }
  finally  { btn.disabled = false; }
}

async function deletePlotConfirm(plotId) {
  const plot = allPlots.find(p => p.plot_id === plotId);
  if (!confirm(`ลบแปลง "${plot?.plot_name}" ใช่ไหมครับ?`)) return;
  try {
    await fetch(`${API}/api/plots/${plotId}`, { method: 'DELETE' });
    await loadAll();
    renderPlots();
    populatePlotSelect();
  } catch { alert('เกิดข้อผิดพลาด ลองใหม่'); }
}

// ---------------------------------------------------------------------------
// Transaction modal
// ---------------------------------------------------------------------------
function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('txn-form').reset();
  updateCategories();
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay'))
    document.getElementById('modal-overlay').classList.remove('open');
}

function updateCategories() {
  const type = document.getElementById('f-type').value;
  const sel  = document.getElementById('f-category');
  const cats = type === 'รายจ่าย' ? EXPENSE_CATS : INCOME_CATS;
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function populatePlotSelect() {
  document.getElementById('f-plot').innerHTML =
    allPlots.map(p => `<option value="${p.plot_id}">${p.plot_name}</option>`).join('');
}

async function submitTxn(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  const body = {
    type:        document.getElementById('f-type').value,
    category:    document.getElementById('f-category').value,
    amount:      document.getElementById('f-amount').value,
    plot_id:     document.getElementById('f-plot').value,
    recorded_by: document.getElementById('f-by').value || 'เว็บ',
  };
  try {
    const data = await fetch(`${API}/api/transactions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());
    closeModal();
    await loadAll();
    renderOverview();
    alert(`✅ บันทึกแล้วครับ (${data.txn_id})`);
  } catch { alert('เกิดข้อผิดพลาด ลองใหม่'); }
  finally  { btn.disabled = false; btn.textContent = 'บันทึก'; }
}

async function deleteTxn(txnId) {
  if (!confirm(`ลบรายการ ${txnId} ใช่ไหมครับ?`)) return;
  try {
    await fetch(`${API}/api/transactions/${txnId}`, { method: 'DELETE' });
    await loadAll();
    renderOverview();
    const active = document.querySelector('.plot-btn.active');
    if (active) renderPlotDetail(active.dataset.plotId);
  } catch { alert('เกิดข้อผิดพลาด ลองใหม่'); }
}

// ---------------------------------------------------------------------------
// Farm Map
// ---------------------------------------------------------------------------
const ZONES = [
  { id:0, label:'ว่างเปล่า',  color:'#f5f5f5', border:'#e0e0e0', emoji:'⬜' },
  { id:1, label:'ไร่นา',      color:'#c8e6c9', border:'#66bb6a', emoji:'🌾' },
  { id:2, label:'สระน้ำ',     color:'#bbdefb', border:'#42a5f5', emoji:'💧' },
  { id:3, label:'บ้าน/อาคาร', color:'#ffe0b2', border:'#ffa726', emoji:'🏠' },
  { id:4, label:'ทางเดิน',    color:'#d7ccc8', border:'#a1887f', emoji:'🛤️' },
  { id:5, label:'ต้นไม้',     color:'#a5d6a7', border:'#388e3c', emoji:'🌳' },
  { id:6, label:'โรงเก็บของ', color:'#bcaaa4', border:'#795548', emoji:'🏗️' },
  { id:7, label:'ลบ/ล้าง',    color:'#ffffff', border:'#bbb',    emoji:'🧹' },
];

let mapGrid        = [];
let mapRows        = 15;
let mapCols        = 20;
let mapCellM       = 10;
let mapZoneLabels  = {};
let selectedZone   = 1;
let isPainting     = false;
let mapInitialized = false;
let zoomLevel      = 1;
let editingZoneId  = null;
let mapCanvas, mapCtx;
const BASE_CELL_PX = 28;

function getCellPx() { return Math.max(8, Math.round(BASE_CELL_PX * zoomLevel)); }

function renderMapPage() {
  if (!mapInitialized) {
    mapCanvas = document.getElementById('map-canvas');
    mapCtx    = mapCanvas.getContext('2d');
    setupMapEvents();
    mapInitialized = true;
  }
  fetch(`${API}/api/map`).then(r => r.json()).then(data => {
    if (data && data.grid && data.grid.length) {
      mapRows       = data.rows         || mapRows;
      mapCols       = data.cols         || mapCols;
      mapCellM      = data.cell_m       || mapCellM;
      mapGrid       = data.grid;
      mapZoneLabels = data.zone_labels  || {};
      zoomLevel     = data.zoom         || 1;
      document.getElementById('map-cell-m').value   = mapCellM;
      document.getElementById('map-width-m').value  = mapCols * mapCellM;
      document.getElementById('map-height-m').value = mapRows * mapCellM;
    } else {
      mapGrid = new Array(mapRows * mapCols).fill(0);
    }
    updateZoomLabel();
    buildZoneToolbar();
    redrawMap();
  }).catch(() => {
    mapGrid = new Array(mapRows * mapCols).fill(0);
    buildZoneToolbar();
    redrawMap();
  });
}

function buildZoneToolbar() {
  document.getElementById('zone-toolbar').innerHTML = ZONES.map(z => {
    const info     = mapZoneLabels[z.id] || {};
    const label    = info.label || z.label;
    const plotName = info.plot_id ? (allPlots.find(p => p.plot_id === info.plot_id)?.plot_name || '') : '';
    const editBtn  = (z.id > 0 && z.id < 7)
      ? `<span class="zone-edit-icon" onclick="event.stopPropagation();openZoneEdit(${z.id})">✏️</span>` : '';
    return `<button class="zone-btn${z.id === selectedZone ? ' active' : ''}"
              id="zone-btn-${z.id}"
              style="background:${z.color};border-color:${z.border}"
              onclick="selectZone(${z.id})">
      <span class="zone-icon">${z.emoji}</span>
      <span class="zone-name">${label}</span>
      ${plotName ? `<span class="zone-plot-tag">${plotName}</span>` : ''}
      ${editBtn}
    </button>`;
  }).join('');
}

function selectZone(id) {
  selectedZone = id;
  document.querySelectorAll('.zone-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`zone-btn-${id}`)?.classList.add('active');
}

function setupMapEvents() {
  const getPos = e => {
    const rect   = mapCanvas.getBoundingClientRect();
    const src    = e.touches ? e.touches[0] : e;
    const scaleX = mapCanvas.width  / rect.width;
    const scaleY = mapCanvas.height / rect.height;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  };
  const paint = e => {
    const { x, y } = getPos(e);
    const cp   = getCellPx();
    const c    = Math.floor(x / cp);
    const r    = Math.floor(y / cp);
    if (c < 0 || c >= mapCols || r < 0 || r >= mapRows) return;
    const zone = selectedZone === 7 ? 0 : selectedZone;
    const idx  = r * mapCols + c;
    if (mapGrid[idx] === zone) return;
    mapGrid[idx] = zone;
    const z = ZONES[zone];
    mapCtx.fillStyle   = z.color;
    mapCtx.fillRect(c * cp, r * cp, cp, cp);
    mapCtx.strokeStyle = z.border;
    mapCtx.lineWidth   = 0.5;
    mapCtx.strokeRect(c * cp + 0.5, r * cp + 0.5, cp - 1, cp - 1);
    updateMapLegend();
  };
  mapCanvas.addEventListener('mousedown',  e => { isPainting = true;  paint(e); });
  mapCanvas.addEventListener('mousemove',  e => { if (isPainting) paint(e); });
  mapCanvas.addEventListener('mouseup',    () => isPainting = false);
  mapCanvas.addEventListener('mouseleave', () => isPainting = false);
  mapCanvas.addEventListener('touchstart',  e => { e.preventDefault(); isPainting = true;  paint(e); }, { passive:false });
  mapCanvas.addEventListener('touchmove',   e => { e.preventDefault(); if (isPainting) paint(e); }, { passive:false });
  mapCanvas.addEventListener('touchend',    () => isPainting = false);
}

function redrawMap() {
  const cp = getCellPx();
  mapCanvas.width  = cp * mapCols;
  mapCanvas.height = cp * mapRows;
  for (let r = 0; r < mapRows; r++) {
    for (let c = 0; c < mapCols; c++) {
      const zid = mapGrid[r * mapCols + c] || 0;
      const z   = ZONES[zid];
      mapCtx.fillStyle   = z.color;
      mapCtx.fillRect(c * cp, r * cp, cp, cp);
      mapCtx.strokeStyle = z.border;
      mapCtx.lineWidth   = 0.5;
      mapCtx.strokeRect(c * cp + 0.5, r * cp + 0.5, cp - 1, cp - 1);
    }
  }
  updateMapLegend();
}

function zoomIn()  { if (zoomLevel < 4)    { zoomLevel = Math.round((zoomLevel + 0.25)*4)/4; updateZoomLabel(); redrawMap(); } }
function zoomOut() { if (zoomLevel > 0.25) { zoomLevel = Math.round((zoomLevel - 0.25)*4)/4; updateZoomLabel(); redrawMap(); } }
function updateZoomLabel() { setText('zoom-label', Math.round(zoomLevel * 100) + '%'); }

function applyGridSize() {
  const wm  = parseInt(document.getElementById('map-width-m').value)  || 200;
  const hm  = parseInt(document.getElementById('map-height-m').value) || 150;
  mapCellM  = parseInt(document.getElementById('map-cell-m').value)   || 10;
  const nc  = Math.max(5, Math.min(200, Math.round(wm / mapCellM)));
  const nr  = Math.max(5, Math.min(200, Math.round(hm / mapCellM)));
  const ng  = new Array(nr * nc).fill(0);
  for (let r = 0; r < Math.min(nr, mapRows); r++)
    for (let c = 0; c < Math.min(nc, mapCols); c++)
      ng[r * nc + c] = mapGrid[r * mapCols + c] || 0;
  mapRows = nr; mapCols = nc; mapGrid = ng;
  redrawMap();
}

function onCellMChange() {
  mapCellM = parseInt(document.getElementById('map-cell-m').value) || 10;
  updateMapLegend();
}

function updateMapLegend() {
  const counts   = new Array(ZONES.length).fill(0);
  mapGrid.forEach(z => { if (z >= 0 && z < ZONES.length) counts[z]++; });
  const cellArea = mapCellM * mapCellM;

  const zoneRows = ZONES.filter((z, i) => i > 0 && i < 7 && counts[i] > 0).map(z => {
    const info  = mapZoneLabels[z.id] || {};
    const label = info.label || z.label;
    const m2    = counts[z.id] * cellArea;
    return `<div class="map-leg-item">
      <span class="map-leg-dot" style="background:${z.color};border:2px solid ${z.border}"></span>
      <span>${z.emoji} ${label}</span>
      <span class="map-leg-area">${m2.toLocaleString()} ม² · ${(m2/1600).toFixed(2)} ไร่</span>
    </div>`;
  });

  const linked = Object.entries(mapZoneLabels)
    .filter(([, v]) => v.plot_id)
    .map(([zid, v]) => {
      const z    = ZONES[parseInt(zid)];
      const plot = allPlots.find(p => p.plot_id === v.plot_id);
      if (!z || !plot) return '';
      return `<div class="map-link-item">
        <span class="map-leg-dot" style="background:${z.color};border:2px solid ${z.border}"></span>
        <span>${v.label || z.label} → <strong>${plot.plot_name}</strong></span>
        <button class="btn-goto-plot" onclick="navigateToPlot('${v.plot_id}')">ดูแปลง →</button>
      </div>`;
    }).filter(Boolean);

  let html = zoneRows.length
    ? zoneRows.join('')
    : '<p style="color:#aaa;text-align:center;padding:12px">วาดแผนผังเพื่อดูสรุปพื้นที่</p>';
  if (linked.length)
    html += `<div class="map-links-hdr">🔗 ลิงก์แปลง</div>${linked.join('')}`;
  document.getElementById('map-legend').innerHTML = html;
}

// Zone edit
function openZoneEdit(zoneId) {
  editingZoneId = zoneId;
  const info = mapZoneLabels[zoneId] || {};
  document.getElementById('zf-label').value   = info.label || ZONES[zoneId]?.label || '';
  document.getElementById('zf-plot').innerHTML =
    '<option value="">ไม่เชื่อมกับแปลง</option>' +
    allPlots.map(p => `<option value="${p.plot_id}"${info.plot_id===p.plot_id?' selected':''}>${p.plot_name}</option>`).join('');
  document.getElementById('zone-modal').classList.add('open');
}
function closeZoneModal(e) {
  if (!e || e.target === document.getElementById('zone-modal'))
    document.getElementById('zone-modal').classList.remove('open');
}
function saveZoneEdit() {
  if (editingZoneId === null) return;
  mapZoneLabels[editingZoneId] = {
    label:   document.getElementById('zf-label').value.trim() || ZONES[editingZoneId]?.label,
    plot_id: document.getElementById('zf-plot').value || null,
  };
  closeZoneModal();
  buildZoneToolbar();
  updateMapLegend();
}

// Navigate to plot tab
function navigateToPlot(plotId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-page="page-plots"]').classList.add('active');
  document.getElementById('page-plots').classList.add('active');
  renderPlots();
  setTimeout(() => {
    document.querySelectorAll('.plot-btn').forEach(b => {
      if (b.dataset.plotId === plotId) {
        document.querySelectorAll('.plot-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      }
    });
    renderPlotDetail(plotId);
  }, 80);
}

async function saveMap() {
  const btn = document.getElementById('map-save-btn');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    await fetch(`${API}/api/map`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: mapRows, cols: mapCols, cell_m: mapCellM,
                             grid: mapGrid, zone_labels: mapZoneLabels, zoom: zoomLevel }),
    });
    btn.textContent = '✅ บันทึกแล้ว';
    setTimeout(() => { btn.textContent = '💾 บันทึก'; }, 2000);
  } catch { alert('บันทึกไม่ได้ ลองใหม่'); btn.textContent = '💾 บันทึก'; }
  finally  { btn.disabled = false; }
}

function clearMap() {
  if (!confirm('ล้างแผนผังทั้งหมดใช่ไหมครับ?')) return;
  mapGrid = new Array(mapRows * mapCols).fill(0);
  redrawMap();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sum(arr, type) {
  return arr.filter(r => !type || r.type === type)
            .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
}
function fmt(n) {
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function setText(id, val) {
  const el = document.getElementById(id); if (el) el.textContent = val;
}
function lastNMonths(n) {
  const d = new Date(), months = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(m.toISOString().slice(0, 7));
  }
  return months;
}
function shortMonth(ym) {
  const names = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return names[parseInt(ym.split('-')[1], 10) - 1];
}
function groupByPlot(txns) {
  const m = {};
  txns.forEach(r => { m[r.plot_id] = (m[r.plot_id] || 0) + parseFloat(r.amount); });
  return m;
}
function topEntry(obj) {
  const e = Object.entries(obj);
  return e.length ? e.sort((a, b) => b[1] - a[1])[0] : null;
}
function renderDoughnut(canvasId, labels, data) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  const COLORS = ['#66bb6a','#ef5350','#42a5f5','#ffa726','#ab47bc','#26c6da'];
  charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: COLORS.slice(0, labels.length) }] },
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
  if (!txns.length)
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px">ยังไม่มีรายการ</td></tr>';
}
