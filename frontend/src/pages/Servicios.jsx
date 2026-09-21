// src/pages/Servicios.jsx
import React, { useState } from 'react';

export default function Servicios({ esMedico }) {
  const [servicios, setServicios] = useState([
    { id: 1, servicio: "Consulta General", especialidad: "Medicina General", precio: "250.00", medico: "Dr. Giselle Guzmán" },
    { id: 2, servicio: "Valoración Nutricional", especialidad: "Nutrición", precio: "300.00", medico: "Dr. Giselle Guzmán" },
    { id: 3, servicio: "Revisión Dental", especialidad: "Odontología", precio: "350.00", medico: "Dr. Giselle Guzmán" }
  ]);

  const [mostrarModal, setMostrarModal] = useState(false);
  const [nuevoServicio, setNuevoServicio] = useState({ servicio: '', especialidad: '', precio: '' });

  const handleGuardar = (e) => {
    e.preventDefault();
    if (!nuevoServicio.servicio || !nuevoServicio.precio) return;
    setServicios((prev) => [...prev, { ...nuevoServicio, id: Date.now(), medico: 'Dr. Giselle Guzmán' }]);
    setNuevoServicio({ servicio: '', especialidad: '', precio: '' });
    setMostrarModal(false);
  };

  return (
    <div style={{ padding: '36px', flex: 1, backgroundColor: '#f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontWeight: '700' }}>Servicios Médicos</h2>
          <p style={{ color: '#64748b', margin: '6px 0 0 0', fontSize: '14px' }}>
            {esMedico ? 'Administra los servicios que ofreces' : 'Elige el servicio que necesitas y agenda una cita'}
          </p>
        </div>
        {esMedico && (
          <button style={styles.btnNuevo} onClick={() => setMostrarModal(true)}>
            + Nuevo Servicio
          </button>
        )}
      </div>

      {!esMedico ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {servicios.map((item) => (
            <div key={item.id} className="tarjeta-flotante" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
                <span style={styles.iconoCard}>🩺</span>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontWeight: '600', color: '#0f172a' }}>{item.servicio}</h4>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>{item.especialidad || 'General'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#0284c7' }}>${item.precio}</span>
                <button style={styles.btnAgendar}>Agendar cita</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="tarjeta-flotante" style={{ padding: '24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '12px' }}>
                <th style={{ padding: '14px 12px' }}>SERVICIO</th>
                <th style={{ padding: '14px 12px' }}>ESPECIALIDAD</th>
                <th style={{ padding: '14px 12px' }}>PRECIO</th>
                <th style={{ padding: '14px 12px' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {servicios.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '16px 12px', fontWeight: '600', color: '#0f172a' }}>{item.servicio}</td>
                  <td style={{ padding: '16px 12px', color: '#64748b', fontSize: '14px' }}>{item.especialidad || 'General'}</td>
                  <td style={{ padding: '16px 12px', fontWeight: '700', color: '#0284c7' }}>${item.precio}</td>
                  <td style={{ padding: '16px 12px' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '8px' }}>✏️</button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer' }}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal flotante para crear servicio */}
      {mostrarModal && (
        <div style={styles.overlayModal}>
          <div className="tarjeta-flotante" style={styles.modalContent}>
            <h3 style={{ margin: '0 0 16px 0', color: '#0f172a' }}>Agregar Nuevo Servicio</h3>
            <form onSubmit={handleGuardar}>
              <div style={{ marginBottom: '14px' }}>
                <label style={styles.labelModal}>NOMBRE DEL SERVICIO</label>
                <input
                  type="text"
                  className="input-flotante"
                  placeholder="Ej. Checkup General"
                  value={nuevoServicio.servicio}
                  onChange={(e) => setNuevoServicio({ ...nuevoServicio, servicio: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  required
                />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={styles.labelModal}>ESPECIALIDAD</label>
                <input
                  type="text"
                  className="input-flotante"
                  placeholder="Ej. Cardiología"
                  value={nuevoServicio.especialidad}
                  onChange={(e) => setNuevoServicio({ ...nuevoServicio, especialidad: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={styles.labelModal}>PRECIO ($)</label>
                <input
                  type="number"
                  className="input-flotante"
                  placeholder="500.00"
                  value={nuevoServicio.precio}
                  onChange={(e) => setNuevoServicio({ ...nuevoServicio, precio: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" style={styles.btnCancelarModal} onClick={() => setMostrarModal(false)}>
                  Cancelar
                </button>
                <button type="submit" style={styles.btnNuevo}>
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  btnNuevo: {
    backgroundColor: '#0284c7',
    color: '#fff',
    border: 'none',
    padding: '12px 20px',
    borderRadius: '12px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
    boxShadow: '0 8px 16px -4px rgba(2, 132, 199, 0.4)'
  },
  iconoCard: { backgroundColor: '#e0f2fe', color: '#0284c7', padding: '12px', borderRadius: '14px', fontSize: '22px' },
  btnAgendar: { backgroundColor: '#0f172a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600' },
  overlayModal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { padding: '32px', width: '100%', maxWidth: '420px', backgroundColor: '#fff' },
  labelModal: { display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '6px' },
  btnCancelarModal: { backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '12px 18px', borderRadius: '12px', cursor: 'pointer', fontWeight: '600' }
};