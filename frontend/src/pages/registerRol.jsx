// src/pages/RegisterRol.jsx
import React from 'react';

export default function RegisterRol({ alSeleccionarRol, alVolver }) {
  return (
    <div style={styles.contenedorCentrado}>
      <div style={styles.tarjeta}>
        <button style={styles.btnVolver} onClick={alVolver}>← Volver al login</button>
        
        <div style={styles.iconoEncabezado}>🩺</div>
        <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>Crear cuenta en Asist-me</h2>
        <p style={{ textAlign: 'center', color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
          Selecciona el tipo de cuenta que deseas crear
        </p>

        <div style={styles.opcion} onClick={() => alSeleccionarRol('paciente')}>
          <div style={styles.iconoOpcion}>👤</div>
          <div>
            <h4 style={{ margin: '0 0 4px 0' }}>Paciente</h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              Consulta tu historial médico, agenda citas con especialistas y recibe atención.
            </p>
          </div>
        </div>

        <div style={styles.opcion} onClick={() => alSeleccionarRol('medico')}>
          <div style={{ ...styles.iconoOpcion, backgroundColor: '#e0e7ff', color: '#4338ca' }}>🩺</div>
          <div>
            <h4 style={{ margin: '0 0 4px 0' }}>Médico / Especialista</h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              Gestiona expedientes, administra tus horarios y atiende consultas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  contenedorCentrado: {
    minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#f8fafc', fontFamily: 'sans-serif'
  },
  tarjeta: {
    backgroundColor: '#fff', padding: '32px', borderRadius: '16px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.05)', width: '100%', maxWidth: '420px'
  },
  btnVolver: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', marginBottom: '16px' },
  iconoEncabezado: {
    fontSize: '32px', backgroundColor: '#0284c7', color: '#fff', width: '56px', height: '56px',
    borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto'
  },
  opcion: {
    display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', border: '1px solid #e2e8f0',
    borderRadius: '12px', cursor: 'pointer', marginBottom: '12px', transition: 'all 0.2s'
  },
  iconoOpcion: {
    fontSize: '20px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '12px', borderRadius: '10px'
  }
};