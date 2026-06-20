import os
import logging
from linebot.v3.messaging import (
    MessagingApi, ReplyMessageRequest, PushMessageRequest,
    TextMessage, QuickReply, QuickReplyItem,
    MessageAction, PostbackAction,
)
from linebot.v3.webhooks import TextMessageContent, ImageMessageContent

from bot.ocr import extract_amount_from_image
from bot.sheets import save_transaction, get_plots, update_transaction_status
from bot.parser import parse_command

logger = logging.getLogger(__name__)

APPROVER_USER_ID = os.environ.get('LINE_APPROVER_USER_ID', '')

# In-memory conversation state per user_id
user_states: dict[str, dict] = {}

EXPENSE_CATEGORIES = ['ค่าปุ๋ย', 'ค่ายา', 'ค่าเมล็ด', 'ค่าน้ำมัน', 'ค่าซ่อม', 'ค่าแรง', 'อื่นๆ']
INCOME_CATEGORIES  = ['ขายข้าว', 'ขายมัน', 'ขายข้าวโพด', 'อื่นๆ']
ALL_CATEGORIES     = EXPENSE_CATEGORIES + INCOME_CATEGORIES


def _qr(*labels: str) -> QuickReply:
    items = [QuickReplyItem(action=MessageAction(label=l[:20], text=l)) for l in labels]
    return QuickReply(items=items)


def _reply(api: MessagingApi, reply_token: str, text: str, qr: QuickReply | None = None):
    api.reply_message(ReplyMessageRequest(
        reply_token=reply_token,
        messages=[TextMessage(text=text, quick_reply=qr)],
    ))


def _get_source_id(event) -> str:
    """ได้ group_id ถ้าอยู่ในกลุ่ม หรือ user_id ถ้าแชทส่วนตัว"""
    source = event.source
    if hasattr(source, 'group_id') and source.group_id:
        return source.group_id
    if hasattr(source, 'room_id') and source.room_id:
        return source.room_id
    return source.user_id


def handle_message(event, api: MessagingApi):
    user_id   = event.source.user_id
    source_id = _get_source_id(event)
    token     = event.reply_token

    if isinstance(event.message, ImageMessageContent):
        _handle_image(event, api, user_id, source_id, token)
    elif isinstance(event.message, TextMessageContent):
        _handle_text(event, api, user_id, source_id, token, event.message.text.strip())


# ---------------------------------------------------------------------------
# Image flow
# ---------------------------------------------------------------------------

def _handle_image(event, api: MessagingApi, user_id: str, source_id: str, token: str):
    image_id = event.message.id
    _reply(api, token, "📷 กำลังอ่านรูปอยู่นะครับ รอแป๊บนึง...")

    amount = extract_amount_from_image(image_id)

    if amount is not None:
        user_states[user_id] = {'step': 'waiting_type', 'amount': amount, 'image_id': image_id}
        _push(api, source_id,
              f"📄 อ่านได้ยอด {amount:,.0f} บาทครับ\nรายการนี้คืออะไรครับ?",
              _qr('💸 รายจ่าย', '💰 รายรับ'))
    else:
        user_states[user_id] = {'step': 'waiting_amount', 'amount': None, 'image_id': image_id}
        _push(api, source_id,
              "📄 อ่านรูปได้แล้วครับ แต่หายอดเงินไม่เจอ\nพิมพ์ตัวเลขยอดเงินได้เลยครับ เช่น 1200")


def _push(api: MessagingApi, user_id: str, text: str, qr: QuickReply | None = None):
    api.push_message(PushMessageRequest(
        to=user_id,
        messages=[TextMessage(text=text, quick_reply=qr)],
    ))


# ---------------------------------------------------------------------------
# Text / state machine
# ---------------------------------------------------------------------------

