// src/pages/login.jsx
import React, { useState } from 'react';

export default function Login({ alIniciarSesion, irARegistroRol }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) return alert('Ingresa correo y contraseña');
    alIniciarSesion({ email });
  };

  return (
    <div style={styles.contenedor}>
      <div className="tarjeta-flotante" style={styles.tarjeta}>
        <div style={styles.logoContenedor}>🩺</div>
        <h2 style={{ textAlign: 'center', margin: '0 0 6px 0', color: '#0f172a', fontWeight: '700' }}>
          Bienvenido a Asist-me
        </h2>
        <p style={{ textAlign: 'center', color: '#64748b', fontSize: '14px', margin: '0 0 28px 0' }}>
          Ingresa tus credenciales para acceder al sistema
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '18px' }}>
            <label style={styles.label}>CORREO ELECTRÓNICO</label>
            <div className="input-flotante" style={styles.inputIcono}>
              <span style={{ fontSize: '16px' }}>✉️</span>
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                required
              />
            </div>
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={styles.label}>CONTRASEÑA</label>
            <div className="input-flotante" style={styles.inputIcono}>
              <span style={{ fontSize: '16px' }}>🔒</span>
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

          <button type="submit" style={styles.btnSubmit}>
            Iniciar Sesión
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
  contenedor: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  tarjeta: {
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
  },
  logoContenedor: {
    width: '64px',
    height: '64px',
    backgroundColor: '#0284c7',
    color: '#fff',
    borderRadius: '20px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '32px',
    margin: '0 auto 20px auto',
    boxShadow: '0 8px 16px -4px rgba(2, 132, 199, 0.4)' // Relieve en el icono
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '700',
    color: '#475569',
    marginBottom: '6px',
    letterSpacing: '0.5px'
  },
  inputIcono: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  input: {
    border: 'none',
    outline: 'none',
    width: '100%',
    fontSize: '14px',
    backgroundColor: 'transparent',
    fontFamily: 'inherit'
  },
  btnSubmit: {
    width: '100%',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    padding: '14px',
    borderRadius: '12px',
    fontWeight: '600',
    fontSize: '15px',
    cursor: 'pointer',
    boxShadow: '0 8px 20px -4px rgba(2, 132, 199, 0.4)', // Botón elevado
    transition: 'all 0.2s ease'
  }
};