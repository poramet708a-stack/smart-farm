const API = '';

let allPlots            = [];
let allTransactions     = [];
let allHarvest          = [];
let allActivities       = [];
let yieldEstimates      = {};
let allHarvestSessions  = [];
let allHarvestEntries   = [];
let allSeasonLogs       = [];
let charts              = {};

// Plots that are still active (not yet harvested)
const activePlots = () => allPlots.filter(p => p.status !== 'เก็บเกี่ยวแล้ว');

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
let currentPlotId  = null;

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
  const [plots, txns, harvest, acts, yields] = await Promise.all([
    fetch(`${API}/api/plots`).then(r => r.json()).catch(() => []),
    fetch(`${API}/api/transactions`).then(r => r.json()).catch(() => []),
    fetch(`${API}/api/harvest`).then(r => r.json()).catch(() => []),
    fetch(`${API}/api/activities`).then(r => r.json()).catch(() => []),
    fetch(`${API}/api/yields`).then(r => r.json()).catch(() => ({})),
  ]);
  allPlots        = plots;
  allTransactions = txns;
  allHarvest      = harvest;
  allActivities   = acts;
  yieldEstimates  = yields;
}

// helper: normalize yieldEstimates entry → { kg, price }
function yieldData(plotId) {
  const e = yieldEstimates[plotId];
  if (!e) return { kg: 0, price: 0 };
  if (typeof e === 'object') return { kg: e.kg || 0, price: e.price || 0 };
  return { kg: e, price: 0 };
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
  if (charts.monthly) charts.monthly.canvas.style.borderRadius = '8px';

  const plotExpense = groupByPlot(allTransactions.filter(r => r.type === 'รายจ่าย'));
  const topPlot     = topEntry(plotExpense);
  if (topPlot) {
    const name = allPlots.find(p => p.plot_id === topPlot[0])?.plot_name || topPlot[0];
    setText('ov-top-plot', `${name} (${fmt(topPlot[1])} บาท)`);
  }

  renderOvPlotBars(plotExpense);
  renderOvPlotCards();
  renderOvRecent();
}

function renderOvPlotBars(plotExpense) {
  const el = document.getElementById('ov-plot-bars');
  if (!el) return;
  const active = activePlots();
  if (!active.length) { el.innerHTML = '<p class="ov-empty">ยังไม่มีแปลง</p>'; return; }

  const hasAnyEstimate = active.some(p => {
    const d = yieldData(p.plot_id);
    return d.kg > 0 && d.price > 0;
  });

  el.innerHTML = active.map(p => {
    const expense = plotExpense[p.plot_id] || 0;
    const { kg, price } = yieldData(p.plot_id);
    const estRev  = kg * price;
    const hasEst  = estRev > 0;
    const pct     = hasEst ? Math.min(Math.round(expense / estRev * 100), 100) : 0;
    const over    = hasEst && expense > estRev;
    const barColor = !hasEst    ? '#90caf9'
                   : pct < 70  ? '#66bb6a'
                   : pct < 90  ? '#ffa726'
                   :              '#ef5350';
    const fillWidth = hasEst ? Math.max(2, pct) : (expense > 0 ? 100 : 0);

    let statusTag = '';
    if (hasEst) {
      if (over) {
        const diff = expense - estRev;
        statusTag = `<span class="ov-status-tag red">❌ เกิน ${fmt(diff)} ฿</span>`;
      } else {
        const diff = estRev - expense;
        statusTag = `<span class="ov-status-tag ${pct < 70 ? 'green' : 'orange'}">✅ เหลือ ${fmt(diff)} ฿</span>`;
      }
    } else {
      statusTag = `<span class="ov-status-tag grey">ยังไม่ได้ประเมิน</span>`;
    }

    return `<div class="ov-bar-block">
      <div class="ov-bar-head">
        <span class="ov-bar-name">${p.plot_name}</span>
        ${statusTag}
      </div>
      <div class="ov-bar-wrap">
        <div class="ov-bar-fill" style="width:${fillWidth}%;background:${barColor}"></div>
        ${hasEst ? `<div class="ov-bar-target" title="รายได้ที่ประเมิน"></div>` : ''}
      </div>
      <div class="ov-bar-foot">
        <span>ต้นทุน <strong>${fmt(expense)} ฿</strong></span>
        ${hasEst
          ? `<span>ประเมินรายได้ <strong>${fmt(estRev)} ฿</strong> (${kg} กก. × ${price} ฿)</span>`
          : `<span style="color:#aaa;font-size:0.8rem">ตั้งประเมินได้ที่หน้า 📐 วิเคราะห์</span>`}
      </div>
    </div>`;
  }).join('');
}

