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


@app.route('/api/harvest', methods=['POST'])
def api_add_harvest():
    from bot.sheets import save_harvest
    d = request.get_json()
    hid = save_harvest(
        plot_id      = d['plot_id'],
        quantity_kg  = float(d['quantity_kg']),
        price_per_kg = float(d['price_per_kg']),
        buyer        = d.get('buyer', ''),
        notes        = d.get('notes', ''),
        harvest_date = d.get('harvest_date'),
    )
    return jsonify({'harvest_id': hid})


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


@app.route('/api/harvest-sessions')
def api_get_harvest_sessions():
    from bot.sheets import get_harvest_sessions
    return jsonify(get_harvest_sessions())


@app.route('/api/harvest-sessions', methods=['POST'])
def api_create_harvest_session():
    from bot.sheets import create_harvest_session
    d = request.get_json()
    sid = create_harvest_session(
        plot_id     = d['plot_id'],
        start_date  = d['start_date'],
        expected_kg = float(d.get('expected_kg', 0)),
        notes       = d.get('notes', ''),
    )
    return jsonify({'session_id': sid})


@app.route('/api/harvest-sessions/<session_id>/close', methods=['POST'])
def api_close_harvest_session(session_id):
    from bot.sheets import close_harvest_session
    d = request.get_json()
    close_harvest_session(
        session_id        = session_id,
        end_date          = d['end_date'],
        destination_type  = d.get('destination_type', ''),
        destination_detail= d.get('destination_detail', ''),
        total_kg          = float(d.get('total_kg', 0)),
        total_revenue     = float(d.get('total_revenue', 0)),
    )
    return jsonify({'ok': True})


@app.route('/api/harvest-entries')
def api_get_harvest_entries():
    from bot.sheets import get_harvest_entries
    return jsonify(get_harvest_entries())


@app.route('/api/harvest-entries', methods=['POST'])
def api_add_harvest_entry():
    from bot.sheets import add_harvest_entry
    d = request.get_json()
    eid = add_harvest_entry(
        session_id  = d['session_id'],
        plot_id     = d['plot_id'],
        date        = d['date'],
        kg          = float(d['kg']),
        price_per_kg= float(d['price_per_kg']),
        notes       = d.get('notes', ''),
    )
    return jsonify({'entry_id': eid})


@app.route('/api/harvest-entries/<entry_id>', methods=['DELETE'])
def api_delete_harvest_entry(entry_id):
    from bot.sheets import delete_harvest_entry
    delete_harvest_entry(entry_id)
    return jsonify({'ok': True})


@app.route('/api/season-logs')
def api_get_season_logs():
    from bot.sheets import get_season_logs
    return jsonify(get_season_logs())


@app.route('/api/season-logs', methods=['POST'])
def api_save_season_log():
    from bot.sheets import save_season_log
    d = request.get_json()
    lid = save_season_log(d['plot_id'], d)
    return jsonify({'log_id': lid})


@app.route('/api/season-logs/<log_id>', methods=['DELETE'])
def api_delete_season_log(log_id):
    from bot.sheets import delete_season_log
    delete_season_log(log_id)
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
        date        = data.get('date'),
        notes       = data.get('notes', ''),
    )
    return jsonify({'txn_id': txn_id})


@app.route('/api/transactions/<txn_id>/notes', methods=['PATCH'])
def api_update_txn_notes(txn_id):
    from bot.sheets import update_transaction_notes
    d = request.get_json()
    update_transaction_notes(txn_id, d.get('notes', ''))
    return jsonify({'ok': True})


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
