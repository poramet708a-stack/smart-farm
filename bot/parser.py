import re
from bot.sheets import get_summary, get_plots

_TH_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
               'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

HELP_TEXT = (
    "📖 คู่มือการใช้งาน\n"
    "──────────────────\n"
    "📷 ส่งรูปสลิป\n"
    "   → อ่านยอดเงินอัตโนมัติ\n\n"
    "🔢 พิมพ์ยอดเงิน เช่น 500\n"
    "   → เริ่มบันทึกรายการ\n\n"
    "🌱 แปลง\n"
    "   → ดูแปลงที่ปลูกอยู่ทั้งหมด\n\n"
    "📊 สรุป\n"
    "   → ยอดรายรับ-รายจ่ายเดือนนี้\n\n"
    "📊 สรุป [ชื่อแปลง]\n"
    "   → เช่น: สรุป ข้าวหอม A\n\n"
    "❓ คำสั่ง\n"
    "   → แสดงคู่มือนี้"
)


def _fmt_date(date_str: str) -> str:
    """'2026-07-15' → '15 ก.ค. 69'"""
    try:
        y, m, d = date_str.split('-')
        be_yy = str(int(y) + 543)[-2:]
        return f"{int(d)} {_TH_MONTHS[int(m)]} {be_yy}"
    except Exception:
        return date_str


def parse_command(text: str) -> str | None:
    text = text.strip()

    # คำสั่ง / ช่วยด้วย / help
    if text in ('คำสั่ง', 'ช่วยด้วย', 'help', '?', 'คู่มือ'):
        return HELP_TEXT

    # แปลง → รายการแปลงที่ปลูกอยู่
    if text == 'แปลง':
        plots = get_plots()
        if not plots:
            return "🌱 ยังไม่มีแปลงที่ปลูกอยู่ครับ"
        lines = [f"🌱 แปลงที่ปลูกอยู่ ({len(plots)} แปลง)\n──────────────────"]
        for i, p in enumerate(plots, 1):
            harvest = _fmt_date(p['expected_harvest']) if p.get('expected_harvest') else '—'
            resting = ' (หยุดพัก)' if p.get('status') == 'หยุดพัก' else ''
            lines.append(
                f"{i}. {p['plot_name']}{resting}\n"
                f"   {p['crop_type']} · {p['area_rai']} ไร่\n"
                f"   เก็บเกี่ยว {harvest}"
            )
        return '\n\n'.join(lines)

    # สรุป / สรุป แปลงข้าว
    if text.startswith('สรุป'):
        match      = re.search(r'สรุป\s+(\S+)', text)
        plot_name  = match.group(1) if match else None
        data       = get_summary(plot_name)
        label      = plot_name if plot_name else 'ทุกแปลง'
        profit_ico = '✅' if data['profit'] >= 0 else '⚠️'
        return (
            f"📊 สรุปเดือนนี้ — {label}\n"
            f"💰 รายรับ:  {data['income']:>10,.0f} บาท\n"
            f"💸 รายจ่าย: {data['expense']:>10,.0f} บาท\n"
            f"{profit_ico} กำไร:    {data['profit']:>10,.0f} บาท"
        )

    return None