def _handle_text(event, api: MessagingApi, user_id: str, source_id: str, token: str, text: str):
    state = user_states.get(user_id, {})
    step  = state.get('step')

    # Step: ให้พิมพ์ยอดเงิน (OCR ไม่ได้)
    if step == 'waiting_amount':
        cleaned = text.replace(',', '').replace(' ', '')
        try:
            amount = float(cleaned)
            state.update({'amount': amount, 'step': 'waiting_type'})
            user_states[user_id] = state
            _reply(api, token,
                   f"รับทราบ {amount:,.0f} บาทครับ\nรายการนี้คืออะไรครับ?",
                   _qr('💸 รายจ่าย', '💰 รายรับ'))
        except ValueError:
            _reply(api, token, "พิมพ์เป็นตัวเลขเท่านั้นนะครับ เช่น 1200")
        return

    # Step: รายรับ หรือ รายจ่าย
    if step == 'waiting_type':
        if 'รายจ่าย' in text:
            state.update({'type': 'รายจ่าย', 'step': 'waiting_category'})
            user_states[user_id] = state
            _reply(api, token, "หมวดหมู่รายจ่ายครับ?", _qr(*EXPENSE_CATEGORIES))
        elif 'รายรับ' in text:
            state.update({'type': 'รายรับ', 'step': 'waiting_category'})
            user_states[user_id] = state
            _reply(api, token, "ขายอะไรครับ?", _qr(*INCOME_CATEGORIES))
        else:
            _reply(api, token, "เลือกได้เลยครับ", _qr('💸 รายจ่าย', '💰 รายรับ'))
        return

    # Step: หมวดหมู่
    if step == 'waiting_category':
        if text in ALL_CATEGORIES:
            state.update({'category': text, 'step': 'waiting_plot'})
            user_states[user_id] = state
            plots = get_plots()
            plot_labels = [p['plot_name'] for p in plots][:13]
            _reply(api, token, "แปลงไหนครับ?", _qr(*plot_labels))
        else:
            cats = EXPENSE_CATEGORIES if state.get('type') == 'รายจ่าย' else INCOME_CATEGORIES
            _reply(api, token, "เลือกจากปุ่มได้เลยครับ", _qr(*cats))
        return

    # Step: เลือกแปลง
    if step == 'waiting_plot':
        plots   = get_plots()
        matched = next((p for p in plots if p['plot_name'] == text), None)
        if matched:
            state.update({
                'plot_id':   matched['plot_id'],
                'plot_name': matched['plot_name'],
                'step':      'waiting_confirm',
            })
            user_states[user_id] = state
            emoji = '💸' if state['type'] == 'รายจ่าย' else '💰'
            summary = (
                f"{emoji} {state['type']} {state['amount']:,.0f} บาท\n"
                f"หมวด: {state['category']}\n"
                f"แปลง: {state['plot_name']}\n\n"
                f"บันทึกเลยไหมครับ?"
            )
            _reply(api, token, summary, _qr('✅ ยืนยัน', '❌ ยกเลิก'))
        else:
            plots  = get_plots()
            labels = [p['plot_name'] for p in plots]
            _reply(api, token, "เลือกแปลงจากปุ่มได้เลยครับ", _qr(*labels))
        return

    # Step: เลือกแปลงสำหรับสรุป
    if step == 'waiting_summary_plot':
        plots = get_plots()
        if text in ('📊 ทุกแปลง', 'ทุกแปลง'):
            user_states.pop(user_id, None)
            _reply(api, token, _format_summary())
        else:
            matched = next((p for p in plots if p['plot_name'] == text), None)
            if matched:
                user_states.pop(user_id, None)
                _reply(api, token, _format_summary(matched['plot_name']))
            else:
                _reply(api, token, "เลือกแปลงที่ต้องการสรุปครับ",
                       _qr('📊 ทุกแปลง', *[p['plot_name'] for p in plots][:12]))
        return

    # Step: ยืนยัน / ยกเลิก
    if step == 'waiting_confirm':
        if 'ยืนยัน' in text:
            recorder = _get_display_name(api, user_id)
            txn_id = save_transaction(
                txn_type    = state['type'],
                category    = state['category'],
                amount      = state['amount'],
                plot_id     = state['plot_id'],
                image_id    = state.get('image_id', ''),
                recorded_by = recorder,
            )
            user_states.pop(user_id, None)
            _reply(api, token, f"✅ บันทึกแล้วครับ ({txn_id})")
        elif 'ยกเลิก' in text:
            user_states.pop(user_id, None)
            _reply(api, token, "❌ ยกเลิกแล้วครับ")
        else:
            _reply(api, token, "เลือกได้เลยครับ", _qr('✅ ยืนยัน', '❌ ยกเลิก'))
        return

    # สรุป (ไม่มีชื่อแปลง) → แสดงตัวเลือก
    if text == 'สรุป':
        plots = get_plots()
        user_states[user_id] = {'step': 'waiting_summary_plot'}
        _reply(api, token, "สรุปอะไรดีครับ?",
               _qr('📊 ทุกแปลง', *[p['plot_name'] for p in plots][:12]))
        return

    # ไม่มี state — ลอง parse คำสั่งปกติ
    result = parse_command(text)
    if result:
        _reply(api, token, result)
        return

    # พิมพ์ตัวเลขหรือ "จ่าย/รับ ตัวเลข" เพื่อเริ่ม flow
    amount = _parse_amount_from_text(text)
    if amount:
        user_states[user_id] = {'step': 'waiting_type', 'amount': amount, 'image_id': ''}
        _reply(api, token,
               f"รับทราบ {amount:,.0f} บาทครับ\nรายการนี้คืออะไรครับ?",
               _qr('💸 รายจ่าย', '💰 รายรับ'))
        return

    _reply(api, token,
           "ส่งรูปใบเสร็จ หรือพิมพ์จำนวนเงิน เช่น 500\n"
           "พิมพ์ 'คำสั่ง' เพื่อดูคู่มือการใช้งานครับ")


