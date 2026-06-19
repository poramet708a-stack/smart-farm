import os
import re
import logging
import requests

logger = logging.getLogger(__name__)

OCR_SPACE_URL = 'https://api.ocr.space/parse/image'


def extract_amount_from_image(image_message_id: str) -> float | None:
    """
    Downloads LINE image, sends to OCR.space, extracts total amount.
    Returns None if no amount found.
    """
    image_bytes = _download_line_image(image_message_id)
    if not image_bytes:
        return None

    text = _ocr(image_bytes)
    if not text:
        return None

    logger.info(f'OCR text: {text[:200]}')
    return _extract_amount(text)


def _download_line_image(message_id: str) -> bytes | None:
    token = os.environ['LINE_CHANNEL_ACCESS_TOKEN']
    url   = f'https://api-data.line.me/v2/bot/message/{message_id}/content'
    try:
        resp = requests.get(url, headers={'Authorization': f'Bearer {token}'}, timeout=15)
        resp.raise_for_status()
        return resp.content
    except Exception as e:
        logger.error(f'ดาวน์โหลดรูปไม่ได้: {e}')
        return None


def _ocr(image_bytes: bytes) -> str:
    api_key = os.environ.get('OCR_SPACE_API_KEY', 'helloworld')
    try:
        resp = requests.post(
            OCR_SPACE_URL,
            files={'file': ('receipt.jpg', image_bytes, 'image/jpeg')},
            data={
                'apikey':   api_key,
                'language': 'tha',        # ภาษาไทย
                'isOverlayRequired': False,
                'OCREngine': 2,           # Engine 2 แม่นกว่าสำหรับใบเสร็จ
            },
            timeout=30,
        )
        resp.raise_for_status()
        result = resp.json()

        if result.get('IsErroredOnProcessing'):
            logger.error(f'OCR.space error: {result.get("ErrorMessage")}')
            return ''

        parsed = result.get('ParsedResults', [])
        return parsed[0].get('ParsedText', '') if parsed else ''

    except Exception as e:
        logger.error(f'OCR error: {e}')
        return ''


def _extract_amount(text: str) -> float | None:
    # หายอดเงินจาก keyword สำคัญก่อน
    keyword_patterns = [
        r'(?:ยอดรวม|รวมทั้งสิ้น|ยอดสุทธิ|ยอดชำระ|รวม|total|net|สุทธิ)[^\d]*([\d,]+(?:\.\d{1,2})?)',
        r'([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|baht)',
    ]
    for pattern in keyword_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            for m in reversed(matches):
                try:
                    val = float(str(m).replace(',', ''))
                    if 1 <= val <= 9_999_999:
                        return val
                except ValueError:
                    continue

    # Fallback: เอาตัวเลขที่ใหญ่ที่สุดในรูป
    candidates = []
    for n in re.findall(r'[\d,]+(?:\.\d{1,2})?', text):
        try:
            val = float(n.replace(',', ''))
            if 1 <= val <= 9_999_999:
                candidates.append(val)
        except ValueError:
            continue

    return max(candidates) if candidates else None
