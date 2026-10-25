// src/pages/login.jsx
import React, { useState } from 'react';
import { loginAPI } from '../services/api';
import Icon from '../components/Icon';

export default function Login({ alIniciarSesionExitoso, irARegistroRol, alVolverALanding }) {
  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identificador.trim() || !password) {
      setError('Ingresa tu nombre de usuario o correo y contraseña.');
      return;
    }

    setCargando(true);
    setError('');

    try {
      const res = await loginAPI(identificador.trim(), password);
      alIniciarSesionExitoso(res.usuario, res.access_token);
    } catch (err) {
      setError(err.message || 'Credenciales inválidas. Verifica tus datos.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={styles.contenedor}>
      <div className="card" style={styles.tarjeta}>
        {alVolverALanding && (
          <button
            type="button"
            onClick={alVolverALanding}
            style={{
              background: 'none',
              border: 'none',
              color: '#7c8986',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '16px',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'inherit',
            }}
          >
            ← Volver al inicio
          </button>
        )}
        <div style={styles.brandContainer}>
          <img className="auth-brand-logo" src="/asist-me-logo.svg" alt="Asist-me" />
        </div>

        <div style={styles.encabezado}>
          <p className="eyebrow" style={{ textAlign: 'center', marginBottom: '6px' }}>
            PORTAL MÉDICO INTELIGENTE
          </p>
          <h2 style={styles.titulo}>Iniciar sesión</h2>
          <p style={styles.subtitulo}>
            Accede a tu agenda, pacientes y consultas en tiempo real.
          </p>
        </div>

        {error && (
          <div style={styles.mensajeError}>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.formulario}>
          <div style={styles.campo}>
            <label style={styles.label}>USUARIO O CORREO ELECTRÓNICO</label>
            <div style={styles.inputWrapper}>
              <span style={styles.inputIcon}>
                <Icon name="users" size={17} />
              </span>
              <input
                type="text"
                placeholder="ejemplo@asistme.com"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                style={styles.input}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div style={styles.campo}>
            <label style={styles.label}>CONTRASEÑA</label>
            <div style={styles.inputWrapper}>
              <span style={styles.inputIcon}>
                <Icon name="settings" size={17} />
              </span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="primary-btn"
            style={styles.btnSubmit}
          >
            {cargando ? 'Iniciando sesión...' : 'Ingresar a mi cuenta'}
          </button>
        </form>

        <div style={styles.pieRegistro}>
          <span style={{ color: '#7c8986', fontSize: '13px' }}>¿Aún no tienes cuenta?</span>{' '}
          <button
            type="button"
            onClick={irARegistroRol}
            style={styles.linkRegistro}
          >
            Crear cuenta
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  contenedor: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '24px',
    background: 'radial-gradient(circle at 78% 8%, #edf3ef 0, transparent 28%), #f7f9f7',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    boxSizing: 'border-box',
  },
  tarjeta: {
    width: '100%',
    maxWidth: '440px',
    padding: '36px 32px',
    borderRadius: '24px',
    backgroundColor: '#ffffff',
    boxShadow: '0 24px 60px rgba(40, 65, 59, 0.08)',
    border: '1px solid #e9eeeb',
  },
  brandContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '20px',
  },
  encabezado: {
    marginBottom: '24px',
    textAlign: 'center',
  },
  titulo: {
    fontSize: '26px',
    fontWeight: '700',
    color: '#1d2927',
    margin: '0 0 6px 0',
    letterSpacing: '-0.8px',
  },
  subtitulo: {
    fontSize: '13px',
    color: '#7c8986',
    margin: 0,
    lineHeight: '1.5',
  },
  formulario: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  campo: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#7c8986',
    marginBottom: '8px',
    letterSpacing: '0.8px',
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    border: '1px solid #e9eeeb',
    borderRadius: '14px',
    padding: '0 14px',
    height: '46px',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },
  inputIcon: {
    color: '#7c8986',
    display: 'grid',
    placeItems: 'center',
    marginRight: '10px',
  },
  input: {
    border: 'none',
    outline: 'none',
    width: '100%',
    fontSize: '13px',
    color: '#1d2927',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
  },
  btnSubmit: {
    width: '100%',
    height: '46px',
    justifyContent: 'center',
    marginTop: '6px',
    fontSize: '14px',
  },
  mensajeError: {
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecaca',
    padding: '12px 14px',
    borderRadius: '14px',
    fontSize: '12px',
    marginBottom: '18px',
    textAlign: 'center',
    fontWeight: '500',
  },
  pieRegistro: {
    textAlign: 'center',
    marginTop: '24px',
    paddingTop: '20px',
    borderTop: '1px solid #e9eeeb',
  },
  linkRegistro: {
    background: 'none',
    border: 'none',
    color: '#174f49',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '0 4px',
    fontFamily: 'inherit',
  },
};