function renderOvPlotCards() {
  const el = document.getElementById('ov-plot-cards');
  if (!el) return;
  const active = activePlots();
  if (!active.length) { el.innerHTML = '<p class="ov-empty">ยังไม่มีแปลง</p>'; return; }
  const today = new Date();
  el.innerHTML = active.map(p => {
    const spent   = sum(allTransactions.filter(r => r.plot_id === p.plot_id && r.type === 'รายจ่าย'));
    const harvest = p.expected_harvest ? new Date(p.expected_harvest) : null;
    const days    = harvest ? Math.ceil((harvest - today) / 86400000) : null;
    const daysStr = days === null ? '—'
                  : days < 0    ? `เลยกำหนด ${Math.abs(days)} วัน`
                  : days === 0  ? 'วันนี้!'
                  :               `อีก ${days} วัน`;
    const daysClass = days !== null && days <= 7 ? 'ov-days-soon' : '';
    const statusBadge = p.status === 'เก็บเกี่ยวแล้ว'
      ? '<span class="ov-badge done">✅ เก็บเกี่ยวแล้ว</span>'
      : '<span class="ov-badge active">🌱 กำลังปลูก</span>';
    return `<div class="ov-plot-card">
      <div class="ov-pc-top">${statusBadge}<span class="ov-pc-name">${p.plot_name}</span></div>
      <div class="ov-pc-crop">🌿 ${p.crop_type || '—'} · ${p.area_rai || '—'} ไร่</div>
      <div class="ov-pc-row"><span>💸 ค่าใช้จ่ายสะสม</span><strong>${fmt(spent)} ฿</strong></div>
      <div class="ov-pc-row"><span>🚜 เก็บเกี่ยว</span><strong class="${daysClass}">${daysStr}</strong></div>
    </div>`;
  }).join('');
}

