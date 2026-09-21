// src/services/api.js
export const enviarMensajeChat = async (usuarioId, mensaje) => {
  try {
    const response = await fetch("http://127.0.0.1:5000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        usuario_id: usuarioId,
        mensaje: mensaje,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();
    return data; // Devuelve { respuesta: "...", status: "success" }
  } catch (error) {
    console.error("Error conectando con el backend:", error);
    throw error;
  }
};