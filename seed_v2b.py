"""
ต่อจาก seed_v2.py — เพิ่ม RICE session + season logs ทั้งหมด
"""
import os, sys
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, os.path.dirname(__file__))

from bot.sheets import (
    create_harvest_session, add_harvest_entry,
    save_season_log,
)

RICE    = 'PLOT-0004'
CASSAVA = 'PLOT-0005'
CORN    = 'PLOT-0006'

print('Harvest session: rice...')
sid_rice = create_harvest_session(RICE, '2026-06-10', expected_kg=6000,
                                  notes='5 rai x 1200 kg/rai estimate')
add_harvest_entry(sid_rice, RICE, '2026-06-10', kg=1100, price_per_kg=14.0,
                  notes='start top section')
add_harvest_entry(sid_rice, RICE, '2026-06-14', kg=1300, price_per_kg=14.0,
                  notes='mid section, good quality')
print('  done -', sid_rice)

print('Season log: corn...')
lid1 = save_season_log(CORN, {
    'season_name':     'ปี 2025-2026 รอบที่ 1',
    'start_date':      '2025-11-01',
    'end_date':        '2026-02-28',
    'fertilizer_cost': 1500,
    'pesticide_cost':  500,
    'water_count':     8,
    'rain_count':      14,
    'problems':        'แมลงศัตรู',
    'yield_kg':        3600,
    'price_per_kg':    6.0,
    'notes':           'ปุ๋ยสูตร 15-15-15 ใช้ 2 ครั้ง ข้าวโพดออกดีปีนี้ เจอเพลี้ยช่วงต้นแต่แก้ได้ทัน ราคาดีกว่าปีก่อน',
})
print(' ', lid1)

print('Season log: rice...')
lid2 = save_season_log(RICE, {
    'season_name':     'ปี 2025-2026 รอบที่ 1',
    'start_date':      '2025-12-01',
    'end_date':        '',
    'fertilizer_cost': 4600,
    'pesticide_cost':  0,
    'water_count':     18,
    'rain_count':      9,
    'problems':        '',
    'yield_kg':        0,
    'price_per_kg':    14.0,
    'notes':           'ต้นข้าวแข็งแรงดี ไม่มีโรคระบาด คาดผลผลิต 1200 กก./ไร่ ราคาตลาดดีมาก',
})
print(' ', lid2)

print('Season log: cassava...')
lid3 = save_season_log(CASSAVA, {
    'season_name':     'ปี 2025-2026 รอบที่ 1',
    'start_date':      '2025-10-01',
    'end_date':        '',
    'fertilizer_cost': 3400,
    'pesticide_cost':  200,
    'water_count':     5,
    'rain_count':      7,
    'problems':        'ภัยแล้ง',
    'yield_kg':        0,
    'price_per_kg':    3.5,
    'notes':           'ดินแห้งมากช่วง มิ.ย. ต้องรดน้ำเพิ่ม คาดเก็บเกี่ยว ต.ค. 2026 ราคามันปีนี้ยังไม่แน่นอน',
})
print(' ', lid3)

print('ALL DONE')
