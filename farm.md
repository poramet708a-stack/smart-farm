# 🌾 Farm Manager — Thai Farmer Expense Tracker

## Project Overview
ระบบบันทึกรายรับรายจ่ายสำหรับเกษตรกรไทย โดยใช้ LINE Group เป็นช่องทางรับข้อมูล
และ Google Sheets เป็นฐานข้อมูล พร้อม Web Dashboard สำหรับวิเคราะห์ข้อมูลแยกตามแปลง

---

## Architecture

```
LINE Group (User Input)
    │
    ├── ส่งรูปใบเสร็จ / พิมพ์ข้อความ
    │
    ▼
LINE Webhook Server (Python + Flask)
    │
    ├── OCR ด้วย Google Vision API (ฟรี 1,000 รูป/เดือน)
    ├── Parse ข้อมูล: ยอดเงิน, หมวดหมู่, แปลง, ผู้บันทึก
    ├── รอการอนุมัติจากผู้อนุมัติในกลุ่ม
    │
    ▼
Google Sheets (Database)
    │
    ├── Sheet: transactions
    ├── Sheet: plots (แปลงเกษตร)
    ├── Sheet: harvest (การเก็บเกี่ยว)
    └── Sheet: problems (ปัญหาที่พบ)
    │
    ▼
Web Dashboard (HTML + JS, ดึงข้อมูลจาก Sheets API)
    └── วิเคราะห์ต้นทุน / กำไร / timeline แยกตามแปลง
```

---

## Tech Stack

| ส่วน | เทคโนโลยี | ค่าใช้จ่าย |
|------|-----------|-----------|
| LINE Bot | LINE Messaging API | ฟรี |
| Server | Python + Flask | ฟรี |
| Hosting | Railway หรือ Render | ฟรี (free tier) |
| OCR | Google Vision API | ฟรี 1,000 รูป/เดือน |
| Database | Google Sheets API | ฟรี |
| Dashboard | HTML + Chart.js | ฟรี |

**ค่าใช้จ่ายรวม: ฟรี 100%** สำหรับการใช้งานระดับครอบครัว/ฟาร์มขนาดเล็ก

---

## User Roles

### 👨‍🌾 Role 1: ผู้บันทึก (Recorder)
- ส่งรูปใบเสร็จในกลุ่ม LINE
- ระบุว่าซื้ออะไร สำหรับแปลงไหน
- รอการอนุมัติ

### 👨‍💼 Role 2: ผู้อนุมัติ (Approver)
- เห็นรายการที่ส่งเข้ามา
- กดปุ่ม ✅ อนุมัติ หรือ ❌ ไม่อนุมัติ
- ระบบบันทึกชื่อผู้อนุมัติ + เวลาอัตโนมัติ

---

## LINE Bot Commands

### Flow หลัก — ส่งรูปใบเสร็จ (Quick Reply ทั้งหมด ไม่ต้องพิมพ์)

```
1. ผู้ใช้ส่งรูปใบเสร็จ
       ↓
2. Bot วิเคราะห์รูป (OCR) แล้วตอบ:
   "📄 อ่านได้ยอด 1,200 บาท
    รายการนี้คืออะไรครับ?"
   [Quick Reply]  💸 รายจ่าย  |  💰 รายรับ
       ↓
3ก. ถ้า รายจ่าย → Bot ถาม:
    "หมวดหมู่รายจ่าย?"
    [Quick Reply]  🌿 ค่าปุ๋ย  |  🌾 ค่าเมล็ด  |  ⛽ ค่าน้ำมัน
                   🔧 ค่าซ่อม  |  👷 ค่าแรง    |  📦 อื่นๆ
       ↓
3ข. ถ้า รายรับ → Bot ถาม:
    "ขายอะไรครับ?"
    [Quick Reply]  🌾 ขายข้าว  |  🥔 ขายมัน  |  🌽 ขายข้าวโพด  |  💵 อื่นๆ
       ↓
4. Bot ถาม:
   "แปลงไหนครับ?"
   [Quick Reply]  แปลงข้าว A  |  แปลงมัน B  |  แปลงข้าวโพด C
       ↓
5. Bot สรุปให้ตรวจสอบ:
   "✅ รายจ่าย 1,200 บาท
    หมวด: ค่าปุ๋ย
    แปลง: แปลงข้าว A
    บันทึกเลยไหมครับ?"
   [Quick Reply]  ✅ ยืนยัน  |  ❌ ยกเลิก
       ↓
6. Bot ส่งให้ผู้อนุมัติ รอกด ✅/❌
```