function renderOvRecent() {
  const el = document.getElementById('ov-recent');
  if (!el) return;
  const recent = [...allTransactions]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 8);
  if (!recent.length) { el.innerHTML = '<p class="ov-empty">ยังไม่มีรายการ</p>'; return; }
  el.innerHTML = recent.map(r => {
    const plotName = allPlots.find(p => p.plot_id === r.plot_id)?.plot_name || r.plot_id || '—';
    const isIncome = r.type === 'รายรับ';
    return `<div class="ov-recent-row">
      <span class="ov-recent-dot ${isIncome ? 'inc' : 'exp'}"></span>
      <div class="ov-recent-info">
        <div class="ov-recent-cat">${r.category || r.type}</div>
        <div class="ov-recent-meta">${(r.date || '').slice(0, 10)} · ${plotName}</div>
      </div>
      <div class="ov-recent-amt ${isIncome ? 'inc' : 'exp'}">${isIncome ? '+' : '-'}${fmt(r.amount)} ฿</div>
    </div>`;
  }).join('');
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
  const active = activePlots();
  active.forEach((p, i) => {
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
  if (active.length) renderPlotDetail(active[0].plot_id);
  else {
    document.getElementById('plot-actions').innerHTML = '';
    setText('plot-name', '');
  }
}

function renderPlotDetail(plotId) {
  currentPlotId = plotId;
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
// Page 3: Harvest (Session-based)
// ---------------------------------------------------------------------------
async function renderHarvest() {
  if (!allHarvestSessions.length && !allHarvestEntries.length) {
    [allHarvestSessions, allHarvestEntries] = await Promise.all([
      fetch(`${API}/api/harvest-sessions`).then(r => r.json()).catch(() => []),
      fetch(`${API}/api/harvest-entries`).then(r => r.json()).catch(() => []),
    ]);
  }
  const done    = allHarvestSessions.filter(s => s.status === 'เสร็จแล้ว');
  const open    = allHarvestSessions.filter(s => s.status === 'กำลังเก็บ');
  const totalRev = done.reduce((s, h) => s + parseFloat(h.total_revenue || 0), 0);
  const totalKg  = done.reduce((s, h) => s + parseFloat(h.total_kg      || 0), 0);

  setText('hrv-total-rev',   fmt(totalRev) + ' ฿');
  setText('hrv-total-kg',    fmt(totalKg)  + ' กก.');
  setText('hrv-open-count',  open.length + ' รอบ');

  // Open sessions
  const openEl = document.getElementById('hrv-sessions-open');
  if (!open.length) {
    openEl.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px">ไม่มีรอบที่กำลังดำเนินการ</p>';
  } else {
    openEl.innerHTML = open.map(s => {
      const plot    = allPlots.find(p => p.plot_id === s.plot_id);
      const entries = allHarvestEntries.filter(e => e.session_id === s.session_id);
      const expKg   = parseFloat(s.expected_kg) || 0;
      const doneKg  = parseFloat(s.total_kg)    || 0;
      const pct     = expKg > 0 ? Math.min(Math.round(doneKg / expKg * 100), 100) : 0;
      const barColor= pct < 50 ? '#90caf9' : pct < 80 ? '#66bb6a' : '#ffa726';

      const entryRows = entries.length
        ? entries.map(e => `
            <div class="hen-row">
              <span class="hen-date">${e.date}</span>
              <span class="hen-kg">${fmt(e.kg)} กก.</span>
              <span class="hen-price">${e.price_per_kg ? fmt(parseFloat(e.kg)*parseFloat(e.price_per_kg))+' ฿' : '—'}</span>
              <span class="hen-note">${e.notes || ''}</span>
            </div>`).join('')
        : '<p style="color:#bbb;font-size:0.85rem;padding:8px 0">ยังไม่มีรอบเก็บ กด "บันทึกรอบเก็บ"</p>';

      return `<div class="hss-card">
        <div class="hss-head">
          <span class="hss-plot">${plot?.plot_name || s.plot_id}</span>
          <span class="hss-date">เริ่ม ${s.start_date}</span>
        </div>
        <div class="hss-progress-wrap">
          <div class="hss-progress-bar" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <div class="hss-progress-info">
          <span>${fmt(doneKg)} / ${fmt(expKg)} กก. (${pct}%)</span>
          <span>รายได้: ${fmt(parseFloat(s.total_revenue||0))} ฿</span>
        </div>
        <div class="hen-list">${entryRows}</div>
        <div class="hss-actions">
          <button class="btn-add-inline" onclick="openHarvestEntryModal('${s.session_id}','${s.plot_id}')">📦 บันทึกรอบเก็บ</button>
          <button class="btn-close-session" onclick="openCloseSessionModal('${s.session_id}',${doneKg},${parseFloat(s.total_revenue||0)})">✅ ปิดรอบ</button>
        </div>
      </div>`;
    }).join('');
  }

  // Done sessions table
  const tbody = document.querySelector('#harvest-done-table tbody');
  tbody.innerHTML = '';
  if (!done.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:24px">ยังไม่มีรอบที่เสร็จแล้ว</td></tr>';
  } else {
    done.forEach(s => {
      const plot = allPlots.find(p => p.plot_id === s.plot_id);
      const tr   = document.createElement('tr');
      tr.innerHTML = `
        <td>${plot?.plot_name || s.plot_id}</td>
        <td>${s.end_date || '—'}</td>
        <td>${fmt(s.total_kg)} กก.</td>
        <td class="amt-inc">${fmt(s.total_revenue)} ฿</td>
        <td>${s.destination_type || '—'}${s.destination_detail ? ' · '+s.destination_detail : ''}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// ── Harvest Session Modal ──────────────────────────────────
function openHarvestSessionModal() {
  document.getElementById('hss-form').reset();
  document.getElementById('hss-start').value = new Date().toISOString().slice(0, 10);
  document.getElementById('hss-plot').innerHTML =
    activePlots().map(p => `<option value="${p.plot_id}">${p.plot_name}</option>`).join('');
  document.getElementById('hss-modal').classList.add('open');
}
async function submitHarvestSession(e) {
  e.preventDefault();
  const btn = document.getElementById('hss-save-btn');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    await fetch(`${API}/api/harvest-sessions`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        plot_id:     document.getElementById('hss-plot').value,
        start_date:  document.getElementById('hss-start').value,
        expected_kg: document.getElementById('hss-expected').value,
        notes:       document.getElementById('hss-notes').value,
      }),
    });
    closeModal2('hss-modal');
    await reloadHarvest();
  } catch { alert('เกิดข้อผิดพลาด ลองใหม่'); }
  finally  { btn.disabled = false; btn.textContent = 'เปิดรอบ'; }
}

// ── Harvest Entry Modal ───────────────────────────────────
function openHarvestEntryModal(sessionId, plotId) {
  document.getElementById('hen-form').reset();
  document.getElementById('hen-session-id').value = sessionId;
  document.getElementById('hen-plot-id').value    = plotId;
  document.getElementById('hen-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('hen-preview-row').style.display = 'none';
  document.getElementById('hen-modal').classList.add('open');
}
function updateEntryPreview() {
  const kg    = parseFloat(document.getElementById('hen-kg').value)    || 0;
  const price = parseFloat(document.getElementById('hen-price').value) || 0;
  const row   = document.getElementById('hen-preview-row');
  if (kg && price) {
    document.getElementById('hen-preview').textContent = fmt(kg * price) + ' ฿';
    row.style.display = '';
  } else row.style.display = 'none';
}
async function submitHarvestEntry(e) {
  e.preventDefault();
  const btn = document.getElementById('hen-save-btn');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    await fetch(`${API}/api/harvest-entries`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        session_id:  document.getElementById('hen-session-id').value,
        plot_id:     document.getElementById('hen-plot-id').value,
        date:        document.getElementById('hen-date').value,
        kg:          document.getElementById('hen-kg').value,
        price_per_kg:document.getElementById('hen-price').value || 0,
        notes:       document.getElementById('hen-notes').value,
      }),
    });
    closeModal2('hen-modal');
    await reloadHarvest();
  } catch { alert('เกิดข้อผิดพลาด ลองใหม่'); }
  finally  { btn.disabled = false; btn.textContent = 'บันทึก'; }
}

// ── Close Session Modal ───────────────────────────────────
function openCloseSessionModal(sessionId, totalKg, totalRev) {
  document.getElementById('hclose-form').reset();
  document.getElementById('hclose-session-id').value = sessionId;
  document.getElementById('hclose-total-kg').value   = totalKg;
  document.getElementById('hclose-total-rev').value  = totalRev;
  document.getElementById('hclose-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('hclose-summary').textContent =
    `ผลผลิตรวม ${fmt(totalKg)} กก. · รายได้ ${fmt(totalRev)} ฿`;
  document.getElementById('hclose-modal').classList.add('open');
}
async function submitCloseSession(e) {
  e.preventDefault();
  const btn = document.getElementById('hclose-save-btn');
  btn.disabled = true; btn.textContent = 'กำลังปิดรอบ...';
  try {
    const sid = document.getElementById('hclose-session-id').value;
    await fetch(`${API}/api/harvest-sessions/${sid}/close`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        end_date:          document.getElementById('hclose-date').value,
        destination_type:  document.getElementById('hclose-dest-type').value,
        destination_detail:document.getElementById('hclose-dest-detail').value,
        total_kg:          document.getElementById('hclose-total-kg').value,
        total_revenue:     document.getElementById('hclose-total-rev').value,
      }),
    });
    closeModal2('hclose-modal');
    await reloadHarvest();
  } catch { alert('เกิดข้อผิดพลาด ลองใหม่'); }
  finally  { btn.disabled = false; btn.textContent = 'ปิดรอบ'; }
}

async function reloadHarvest() {
  allHarvestSessions = [];
  allHarvestEntries  = [];
  allPlots = await fetch(`${API}/api/plots`).then(r => r.json()).catch(() => allPlots);
  await renderHarvest();
  renderOverview();
  renderPlots();
  populatePlotSelect();
  if (anCurrentPlot) renderAnalysis(anCurrentPlot);
}

// ── Generic modal closer ──────────────────────────────────
function closeModal2(id, e) {
  const el = document.getElementById(id);
  if (!e || e.target === el) el.classList.remove('open');
}

// ---------------------------------------------------------------------------
// Page 4: Season Log
// ---------------------------------------------------------------------------
async function renderSeasonPage() {
  if (!allSeasonLogs.length) {
    try { allSeasonLogs = await fetch(`${API}/api/season-logs`).then(r => r.json()); }
    catch { allSeasonLogs = []; }
  }

  const el = document.getElementById('season-content');
  if (!allPlots.length) {
    el.innerHTML = '<p style="color:#aaa;text-align:center;padding:32px">ยังไม่มีแปลง</p>';
    return;
  }

  el.innerHTML = allPlots.map(p => {
    const logs = allSeasonLogs.filter(l => l.plot_id === p.plot_id);
    const txns = allTransactions.filter(r => r.plot_id === p.plot_id);
    const totalCost = sum(txns, 'รายจ่าย');
    const fertCost  = sum(txns.filter(r => r.category === 'ค่าปุ๋ย'),    'รายจ่าย');
    const pestCost  = sum(txns.filter(r => r.category === 'ค่ายาฆ่าแมลง' || r.category === 'ค่ายา'), 'รายจ่าย');

    const logCards = logs.length
      ? logs.map(l => {
          const rev     = parseFloat(l.yield_kg || 0) * parseFloat(l.price_per_kg || 0);
          const cost    = totalCost;
          const profit  = rev - cost;
          const problems= l.problems ? l.problems.split(',').filter(Boolean)
            .map(pr => `<span class="prob-tag">${pr.trim()}</span>`).join('') : '—';
          return `<div class="sl-card">
            <div class="sl-card-head">
              <strong>${l.season_name}</strong>
              <span style="color:#888;font-size:0.8rem">${l.start_date} → ${l.end_date || 'ปัจจุบัน'}</span>
              <button class="btn-del" onclick="deleteSeasonLog('${l.log_id}')">ลบ</button>
            </div>
            <div class="sl-grid">
              <div class="sl-stat"><div class="sl-stat-l">🌾 ผลผลิต</div><strong>${fmt(l.yield_kg || 0)} กก.</strong></div>
              <div class="sl-stat"><div class="sl-stat-l">💰 รายได้</div><strong class="amt-inc">${fmt(rev)} ฿</strong></div>
              <div class="sl-stat"><div class="sl-stat-l">💊 ต้นทุนปุ๋ย</div><strong>${fmt(l.fertilizer_cost || 0)} ฿</strong></div>
              <div class="sl-stat"><div class="sl-stat-l">🧪 ต้นทุนยา</div><strong>${fmt(l.pesticide_cost || 0)} ฿</strong></div>
              <div class="sl-stat"><div class="sl-stat-l">💧 รดน้ำ</div><strong>${l.water_count || 0} ครั้ง</strong></div>
              <div class="sl-stat"><div class="sl-stat-l">🌧️ ฝนตก</div><strong>${l.rain_count || 0} ครั้ง</strong></div>
            </div>
            <div style="margin-top:8px"><span style="font-size:0.8rem;color:#888">ปัญหาที่พบ: </span>${problems}</div>
            ${l.notes ? `<div class="sl-notes">"${l.notes}"</div>` : ''}
          </div>`;
        }).join('')
      : `<p style="color:#aaa;font-size:0.85rem;padding:12px 0">ยังไม่มีบันทึก กด "เพิ่มบันทึก" เพื่อเริ่มบันทึกฤดูกาลแรก</p>`;

    return `<div class="sl-plot-block">
      <div class="sl-plot-title">🌿 ${p.plot_name} · ${p.crop_type}</div>
      ${logCards}
    </div>`;
  }).join('');
}

function openSeasonLogModal(plotId) {
  document.getElementById('season-form').reset();
  document.getElementById('sl-plot').innerHTML =
    allPlots.map(p => `<option value="${p.plot_id}"${p.plot_id===plotId?' selected':''}>${p.plot_name}</option>`).join('');
  document.querySelectorAll('#sl-problem-tags input').forEach(cb => cb.checked = false);
  document.getElementById('season-modal').classList.add('open');
}

async function submitSeasonLog(e) {
  e.preventDefault();
  const btn = document.getElementById('sl-save-btn');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  const problems = [...document.querySelectorAll('#sl-problem-tags input:checked')]
    .map(cb => cb.value).join(',');
  try {
    await fetch(`${API}/api/season-logs`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        plot_id:       document.getElementById('sl-plot').value,
        season_name:   document.getElementById('sl-name').value,
        start_date:    document.getElementById('sl-start').value,
        end_date:      document.getElementById('sl-end').value,
        fertilizer_cost: document.getElementById('sl-fert').value  || 0,
        pesticide_cost:  document.getElementById('sl-pest').value  || 0,
        water_count:     document.getElementById('sl-water').value || 0,
        rain_count:      document.getElementById('sl-rain').value  || 0,
        problems,
        yield_kg:        document.getElementById('sl-yield').value || 0,
        price_per_kg:    document.getElementById('sl-price').value || 0,
        notes:           document.getElementById('sl-notes').value,
      }),
    });
    closeModal2('season-modal');
    allSeasonLogs = await fetch(`${API}/api/season-logs`).then(r => r.json()).catch(() => []);
    renderAnalysis(anCurrentPlot);
  } catch { alert('เกิดข้อผิดพลาด ลองใหม่'); }
  finally  { btn.disabled = false; btn.textContent = 'บันทึก'; }
}

async function deleteSeasonLog(logId) {
  if (!confirm('ลบบันทึกฤดูกาลนี้?')) return;
  await fetch(`${API}/api/season-logs/${logId}`, { method: 'DELETE' });
  allSeasonLogs = await fetch(`${API}/api/season-logs`).then(r => r.json()).catch(() => []);
  renderAnalysis(anCurrentPlot);
}

// ---------------------------------------------------------------------------
// Page 4: Analysis + Season (merged, per-plot)
// ---------------------------------------------------------------------------
let anCurrentPlot = null;

async function renderAnalysis(plotId) {
  if (!Object.keys(yieldEstimates).length) {
    try { yieldEstimates = await fetch(`${API}/api/yields`).then(r => r.json()); }
    catch { yieldEstimates = {}; }
  }
  if (!allSeasonLogs.length) {
    try { allSeasonLogs = await fetch(`${API}/api/season-logs`).then(r => r.json()); }
    catch { allSeasonLogs = []; }
  }

  const active = activePlots();
  if (!plotId || !active.find(pl => pl.plot_id === plotId))
    plotId = anCurrentPlot && active.find(pl => pl.plot_id === anCurrentPlot)
             ? anCurrentPlot : active[0]?.plot_id;
  if (!plotId) return;
  anCurrentPlot = plotId;

  // Always rebuild buttons so active state and new plots are always correct
  const btnContainer = document.getElementById('an-plot-buttons');
  if (btnContainer) {
    btnContainer.innerHTML = active.map(p =>
      `<button class="an-plot-btn${p.plot_id === plotId ? ' active' : ''}"
               onclick="selectAnPlot('${p.plot_id}')">${p.plot_name}</button>`
    ).join('');
  }

  const container = document.getElementById('analysis-content');
  if (!active.length) {
    container.innerHTML = '<p style="color:#aaa;text-align:center;padding:32px">ยังไม่มีข้อมูลแปลง</p>';
    return;
  }

  const p       = allPlots.find(pl => pl.plot_id === plotId);
  if (!p) return;
  const txns    = allTransactions.filter(r => r.plot_id === plotId);
  const expense = sum(txns, 'รายจ่าย');
  const income  = sum(txns, 'รายรับ');
  const area    = parseFloat(p.area_rai) || 1;
  const { kg: estKg, price: estPrice } = yieldData(plotId);

  // Cost breakdown by category
  const catMap = {};
  txns.filter(r => r.type === 'รายจ่าย').forEach(r => {
    catMap[r.category] = (catMap[r.category] || 0) + parseFloat(r.amount || 0);
  });
  const catBars = Object.entries(catMap).sort((a,b) => b[1]-a[1]).map(([cat, val]) => {
    const pct = expense > 0 ? Math.round(val/expense*100) : 0;
    return `<div class="an-cat-row">
      <span class="an-cat-name">${cat}</span>
      <div class="an-cat-bar-wrap"><div class="an-cat-bar" style="width:${pct}%"></div></div>
      <span class="an-cat-val">${fmt(val)} ฿ (${pct}%)</span>
    </div>`;
  }).join('') || '<p style="color:#aaa;font-size:0.85rem">ยังไม่มีรายจ่าย</p>';

  // Season logs for this plot
  const logs = allSeasonLogs.filter(l => l.plot_id === plotId);
  const logCards = logs.length
    ? logs.map(l => {
        const rev = parseFloat(l.yield_kg||0) * parseFloat(l.price_per_kg||0);
        const problems = l.problems ? l.problems.split(',').filter(Boolean)
          .map(pr => `<span class="prob-tag">${pr.trim()}</span>`).join('') : '—';
        return `<div class="sl-card">
          <div class="sl-card-head">
            <strong>${l.season_name}</strong>
            <span style="color:#888;font-size:0.8rem">${l.start_date}${l.end_date ? ' → '+l.end_date : ' → ปัจจุบัน'}</span>
            <button class="btn-del" onclick="deleteSeasonLog('${l.log_id}')">ลบ</button>
          </div>
          <div class="sl-grid">
            <div class="sl-stat"><div class="sl-stat-l">🌾 ผลผลิต</div><strong>${fmt(l.yield_kg||0)} กก.</strong></div>
            <div class="sl-stat"><div class="sl-stat-l">💰 รายได้</div><strong class="amt-inc">${fmt(rev)} ฿</strong></div>
            <div class="sl-stat"><div class="sl-stat-l">💊 ต้นทุนปุ๋ย</div><strong>${fmt(l.fertilizer_cost||0)} ฿</strong></div>
            <div class="sl-stat"><div class="sl-stat-l">🧪 ต้นทุนยา</div><strong>${fmt(l.pesticide_cost||0)} ฿</strong></div>
            <div class="sl-stat"><div class="sl-stat-l">💧 รดน้ำ</div><strong>${l.water_count||0} ครั้ง</strong></div>
            <div class="sl-stat"><div class="sl-stat-l">🌧️ ฝนตก</div><strong>${l.rain_count||0} ครั้ง</strong></div>
          </div>
          <div style="margin-top:8px"><span style="font-size:0.8rem;color:#888">ปัญหา: </span>${problems}</div>
          ${l.notes ? `<div class="sl-notes">"${l.notes}"</div>` : ''}
        </div>`;
      }).join('')
    : `<p style="color:#aaa;font-size:0.85rem;padding:8px 0">ยังไม่มีบันทึก — กด "➕ เพิ่มบันทึกฤดูกาล" เพื่อเริ่ม</p>`;

  // All transactions for this plot (with notes)
  const txnRows = [...txns].reverse().map(r => {
    const isInc = r.type === 'รายรับ';
    const notes = r.notes || '';
    return `<tr class="${isInc ? 'row-income' : 'row-expense'}">
      <td>${(r.date||'').slice(0,10)}</td>
      <td><span class="type-badge ${isInc?'inc':'exp'}">${isInc?'+ รับ':'− จ่าย'}</span></td>
      <td>${r.category}</td>
      <td class="amt-cell ${isInc?'amt-inc':'amt-exp'}">${isInc?'+':'−'}${fmt(r.amount)} ฿</td>
      <td class="notes-cell">
        ${notes ? `<span class="txn-notes">${notes}</span>` : '<span style="color:#ccc">—</span>'}
        <button class="btn-edit-notes" title="แก้ไขเหตุผล"
          onclick="openNotesModal('${r.id}','${r.category}','${(r.date||'').slice(0,10)}','${notes.replace(/'/g,"\\'")}')">✏️</button>
      </td>
      <td><button class="btn-del" onclick="deleteTxnFromAnalysis('${r.id}')">ลบ</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px">ยังไม่มีรายการ</td></tr>';

  container.innerHTML = `
    <div class="an-plot-header">
      <span class="an-plot-title">🌿 ${p.plot_name} · ${p.crop_type} · ${area} ไร่</span>
      <span class="an-plot-status ${p.status==='เก็บเกี่ยวแล้ว'?'done':'active'}">${p.status||'กำลังปลูก'}</span>
    </div>

    <!-- Section 1: Cost summary -->
    <div class="an-section">
      <div class="an-section-title">💸 ต้นทุนฤดูกาลปัจจุบัน</div>
      <div class="cards" style="margin-bottom:12px">
        <div class="card expense"><div class="label">ต้นทุนรวม</div><div class="value">${fmt(expense)} ฿</div></div>
        <div class="card"><div class="label">ต้นทุน/ไร่</div><div class="value" style="font-size:1rem">${fmt(expense/area)} ฿</div></div>
        <div class="card income"><div class="label">รายรับรวม</div><div class="value">${fmt(income)} ฿</div></div>
      </div>
      <div class="an-section-sub">แยกตามหมวด</div>
      ${catBars}
    </div>

    <!-- Section 2: Yield estimate -->
    <div class="an-section">
      <div class="an-section-title">🌾 ประมาณการผลผลิต & กำไร</div>
      <div class="an-input-row">
        <label>📦 ผลผลิตที่ประเมิน</label>
        <input class="yield-input" type="number" min="0" placeholder="กรอก กก."
               data-plot="${plotId}" data-expense="${expense}"
               value="${estKg||''}" oninput="recalcPlot(this)">
        <span>กก.</span>
      </div>
      <div class="an-input-row">
        <label>💰 ราคาขายที่คาดไว้</label>
        <input class="price-input" type="number" min="0" placeholder="บาท/กก."
               data-plot="${plotId}" data-expense="${expense}" data-est="${estKg}"
               value="${estPrice||''}" oninput="recalcProfit(this)">
        <span>บาท/กก.</span>
      </div>
      <div id="acalc-${plotId}">
        ${(estKg&&estPrice) ? _calcHtml(expense,estKg,estPrice,plotId) : '<p class="an-hint">← กรอกผลผลิต + ราคาเพื่อดูกำไร</p>'}
      </div>
      <button class="btn-save" style="width:100%;margin-top:12px;padding:12px" onclick="saveYieldEstimates()">💾 บันทึกการประเมิน</button>
    </div>

    <!-- Section 3: Transaction detail with notes -->
    <div class="an-section">
      <div class="an-section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>📝 รายละเอียดรายรับ-รายจ่าย</span>
        <button class="btn-add-inline" onclick="openModal('${plotId}')">➕ เพิ่มรายการ</button>
      </div>
      <div class="table-wrap" style="margin-top:10px">
        <table>
          <thead><tr><th>วันที่</th><th>ประเภท</th><th>หมวด</th><th>ยอด</th><th>เหตุผล / บันทึก</th><th></th></tr></thead>
          <tbody>${txnRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Section 4: Season log -->
    <div class="an-section">
      <div class="an-section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>📓 บันทึกฤดูกาล</span>
        <button class="btn-add-inline" onclick="openSeasonLogModal('${plotId}')">➕ เพิ่มบันทึก</button>
      </div>
      ${logCards}
    </div>
  `;
}

function selectAnPlot(plotId) {
  anCurrentPlot = plotId;
  renderAnalysis(plotId);
}

async function deleteTxnFromAnalysis(txnId) {
  if (!confirm('ลบรายการนี้?')) return;
  await fetch(`${API}/api/transactions/${txnId}`, { method: 'DELETE' });
  await loadAll();
  renderOverview();
  renderAnalysis(anCurrentPlot);
}

function _calcHtml(expense, estKg, estPrice, plotId) {
  const breakEven = estKg > 0 ? expense / estKg : 0;
  const revenue   = estKg * estPrice;
  const profit    = revenue - expense;
  return `
    <div class="an-row highlight">
      <span>⚖️ ราคาคุ้มทุน</span><strong>${fmt(breakEven)} บาท/กก.</strong>
    </div>
    <div class="an-row"><span>📈 รายได้ประมาณ</span><strong>${fmt(revenue)} บาท</strong></div>
    <div class="an-row ${profit >= 0 ? 'an-profit' : 'an-loss'}">
      <span>${profit >= 0 ? '✅ กำไรประมาณ' : '❌ ขาดทุนประมาณ'}</span>
      <strong>${profit >= 0 ? '+' : ''}${fmt(profit)} บาท</strong>
    </div>
  `;
}

function recalcPlot(input) {
  const plotId  = input.dataset.plot;
  const expense = parseFloat(input.dataset.expense) || 0;
  const estKg   = parseFloat(input.value) || 0;
  const d = yieldData(plotId);
  yieldEstimates[plotId] = { kg: estKg, price: d.price };
  const priceEl = document.querySelector(`.price-input[data-plot="${plotId}"]`);
  priceEl && (priceEl.dataset.est = estKg);
  const estPrice = d.price;
  document.getElementById(`acalc-${plotId}`).innerHTML =
    (estKg && estPrice) ? _calcHtml(expense, estKg, estPrice, plotId) : '<p class="an-hint">← กรอกผลผลิต + ราคาเพื่อคำนวณ</p>';
}

function recalcProfit(input) {
  const price   = parseFloat(input.value) || 0;
  const expense = parseFloat(input.dataset.expense) || 0;
  const estKg   = parseFloat(input.dataset.est) || 0;
  const plotId  = input.dataset.plot;
  const d = yieldData(plotId);
  yieldEstimates[plotId] = { kg: d.kg || estKg, price };
  document.getElementById(`acalc-${plotId}`).innerHTML =
    (estKg && price) ? _calcHtml(expense, estKg, price, plotId) : '<p class="an-hint">← กรอกผลผลิต + ราคาเพื่อคำนวณ</p>';
}

async function saveYieldEstimates() {
  document.querySelectorAll('.yield-input').forEach(inp => {
    const kg = parseFloat(inp.value);
    const pid = inp.dataset.plot;
    const d = yieldData(pid);
    if (kg > 0) yieldEstimates[pid] = { kg, price: d.price };
    else delete yieldEstimates[pid];
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
function openModal(plotId = null, date = null) {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('txn-form').reset();
  updateCategories();
  populatePlotSelect();
  document.getElementById('f-date').value = date || new Date().toISOString().slice(0, 10);
  if (plotId) document.getElementById('f-plot').value = plotId;
}

function openTxnFromCalendar() {
  closeDayModal();
  openModal(null, currentDayDate);
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
    activePlots().map(p => `<option value="${p.plot_id}">${p.plot_name}</option>`).join('');
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
    date:        document.getElementById('f-date').value,
    notes:       document.getElementById('f-notes').value || '',
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
    const active = document.querySelector('.plot-btn.active');
    if (active) renderPlotDetail(active.dataset.plotId);
    renderCalendar();
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
    const isInc = r.type === 'รายรับ';
    const notes = r.notes || '';
    const tr = document.createElement('tr');
    tr.className = isInc ? 'row-income' : 'row-expense';
    tr.innerHTML = `
      <td>${(r.date || '').slice(0, 10)}</td>
      <td><span class="type-badge ${isInc ? 'inc' : 'exp'}">${isInc ? '+ รับ' : '− จ่าย'}</span></td>
      <td>${r.category}</td>
      <td class="amt-cell ${isInc ? 'amt-inc' : 'amt-exp'}">${isInc ? '+' : '−'}${fmt(r.amount)} ฿</td>
      <td class="notes-cell">
        ${notes ? `<span class="txn-notes">${notes}</span>` : '<span style="color:#ccc">—</span>'}
        <button class="btn-edit-notes" title="แก้ไขเหตุผล"
          onclick="openNotesModal('${r.id}','${r.category}','${(r.date||'').slice(0,10)}','${notes.replace(/'/g,"\\'")}')">✏️</button>
      </td>
      <td><button class="btn-del" onclick="deleteTxn('${r.id}')">ลบ</button></td>
    `;
    tbody.appendChild(tr);
  });
  if (!txns.length)
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px">ยังไม่มีรายการ</td></tr>';
}

function openNotesModal(txnId, category, date, currentNotes) {
  document.getElementById('nm-txn-id').value = txnId;
  document.getElementById('nm-notes').value  = currentNotes || '';
  document.getElementById('nm-info').textContent = `${date} · ${category}`;
  document.getElementById('notes-modal').classList.add('open');
  setTimeout(() => document.getElementById('nm-notes').focus(), 100);
}

async function submitTxnNotes() {
  const btn   = document.getElementById('nm-save-btn');
  const txnId = document.getElementById('nm-txn-id').value;
  const notes = document.getElementById('nm-notes').value;
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    await fetch(`${API}/api/transactions/${txnId}/notes`, {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ notes }),
    });
    // update local state
    const r = allTransactions.find(t => t.id === txnId);
    if (r) r.notes = notes;
    closeModal2('notes-modal');
    // refresh whichever table is visible
    const activePlot = document.querySelector('.plot-btn.active');
    if (activePlot) renderPlotDetail(activePlot.dataset.plotId);
    const anPlot = document.querySelector('.an-plot-btn.active');
    if (anPlot) renderAnalysis(anPlot.dataset.plotId);
  } catch { alert('เกิดข้อผิดพลาด'); }
  finally  { btn.disabled = false; btn.textContent = 'บันทึก'; }
}
