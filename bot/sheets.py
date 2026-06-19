import os
import logging
from datetime import datetime
from functools import lru_cache
import gspread
from google.oauth2.service_account import Credentials

logger = logging.getLogger(__name__)

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
]

_gc: gspread.Client | None = None


def _client() -> gspread.Client:
    global _gc
    if _gc is None:
        json_content = os.environ.get('GOOGLE_CREDENTIALS_JSON_CONTENT')
        if json_content:
            import json
            info = json.loads(json_content)
            creds = Credentials.from_service_account_info(info, scopes=SCOPES)
        else:
            creds = Credentials.from_service_account_file(
                os.environ['GOOGLE_CREDENTIALS_JSON'], scopes=SCOPES
            )
        _gc = gspread.authorize(creds)
    return _gc


def _sheet(name: str) -> gspread.Worksheet:
    return _client().open_by_key(os.environ['GOOGLE_SHEETS_ID']).worksheet(name)


def _next_id(prefix: str, ws: gspread.Worksheet) -> str:
    count = len(ws.get_all_values())  # includes header row
    return f'{prefix}-{count:04d}'


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

def save_transaction(
    txn_type: str,
    category: str,
    amount: float,
    plot_id: str,
    image_id: str,
    recorded_by: str,
) -> str:
    ws     = _sheet('transactions')
    txn_id = _next_id('TXN', ws)
    now    = datetime.now().strftime('%Y-%m-%d %H:%M')
    ws.append_row([
        txn_id, now, txn_type, category, amount,
        plot_id, '', recorded_by, '', '', 'pending', image_id,
    ])
    logger.info(f'บันทึก {txn_id}: {txn_type} {amount} บาท แปลง {plot_id}')
    return txn_id


def update_transaction_status(txn_id: str, status: str, approved_by: str):
    ws   = _sheet('transactions')
    cell = ws.find(txn_id, in_column=1)
    if not cell:
        logger.warning(f'ไม่พบ {txn_id}')
        return
    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    ws.update_cell(cell.row, 9,  approved_by)
    ws.update_cell(cell.row, 10, now)
    ws.update_cell(cell.row, 11, status)
    logger.info(f'{txn_id} → {status} โดย {approved_by}')


def get_transactions(plot_id: str | None = None) -> list[dict]:
    ws      = _sheet('transactions')
    records = ws.get_all_records()
    if plot_id:
        records = [r for r in records if r.get('plot_id') == plot_id]
    return records


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------

def get_plots() -> list[dict]:
    """แปลงที่ยังปลูกอยู่ (ไม่รวมที่เก็บเกี่ยวแล้ว)"""
    ws      = _sheet('plots')
    records = ws.get_all_records()
    return [r for r in records if r.get('status') != 'เก็บเกี่ยวแล้ว']


def get_all_plots() -> list[dict]:
    return _sheet('plots').get_all_records()


# ---------------------------------------------------------------------------
# Harvest
# ---------------------------------------------------------------------------

def get_harvest() -> list[dict]:
    return _sheet('harvest').get_all_records()


def save_harvest(plot_id: str, quantity_kg: float, price_per_kg: float, buyer: str, notes: str = '') -> str:
    ws         = _sheet('harvest')
    hrv_id     = _next_id('HRV', ws)
    today      = datetime.now().strftime('%Y-%m-%d')
    total      = quantity_kg * price_per_kg
    ws.append_row([hrv_id, plot_id, today, quantity_kg, price_per_kg, total, buyer, notes])
    return hrv_id


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def get_summary(plot_name: str | None = None) -> dict:
    records = get_transactions()
    now     = datetime.now()
    prefix  = now.strftime('%Y-%m')

    approved = [
        r for r in records
        if r.get('status') == 'approved'
        and str(r.get('date', '')).startswith(prefix)
    ]

    if plot_name:
        plots    = get_all_plots()
        plot_map = {p['plot_name']: p['plot_id'] for p in plots}
        pid      = plot_map.get(plot_name)
        approved = [r for r in approved if r.get('plot_id') == pid]

    income  = sum(float(r['amount']) for r in approved if r.get('type') == 'รายรับ')
    expense = sum(float(r['amount']) for r in approved if r.get('type') == 'รายจ่าย')

    return {
        'month':   prefix,
        'income':  income,
        'expense': expense,
        'profit':  income - expense,
    }