> **หมายเหตุ:** ถ้า OCR อ่านยอดไม่ได้ → Bot จะถาม "ยอดเงินเท่าไหร่ครับ?" ให้พิมพ์ตัวเลขอย่างเดียว

---

### คำสั่งพิมพ์ (สำหรับคนที่สะดวกพิมพ์)
```
"สรุป"          → สรุปเดือนนี้ทุกแปลง
"สรุป แปลงข้าว" → สรุปเฉพาะแปลงข้าว
"ปัญหา [รูป]"   → บันทึกปัญหาพร้อมรูป (แล้ว bot ถามแปลงผ่าน Quick Reply)
"เก็บเกี่ยว"   → บันทึกการเก็บเกี่ยว (bot ถามแปลง + ปริมาณ)
"แปลง"         → ดูรายชื่อแปลงทั้งหมด
```

---

## Google Sheets Structure

### Sheet 1: `transactions`
| คอลัมน์ | ประเภท | ตัวอย่าง |
|---------|--------|---------|
| id | auto | TXN-001 |
| date | datetime | 2026-06-19 14:30 |
| type | string | รายจ่าย / รายรับ |
| category | string | ปุ๋ย / ยาฆ่าแมลง / ค่าแรง / ขายผลผลิต |
| amount | number | 1200 |
| plot_id | string | PLOT-001 |
| description | string | ปุ๋ยยูเรีย 2 กระสอบ |
| recorded_by | string | สมชาย |
| approved_by | string | นายทุน |
| approved_at | datetime | 2026-06-19 15:00 |
| status | string | pending / approved / rejected |
| image_url | string | https://... |

### Sheet 2: `plots`
| คอลัมน์ | ประเภท | ตัวอย่าง |
|---------|--------|---------|
| plot_id | auto | PLOT-001 |
| plot_name | string | นาข้าวแปลง A |
| crop_type | string | ข้าว / มันสำปะหลัง / ข้าวโพด |
| area_rai | number | 5 |
| start_date | date | 2026-05-01 |
| expected_harvest | date | 2026-09-01 |
| status | string | กำลังปลูก / เก็บเกี่ยวแล้ว |
| notes | string | - |

### Sheet 3: `harvest`
| คอลัมน์ | ประเภท | ตัวอย่าง |
|---------|--------|---------|
| harvest_id | auto | HRV-001 |
| plot_id | string | PLOT-001 |
| harvest_date | date | 2026-09-15 |
| quantity_kg | number | 3000 |
| price_per_kg | number | 8 |
| total_revenue | number | 24000 |
| buyer | string | โรงสีนายสมศักดิ์ |
| notes | string | - |

### Sheet 4: `problems`
| คอลัมน์ | ประเภท | ตัวอย่าง |
|---------|--------|---------|
| problem_id | auto | PRB-001 |
| date | datetime | 2026-07-10 |
| plot_id | string | PLOT-001 |
| problem_type | string | โรคพืช / แมลง / น้ำท่วม / แล้ง |
| description | string | เพลี้ยกระโดด |
| image_url | string | https://... |
| solution | string | พ่นยา xxx |
| reported_by | string | สมชาย |

---

## Project Structure

```
farm-manager/
├── CLAUDE.md                 ← ไฟล์นี้
├── requirements.txt
├── .env.example
├── .env                      ← ห้าม commit!
│
├── bot/
│   ├── app.py               ← Flask server + LINE webhook
│   ├── line_handler.py      ← จัดการ event จาก LINE
│   ├── ocr.py               ← Google Vision API
│   ├── parser.py            ← parse ข้อความเกษตรกร
│   └── sheets.py            ← Google Sheets API
│
├── dashboard/
│   ├── index.html           ← Web Dashboard หน้าหลัก
│   ├── style.css
│   └── app.js               ← ดึงข้อมูลจาก Sheets + Chart.js
│
└── scripts/
    ├── setup_sheets.py      ← สร้าง Sheets structure ครั้งแรก
    └── test_bot.py          ← ทดสอบโดยไม่ต้องใช้ LINE จริง
```

