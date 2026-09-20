from flask import Flask, jsonify, request
app = Flask(__name__)

@app.route('/api', methods=['POST'])
def api():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400

    # Process the data (for demonstration, we'll just echo it back)
    response_data = {
        'received': data,
        'message': 'Data processed successfully'
    }
    return jsonify(response_data), 200