"""
เพิ่มข้อมูลตัวอย่าง harvest sessions + season log
รันด้วย:  ! python seed_v2.py
"""
import os, sys
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, os.path.dirname(__file__))

from bot.sheets import (
    create_harvest_session, close_harvest_session,
    add_harvest_entry, save_season_log,
    _ensure_sheet, _HSS_HDR, _HEN_HDR, _SL_HDR,
)

# Plot IDs จาก seed.py รอบแรก
RICE     = 'PLOT-0004'   # แปลงข้าวหอม A
CASSAVA  = 'PLOT-0005'   # แปลงมันสำปะหลัง B
CORN     = 'PLOT-0006'   # แปลงข้าวโพด C

print('=== Harvest Sessions ===')

# 1) แปลงข้าวโพด C — เสร็จแล้ว
sid_corn = create_harvest_session(CORN, '2026-02-10', expected_kg=4000,
                                  notes='เริ่มเก็บหลังข้าวโพดแห้งดี')
print(f'  {sid_corn}: แปลงข้าวโพด (open)')

add_harvest_entry(sid_corn, CORN, '2026-02-10', kg=1200, price_per_kg=6.0, notes='ล็อตแรก คุณภาพดี')
add_harvest_entry(sid_corn, CORN, '2026-02-15', kg=1500, price_per_kg=6.0, notes='')
add_harvest_entry(sid_corn, CORN, '2026-02-22', kg=900,  price_per_kg=6.0, notes='ล็อตสุดท้าย')
print(f'    3 รอบเก็บ รวม 3,600 กก.')

close_harvest_session(
    sid_corn,
    end_date='2026-02-25',
    destination_type='ส่งโรงงาน',
    destination_detail='โรงงานแปรรูปนครราชสีมา',
    total_kg=3600.0,
    total_revenue=21600.0,
)
print(f'    ปิดแล้ว → ส่งโรงงานนครราชสีมา')

# 2) แปลงข้าวหอม A — กำลังเก็บ 2 รอบแล้ว (อีก ~2 เดือนเสร็จ)
sid_rice = create_harvest_session(RICE, '2026-06-10', expected_kg=6000,
                                  notes='คาด 5 ไร่ x 1,200 กก./ไร่')
print(f'\n  {sid_rice}: แปลงข้าวหอม A (กำลังเก็บ)')

add_harvest_entry(sid_rice, RICE, '2026-06-10', kg=1100, price_per_kg=14.0, notes='เริ่มเก็บแปลงตอนบน')
add_harvest_entry(sid_rice, RICE, '2026-06-14', kg=1300, price_per_kg=14.0, notes='แปลงกลาง ข้าวสวยมาก')
print(f'    2 รอบเก็บ รวม 2,400 กก. (40%) — ยังเปิดอยู่')

# 3) แปลงมันสำปะหลัง B — ยังไม่เริ่มเก็บ ยังไม่มี session

print('\n=== Season Logs ===')

# แปลงข้าวโพด C — เสร็จสิ้นแล้ว
lid1 = save_season_log(CORN, {
    'season_name':     'ปี 2565-2569 รอบที่ 1',
    'start_date':      '2025-11-01',
    'end_date':        '2026-02-28',
    'fertilizer_cost': 1500,
    'pesticide_cost':  500,
    'water_count':     8,
    'rain_count':      14,
    'problems':        'แมลงศัตรู',
    'yield_kg':        3600,
    'price_per_kg':    6.0,
    'notes':           'ปุ๋ยสูตร 15-15-15 ใช้ 2 ครั้ง ข้าวโพดออกดีปีนี้ เจอเพลี้ยช่วงต้นแต่แก้ได้ทัน ราคาค่อนข้างดีกว่าปีก่อน',
})
print(f'  {lid1}: แปลงข้าวโพด — ปี 2025-2026 รอบ 1 (จบแล้ว)')

# แปลงข้าวหอม A — อยู่ระหว่างดำเนินการ
lid2 = save_season_log(RICE, {
    'season_name':     'ปี 2568-2569 รอบที่ 1',
    'start_date':      '2025-12-01',
    'end_date':        '',
    'fertilizer_cost': 4600,
    'pesticide_cost':  0,
    'water_count':     18,
    'rain_count':      9,
    'problems':        '',
    'yield_kg':        0,
    'price_per_kg':    14.0,
    'notes':           'ต้นข้าวแข็งแรงดี ไม่มีโรคระบาด คาดผลผลิต ~1,200 กก./ไร่ ราคาตลาดดีมาก',
})
print(f'  {lid2}: แปลงข้าวหอม A — ปี 2025-2026 (กำลังดำเนินการ)')

# แปลงมันสำปะหลัง B — อยู่ระหว่างดำเนินการ
lid3 = save_season_log(CASSAVA, {
    'season_name':     'ปี 2568-2569 รอบที่ 1',
    'start_date':      '2025-10-01',
    'end_date':        '',
    'fertilizer_cost': 3400,
    'pesticide_cost':  200,
    'water_count':     5,
    'rain_count':      7,
    'problems':        'ภัยแล้ง',
    'yield_kg':        0,
    'price_per_kg':    3.5,
    'notes':           'ดินแห้งมากช่วงมิ.ย. ต้องรดน้ำเพิ่ม คาดเก็บเกี่ยวได้ประมาณ ต.ค. 2026 ราคามันปีนี้ยังไม่แน่นอน',
})
print(f'  {lid3}: แปลงมันสำปะหลัง B — ปี 2025-2026 (กำลังดำเนินการ)')

print('\nเสร็จแล้ว! เปิดเว็บดูได้เลยครับ')
