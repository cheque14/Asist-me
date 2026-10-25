// src/components/CitaCard.jsx
import React from 'react';
import Icon from './Icon';

export default function CitaCard({ cita, alCancelar }) {
  const obtenerEstado = (estado) => {
    switch (estado?.toLowerCase()) {
      case 'confirmada':
      case 'aceptada':
        return { bg: '#edf3ec', color: '#174f49', texto: 'CONFIRMADA' };
      case 'pendiente':
      case 'agendada':
        return { bg: '#e4edf0', color: '#246b62', texto: 'PROGRAMADA' };
      case 'cancelada':
        return { bg: '#fee2e2', color: '#b91c1c', texto: 'CANCELADA' };
      default:
        return { bg: '#f3f6f4', color: '#5c6b68', texto: estado?.toUpperCase() || 'PENDIENTE' };
    }
  };

  const estiloEstado = obtenerEstado(cita.estado);

  return (
    <div className="card" style={styles.tarjeta}>
      <div style={styles.encabezado}>
        <div>
          <span style={styles.subtitulo}>{cita.paciente || cita.medico || 'Atención Médica'}</span>
          <h4 style={styles.titulo}>{cita.servicio || 'Consulta Médica'}</h4>
        </div>
        <span
          style={{
            backgroundColor: estiloEstado.bg,
            color: estiloEstado.color,
            padding: '5px 12px',
            borderRadius: '12px',
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.6px',
          }}
        >
          {estiloEstado.texto}
        </span>
      </div>

      <div style={styles.detallesGrid}>
        <div style={styles.itemDetalle}>
          <span style={styles.label}>
            <Icon name="clock" size={13} />
            <span>HORARIO</span>
          </span>
          <strong style={styles.valor}>{cita.hora || '09:00 AM'}</strong>
        </div>

        <div style={styles.itemDetalle}>
          <span style={styles.label}>
            <Icon name="video" size={13} />
            <span>MODALIDAD / UBICACIÓN</span>
          </span>
          <strong style={styles.valor}>{cita.ubicacion || 'Consultorio Principal'}</strong>
        </div>

        {cita.motivo && (
          <div style={{ gridColumn: 'span 2', ...styles.itemDetalle }}>
            <span style={styles.label}>
              <Icon name="file" size={13} />
              <span>MOTIVO DE LA CONSULTA</span>
            </span>
            <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#5c6b68' }}>{cita.motivo}</p>
          </div>
        )}
      </div>

      {cita.estado !== 'cancelada' && alCancelar && (
        <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end' }}>
          <button style={styles.btnCancelar} onClick={() => alCancelar(cita.id)}>
            Cancelar cita
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  tarjeta: {
    padding: '22px',
    marginBottom: '16px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  encabezado: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  subtitulo: {
    display: 'block',
    fontSize: '11px',
    color: '#7c8986',
    fontWeight: '600',
    marginBottom: '2px',
  },
  titulo: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '700',
    color: '#1d2927',
    letterSpacing: '-0.3px',
  },
  detallesGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '14px',
    padding: '14px 16px',
    backgroundColor: '#f7f9f7',
    borderRadius: '16px',
    border: '1px solid #e9eeeb',
  },
  itemDetalle: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '10px',
    color: '#7c8986',
    fontWeight: '700',
    letterSpacing: '0.6px',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  valor: {
    fontSize: '13px',
    color: '#1d2927',
  },
  btnCancelar: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fecaca',
    padding: '7px 14px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
};
