// src/components/Sidebar.jsx
import React from 'react';

export default function Sidebar({ vistaActual, setVistaActual, usuario }) {
  const esMedico = usuario?.rol === 'medico';

  return (
    <aside style={styles.sidebar}>
      <div>
        {/* Encabezado del Logo */}
        <div style={styles.logoContenedor}>
          <div style={styles.iconoLogo}>🩺</div>
          <div>
            <h2 style={styles.logoTitulo}>Asist-me</h2>
            <span style={styles.logoSubtitulo}>Gestión Médica</span>
          </div>
        </div>

        {/* Menú de Navegación */}
        <nav style={styles.nav}>
          <button 
            style={vistaActual === 'panel' ? styles.btnActivo : styles.btnNav} 
            onClick={() => setVistaActual('panel')}
          >
            <span style={styles.iconoMenu}>📊</span> 
            {esMedico ? 'Panel Médico' : 'Inicio'}
          </button>

          <button 
            style={vistaActual === 'historial' ? styles.btnActivo : styles.btnNav} 
            onClick={() => setVistaActual('historial')}
          >
            <span style={styles.iconoMenu}>📋</span> 
            Historial Clínico
          </button>

          <button 
            style={vistaActual === 'citas' ? styles.btnActivo : styles.btnNav} 
            onClick={() => setVistaActual('citas')}
          >
            <span style={styles.iconoMenu}>📅</span> 
            Calendario y Citas
          </button>

          <button 
            style={vistaActual === 'servicios' ? styles.btnActivo : styles.btnNav} 
            onClick={() => setVistaActual('servicios')}
          >
            <span style={styles.iconoMenu}>🩺</span> 
            Servicios
          </button>
        </nav>
      </div>

      {/* Pie del Perfil */}
      <div style={styles.perfilFooter}>
        <div style={{ fontSize: '15px', fontWeight: '600', color: '#f8fafc' }}>
          {usuario?.nombre || 'Usuario'}
        </div>
        <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
          {usuario?.rol || 'Paciente'}
        </div>
        <button 
          style={styles.btnConfig} 
          onClick={() => setVistaActual('configuracion')}
        >
          ⚙️ Configuración
        </button>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: '220px', // Ancho reducido para mejor proporción
    backgroundColor: '#0f172a',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '24px 16px',
    minHeight: '100vh',
    boxSizing: 'border-box',
    flexShrink: 0
  },
  logoContenedor: { 
    display: 'flex', 
    alignItems: 'center', 
    gap: '12px', 
    marginBottom: '32px' 
  },
  iconoLogo: { 
    backgroundColor: '#0284c7', 
    padding: '8px', 
    borderRadius: '12px', 
    fontSize: '22px',
    boxShadow: '0 4px 10px rgba(2, 132, 199, 0.4)'
  },
  logoTitulo: { 
    fontSize: '20px', 
    fontWeight: '700', 
    margin: 0, 
    color: '#f8fafc' 
  },
  logoSubtitulo: { 
    fontSize: '12px', 
    color: '#94a3b8' 
  },
  nav: { 
    display: 'flex', 
    flexDirection: 'column', 
    gap: '6px' 
  },
  btnNav: {
    display: 'flex', 
    alignItems: 'center', 
    gap: '12px', 
    padding: '12px 14px',
    backgroundColor: 'transparent', 
    color: '#94a3b8', 
    border: 'none',
    borderRadius: '10px', 
    cursor: 'pointer', 
    textAlign: 'left', 
    fontSize: '15px', // Texto más grande y legible
    fontWeight: '500',
    transition: 'all 0.2s ease'
  },
  btnActivo: {
    display: 'flex', 
    alignItems: 'center', 
    gap: '12px', 
    padding: '12px 14px',
    backgroundColor: '#1e293b', 
    color: '#38bdf8', 
    border: 'none',
    borderRadius: '10px', 
    cursor: 'pointer', 
    textAlign: 'left', 
    fontSize: '15px', // Texto más grande y legible
    fontWeight: '600'
  },
  iconoMenu: { 
    fontSize: '18px' 
  },
  perfilFooter: { 
    borderTop: '1px solid #1e293b', 
    paddingTop: '16px' 
  },
  btnConfig: { 
    background: 'none', 
    border: 'none', 
    color: '#94a3b8', 
    cursor: 'pointer', 
    marginTop: '10px', 
    padding: 0,
    fontSize: '13px',
    fontWeight: '500'
  }
};