// src/pages/HistorialClinico.jsx
import React, { useState } from 'react';

export default function HistorialClinico() {
  const [registros, setRegistros] = useState([
    { id: 1, fecha: '07 ABRIL 2026', titulo: 'Diagnóstico: Falta de calcio', descripcion: 'Tratamiento: Suplemento de calcio diario con alimentos.' },
    { id: 2, fecha: '02 MAYO 2026', titulo: 'Consulta de Seguimiento', descripcion: 'Evolución favorable, continuar rutina habitual.' }
  ]);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevoDiagnostico, setNuevoDiagnostico] = useState({ titulo: '', descripcion: '' });

  const handleAgregar = (e) => {
    e.preventDefault();
    if (!nuevoDiagnostico.titulo) return;
    const nuevo = {
      id: Date.now(),
      fecha: 'HOY',
      titulo: nuevoDiagnostico.titulo,
      descripcion: nuevoDiagnostico.descripcion
    };
    setRegistros([nuevo, ...registros]);
    setNuevoDiagnostico({ titulo: '', descripcion: '' });
    setMostrarForm(false);
  };

  return (
    <div style={{ padding: '36px', flex: 1, backgroundColor: '#f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontWeight: '700' }}>Historial Clínico</h2>
          <p style={{ color: '#64748b', margin: '6px 0 0 0', fontSize: '14px' }}>
            Línea de tiempo de atenciones médicas e indicaciones
          </p>
        </div>
        <button style={styles.btnAgregar} onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? 'Cerrar Formulario' : '+ Nueva Nota Médica'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.2fr', gap: '28px' }}>
        {/* Resumen flotante */}
        <div className="tarjeta-flotante" style={{ padding: '28px', height: 'fit-content' }}>
          <div style={styles.avatar}></div>
          <h3 style={{ margin: '0 0 4px 0', color: '#0f172a', fontWeight: '700' }}>Ezequiel Lopez</h3>
          <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Edad: 21 años</p>
          <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '20px 0' }} />
          <div>
            <strong style={{ fontSize: '11px', color: '#94a3b8', letterSpacing: '0.5px' }}>ÚLTIMA CONSULTA</strong>
            <p style={{ color: '#334155', margin: '4px 0', fontWeight: '600' }}>07 de Abril de 2026</p>
          </div>
          <button style={styles.btnPdf}>📄 Exportar Expediente (PDF)</button>
        </div>

        {/* Panel derecho con Línea de Tiempo */}
        <div className="tarjeta-flotante" style={{ padding: '28px' }}>
          {mostrarForm && (
            <form onSubmit={handleAgregar} style={{ marginBottom: '28px', paddingBottom: '20px', borderBottom: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>Agregar Registro Médico</h4>
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="text"
                  className="input-flotante"
                  placeholder="Título o Diagnóstico..."
                  value={nuevoDiagnostico.titulo}
                  onChange={(e) => setNuevoDiagnostico({ ...nuevoDiagnostico, titulo: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  required
                />  
              </div>
              <div style={{ marginBottom: '16px' }}>
                <textarea
                  className="input-flotante"
                  placeholder="Tratamiento o notas adicionales..."
                  value={nuevoDiagnostico.descripcion}
                  onChange={(e) => setNuevoDiagnostico({ ...nuevoDiagnostico, descripcion: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', height: '80px', resize: 'none' }}
                />
              </div>
              <button type="submit" style={styles.btnAgregar}>Guardar Nota</button>
            </form>
          )}

          <h4 style={{ marginTop: 0, marginBottom: '24px', color: '#0f172a', fontWeight: '600' }}>
            Línea de Tiempo Médica
          </h4>
          
          {registros.map((item) => (
            <div key={item.id} style={styles.timelineItem}>
              <div style={styles.timelineDot}></div>
              <div>
                <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: '700', letterSpacing: '0.5px' }}>{item.fecha}</span>
                <h5 style={{ margin: '4px 0 6px 0', color: '#0f172a', fontSize: '15px' }}>{item.titulo}</h5>
                <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: '1.5' }}>
                  {item.descripcion}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  avatar: { width: '64px', height: '64px', backgroundColor: '#e0f2fe', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', marginBottom: '16px' },
  btnPdf: { width: '100%', marginTop: '24px', padding: '12px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)' },
  btnAgregar: { backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '12px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' },
  timelineItem: { display: 'flex', gap: '16px', paddingLeft: '16px', borderLeft: '2px solid #e2e8f0', marginBottom: '28px', position: 'relative' },
  timelineDot: { width: '12px', height: '12px', backgroundColor: '#0284c7', borderRadius: '50%', position: 'absolute', left: '-7px', top: '2px', boxShadow: '0 0 0 4px #e0f2fe' }
};