---

## Environment Variables (.env)

```env
# LINE
LINE_CHANNEL_SECRET=xxx
LINE_CHANNEL_ACCESS_TOKEN=xxx
LINE_APPROVER_USER_ID=xxx        # LINE user ID ของผู้อนุมัติ

# Google
GOOGLE_SHEETS_ID=xxx             # ID ของ Google Sheet
GOOGLE_CREDENTIALS_JSON=xxx      # path ไปยัง credentials.json

# Server
PORT=8000
```

---

## Build Order (ให้ Claude Code ทำตามลำดับนี้)

### Phase 1 — Setup & Infrastructure
1. สร้าง `requirements.txt` (flask, line-bot-sdk, google-cloud-vision, gspread)
2. สร้าง `scripts/setup_sheets.py` — สร้าง Sheets พร้อม header ทั้ง 4 sheets
3. ทดสอบ connection กับ Google Sheets

### Phase 2 — LINE Webhook
4. สร้าง `bot/app.py` — Flask server รับ webhook จาก LINE
5. สร้าง `bot/line_handler.py` — จัดการ text message และ image message
6. สร้าง approval flow — ส่ง Quick Reply ให้ผู้อนุมัติ

### Phase 3 — OCR & Parsing
7. สร้าง `bot/ocr.py` — ส่งรูปไป Google Vision API, ดึงยอดเงิน
8. สร้าง `bot/parser.py` — parse ข้อความภาษาไทย เช่น "จ่าย 1200 ค่าปุ๋ย แปลงข้าว"
9. สร้าง `bot/sheets.py` — บันทึก/ดึงข้อมูลจาก Google Sheets

### Phase 4 — Dashboard
10. สร้าง `dashboard/index.html` + `app.js`
11. หน้า Overview: รายรับ/รายจ่าย/กำไรรวม
12. หน้า Per Plot: ต้นทุนต่อไร่, timeline, ปัญหา
13. หน้า Harvest: บันทึกการขาย, เปรียบเทียบกำไร

### Phase 5 — Deploy
14. Deploy บน Railway หรือ Render (free tier)
15. ตั้ง webhook URL ใน LINE Developer Console
16. ทดสอบ end-to-end

---

## Dashboard Features

### หน้า 1: ภาพรวม (Overview)
- กราฟรายรับ vs รายจ่าย รายเดือน
- กำไร/ขาดทุนสะสม
- แปลงที่ใช้เงินมากที่สุด

### หน้า 2: รายแปลง (Per Plot)
- ต้นทุนรวม แยกหมวดหมู่ (ปุ๋ย/ยา/แรงงาน/อื่นๆ)
- ต้นทุนต่อไร่
- Timeline: วันปลูก → วันเก็บเกี่ยว (กี่วัน)
- รายการปัญหาที่เคยเกิด

### หน้า 3: การเก็บเกี่ยว (Harvest)
- รายได้จากการขาย
- กำไรสุทธิ = รายได้ - ต้นทุน
- เปรียบเทียบระหว่างรอบปลูก

### หน้า 4: วิเคราะห์ (Analysis) — เกษตรกรกรอกเอง
- ประมาณการผลผลิตขั้นต่ำ (กก.) ที่จะคุ้มทุน
- ราคาขายขั้นต่ำที่ต้องได้
- คำนวณ break-even อัตโนมัติ

---

## Notes สำหรับ Claude Code

- ใช้ภาษาไทยในทุก bot response
- LINE Quick Reply ปุ่มต้องกดง่าย ไม่เกิน 3 ปุ่มต่อครั้ง
- หมวดหมู่รายจ่ายเริ่มต้น: ปุ๋ย, ยาฆ่าแมลง, เมล็ดพันธุ์, ค่าแรง, น้ำมัน, อื่นๆ
- หมวดหมู่รายรับ: ขายข้าว, ขายมัน, ขายข้าวโพด, อื่นๆ
- แปลงต้องเพิ่มได้ไม่จำกัด (ยืดหยุ่น)
- Error handling ทุกจุด — ถ้า OCR อ่านไม่ได้ให้ถามผู้ใช้แทน
- Log ทุก transaction ไว้ด้วยเสมอ
