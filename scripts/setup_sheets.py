"""
สร้าง Google Sheets structure ครั้งแรก
รัน: python scripts/setup_sheets.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import gspread
from google.oauth2.service_account import Credentials

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
]

SHEETS = {
    'transactions': [
        'id', 'date', 'type', 'category', 'amount',
        'plot_id', 'description', 'recorded_by',
    ],
    'plots': [
        'plot_id', 'plot_name', 'crop_type', 'area_rai',
        'start_date', 'expected_harvest', 'status', 'notes',
    ],
    'harvest': [
        'harvest_id', 'plot_id', 'harvest_date', 'quantity_kg',
        'price_per_kg', 'total_revenue', 'buyer', 'notes',
    ],
    'problems': [
        'problem_id', 'date', 'plot_id', 'problem_type',
        'description', 'image_url', 'solution', 'reported_by',
    ],
}

SAMPLE_PLOTS = [
    ['PLOT-0001', 'แปลงข้าว A',     'ข้าว',           5, '2026-05-01', '2026-09-01', 'กำลังปลูก', ''],
    ['PLOT-0002', 'แปลงมัน B',      'มันสำปะหลัง',    8, '2026-04-01', '2026-10-01', 'กำลังปลูก', ''],
    ['PLOT-0003', 'แปลงข้าวโพด C',  'ข้าวโพด',        3, '2026-06-01', '2026-09-01', 'กำลังปลูก', ''],
]


def main():
    print('🌾 Farm Manager — ตั้งค่า Google Sheets\n')

    creds = Credentials.from_service_account_file(
        os.environ['GOOGLE_CREDENTIALS_JSON'], scopes=SCOPES
    )
    gc          = gspread.authorize(creds)
    spreadsheet = gc.open_by_key(os.environ['GOOGLE_SHEETS_ID'])
    existing    = {ws.title for ws in spreadsheet.worksheets()}

    for sheet_name, headers in SHEETS.items():
        if sheet_name in existing:
            print(f'  ⏭️  ข้าม {sheet_name} (มีอยู่แล้ว)')
            continue
        ws = spreadsheet.add_worksheet(title=sheet_name, rows=1000, cols=len(headers))
        ws.append_row(headers)
        print(f'  ✅ สร้าง sheet: {sheet_name}')

        if sheet_name == 'plots':
            for row in SAMPLE_PLOTS:
                ws.append_row(row)
            print(f'     เพิ่มแปลงตัวอย่าง {len(SAMPLE_PLOTS)} แปลง')

    print('\n✅ เสร็จแล้วครับ! เปิด Google Sheet ตรวจสอบได้เลย')


if __name__ == '__main__':
    main()
