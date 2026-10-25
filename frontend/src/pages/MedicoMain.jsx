// src/pages/MedicoMain.jsx
import React, { useState, useEffect, useRef } from 'react';
import Icon from '../components/Icon';
import { formatClinicDate, formatClinicTime } from '../utils/dateTime';
import CitaDetalleModal from '../components/CitaDetalleModal';
import {
  enviarMensajeChat,
  obtenerCitasAPI,
  cancelarCitaAPI,
  actualizarEstadoCitaAPI,
  obtenerSolicitudesCambioAPI,
  resolverSolicitudCambioAPI,
  proponerCambioCitaAPI,
} from '../services/api';

export default function MedicoMain({ usuario, setVistaActual }) {
  const [citas, setCitas] = useState([]);
  const [cargandoCitas, setCargandoCitas] = useState(true);
  const [errorCitas, setErrorCitas] = useState('');
  const [solicitudesCambio, setSolicitudesCambio] = useState([]);
  const [citaDetalle, setCitaDetalle] = useState(null);
  const [errorSolicitudes, setErrorSolicitudes] = useState('');
  const [errorPropuesta, setErrorPropuesta] = useState('');
  const [solicitudEnCurso, setSolicitudEnCurso] = useState(null);
  const refreshSequence = useRef(0);
  const refreshing = useRef(false);
  const detailId = useRef(null);
  detailId.current = citaDetalle?.id;
  const invalidateRefresh = () => { refreshSequence.current += 1; };

  const [query, setQuery] = useState('');
  const [cargandoAsistente, setCargandoAsistente] = useState(false);
  const [mensajeAsistente, setMensajeAsistente] = useState(
    'Soy el asistente administrativo de Asist-me. Te oriento sobre citas y horarios; las notas se registran en Expediente clínico. No doy diagnósticos ni recetas.'
  );

  const nombreDoctor = usuario?.nombre ? usuario.nombre : 'Doctor';

  // Fecha de hoy
  const hoy = new Date();
  const fechaFormateada = hoy
    .toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    .toUpperCase();

  // Cargar citas reales del médico desde el backend
  const cargarCitas = async (silencioso = false) => {
    if (!usuario?.access_token) {
      setCargandoCitas(false);
      return;
    }
    if (silencioso && refreshing.current) return;
    const sequence = ++refreshSequence.current;
    refreshing.current = true;
    if (!silencioso) setCargandoCitas(true);
    try {
      const [data, solicitudes] = await Promise.allSettled([
        obtenerCitasAPI(usuario.access_token),
        obtenerSolicitudesCambioAPI(usuario.access_token),
      ]);
      if (sequence !== refreshSequence.current) return;
      if (data.status === 'fulfilled') {
        setCitas(Array.isArray(data.value) ? data.value : []);
        setErrorCitas('');
      } else setErrorCitas(data.reason?.message || 'No se pudieron sincronizar las citas.');
      if (solicitudes.status === 'fulfilled') {
        setSolicitudesCambio(Array.isArray(solicitudes.value) ? solicitudes.value : []);
        setErrorSolicitudes('');
      } else setErrorSolicitudes(solicitudes.reason?.message || 'No se pudieron consultar las solicitudes.');
    } catch (err) {
      if (sequence === refreshSequence.current) setErrorCitas(err.message || 'No se pudieron sincronizar las citas.');
    } finally {
      if (sequence === refreshSequence.current) {
        refreshing.current = false;
        setCargandoCitas(false);
      }
    }
  };

  useEffect(() => {
    cargarCitas();
    const refresh = () => cargarCitas(true);
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener('focus', refresh);
    window.addEventListener('asis:notifications-updated', refresh);
    return () => {
      invalidateRefresh();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('asis:notifications-updated', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.access_token]);

  useEffect(() => { setErrorPropuesta(''); }, [citaDetalle?.id]);

  const handleCancelar = async (citaId) => {
    if (!window.confirm('¿Seguro que deseas cancelar esta cita?')) return;
    try {
      await cancelarCitaAPI(usuario.access_token, citaId);
      await cargarCitas();
    } catch (err) {
      alert(err.message || 'Error al cancelar la cita');
    }
  };

  const handleEstado = async (citaId, estado) => {
    setErrorPropuesta('');
    try {
      await actualizarEstadoCitaAPI(usuario.access_token, citaId, estado);
      setCitaDetalle((current) => current?.id === citaId ? { ...current, estado } : current);
      await cargarCitas();
    } catch (err) {
      if (detailId.current === citaId) setErrorPropuesta(err.message || 'No se pudo actualizar el estado.');
      else setErrorCitas(err.message || 'No se pudo actualizar el estado.');
    }
  };

  const handleSolicitud = async (solicitudId, aceptar) => {
    if (solicitudEnCurso !== null) return;
    setSolicitudEnCurso(solicitudId);
    try {
      await resolverSolicitudCambioAPI(usuario.access_token, solicitudId, aceptar);
      await cargarCitas();
      window.dispatchEvent(new Event('asis:notifications-updated'));
    } catch (err) {
      setErrorCitas(err.message || 'No se pudo resolver la solicitud.');
    } finally {
      setSolicitudEnCurso(null);
    }
  };

  const handleProponerCambio = async (citaId, fechaHora) => {
    setErrorPropuesta('');
    try {
      await proponerCambioCitaAPI(usuario.access_token, citaId, {
        ...(typeof fechaHora === 'object' ? fechaHora : { fecha_hora: fechaHora }),
        motivo: 'Cambio propuesto por el médico',
      });
      setCitaDetalle((current) => current?.id === citaId ? null : current);
      await cargarCitas();
      alert('Propuesta enviada al paciente. La cita queda pendiente de su respuesta.');
    } catch (err) {
      if (detailId.current === citaId) setErrorPropuesta(err.message || 'No se pudo proponer el cambio.');
    }
  };

  const handleEnviarConsulta = async (e) => {
    if (e) e.preventDefault();
    if (!query.trim() || cargandoAsistente) return;

    const texto = query.trim();
    setQuery('');
    setCargandoAsistente(true);
    setMensajeAsistente(`Pensando: "${texto}"...`);

    try {
      const res = await enviarMensajeChat(usuario?.access_token, texto);
      if (res && res.respuesta) {
        setMensajeAsistente(res.respuesta);
      } else {
        setMensajeAsistente('Listo. Ya procesé tu solicitud.');
      }
    } catch (err) {
      setMensajeAsistente('No pude conectar con el servidor en este momento.');
    } finally {
      setCargandoAsistente(false);
    }
  };

  const handleChipClick = (texto) => {
    setQuery(texto);
  };

  // Filtrar citas activas (no canceladas)
  const citasActivas = citas.filter((c) => !['cancelada', 'rechazada', 'completada'].includes(c.estado)
    && new Date(c.fecha_hora).getTime() >= Date.now()).sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
  const proximaCita = citasActivas.length > 0 ? citasActivas[0] : null;
  const agendaOrdenada = [...citas].sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));

  // Formato de hora amigable
  const zonaDeFecha = (value) => citas.find((item) => item.fecha_hora === value)?.zona_horaria
    || citas.map((item) => item.solicitud_cambio).find((item) => item?.fecha_hora_solicitada === value)?.zona_horaria;
  const formatearHora = (value, zone) => formatClinicTime(value, zone || zonaDeFecha(value));
  const formatearFechaCorta = (value, zone) => formatClinicDate(value, zone || zonaDeFecha(value));

  return (
    <div className="bento-dashboard" aria-label="Panel Médico">
      {/* Hero Section */}
      <section className="bento-hero">
        <div>
          <p className="eyebrow">{fechaFormateada}</p>
          <h1>Buenos días, Dr. {nombreDoctor}.</h1>
          <p className="subtitle">
            {citasActivas.length === 0
              ? 'No tienes citas agendadas por el momento. Tu agenda está libre.'
              : `Tienes ${citasActivas.length} ${citasActivas.length === 1 ? 'consulta programada' : 'consultas programadas'}.`}
          </p>
        </div>

        <div className="hero-actions">
          <div className="role-badge">
            <Icon name="users" size={16} />
            <span>Médico Activo</span>
          </div>

          <button
            className="primary-btn"
            onClick={() => setVistaActual && setVistaActual('horarios')}
          >
            <Icon name="clock" size={18} />
            <span>Mis Horarios</span>
          </button>
        </div>
      </section>

      {errorCitas && (
        <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px 16px', borderRadius: '14px', marginBottom: '18px', fontSize: '13px' }}>
          {errorCitas}
        </div>
      )}

      {(solicitudesCambio.length > 0 || errorSolicitudes) && (
        <section className="card" style={{ marginBottom: '20px', border: '1px solid #ead9c7' }}>
          <div className="section-heading">
            <div>
              <span>Revisión requerida</span>
              <h2>Solicitudes de cambio</h2>
            </div>
            <span className="tag">
              {solicitudesCambio.length} {solicitudesCambio.length === 1 ? 'pendiente' : 'pendientes'}
            </span>
          </div>
          {errorSolicitudes && <div className="change-request-error" role="alert">{errorSolicitudes} <button type="button" onClick={() => cargarCitas()}>Reintentar solicitudes</button></div>}
          <div className="change-request-list">
            {solicitudesCambio.map((solicitud) => {
              const citaRelacionada = citas.find((cita) => String(cita.id) === String(solicitud.cita_id));
              return (
              <div className="change-request-row" key={solicitud.id}>
                <div className="change-request-time">
                  <strong>{formatearHora(solicitud.fecha_hora_solicitada, solicitud.zona_horaria)}</strong>
                  <span>{formatearFechaCorta(solicitud.fecha_hora_solicitada, solicitud.zona_horaria)}</span>
                </div>
                <div className="change-request-content">
                  <strong>{solicitud.estado === 'pendiente_medico' ? 'Contraoferta del paciente' : 'Solicitud de reprogramación'}</strong>
                  <span>{citaRelacionada?.paciente_nombre || 'Paciente'} · {citaRelacionada?.especialidad || 'Consulta médica'}</span>
                  <small>
                    {citaRelacionada ? `${formatearFechaCorta(citaRelacionada.fecha_hora, citaRelacionada.zona_horaria)} ${formatearHora(citaRelacionada.fecha_hora, citaRelacionada.zona_horaria)} → ` : 'Nuevo horario: '}
                    {formatearFechaCorta(solicitud.fecha_hora_solicitada, solicitud.zona_horaria)} {formatearHora(solicitud.fecha_hora_solicitada, solicitud.zona_horaria)}
                  </small>
                </div>
                <div className="change-request-actions">
                  <button className="next-actions-button" disabled={solicitudEnCurso !== null} onClick={() => handleSolicitud(solicitud.id, true)}>Aceptar horario</button>
                  <button className="request-reject-button" disabled={solicitudEnCurso !== null} onClick={() => handleSolicitud(solicitud.id, false)}>Rechazar</button>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Bento Grid */}
      <section className="bento">
        {/* 1. Próxima Cita */}
        <article className="card next-card">
          <div className="card-top">
            <span className="soft-icon sage">
              <Icon name="clock" />
            </span>
            <span className="tag">Próxima cita</span>
            <button className="icon-button" aria-label="Actualizar" onClick={cargarCitas}>
              <Icon name="more" />
            </button>
          </div>

          {cargandoCitas ? (
            <div style={{ margin: 'auto 0', color: '#7c8986', fontSize: '13px' }}>
              Consultando agenda en tiempo real...
            </div>
          ) : proximaCita ? (
            <>
              <div className="next-content">
                <div>
                  <span className="big-time">{formatearHora(proximaCita.fecha_hora, proximaCita.zona_horaria)}</span>
                  <span className="duration">
                    {formatearFechaCorta(proximaCita.fecha_hora, proximaCita.zona_horaria)} · Estado: {proximaCita.estado}
                  </span>
                </div>
                <div className="patient-line">
                  <div className="avatar lilac">
                    {proximaCita.paciente_nombre ? proximaCita.paciente_nombre.substring(0, 2).toUpperCase() : 'PA'}
                  </div>
                  <div>
                    <strong>{proximaCita.paciente_nombre || 'Paciente'}</strong>
                    <span>{proximaCita.paciente_email || 'Consulta médica'}</span>
                  </div>
                </div>
              </div>

              <div className="next-actions">
                <button onClick={() => setVistaActual && setVistaActual('expediente')}>
                  <Icon name="file" size={16} />
                  <span>Ver expediente</span>
                </button>
                <button
                  className="join"
                  onClick={() => setCitaDetalle(proximaCita)}
                >
                  <Icon name="chevron" size={16} />
                  <span>Ver cita</span>
                </button>
              </div>
            </>
          ) : (
            <div style={{ margin: 'auto 0', textAlign: 'center', padding: '20px 0' }}>
              <strong style={{ display: 'block', fontSize: '16px', color: '#1d2927', marginBottom: '6px' }}>
                Sin citas próximas
              </strong>
              <p style={{ margin: 0, fontSize: '12px', color: '#7c8986' }}>
                Tu agenda no tiene citas agendadas actualmente. Cuando un paciente reserve contigo, aparecerá aquí automáticamente.
              </p>
            </div>
          )}
        </article>

        {/* 2. Ritmo de la semana */}
        <article className="card pulse-card">
          <div className="card-title">
            <div>
              <span>Ritmo de atención</span>
              <strong>{citasActivas.length} {citasActivas.length === 1 ? 'paciente' : 'pacientes'}</strong>
            </div>
            <span className="trend">En tiempo real</span>
          </div>

          <div className="chart-bars" aria-label="Actividad semanal">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((dia, i) => (
              <div key={i}>
                <i
                  style={{ height: citasActivas.length > 0 ? `${Math.min(100, 25 * citasActivas.length)}%` : '12%' }}
                  className={i === 3 ? 'today' : ''}
                />
                <span>{dia}</span>
              </div>
            ))}
          </div>
        </article>

        {/* 3. Balance de bienestar */}
        <article className="card wellness-card">
          <div className="orb">
            <Icon name="sparkles" size={24} />
          </div>
          <p>Disponibilidad médica</p>
          <strong>
            {citasActivas.length === 0
              ? 'Tienes bloques disponibles para recibir pacientes hoy.'
              : `Tienes ${citasActivas.length} compromisos agendados esta semana.`}
          </strong>
          <button onClick={() => setVistaActual && setVistaActual('horarios')}>
            Configurar mis horarios <Icon name="arrow" size={15} />
          </button>
        </article>

        {/* 4. Agenda de hoy / Citas */}
        <article className="card schedule-card">
          <div className="section-heading">
            <div>
              <span>Citas agendadas</span>
              <h2>Agenda de pacientes</h2>
            </div>
            <button onClick={() => cargarCitas()}>
              Actualizar <Icon name="arrow" size={15} />
            </button>
          </div>

          <div className="schedule-list">
            {cargandoCitas ? (
              <p style={{ color: '#7c8986', fontSize: '13px', margin: '20px 0' }}>Cargando citas...</p>
            ) : citas.length === 0 ? (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: '#7c8986' }}>
                <Icon name="calendar" size={32} style={{ color: '#c4d1cd', marginBottom: '8px' }} />
                <p style={{ margin: 0, fontSize: '13px' }}>
                  Aún no tienes citas registradas. Los pacientes pueden agendar citas contigo desde su panel.
                </p>
              </div>
            ) : (
              agendaOrdenada.map((cita) => (
                <div className="appointment" key={cita.id}>
                  <div className="appointment-time">
                    <strong>{formatearHora(cita.fecha_hora, cita.zona_horaria)}</strong>
                    <span>{formatearFechaCorta(cita.fecha_hora, cita.zona_horaria)}</span>
                  </div>
                  <div className="rail">
                    <i />
                  </div>
                  <div className="avatar blue">
                    {cita.paciente_nombre ? cita.paciente_nombre.substring(0, 2).toUpperCase() : 'PA'}
                  </div>
                  <div className="patient-info">
                    <strong>{cita.paciente_nombre || 'Paciente'}</strong>
                    <span>{cita.especialidad || 'Consulta'} · Estado: {cita.estado}</span>
                  </div>
                  <span className={cita.estado === 'confirmada' ? 'mode' : 'mode remote'}>
                    <Icon name="users" size={14} />
                    <span>{cita.estado}</span>
                  </span>
                  <select
                    className="appointment-status-select"
                    value={cita.estado}
                    onChange={(event) => handleEstado(cita.id, event.target.value)}
                    aria-label="Cambiar estado de cita"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="confirmada">Confirmada</option>
                    <option value="cancelada">Cancelada</option>
                    <option value="rechazada">Rechazada</option>
                  </select>
                  <button
                    className="icon-button"
                    title="Ver detalle de la cita"
                    onClick={() => setCitaDetalle(cita)}
                  >
                    <Icon name="chevron" size={17} />
                  </button>
                </div>
              ))
            )}
          </div>
        </article>

        {/* 5. Asistente Inteligente */}
        <article className="card assistant-card">
          <div className="assistant-heading">
            <div className="ai-mark">
              <Icon name="sparkles" />
            </div>
            <div>
              <span>Asistente administrativo</span>
              <h2>¿Qué necesitas resolver?</h2>
            </div>
            <i>EN LÍNEA</i>
          </div>

          <div className="bot-message">
            {cargandoAsistente ? 'Procesando tu solicitud...' : mensajeAsistente}
          </div>

          <div className="chips">
            <button onClick={() => handleChipClick('¿Cuáles son mis citas programadas?')}>
              Ver mis citas
            </button>
            <button onClick={() => handleChipClick('¿Cómo configuro mis horarios?')}>
              Mis horarios
            </button>
            <button onClick={() => handleChipClick('Resumen de atención')}>
              Resumen del día
            </button>
          </div>

          <form className="chat-box" onSubmit={handleEnviarConsulta}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Escribe tu consulta o comando..."
              disabled={cargandoAsistente}
            />
            <button type="submit" aria-label="Enviar" disabled={cargandoAsistente}>
              <Icon name="send" size={18} />
            </button>
          </form>
        </article>

        {citaDetalle && (
          <CitaDetalleModal
            cita={citaDetalle}
            rol="medico"
            onClose={() => setCitaDetalle(null)}
            onCancel={async (citaId) => {
              await handleCancelar(citaId);
              setCitaDetalle(null);
            }}
            formatearFecha={formatearFechaCorta}
            formatearHora={formatearHora}
            onProposeChange={handleProponerCambio}
            actionError={errorPropuesta}
            onUpdateStatus={handleEstado}
          />
        )}

        {/* 6. Expedientes y Actividad reciente */}
        <article className="card records-card">
          <div className="section-heading">
            <div>
              <span>Actividad en tiempo real</span>
              <h2>Expedientes y Pacientes</h2>
            </div>
            <button
              className="round-add"
              aria-label="Nuevo expediente"
              onClick={() => setVistaActual && setVistaActual('expediente')}
            >
              <Icon name="plus" size={17} />
            </button>
          </div>

          {citasActivas.length === 0 ? (
            <p style={{ color: '#7c8986', fontSize: '13px', margin: '20px 0' }}>
              No hay actividad clínica reciente registrada.
            </p>
          ) : (
            citasActivas.slice(0, 3).map((c) => (
              <div
                key={c.id}
                className="record"
                style={{ cursor: 'pointer' }}
                onClick={() => setVistaActual && setVistaActual('expediente')}
              >
                <span className="soft-icon peach">
                  <Icon name="file" />
                </span>
                <div>
                  <strong>Consulta médica con {c.paciente_nombre}</strong>
                  <span>{formatearFechaCorta(c.fecha_hora, c.zona_horaria)} · {c.especialidad || 'Medicina General'}</span>
                </div>
                <Icon name="chevron" size={16} />
              </div>
            ))
          )}
        </article>
      </section>
    </div>
  );
}
