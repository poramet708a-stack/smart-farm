import re
from bot.sheets import get_summary


def parse_command(text: str) -> str | None:
    text = text.strip()

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
