"""
ทดสอบ bot โดยไม่ต้องใช้ LINE จริง
รัน: python scripts/test_bot.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from bot.sheets import get_plots, save_transaction, get_summary, update_transaction_status


def test_sheets_connection():
    print('=== ทดสอบ Google Sheets ===')
    plots = get_plots()
    print(f'แปลงที่กำลังปลูก: {len(plots)} แปลง')
    for p in plots:
        print(f'  {p["plot_id"]}: {p["plot_name"]} ({p["crop_type"]}, {p["area_rai"]} ไร่)')


def test_save_transaction():
    print('\n=== ทดสอบบันทึกรายการ ===')
    plots = get_plots()
    if not plots:
        print('ไม่มีแปลง — รัน setup_sheets.py ก่อนครับ')
        return

    txn_id = save_transaction(
        txn_type    = 'รายจ่าย',
        category    = 'ค่าปุ๋ย',
        amount      = 1200,
        plot_id     = plots[0]['plot_id'],
        image_id    = 'test-image-id',
        recorded_by = 'ทดสอบ',
    )
    print(f'บันทึกแล้ว: {txn_id}')

    update_transaction_status(txn_id, 'approved', 'ผู้อนุมัติทดสอบ')
    print(f'อนุมัติแล้ว: {txn_id}')

    return txn_id


def test_summary():
    print('\n=== ทดสอบสรุป ===')
    data = get_summary()
    print(f'เดือน {data["month"]}:')
    print(f'  รายรับ:  {data["income"]:,.0f} บาท')
    print(f'  รายจ่าย: {data["expense"]:,.0f} บาท')
    print(f'  กำไร:   {data["profit"]:,.0f} บาท')


if __name__ == '__main__':
    test_sheets_connection()
    test_save_transaction()
    test_summary()
    print('\n✅ ทดสอบเสร็จแล้วครับ')
