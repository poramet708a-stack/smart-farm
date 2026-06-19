const API = '';

let allPlots        = [];
let allTransactions = [];
let allHarvest      = [];
let allActivities   = [];
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
function renderAnalysis() {
  const container = document.getElementById('analysis-content');
  container.innerHTML = '';
  allPlots.forEach(p => {
    const txns    = allTransactions.filter(r => r.plot_id === p.plot_id);
    const expense = sum(txns, 'รายจ่าย');
    const area    = parseFloat(p.area_rai) || 1;
    const yMap    = { 'ข้าว': 500, 'มันสำปะหลัง': 3500, 'ข้าวโพด': 800 };
    const est     = (yMap[p.crop_type] || 500) * area;
    const box     = document.createElement('div');
    box.className = 'breakeven';
    box.innerHTML = `
      <h3>📐 ${p.plot_name} (${p.crop_type}, ${area} ไร่)</h3>
      <p>💸 ต้นทุนรวม: <strong>${fmt(expense)} บาท</strong></p>
      <p>📦 ประมาณการผลผลิต: <strong>${fmt(est)} กก.</strong></p>
      <p>⚖️ ราคาขายขั้นต่ำคุ้มทุน: <strong>${fmt(est > 0 ? expense / est : 0)} บาท/กก.</strong></p>
      <p>🌾 ต้นทุนต่อไร่: <strong>${fmt(expense / area)} บาท/ไร่</strong></p>
    `;
    container.appendChild(box);
  });
  if (!allPlots.length)
    container.innerHTML = '<p style="color:#aaa;text-align:center;padding:32px">ยังไม่มีข้อมูลแปลง</p>';
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

let mapGrid       = [];
let mapRows       = 15;
let mapCols       = 20;
let mapCellM      = 10;
let selectedZone  = 1;
let isPainting    = false;
let mapInitialized = false;
let mapCanvas, mapCtx;
const CELL_PX     = 28;

function renderMapPage() {
  if (!mapInitialized) {
    mapCanvas = document.getElementById('map-canvas');
    mapCtx    = mapCanvas.getContext('2d');
    setupMapEvents();
    buildZoneToolbar();
    mapInitialized = true;
  }
  fetch(`${API}/api/map`).then(r => r.json()).then(data => {
    if (data && data.grid && data.grid.length) {
      mapRows  = data.rows   || mapRows;
      mapCols  = data.cols   || mapCols;
      mapCellM = data.cell_m || mapCellM;
      mapGrid  = data.grid;
      document.getElementById('map-cell-m').value = mapCellM;
      const gs = `${mapRows}-${mapCols}`;
      if (document.querySelector(`#map-grid-size option[value="${gs}"]`))
        document.getElementById('map-grid-size').value = gs;
    } else {
      mapGrid = new Array(mapRows * mapCols).fill(0);
    }
    redrawMap();
  }).catch(() => {
    mapGrid = new Array(mapRows * mapCols).fill(0);
    redrawMap();
  });
}

function buildZoneToolbar() {
  document.getElementById('zone-toolbar').innerHTML = ZONES.map(z => `
    <button class="zone-btn${z.id === selectedZone ? ' active' : ''}"
            id="zone-btn-${z.id}"
            style="background:${z.color};border-color:${z.border}"
            onclick="selectZone(${z.id})">
      <span class="zone-icon">${z.emoji}</span>
      <span class="zone-name">${z.label}</span>
    </button>
  `).join('');
}

function selectZone(id) {
  selectedZone = id;
  document.querySelectorAll('.zone-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`zone-btn-${id}`).classList.add('active');
}

function setupMapEvents() {
  const getPos = e => {
    const rect  = mapCanvas.getBoundingClientRect();
    const src   = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };
  const paint = e => {
    const { x, y } = getPos(e);
    const c = Math.floor(x / CELL_PX);
    const r = Math.floor(y / CELL_PX);
    if (c < 0 || c >= mapCols || r < 0 || r >= mapRows) return;
    const idx  = r * mapCols + c;
    const zone = selectedZone === 7 ? 0 : selectedZone;
    if (mapGrid[idx] === zone) return;
    mapGrid[idx] = zone;
    const z = ZONES[zone];
    mapCtx.fillStyle = z.color;
    mapCtx.fillRect(c * CELL_PX, r * CELL_PX, CELL_PX, CELL_PX);
    mapCtx.strokeStyle = z.border;
    mapCtx.lineWidth = 0.5;
    mapCtx.strokeRect(c * CELL_PX + 0.5, r * CELL_PX + 0.5, CELL_PX - 1, CELL_PX - 1);
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
  mapCanvas.width  = CELL_PX * mapCols;
  mapCanvas.height = CELL_PX * mapRows;
  for (let r = 0; r < mapRows; r++) {
    for (let c = 0; c < mapCols; c++) {
      const zid = mapGrid[r * mapCols + c] || 0;
      const z   = ZONES[zid];
      mapCtx.fillStyle = z.color;
      mapCtx.fillRect(c * CELL_PX, r * CELL_PX, CELL_PX, CELL_PX);
      mapCtx.strokeStyle = z.border;
      mapCtx.lineWidth = 0.5;
      mapCtx.strokeRect(c * CELL_PX + 0.5, r * CELL_PX + 0.5, CELL_PX - 1, CELL_PX - 1);
    }
  }
  updateMapLegend();
}

function updateMapLegend() {
  const counts = new Array(ZONES.length).fill(0);
  mapGrid.forEach(z => { if (z >= 0 && z < ZONES.length) counts[z]++; });
  const cellArea = mapCellM * mapCellM;
  const rows = ZONES.filter((z, i) => i > 0 && i < 7 && counts[i] > 0).map(z => {
    const m2  = counts[z.id] * cellArea;
    const rai = (m2 / 1600).toFixed(2);
    return `<div class="map-leg-item">
      <span class="map-leg-dot" style="background:${z.color};border:2px solid ${z.border}"></span>
      <span>${z.emoji} ${z.label}</span>
      <span class="map-leg-area">${m2.toLocaleString()} ม² · ${rai} ไร่</span>
    </div>`;
  });
  document.getElementById('map-legend').innerHTML = rows.length
    ? rows.join('')
    : '<p style="color:#aaa;text-align:center;padding:12px">วาดแผนผังด้านบนเพื่อดูสรุปพื้นที่</p>';
}

function onCellMChange() {
  mapCellM = parseInt(document.getElementById('map-cell-m').value);
  updateMapLegend();
}

function onGridSizeChange() {
  const [r, c] = document.getElementById('map-grid-size').value.split('-').map(Number);
  const newGrid = new Array(r * c).fill(0);
  for (let rr = 0; rr < Math.min(r, mapRows); rr++)
    for (let cc = 0; cc < Math.min(c, mapCols); cc++)
      newGrid[rr * c + cc] = mapGrid[rr * mapCols + cc] || 0;
  mapRows = r; mapCols = c; mapGrid = newGrid;
  redrawMap();
}

async function saveMap() {
  const btn = document.getElementById('map-save-btn');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    await fetch(`${API}/api/map`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: mapRows, cols: mapCols, cell_m: mapCellM, grid: mapGrid }),
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
