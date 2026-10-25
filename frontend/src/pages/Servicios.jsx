// src/pages/Servicios.jsx
import React, { useState, useEffect } from 'react';
import Icon from '../components/Icon';
import { obtenerServiciosAPI, crearServicioAPI } from '../services/api';

export default function Servicios({ esMedico, usuario }) {
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [mostrarModal, setMostrarModal] = useState(false);
  const [nuevoServicio, setNuevoServicio] = useState({
    servicio: '',
    descripcion: '',
    precio: '',
  });

  const cargarServicios = async () => {
    setCargando(true);
    setError('');
    try {
      const data = await obtenerServiciosAPI();
      setServicios(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'No se pudieron sincronizar los servicios.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarServicios();
  }, []);

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!nuevoServicio.servicio.trim() || !nuevoServicio.precio) return;
    try {
      await crearServicioAPI(usuario?.access_token, {
        servicio: nuevoServicio.servicio.trim(),
        descripcion: nuevoServicio.descripcion.trim(),
        precio: nuevoServicio.precio,
      });
      setNuevoServicio({ servicio: '', descripcion: '', precio: '' });
      setMostrarModal(false);
      await cargarServicios();
    } catch (err) {
      alert(err.message || 'Error al guardar el servicio');
    }
  };

  return (
    <div className="bento-dashboard" aria-label="Catálogo de Servicios Médicos">
      {/* Header */}
      <section className="bento-hero">
        <div>
          <p className="eyebrow">CATÁLOGO MÉDICO</p>
          <h1>Servicios de Salud</h1>
          <p className="subtitle">
            {esMedico
              ? 'Administra los servicios y consultas que ofreces a los pacientes.'
              : 'Explora los servicios médicos ofrecidos por nuestros especialistas registrados.'}
          </p>
        </div>

        {esMedico && (
          <div className="hero-actions">
            <button className="primary-btn" onClick={() => setMostrarModal(true)}>
              <Icon name="plus" size={18} />
              <span>Nuevo Servicio</span>
            </button>
          </div>
        )}
      </section>

      {error && (
        <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px 16px', borderRadius: '14px', marginBottom: '18px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {cargando ? (
        <article className="card" style={{ padding: '36px', textAlign: 'center' }}>
          <p style={{ color: '#7c8986' }}>Cargando catálogo de servicios...</p>
        </article>
      ) : servicios.length === 0 ? (
        <article className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <Icon name="file" size={38} style={{ color: '#c4d1cd', marginBottom: '12px' }} />
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#1d2927' }}>
            No hay servicios médicos registrados todavía
          </h3>
          <p style={{ margin: 0, color: '#7c8986', fontSize: '13px' }}>
            {esMedico
              ? 'Sé el primero en publicar un servicio haciendo clic en "Nuevo Servicio".'
              : 'Los médicos registrados publicarán sus servicios aquí para que puedas solicitarlos.'}
          </p>
          {esMedico && (
            <button
              className="primary-btn"
              style={{ marginTop: '20px' }}
              onClick={() => setMostrarModal(true)}
            >
              <Icon name="plus" size={16} />
              <span>Publicar mi primer servicio</span>
            </button>
          )}
        </article>
      ) : !esMedico ? (
        /* Vista de Pacientes */
        <div style={styles.gridServicios}>
          {servicios.map((item) => (
            <article key={item.id} className="card" style={styles.cardServicio}>
              <div style={styles.cardTop}>
                <span className="soft-icon sage">
                  <Icon name="file" size={20} />
                </span>
                <span className="mode">{item.especialidad || 'General'}</span>
              </div>

              <div style={{ margin: '18px 0 20px 0' }}>
                <span style={styles.especialidadTag}>{item.medico || 'Especialista'}</span>
                <h3 style={styles.servicioTitulo}>{item.servicio}</h3>
                <p style={styles.medicoNombre}>
                  {item.descripcion || 'Atención personalizada y diagnóstico integral.'}
                </p>
              </div>

              <div style={styles.cardBottom}>
                <div>
                  <span style={styles.precioLabel}>Honorarios</span>
                  <div style={styles.precioValor}>${item.precio}</div>
                </div>
                <button
                  className="primary-btn"
                  style={{ height: '38px', padding: '0 16px', fontSize: '12px' }}
                  onClick={() => alert(`Para agendar ${item.servicio}, ve al panel y selecciona a ${item.medico}.`)}
                >
                  <Icon name="calendar" size={15} />
                  <span>Agendar</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        /* Vista de Médicos */
        <article className="card" style={{ padding: '24px' }}>
          <div className="section-heading" style={{ marginBottom: '20px' }}>
            <div>
              <span>Servicios publicados</span>
              <h2>Tus Servicios Activos</h2>
            </div>
            <span className="tag">{servicios.length} servicios</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.tabla}>
              <thead>
                <tr style={styles.thFila}>
                  <th style={styles.th}>SERVICIO</th>
                  <th style={styles.th}>DESCRIPCIÓN</th>
                  <th style={styles.th}>PRECIO</th>
                </tr>
              </thead>
              <tbody>
                {servicios.map((item) => (
                  <tr key={item.id} style={styles.tr}>
                    <td style={styles.tdPrincipal}>
                      <strong>{item.servicio}</strong>
                    </td>
                    <td style={styles.td}>{item.descripcion || 'Sin descripción'}</td>
                    <td style={{ ...styles.td, fontWeight: '700', color: '#174f49' }}>
                      ${item.precio}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {/* Modal para crear servicio */}
      {mostrarModal && (
        <div style={styles.overlayModal}>
          <div className="card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="soft-icon sage">
                  <Icon name="plus" size={18} />
                </span>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#1d2927' }}>
                  Crear Nuevo Servicio
                </h3>
              </div>
              <button
                className="icon-button"
                onClick={() => setMostrarModal(false)}
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardar} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label" style={styles.labelModal}>NOMBRE DEL SERVICIO</label>
                <input
                  type="text"
                  placeholder="Ej. Consulta de Medicina General"
                  value={nuevoServicio.servicio}
                  onChange={(e) => setNuevoServicio({ ...nuevoServicio, servicio: e.target.value })}
                  style={styles.modalInput}
                  required
                />
              </div>

              <div>
                <label className="label" style={styles.labelModal}>DESCRIPCIÓN O DETALLES</label>
                <input
                  type="text"
                  placeholder="Ej. Incluye toma de signos vitales e indicaciones"
                  value={nuevoServicio.descripcion}
                  onChange={(e) => setNuevoServicio({ ...nuevoServicio, descripcion: e.target.value })}
                  style={styles.modalInput}
                />
              </div>

              <div>
                <label className="label" style={styles.labelModal}>PRECIO ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="250.00"
                  value={nuevoServicio.precio}
                  onChange={(e) => setNuevoServicio({ ...nuevoServicio, precio: e.target.value })}
                  style={styles.modalInput}
                  required
                />
              </div>

              <div style={styles.modalFooter}>
                <button
                  type="button"
                  style={styles.btnCancelar}
                  onClick={() => setMostrarModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="primary-btn">
                  Guardar Servicio
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
  gridServicios: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px',
  },
  cardServicio: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '24px',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  especialidadTag: {
    fontSize: '11px',
    color: '#7c8986',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
  },
  servicioTitulo: {
    margin: '6px 0 4px 0',
    fontSize: '17px',
    fontWeight: '700',
    color: '#1d2927',
    letterSpacing: '-0.3px',
  },
  medicoNombre: {
    margin: 0,
    fontSize: '12px',
    color: '#7c8986',
    lineHeight: '1.4',
  },
  cardBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '16px',
    borderTop: '1px solid #e9eeeb',
  },
  precioLabel: {
    display: 'block',
    fontSize: '10px',
    color: '#7c8986',
    fontWeight: '600',
  },
  precioValor: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#174f49',
    letterSpacing: '-0.5px',
  },
  tabla: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  thFila: {
    borderBottom: '1px solid #e9eeeb',
  },
  th: {
    padding: '14px 16px',
    fontSize: '11px',
    fontWeight: '700',
    color: '#7c8986',
    letterSpacing: '0.8px',
  },
  tr: {
    borderBottom: '1px solid #f3f6f4',
  },
  tdPrincipal: {
    padding: '16px',
    color: '#1d2927',
  },
  td: {
    padding: '16px',
    fontSize: '13px',
    color: '#5c6b68',
  },
  overlayModal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(29, 41, 39, 0.45)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modalContent: {
    width: '100%',
    maxWidth: '460px',
    padding: '30px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  labelModal: {
    display: 'block',
    fontSize: '10px',
    fontWeight: '700',
    color: '#7c8986',
    marginBottom: '6px',
    letterSpacing: '0.8px',
  },
  modalInput: {
    width: '100%',
    padding: '11px 14px',
    borderRadius: '12px',
    border: '1px solid #e9eeeb',
    fontSize: '13px',
    color: '#1d2927',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    backgroundColor: '#ffffff',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '10px',
  },
  btnCancelar: {
    background: 'none',
    border: '1px solid #e9eeeb',
    color: '#7c8986',
    padding: '0 18px',
    borderRadius: '14px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
