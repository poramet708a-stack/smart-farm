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


@app.route('/api/plots', methods=['POST'])
def api_add_plot():
    from bot.sheets import save_plot
    d = request.get_json()
    pid = save_plot(d['plot_name'], d['crop_type'], float(d['area_rai']),
                    d['start_date'], d['expected_harvest'])
    return jsonify({'plot_id': pid})


@app.route('/api/plots/<plot_id>', methods=['PUT'])
def api_update_plot(plot_id):
    from bot.sheets import update_plot
    d = request.get_json()
    update_plot(plot_id, d['plot_name'], d['crop_type'], float(d['area_rai']),
                d['start_date'], d['expected_harvest'],
                d.get('status', 'กำลังปลูก'), d.get('notes', ''))
    return jsonify({'ok': True})


@app.route('/api/plots/<plot_id>', methods=['DELETE'])
def api_delete_plot(plot_id):
    from bot.sheets import delete_plot
    delete_plot(plot_id)
    return jsonify({'ok': True})


@app.route('/api/yields')
def api_get_yields():
    from bot.sheets import get_yield_estimates
    return jsonify(get_yield_estimates())


@app.route('/api/yields', methods=['POST'])
def api_save_yields():
    from bot.sheets import save_yield_estimates
    save_yield_estimates(request.get_json())
    return jsonify({'ok': True})


@app.route('/api/map')
def api_get_map():
    from bot.sheets import get_map
    return jsonify(get_map())


@app.route('/api/map', methods=['POST'])
def api_save_map():
    from bot.sheets import save_map
    save_map(request.get_json())
    return jsonify({'ok': True})


@app.route('/api/activities')
def api_get_activities():
    from bot.sheets import get_activities
    return jsonify(get_activities())


@app.route('/api/activities', methods=['POST'])
def api_save_activity():
    from bot.sheets import save_activity
    d = request.get_json()
    save_activity(d['date'], d['note'])
    return jsonify({'ok': True})


@app.route('/api/transactions', methods=['POST'])
def api_add_transaction():
    from bot.sheets import save_transaction
    data = request.get_json()
    txn_id = save_transaction(
        txn_type    = data['type'],
        category    = data['category'],
        amount      = float(data['amount']),
        plot_id     = data['plot_id'],
        image_id    = '',
        recorded_by = data.get('recorded_by', 'เว็บ'),
    )
    return jsonify({'txn_id': txn_id})


@app.route('/api/transactions/<txn_id>', methods=['DELETE'])
def api_delete_transaction(txn_id):
    from bot.sheets import delete_transaction
    delete_transaction(txn_id)
    return jsonify({'ok': True})


@app.route('/')
def dashboard():
    from flask import render_template
    return render_template('index.html')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
