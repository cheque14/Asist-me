// src/components/ChatBot.jsx
import React, { useState } from 'react';
import { enviarMensajeChat } from '../services/api';
import Icon from './Icon';

export default function ChatBot({ accessToken }) {
  const [abierto, setAbierto] = useState(false);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensajes, setMensajes] = useState([
    {
      remitente: 'bot',
      texto: 'Soy el asistente administrativo de Asist-me. Puedo orientarte sobre citas y navegación; no doy diagnósticos ni recetas.',
    },
  ]);

  const handleEnviar = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || cargando) return;

    const textoUsuario = input.trim();
    setInput('');

    setMensajes((prev) => [...prev, { remitente: 'usuario', texto: textoUsuario }]);
    setCargando(true);

    try {
      const res = await enviarMensajeChat(accessToken, textoUsuario);
      setMensajes((prev) => [
        ...prev,
        {
          remitente: 'bot',
          texto: res?.respuesta || 'He registrado tu consulta. ¿Deseas algo más?',
        },
      ]);
    } catch (error) {
      setMensajes((prev) => [
        ...prev,
        {
          remitente: 'bot',
          texto: 'No pude conectar con el servidor en este momento. Inténtalo más tarde.',
        },
      ]);
    } finally {
      setCargando(false);
    }
  };

  const enviarChip = (texto) => {
    setInput(texto);
  };

  return (
    <div style={styles.contenedorFlotante}>
      {/* Ventana del Chat */}
      {abierto && (
        <div className="card" style={styles.ventanaChat}>
          {/* Header */}
          <div style={styles.encabezado}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={styles.aiBadge}>
                <Icon name="sparkles" size={16} />
              </div>
              <div>
                <strong style={{ fontSize: '14px', color: '#ffffff', display: 'block' }}>
                  Asist-me · Asistente
                </strong>
                <span style={{ fontSize: '10px', color: '#b6d0cb' }}>Orientación administrativa</span>
              </div>
            </div>
            <button
              style={styles.botonCerrar}
              onClick={() => setAbierto(false)}
              aria-label="Cerrar chat"
            >
              ✕
            </button>
          </div>

          {/* Cuerpo de Mensajes */}
          <div style={styles.cuerpoChat}>
            {mensajes.map((msg, index) => (
              <div
                key={index}
                style={{
                  ...styles.burbujaContenedor,
                  justifyContent: msg.remitente === 'usuario' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    ...styles.burbuja,
                    backgroundColor: msg.remitente === 'usuario' ? '#174f49' : '#ffffff',
                    color: msg.remitente === 'usuario' ? '#ffffff' : '#1d2927',
                    border: msg.remitente === 'usuario' ? 'none' : '1px solid #e9eeeb',
                    borderRadius:
                      msg.remitente === 'usuario' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                  }}
                >
                  {msg.texto}
                </div>
              </div>
            ))}

            {cargando && (
              <div style={{ ...styles.burbujaContenedor, justifyContent: 'flex-start' }}>
                <div style={styles.burbujaCargando}>
                  <span>Escribiendo respuesta</span>
                  <span style={styles.puntosAnim}>...</span>
                </div>
              </div>
            )}
          </div>

          {/* Chips sugeridos rápidos */}
          {mensajes.length <= 2 && (
            <div style={styles.chipsContenedor}>
              <button
                type="button"
                style={styles.chipBtn}
                onClick={() => enviarChip('Buscar espacios para citas')}
              >
                Buscar espacios
              </button>
              <button
                type="button"
                style={styles.chipBtn}
                onClick={() => enviarChip('¿Cómo agendo con un especialista?')}
              >
                Agendar cita
              </button>
            </div>
          )}

          {/* Input de consulta */}
          <form onSubmit={handleEnviar} style={styles.pieFormulario}>
            <div className="chat-box" style={{ width: '100%', boxSizing: 'border-box' }}>
              <input
                type="text"
                placeholder="Pregunta algo sobre citas o salud..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={cargando}
                style={{ fontSize: '12px' }}
              />
              <button type="submit" disabled={cargando} aria-label="Enviar mensaje">
                <Icon name="send" size={16} />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Botón flotante para abrir/cerrar */}
      <button
        style={styles.botonFlotante}
        onClick={() => setAbierto(!abierto)}
        aria-label="Abrir asistente AsisTme"
      >
        <span style={styles.botonFlotanteIcono}>
          <Icon name="sparkles" size={18} />
        </span>
        <span style={{ fontSize: '13px', fontWeight: '700' }}>
          {abierto ? 'Cerrar Asistente' : 'Asist-me · Asistente'}
        </span>
      </button>
    </div>
  );
}

const styles = {
  contenedorFlotante: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 1000,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  botonFlotante: {
    backgroundColor: '#174f49',
    color: '#ffffff',
    border: 'none',
    borderRadius: '24px',
    padding: '10px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    boxShadow: '0 14px 32px rgba(23, 79, 73, 0.28)',
    transition: 'transform 0.15s ease, background 0.15s ease',
  },
  botonFlotanteIcono: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    display: 'grid',
    placeItems: 'center',
  },
  ventanaChat: {
    width: '360px',
    height: '480px',
    backgroundColor: '#f7f9f7',
    borderRadius: '22px',
    boxShadow: '0 24px 60px rgba(40, 65, 59, 0.18)',
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '14px',
    overflow: 'hidden',
    border: '1px solid #e9eeeb',
    padding: 0,
  },
  encabezado: {
    backgroundColor: '#174f49',
    color: '#ffffff',
    padding: '14px 18px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aiBadge: {
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    display: 'grid',
    placeItems: 'center',
  },
  botonCerrar: {
    background: 'none',
    border: 'none',
    color: '#ffffff',
    fontSize: '15px',
    cursor: 'pointer',
    padding: '4px',
    opacity: 0.8,
  },
  cuerpoChat: {
    flex: 1,
    padding: '16px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  burbujaContenedor: {
    display: 'flex',
  },
  burbuja: {
    maxWidth: '82%',
    padding: '10px 14px',
    fontSize: '12px',
    lineHeight: '1.5',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
  },
  burbujaCargando: {
    backgroundColor: '#edf3ec',
    color: '#174f49',
    padding: '8px 14px',
    borderRadius: '14px',
    fontSize: '11px',
    fontWeight: '600',
    display: 'flex',
    gap: '4px',
  },
  puntosAnim: {
    letterSpacing: '2px',
  },
  chipsContenedor: {
    display: 'flex',
    gap: '6px',
    padding: '0 16px 10px 16px',
    flexWrap: 'wrap',
  },
  chipBtn: {
    border: '1px solid #dfe9df',
    backgroundColor: '#ffffff',
    color: '#174f49',
    borderRadius: '14px',
    padding: '5px 10px',
    fontSize: '10px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  pieFormulario: {
    padding: '12px 14px',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e9eeeb',
  },
};
