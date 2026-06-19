import os
import json
import logging
from flask import Flask, request, abort, jsonify
from linebot.v3 import WebhookHandler
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.messaging import Configuration, ApiClient, MessagingApi
from linebot.v3.webhooks import MessageEvent, PostbackEvent
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', template_folder='templates')
handler = WebhookHandler(os.environ['LINE_CHANNEL_SECRET'])
configuration = Configuration(access_token=os.environ['LINE_CHANNEL_ACCESS_TOKEN'])


@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('X-Line-Signature', '')
    body = request.get_data(as_text=True)
    logger.info('Webhook received')
    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        abort(400)
    return 'OK'


@handler.add(MessageEvent)
def on_message(event):
    from bot.line_handler import handle_message
    with ApiClient(configuration) as api_client:
        handle_message(event, MessagingApi(api_client))


@handler.add(PostbackEvent)
def on_postback(event):
    from bot.line_handler import handle_postback
    with ApiClient(configuration) as api_client:
        handle_postback(event, MessagingApi(api_client))


# --- Dashboard API ---

@app.route('/api/summary')
def api_summary():
    from bot.sheets import get_summary
    plot_name = request.args.get('plot')
    data = get_summary(plot_name)
    return jsonify(data)


@app.route('/api/plots')
def api_plots():
    from bot.sheets import get_all_plots
    return jsonify(get_all_plots())


@app.route('/api/transactions')
def api_transactions():
    from bot.sheets import get_transactions
    plot_id = request.args.get('plot_id')
    return jsonify(get_transactions(plot_id))


@app.route('/api/harvest')
def api_harvest():
    from bot.sheets import get_harvest
    return jsonify(get_harvest())


@app.route('/')
def dashboard():
    from flask import render_template
    return render_template('index.html')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
