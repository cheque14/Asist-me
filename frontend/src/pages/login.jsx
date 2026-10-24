// src/pages/login.jsx
import React, { useState } from 'react';
import { loginAPI } from '../services/api';

export default function Login({ alIniciarSesionExitoso, irARegistroRol }) {
  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identificador || !password) {
      setError('Ingresa tu nombre de usuario o correo y contraseña');
      return;
    }

    setCargando(true);
    setError('');

    try {
      const res = await loginAPI(identificador, password);
      // Pasa los datos del usuario autenticado a App.jsx
      alIniciarSesionExitoso(res.usuario, res.access_token);
    } catch (err) {
      setError(err.message || 'Credenciales inválidas');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={styles.contenedor}>
      <div className="tarjeta-flotante" style={styles.tarjeta}>
        <div style={styles.logoContenedor}>🩺</div>
        <h2 style={{ textAlign: 'center', margin: '0 0 6px 0', color: '#0f172a', fontWeight: '700' }}>
          Bienvenido a Asist-me
        </h2>
        <p style={{ textAlign: 'center', color: '#64748b', fontSize: '14px', margin: '0 0 24px 0' }}>
          Ingresa tus credenciales para acceder al sistema
        </p>

        {error && (
          <div style={styles.mensajeError}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '18px' }}>
            <label style={styles.label}>USUARIO O CORREO ELECTRÓNICO</label>
            <div className="input-flotante" style={styles.inputIcono}>
              <span>👤</span>
              <input
                type="text"
                placeholder="usuario o tu@email.com"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                style={styles.input}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={styles.label}>CONTRASEÑA</label>
            <div className="input-flotante" style={styles.inputIcono}>
              <span>🔒</span>
              <input
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                required
              />
            </div>
          </div>

          <button type="submit" disabled={cargando} style={styles.btnSubmit}>
            {cargando ? 'Iniciando sesión...' : 'login'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '14px', color: '#64748b', marginTop: '24px', margin: 0 }}>
          ¿No tienes cuenta?{' '}
          <span style={{ color: '#0284c7', cursor: 'pointer', fontWeight: '600' }} onClick={irARegistroRol}>
            Registrarse
          </span>
        </p>
      </div>
    </div>
  );
}

const styles = {
  contenedor: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  tarjeta: { padding: '40px', width: '100%', maxWidth: '400px' },
  logoContenedor: { width: '64px', height: '64px', backgroundColor: '#0284c7', color: '#fff', borderRadius: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '32px', margin: '0 auto 20px auto', boxShadow: '0 8px 16px -4px rgba(2, 132, 199, 0.4)' },
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: '#475569', marginBottom: '6px', letterSpacing: '0.5px' },
  inputIcono: { display: 'flex', alignItems: 'center', gap: '10px' },
  input: { border: 'none', outline: 'none', width: '100%', fontSize: '14px', backgroundColor: 'transparent', fontFamily: 'inherit' },
  btnSubmit: { width: '100%', backgroundColor: '#0284c7', color: '#ffffff', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '600', fontSize: '15px', cursor: 'pointer', boxShadow: '0 8px 20px -4px rgba(2, 132, 199, 0.4)' },
  mensajeError: { backgroundColor: '#fee2e2', color: '#b91c1c', padding: '10px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }
};