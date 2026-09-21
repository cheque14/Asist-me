// src/components/CitaCard.jsx
import React from 'react';

export default function CitaCard({ cita, alCancelar }) {
  const obtenerEstado = (estado) => {
    switch (estado?.toLowerCase()) {
      case 'confirmada':
      case 'aceptada':
        return { bg: '#dcfce7', color: '#15803d', texto: 'ACEPTADA' };
      case 'pendiente':
      case 'agendada':
        return { bg: '#fef9c3', color: '#a16207', texto: 'AGENDADA' };
      case 'cancelada':
        return { bg: '#fee2e2', color: '#b91c1c', texto: 'CANCELADA' };
      default:
        return { bg: '#f1f5f9', color: '#475569', texto: estado?.toUpperCase() || 'PENDIENTE' };
    }
  };

  const estiloEstado = obtenerEstado(cita.estado);

  return (
    <div className="tarjeta-flotante" style={styles.tarjeta}>
      <div style={styles.encabezado}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
            {cita.servicio}
          </h4>
          <span style={{ fontSize: '13px', color: '#64748b' }}>{cita.paciente || cita.medico}</span>
        </div>
        <span style={{
          backgroundColor: estiloEstado.bg,
          color: estiloEstado.color,
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: '700',
          letterSpacing: '0.5px'
        }}>
          {estiloEstado.texto}
        </span>
      </div>

      <div style={styles.detallesGrid}>
        <div style={styles.itemDetalle}>
          <span style={styles.label}>⏰ HORA</span>
          <span style={styles.valor}>{cita.hora || '09:00 AM'}</span>
        </div>
        <div style={styles.itemDetalle}>
          <span style={styles.label}>📍 UBICACIÓN</span>
          <span style={styles.valor}>{cita.ubicacion || 'Consultorio Principal'}</span>
        </div>
        {cita.motivo && (
          <div style={{ gridColumn: 'span 2', ...styles.itemDetalle }}>
            <span style={styles.label}>📝 MOTIVO</span>
            <span style={styles.valor}>{cita.motivo}</span>
          </div>
        )}
      </div>

      {cita.estado !== 'cancelada' && (
        <div style={{ marginTop: '16px', textAlign: 'right' }}>
          <button style={styles.btnCancelar} onClick={() => alCancelar && alCancelar(cita.id)}>
            Cancelar cita
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  tarjeta: {
    padding: '20px',
    marginBottom: '16px',
  },
  encabezado: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' },
  detallesGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' },
  itemDetalle: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: '10px', color: '#94a3b8', fontWeight: '700', marginBottom: '4px', letterSpacing: '0.5px' },
  valor: { fontSize: '13px', color: '#334155', fontWeight: '500' },
  btnCancelar: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 4px 10px rgba(239, 68, 68, 0.3)'
  }
};