# ---------------------------------------------------------------------------
# Postback (อนุมัติ / ไม่อนุมัติ)
# ---------------------------------------------------------------------------

def handle_postback(event, api: MessagingApi):
    token = event.reply_token
    try:
        data   = dict(item.split('=', 1) for item in event.postback.data.split('&'))
        action = data.get('action')
        txn_id = data.get('txn_id')
    except Exception:
        return

    if not txn_id:
        return

    approver = _get_display_name(api, event.source.user_id)

    if action == 'approve':
        update_transaction_status(txn_id, 'approved', approver)
        _reply(api, token, f"✅ อนุมัติ {txn_id} แล้วครับ")
    elif action == 'reject':
        update_transaction_status(txn_id, 'rejected', approver)
        _reply(api, token, f"❌ ไม่อนุมัติ {txn_id} แล้วครับ")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _format_summary(plot_name: str | None = None) -> str:
    from bot.sheets import get_summary
    data  = get_summary(plot_name)
    label = plot_name if plot_name else 'ทุกแปลง'
    ico   = '✅' if data['profit'] >= 0 else '⚠️'
    return (
        f"📊 สรุปเดือนนี้ — {label}\n"
        f"💰 รายรับ:  {data['income']:>10,.0f} บาท\n"
        f"💸 รายจ่าย: {data['expense']:>10,.0f} บาท\n"
        f"{ico} กำไร:    {data['profit']:>10,.0f} บาท"
    )


def _parse_amount_from_text(text: str) -> float | None:
    import re
    cleaned = re.sub(r'[จ่ายรับโอนซื้อขาย\s]', '', text).replace(',', '')
    try:
        val = float(cleaned)
        return val if 1 <= val <= 9_999_999 else None
    except ValueError:
        return None


def _get_display_name(api: MessagingApi, user_id: str) -> str:
    try:
        return api.get_profile(user_id).display_name
    except Exception:
        return user_id


def _notify_approver(api: MessagingApi, txn_id: str, state: dict, recorder: str):
    if not APPROVER_USER_ID:
        logger.warning('LINE_APPROVER_USER_ID ไม่ได้ตั้งค่า — ข้ามการแจ้งเตือนผู้อนุมัติ')
        return

    emoji = '💸' if state['type'] == 'รายจ่าย' else '💰'
    text  = (
        f"📋 รายการใหม่รอการอนุมัติ\n"
        f"จาก: {recorder}\n"
        f"{emoji} {state['type']} {state['amount']:,.0f} บาท\n"
        f"หมวด: {state['category']}\n"
        f"แปลง: {state['plot_name']}\n"
        f"รหัส: {txn_id}"
    )
    qr = QuickReply(items=[
        QuickReplyItem(action=PostbackAction(
            label='✅ อนุมัติ',
            data=f'action=approve&txn_id={txn_id}',
            display_text='✅ อนุมัติ',
        )),
        QuickReplyItem(action=PostbackAction(
            label='❌ ไม่อนุมัติ',
            data=f'action=reject&txn_id={txn_id}',
            display_text='❌ ไม่อนุมัติ',
        )),
    ])
    api.push_message(PushMessageRequest(
        to=APPROVER_USER_ID,
        messages=[TextMessage(text=text, quick_reply=qr)],
    ))
