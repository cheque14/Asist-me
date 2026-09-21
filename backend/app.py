from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
# Permitir peticiones desde React durante el desarrollo
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.route("/api/chat", methods=["POST"])
def chat():
    datos = request.get_json() or {}
    usuario_id = datos.get("usuario_id")
    mensaje = datos.get("mensaje", "")

    respuesta_dummy = f"Hola, recibí tu mensaje: '{mensaje}'. ¡Pronto estaré conectado al LLM y Supabase!"

    return jsonify({
        "respuesta": respuesta_dummy,
        "status": "success"
    })

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)