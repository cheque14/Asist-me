import React, { useCallback, useEffect, useRef, useState } from 'react';
import { requiresResponse } from '../utils/appointmentState';
import { formatClinicDate, formatClinicTime } from '../utils/dateTime';
import Icon from '../components/Icon';
import CitaDetalleModal from '../components/CitaDetalleModal';
import {
  obtenerCitasAPI,
  obtenerNotificacionesAPI,
  marcarNotificacionLeidaAPI,
  resolverPropuestaCitaAPI,
} from '../services/api';

export default function Notificaciones({ usuario, setVistaActual }) {
  const [notificaciones, setNotificaciones] = useState([]);
  const [citas, setCitas] = useState([]);
  const [notificacionSeleccionada, setNotificacionSeleccionada] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [errorAccion, setErrorAccion] = useState(null);
  const [errorCitas, setErrorCitas] = useState('');
  const requestSequence = useRef(0);

  const cargar = useCallback(async (silencioso = false) => {
    const sequence = ++requestSequence.current;
    if (!silencioso) setCargando(true);
    if (!silencioso) setError('');
    try {
      const [notificationsResult, appointmentsResult] = await Promise.allSettled([
        obtenerNotificacionesAPI(usuario.access_token),
        obtenerCitasAPI(usuario.access_token),
      ]);
      if (sequence !== requestSequence.current) return;
      if (notificationsResult.status === 'fulfilled') {
        setNotificaciones(Array.isArray(notificationsResult.value) ? notificationsResult.value : []);
      } else setError(notificationsResult.reason.message || 'No se pudieron cargar las notificaciones.');
      if (appointmentsResult.status === 'fulfilled') {
        setCitas(Array.isArray(appointmentsResult.value) ? appointmentsResult.value : []);
        setErrorCitas('');
      } else setErrorCitas(appointmentsResult.reason.message || 'No se pudo cargar el detalle de las citas.');
    } catch (err) {
      if (sequence === requestSequence.current) setError(err.message || 'No se pudieron cargar las notificaciones.');
    } finally {
      if (sequence === requestSequence.current) setCargando(false);
    }
  }, [usuario.access_token]);

  const responderPropuesta = async (solicitudId, accion, fechaHora) => {
    const citaId = notificacionSeleccionada?.cita_id;
    setErrorAccion(null);
    try {
      const result = await resolverPropuestaCitaAPI(usuario.access_token, solicitudId, accion, fechaHora);
      await cargar();
      window.dispatchEvent(new Event('asis:notifications-updated'));
      if (result.notificaciones_leidas === false) {
        setError('La respuesta se guardó, pero una notificación relacionada sigue sin marcarse como leída.');
      }
      setNotificacionSeleccionada(null);
    } catch (err) {
      setError(err.message || 'No se pudo responder la propuesta.');
      setErrorAccion({ citaId, message: err.message || 'No se pudo responder la propuesta.' });
    }
  };

  const abrirNotificacion = async (notificacion) => {
    setErrorAccion(null);
    setNotificacionSeleccionada(notificacion);
    if (notificacion.leida) return;
    try {
      await marcarNotificacionLeidaAPI(usuario.access_token, notificacion.id);
      setNotificaciones((actuales) => actuales.map((item) => (
        item.id === notificacion.id ? { ...item, leida: true } : item
      )));
      window.dispatchEvent(new Event('asis:notifications-updated'));
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la notificación.');
    }
  };

  useEffect(() => {
    cargar();
    const timer = window.setInterval(() => cargar(true), 30000);
    return () => { window.clearInterval(timer); requestSequence.current += 1; };
  }, [cargar]);

  const selectedAppointment = citas.find((cita) => String(cita.id) === String(notificacionSeleccionada?.cita_id));
  const pendingCount = citas.filter((cita) => requiresResponse(cita, usuario?.rol)).length;

  return (
    <main className="notifications-page">
      <header className="notifications-header">
        <div>
          <span className="eyebrow">CENTRO DE ACTIVIDAD</span>
          <h1>Notificaciones</h1>
          <p>Aquí encontrarás nuevas citas, propuestas, cambios y respuestas.</p>
          <p>{notificaciones.filter((item) => !item.leida).length} sin leer · {pendingCount} requieren respuesta</p>
        </div>
        <button className="calendar-secondary-button" type="button" onClick={() => cargar()}>
          <Icon name="arrow" size={16} /> Actualizar
        </button>
      </header>
      {error && <div className="calendar-error" role="alert">{error}</div>}
      {errorCitas && <div className="calendar-error" role="alert">{errorCitas}</div>}
      <section className="notifications-list card">
        {cargando ? <p className="calendar-empty">Cargando notificaciones...</p> : notificaciones.length === 0 ? (
          <div className="notifications-empty">
            <Icon name="bell" size={34} />
            <h2>Todo está al día</h2>
            <p>Cuando llegue una cita, propuesta o cambio, aparecerá aquí.</p>
          </div>
        ) : notificaciones.map((notificacion) => (
          <article
            className={`notification-item ${notificacion.leida ? '' : 'unread'}`}
            key={notificacion.id}
            role="button"
            tabIndex="0"
            onClick={() => abrirNotificacion(notificacion)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrirNotificacion(notificacion); } }}
          >
            <span className="notification-icon"><Icon name="bell" size={18} /></span>
            <div>
              <strong>{notificacion.mensaje}</strong>
              {requiresResponse(citas.find((cita) => String(cita.id) === String(notificacion.cita_id)), usuario?.rol) && <small>Requiere respuesta</small>}
              <small>{notificacion.creado_en ? new Date(notificacion.creado_en).toLocaleString('es-MX') : 'Reciente'}</small>
            </div>
            {!notificacion.leida && <span className="notification-dot" aria-label="No leída" />}
          </article>
        ))}
      </section>
      <button className="notifications-back" type="button" onClick={() => setVistaActual('citas')}>
        <Icon name="calendar" size={16} /> Ver calendario y citas
      </button>
      {notificacionSeleccionada && (!selectedAppointment || errorCitas) && (
        <section className="card" aria-label="Detalle de notificación">
          <h2>Detalle de notificación</h2>
          <p>{notificacionSeleccionada.mensaje}</p>
          {notificacionSeleccionada.cita_id && <>
            <p>No se pudo abrir la cita relacionada. Actualiza el detalle antes de responder.</p>
            <button className="calendar-secondary-button" onClick={() => cargar()}>Reintentar cargar cita</button>
          </>}
          <button className="calendar-secondary-button" onClick={() => setNotificacionSeleccionada(null)}>Cerrar detalle</button>
        </section>
      )}
      {notificacionSeleccionada && selectedAppointment && !errorCitas && (
        <CitaDetalleModal
          key={notificacionSeleccionada.id}
          cita={selectedAppointment}
          rol={usuario?.rol}
          onClose={() => { setNotificacionSeleccionada(null); setErrorAccion(null); }}
          formatearFecha={(value) => formatClinicDate(value, selectedAppointment.zona_horaria)}
          formatearHora={(value) => formatClinicTime(value, selectedAppointment.zona_horaria)}
          notificationMessage={notificacionSeleccionada.mensaje}
          actionError={errorAccion?.citaId === notificacionSeleccionada.cita_id ? errorAccion.message : ''}
          onResolveProposal={usuario?.rol === 'paciente' ? responderPropuesta : undefined}
        />
      )}
    </main>
  );
}
