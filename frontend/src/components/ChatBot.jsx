// src/components/ChatBot.jsx
import React, { useState } from "react";
import { enviarMensajeChat } from "../services/api";

export default function ChatBot({ usuarioId = 1 }) {
  const [abierto, setAbierto] = useState(false);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensajes, setMensajes] = useState([
    { remitente: "bot", texto: "¡Hola! Soy Asist-me. ¿En qué puedo ayudarte hoy?" }
  ]);

  const handleEnviar = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const textoUsuario = input;
    setInput("");
    
    // Agregar mensaje del usuario a la lista
    setMensajes((prev) => [...prev, { remitente: "usuario", texto: textoUsuario }]);
    setCargando(true);

    try {
      // Petición a Flask
      const res = await enviarMensajeChat(usuarioId, textoUsuario);
      setMensajes((prev) => [...prev, { remitente: "bot", texto: res.respuesta }]);
    } catch (error) {
      setMensajes((prev) => [
        ...prev,
        { remitente: "bot", texto: "No pude conectar con el servidor. Inténtalo más tarde." }
      ]);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={styles.contenedorFlotante}>
      {/* Ventana del Chat */}
      {abierto && (
        <div style={styles.ventanaChat}>
          <div style={styles.encabezado}>
            <span style={{ fontWeight: "bold" }}>Asist-me 🩺</span>
            <button style={styles.botonCerrar} onClick={() => setAbierto(false)}>✕</button>
          </div>

          <div style={styles.cuerpoChat}>
            {mensajes.map((msg, index) => (
              <div
                key={index}
                style={{
                  ...styles.burbujaContenedor,
                  justifyContent: msg.remitente === "usuario" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    ...styles.burbuja,
                    backgroundColor: msg.remitente === "usuario" ? "#007bff" : "#e9ecef",
                    color: msg.remitente === "usuario" ? "#ffffff" : "#212529",
                  }}
                >
                  {msg.texto}
                </div>
              </div>
            ))}
            {cargando && (
              <div style={{ ...styles.burbujaContenedor, justifyContent: "flex-start" }}>
                <div style={{ ...styles.burbuja, backgroundColor: "#e9ecef", fontStyle: "italic" }}>
                  Escribiendo...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleEnviar} style={styles.pieFormulario}>
            <input
              type="text"
              placeholder="Escribe tu consulta..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={styles.inputChat}
            />
            <button type="submit" disabled={cargando} style={styles.botonEnviar}>
              Enviar
            </button>
          </form>
        </div>
      )}

      {/* Botón flotante para abrir/cerrar */}
      <button style={styles.botonFlotante} onClick={() => setAbierto(!abierto)}>
        💬 Asist-me
      </button>
    </div>
  );
}

// Estilos rápidos integrados
const styles = {
  contenedorFlotante: {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: 1000,
    fontFamily: "sans-serif",
  },
  botonFlotante: {
    backgroundColor: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "30px",
    padding: "12px 20px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
  },
  ventanaChat: {
    width: "350px",
    height: "450px",
    backgroundColor: "#fff",
    borderRadius: "12px",
    boxShadow: "0 5px 15px rgba(0,0,0,0.3)",
    display: "flex",
    flexDirection: "column",
    marginBottom: "10px",
    overflow: "hidden",
  },
  encabezado: {
    backgroundColor: "#007bff",
    color: "#fff",
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  botonCerrar: {
    background: "none",
    border: "none",
    color: "#fff",
    fontSize: "16px",
    cursor: "pointer",
  },
  cuerpoChat: {
    flex: 1,
    padding: "12px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  burbujaContenedor: {
    display: "flex",
  },
  burbuja: {
    maxWidth: "80%",
    padding: "8px 12px",
    borderRadius: "12px",
    fontSize: "14px",
    lineHeight: "1.4",
  },
  pieFormulario: {
    display: "flex",
    padding: "10px",
    borderTop: "1px solid #ddd",
    gap: "8px",
  },
  inputChat: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: "20px",
    border: "1px solid #ccc",
    outline: "none",
  },
  botonEnviar: {
    backgroundColor: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "20px",
    padding: "8px 14px",
    cursor: "pointer",
  },
};