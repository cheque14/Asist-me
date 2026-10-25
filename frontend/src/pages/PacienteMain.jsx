// src/pages/PacienteMain.jsx
import React, { useState, useEffect } from 'react';
import Icon from '../components/Icon';
import CitaDetalleModal from '../components/CitaDetalleModal';
import { dateInTimeZone, clinicDateTimeInputs, formatClinicDate, formatClinicTime } from '../utils/dateTime';
import { obtenerPersonasClinicasAPI } from '../services/clinicalApi';
import {
  enviarMensajeChat,
  obtenerCitasAPI,
  obtenerMedicosAPI,
  agendarCitaAPI,
  cancelarCitaAPI,
  solicitarCambioCitaAPI,
  resolverPropuestaCitaAPI,
  obtenerNotificacionesAPI,
  obtenerServiciosAPI,
} from '../services/api';

export default function PacienteMain({ usuario, setVistaActual, abrirAgendar, onAgendarAbierto }) {
  const [citas, setCitas] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [cargandoCitas, setCargandoCitas] = useState(true);
  const [errorCitas, setErrorCitas] = useState('');

  // Modal para agendar cita
  const [mostrarModalAgendar, setMostrarModalAgendar] = useState(false);
  const [medicoSeleccionado, setMedicoSeleccionado] = useState('');
  const [fechaCita, setFechaCita] = useState('');
  const [horaCita, setHoraCita] = useState('10:00');
  const [guardandoCita, setGuardandoCita] = useState(false);
  const [errorModal, setErrorModal] = useState('');
  const [motivoCita, setMotivoCita] = useState('');
  const [esParaOtraPersona, setEsParaOtraPersona] = useState(false);
  const [beneficiarioNombre, setBeneficiarioNombre] = useState('');
  const [beneficiarioTelefono, setBeneficiarioTelefono] = useState('');
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [beneficiarioSeleccionado, setBeneficiarioSeleccionado] = useState('');
  const [errorBeneficiarios, setErrorBeneficiarios] = useState('');
  useEffect(() => {
    let active = true;
    if (!mostrarModalAgendar || !usuario?.access_token) return undefined;
    obtenerPersonasClinicasAPI(usuario.access_token)
      .then((people) => {
        if (active) { setBeneficiarios(people.filter((person) => person.tipo === 'beneficiario')); setErrorBeneficiarios(''); }
      })
      .catch(() => { if (active) setErrorBeneficiarios('No se pudieron cargar los beneficiarios registrados. Reabre el formulario para reintentar antes de crear un registro duplicado.'); });
    return () => { active = false; };
  }, [mostrarModalAgendar, usuario?.access_token]);
  const [servicioSeleccionado, setServicioSeleccionado] = useState('');
  const [serviciosMedicos, setServiciosMedicos] = useState([]);
  const [cargandoServicios, setCargandoServicios] = useState(false);
  const [errorServicios, setErrorServicios] = useState('');

  const [citaEditando, setCitaEditando] = useState(null);
  const [mostrarModalEditar, setMostrarModalEditar] = useState(false);
  const [medicoEdicion, setMedicoEdicion] = useState('');
  const [fechaEdicion, setFechaEdicion] = useState('');
  const [horaEdicion, setHoraEdicion] = useState('10:00');
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState('');
  const [citaDetalle, setCitaDetalle] = useState(null);
  const [notificaciones, setNotificaciones] = useState([]);

  // Asistente AI
  const [query, setQuery] = useState('');
  const [cargandoAsistente, setCargandoAsistente] = useState(false);
  const [mensajeAsistente, setMensajeAsistente] = useState(
    'Soy el asistente administrativo de Asist-me. Te oriento sobre citas y navegación; no doy diagnósticos ni recetas.'
  );

  const nombrePaciente = usuario?.nombre ? usuario.nombre : 'Paciente';
  const zonaConsultorio = medicos.find((medico) => String(medico.id) === String(medicoSeleccionado))?.zona_horaria || '';
  const serviciosDelMedico = serviciosMedicos.filter(
    (servicio) => String(servicio.medico_id) === String(medicoSeleccionado)
  );
  const detalleServicioSeleccionado = serviciosDelMedico.find(
    (servicio) => String(servicio.id) === servicioSeleccionado
  );

  const hoy = new Date();
  const fechaFormateada = hoy
    .toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    .toUpperCase();

  // Cargar citas reales y médicos disponibles
  const cargarDatos = async () => {
    setCargandoCitas(true);
    setErrorCitas('');
    try {
      const [citasData, medicosData, notificacionesData] = await Promise.all([
        usuario?.access_token ? obtenerCitasAPI(usuario.access_token) : Promise.resolve([]),
        obtenerMedicosAPI().catch(() => []),
        usuario?.access_token ? obtenerNotificacionesAPI(usuario.access_token).catch(() => []) : Promise.resolve([]),
      ]);
      const listaMed = Array.isArray(medicosData) ? medicosData : [];
      setMedicos(listaMed);
      const medicosPorId = new Map(listaMed.map((medico) => [String(medico.id), medico]));
      setCitas((Array.isArray(citasData) ? citasData : []).map((cita) => {
        const medico = medicosPorId.get(String(cita.medico_id));
        return medico ? {
          ...cita,
          medico_nombre: medico.nombre || cita.medico_nombre,
          especialidad: medico.especialidad || cita.especialidad,
        } : cita;
      }));
      setNotificaciones(Array.isArray(notificacionesData) ? notificacionesData : []);
      if (listaMed.length > 0 && !medicoSeleccionado) {
        setMedicoSeleccionado(listaMed[0].id);
      }
    } catch (err) {
      setErrorCitas(err.message || 'Error al sincronizar tus citas.');
    } finally {
      setCargandoCitas(false);
    }
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.access_token]);

  useEffect(() => {
    if (!abrirAgendar) return;
    setMostrarModalAgendar(true);
    onAgendarAbierto?.();
  }, [abrirAgendar, onAgendarAbierto]);

  useEffect(() => {
    if (!mostrarModalAgendar) return undefined;
    let vigente = true;
    setCargandoServicios(true);
    setErrorServicios('');
    obtenerServiciosAPI()
      .then((data) => {
        if (vigente) setServiciosMedicos(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        if (vigente) setErrorServicios(error.message || 'No se pudieron cargar los servicios.');
      })
      .finally(() => {
        if (vigente) setCargandoServicios(false);
      });
    return () => { vigente = false; };
  }, [mostrarModalAgendar]);

  // Manejo de agendar cita real
  const handleAgendarSubmit = async (e) => {
    e.preventDefault();
    if (!medicoSeleccionado || !fechaCita || !horaCita) {
      setErrorModal('Por favor selecciona médico, fecha y hora.');
      return;
    }
    if (serviciosDelMedico.length > 0 && !servicioSeleccionado) {
      setErrorModal('Selecciona el servicio que necesitas.');
      return;
    }

    setGuardandoCita(true);
    setErrorModal('');

    try {
      await agendarCitaAPI(usuario.access_token, {
        medico_id: Number(medicoSeleccionado),
        servicio_id: servicioSeleccionado ? Number(servicioSeleccionado) : null,
        fecha_local: fechaCita,
        hora_local: horaCita,
        motivo: motivoCita,
        es_para_otra_persona: esParaOtraPersona,
        beneficiario_nombre: beneficiarioNombre,
        beneficiario_telefono: beneficiarioTelefono,
        ...(esParaOtraPersona && beneficiarioSeleccionado ? { persona_atendida_id: Number(beneficiarioSeleccionado) } : {}),
      });
      window.dispatchEvent(new Event('asis:notifications-updated'));

      setMostrarModalAgendar(false);
      setFechaCita('');
      setMotivoCita('');
      setServicioSeleccionado('');
      setEsParaOtraPersona(false);
      setBeneficiarioNombre('');
      setBeneficiarioTelefono('');
      setBeneficiarioSeleccionado('');
      await cargarDatos();
      alert(`Solicitud enviada para el ${fechaCita} a las ${horaCita} (${zonaConsultorio || 'hora del consultorio'}).`);
    } catch (err) {
      setErrorModal(err.message || 'No se pudo agendar la cita.');
    } finally {
      setGuardandoCita(false);
    }
  };

  const handleCancelar = async (citaId) => {
    if (!window.confirm('¿Deseas cancelar esta cita?')) return;
    try {
      await cancelarCitaAPI(usuario.access_token, citaId);
      window.dispatchEvent(new Event('asis:notifications-updated'));
      await cargarDatos();
    } catch (err) {
      alert(err.message || 'Error al cancelar la cita');
    }
  };

  const abrirEdicion = (cita) => {
    const fechaLocal = clinicDateTimeInputs(cita.fecha_hora, cita.zona_horaria);
    setCitaEditando(cita);
    setMedicoEdicion(String(cita.medico_id || medicos[0]?.id || ''));
    setFechaEdicion(fechaLocal.date);
    setHoraEdicion(fechaLocal.time || '10:00');
    setErrorEdicion('');
    setMostrarModalEditar(true);
  };

  const abrirDetalle = (cita) => setCitaDetalle(cita);

  const responderPropuesta = async (solicitudId, accion, fechaHora) => {
    try {
      await resolverPropuestaCitaAPI(usuario.access_token, solicitudId, accion, fechaHora);
      window.dispatchEvent(new Event('asis:notifications-updated'));
      setCitaDetalle(null);
      await cargarDatos();
      alert(accion === 'aceptar' ? 'Cambio aceptado.' : accion === 'rechazar' ? 'Cambio rechazado.' : 'Contraoferta enviada.');
    } catch (err) {
      alert(err.message || 'No se pudo responder la propuesta.');
    }
  };

  const handleEditarSubmit = async (event) => {
    event.preventDefault();
    if (!citaEditando || !medicoEdicion || !fechaEdicion || !horaEdicion) {
      setErrorEdicion('Selecciona médico, fecha y hora.');
      return;
    }
    setGuardandoEdicion(true);
    setErrorEdicion('');
    try {
      await solicitarCambioCitaAPI(usuario.access_token, citaEditando.id, {
        medico_id: Number(medicoEdicion),
        fecha_local: fechaEdicion,
        hora_local: horaEdicion,
        motivo: 'Cambio solicitado por el paciente',
      });
      window.dispatchEvent(new Event('asis:notifications-updated'));
      setMostrarModalEditar(false);
      await cargarDatos();
      alert('Solicitud enviada. El nuevo horario queda reservado hasta que el médico la acepte.');
    } catch (err) {
      setErrorEdicion(err.message || 'No se pudo solicitar el cambio.');
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const handleEnviarConsulta = async (consulta = query) => {
    const texto = consulta.trim();
    if (!texto || cargandoAsistente) return;
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
      setMensajeAsistente('No pude conectar con el servidor.');
    } finally {
      setCargandoAsistente(false);
    }
  };

  const citasActivas = citas.filter((c) => !['cancelada', 'rechazada', 'completada'].includes(c.estado)
    && new Date(c.fecha_hora).getTime() >= Date.now()).sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
  const proximaCita = citasActivas.length > 0 ? citasActivas[0] : null;

  const zonaDeFecha = (value) => citas.find((item) => item.fecha_hora === value)?.zona_horaria
    || citas.map((item) => item.solicitud_cambio).find((item) => item?.fecha_hora_solicitada === value)?.zona_horaria;
  const formatearHora = (value, zone) => formatClinicTime(value, zone || zonaDeFecha(value));
  const formatearFechaCorta = (value, zone) => formatClinicDate(value, zone || zonaDeFecha(value));

  return (
    <div className="bento-dashboard" aria-label="Panel del Paciente">
      {/* Hero Section */}
      <section className="bento-hero">
        <div>
          <p className="eyebrow">{fechaFormateada}</p>
          <h1>Hola, {nombrePaciente}.</h1>
          <p className="subtitle">
            {citasActivas.length === 0
              ? 'No tienes citas agendadas actualmente. Puedes reservar con un médico especialista cuando lo necesites.'
              : `Tienes ${citasActivas.length} ${citasActivas.length === 1 ? 'consulta programada' : 'consultas programadas'}.`}
          </p>
        </div>

        <div className="hero-actions">
          <div className="role-badge">
            <Icon name="users" size={16} />
            <span>Paciente</span>
          </div>

          <button
            className="primary-btn"
            onClick={() => setMostrarModalAgendar(true)}
          >
            <Icon name="plus" size={18} />
            <span>Agendar cita médica</span>
          </button>
        </div>
      </section>

      {errorCitas && (
        <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px 16px', borderRadius: '14px', marginBottom: '18px', fontSize: '13px' }}>
          {errorCitas}
        </div>
      )}

      {notificaciones.filter((notificacion) => !notificacion.leida).slice(0, 2).map((notificacion) => (
        <div key={notificacion.id} className="appointment-notification" role="status">
          <Icon name="sparkles" size={16} />
          <span>{notificacion.mensaje}</span>
        </div>
      ))}

      {/* Bento Grid */}
      <section className="bento">
        {/* 1. Próxima Cita */}
        <article className="card next-card">
          <div className="card-top">
            <span className="soft-icon sage">
              <Icon name="clock" />
            </span>
            <span className="tag">Próxima cita médica</span>
            <button className="icon-button" aria-label="Actualizar" onClick={cargarDatos}>
              <Icon name="more" />
            </button>
          </div>

          {cargandoCitas ? (
            <div style={{ margin: 'auto 0', color: '#7c8986', fontSize: '13px' }}>
              Cargando tu información médica...
            </div>
          ) : proximaCita ? (
            <>
              <div className="next-content">
                <div>
                  <span className="big-time">{formatearHora(proximaCita.fecha_hora)}</span>
                  <span className="duration">
                    {formatearFechaCorta(proximaCita.fecha_hora)} · Estado: {proximaCita.estado}
                  </span>
                </div>
                <div className="patient-line">
                  <div className="avatar doctor">
                    {proximaCita.medico_nombre ? proximaCita.medico_nombre.replace('Dr. ', '').substring(0, 2).toUpperCase() : 'DR'}
                  </div>
                  <div>
                    <strong>{proximaCita.medico_nombre}</strong>
                    <span>{proximaCita.especialidad || 'Medicina General'}</span>
                  </div>
                </div>
              </div>

              <div className="next-actions">
                <button onClick={() => setVistaActual && setVistaActual('expediente')}>
                  <Icon name="file" size={16} />
                  <span>Ver indicaciones</span>
                </button>
                <button
                  className="join"
                  onClick={() => abrirDetalle(proximaCita)}
                >
                  <Icon name="chevron" size={16} />
                  <span>Ver cita</span>
                </button>
              </div>
            </>
          ) : (
            <div style={{ margin: 'auto 0', textAlign: 'center', padding: '20px 0' }}>
              <strong style={{ display: 'block', fontSize: '16px', color: '#1d2927', marginBottom: '6px' }}>
                Sin citas pendientes
              </strong>
              <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#7c8986' }}>
                Reserva una consulta con uno de los médicos registrados en AsisTme.
              </p>
              <button
                className="primary-btn"
                style={{ height: '36px', fontSize: '12px', margin: '0 auto' }}
                onClick={() => setMostrarModalAgendar(true)}
              >
                <Icon name="plus" size={15} />
                <span>Agendar ahora</span>
              </button>
            </div>
          )}
        </article>

        {/* 2. Seguimiento y Médicos registrados */}
        <article className="card pulse-card">
          <div className="card-title">
            <div>
              <span>Médicos disponibles</span>
              <strong>{medicos.length} especialistas</strong>
            </div>
            <span className="trend">Red médica</span>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {medicos.slice(0, 3).map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f4f2' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="avatar blue" style={{ width: '32px', height: '32px', fontSize: '11px' }}>
                    {m.nombre.replace('Dr. ', '').substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '12px', color: '#1d2927' }}>{m.nombre}</strong>
                    <span style={{ fontSize: '10px', color: '#7c8986' }}>{m.especialidad}</span>
                  </div>
                </div>
                <button
                  style={{ border: 'none', background: 'none', color: '#174f49', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                  onClick={() => {
                    setMedicoSeleccionado(m.id);
                    setMostrarModalAgendar(true);
                  }}
                >
                  Agendar
                </button>
              </div>
            ))}
          </div>
        </article>

        {/* 3. Tarjeta de Bienestar */}
        <article className="card wellness-card">
          <div className="orb">
            <Icon name="sparkles" size={24} />
          </div>
          <p>Atención continua</p>
          <strong>
            {citasActivas.length === 0
              ? 'Mantén al día tus chequeos preventivos con nuestros especialistas.'
              : `Tu cita más cercana es el ${formatearFechaCorta(proximaCita?.fecha_hora)}.`}
          </strong>
          <button onClick={() => setVistaActual && setVistaActual('servicios')}>
            Ver catálogo de servicios <Icon name="arrow" size={15} />
          </button>
        </article>

        {/* 4. Mis Citas Programadas */}
        <article className="card schedule-card">
          <div className="section-heading">
            <div>
              <span>Tus consultas</span>
              <h2>Citas Médicas</h2>
            </div>
            <button onClick={() => setMostrarModalAgendar(true)}>
              + Nueva cita <Icon name="arrow" size={15} />
            </button>
          </div>

          <div className="schedule-list">
            {cargandoCitas ? (
              <p style={{ color: '#7c8986', fontSize: '13px', margin: '20px 0' }}>Consultando citas...</p>
            ) : citas.length === 0 ? (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: '#7c8986' }}>
                <Icon name="calendar" size={32} style={{ color: '#c4d1cd', marginBottom: '8px' }} />
                <p style={{ margin: 0, fontSize: '13px' }}>
                  No tienes citas agendadas aún. Haz clic en "Agendar cita médica" para elegir tu especialista.
                </p>
              </div>
            ) : (
              citas.map((cita) => (
                <div className="appointment" key={cita.id}>
                  <div className="appointment-time">
                    <strong>{formatearHora(cita.fecha_hora)}</strong>
                    <span>{formatearFechaCorta(cita.fecha_hora)}</span>
                  </div>
                  <div className="rail">
                    <i />
                  </div>
                  <div className="avatar doctor">
                    {cita.medico_nombre ? cita.medico_nombre.replace('Dr. ', '').substring(0, 2).toUpperCase() : 'DR'}
                  </div>
                  <div className="patient-info">
                    <strong>{cita.medico_nombre}</strong>
                    <span>{cita.especialidad || 'Medicina General'} · Estado: {cita.estado}</span>
                  </div>
                  <span className={cita.estado === 'confirmada' ? 'mode' : 'mode remote'}>
                    <Icon name="users" size={14} />
                    <span>{cita.estado}</span>
                  </span>
                  {cita.estado !== 'cancelada' && !cita.solicitud_cambio && (
                    <button className="appointment-edit-button" onClick={() => abrirEdicion(cita)}>
                      Editar
                    </button>
                  )}
                  <button
                    className="icon-button"
                    title="Ver detalle de la cita"
                    onClick={() => abrirDetalle(cita)}
                  >
                    <Icon name="chevron" size={17} />
                  </button>
                </div>
              ))
            )}
          </div>
        </article>

        {/* 5. Asistente Inteligente AsisTme */}
        <article className="card assistant-card">
          <div className="assistant-heading">
            <div className="ai-mark">
              <Icon name="sparkles" />
            </div>
            <div>
              <span>Asistente AsisTme</span>
              <h2>¿En qué te ayudo hoy?</h2>
            </div>
            <i>EN LÍNEA</i>
          </div>

          <div className="bot-message">
            {cargandoAsistente ? 'Consultando al asistente...' : mensajeAsistente}
          </div>

          <div className="chips">
            <button onClick={() => setMostrarModalAgendar(true)}>
              Agendar cita
            </button>
            <button onClick={() => handleEnviarConsulta('¿Qué médicos están disponibles?')}>
              Médicos disponibles
            </button>
            <button onClick={() => setVistaActual && setVistaActual('servicios')}>
              Ver servicios
            </button>
          </div>

          <form className="chat-box" onSubmit={(event) => {
            event.preventDefault();
            handleEnviarConsulta();
          }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pregúntale a AsisTme..."
              disabled={cargandoAsistente}
            />
            <button type="submit" aria-label="Enviar" disabled={cargandoAsistente}>
              <Icon name="send" size={18} />
            </button>
          </form>
        </article>

        {/* 6. Documentos y Resumen */}
        <article className="card records-card">
          <div className="section-heading">
            <div>
              <span>Historial de citas</span>
              <h2>Documentos y Expediente</h2>
            </div>
            <button
              className="round-add"
              aria-label="Ver todos los documentos"
              onClick={() => setVistaActual && setVistaActual('historial')}
            >
              <Icon name="file" size={17} />
            </button>
          </div>

          {citasActivas.length === 0 ? (
            <p style={{ color: '#7c8986', fontSize: '13px', margin: '20px 0' }}>
              Tus consultas y diagnósticos quedarán archivados aquí una vez concluidas.
            </p>
          ) : (
            citasActivas.slice(0, 2).map((c) => (
              <div
                key={c.id}
                className="record"
                style={{ cursor: 'pointer' }}
                onClick={() => setVistaActual && setVistaActual('historial')}
              >
                <span className="soft-icon peach">
                  <Icon name="file" />
                </span>
                <div>
                  <strong>Consulta médica con {c.medico_nombre}</strong>
                  <span>{formatearFechaCorta(c.fecha_hora)} · {c.especialidad}</span>
                </div>
                <Icon name="chevron" size={16} />
              </div>
            ))
          )}
        </article>
      </section>

      {/* Modal para Agendar Cita */}
      {mostrarModalAgendar && (
        <div style={styles.overlayModal}>
          <div className="card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="soft-icon sage">
                  <Icon name="calendar" size={18} />
                </span>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#1d2927' }}>
                  Agendar Cita con Médico
                </h3>
              </div>
              <button
                className="icon-button"
                onClick={() => setMostrarModalAgendar(false)}
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            {errorModal && (
              <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: '12px', fontSize: '12px', marginBottom: '14px' }}>
                {errorModal}
              </div>
            )}

            <form onSubmit={handleAgendarSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label" style={styles.labelModal}>
                  MÉDICO ESPECIALISTA REGISTRADO
                </label>
                {medicos.length === 0 ? (
                  <p style={{ color: '#b91c1c', fontSize: '12px', margin: '4px 0' }}>
                    No hay médicos registrados aún en el sistema. Registra un médico primero.
                  </p>
                ) : (
                  <select
                    value={medicoSeleccionado}
                    onChange={(e) => {
                      setMedicoSeleccionado(e.target.value);
                      setServicioSeleccionado('');
                    }}
                    style={styles.modalSelect}
                    required
                  >
                    {medicos.map((med) => (
                      <option key={med.id} value={med.id}>
                        {med.nombre} — {med.especialidad} ({med.licencia_medica || 'Certificado'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="appointment-services" aria-live="polite" aria-busy={cargandoServicios}>
                <label className="label" style={styles.labelModal} htmlFor="appointment-service">SERVICIO QUE NECESITAS</label>
                {cargandoServicios ? (
                  <p className="appointment-services-message">Cargando servicios…</p>
                ) : errorServicios ? (
                  <p className="appointment-services-message error">{errorServicios}</p>
                ) : serviciosDelMedico.length ? (
                  <>
                    <select
                      id="appointment-service"
                      value={servicioSeleccionado}
                      onChange={(event) => setServicioSeleccionado(event.target.value)}
                      style={styles.modalSelect}
                      required
                    >
                      <option value="" disabled>Selecciona un servicio</option>
                    {serviciosDelMedico.map((servicio) => (
                      <option key={servicio.id} value={servicio.id}>
                        {servicio.servicio} — {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(servicio.precio) || 0)}
                      </option>
                    ))}
                    </select>
                    {detalleServicioSeleccionado?.descripcion && (
                      <p className="appointment-service-description">{detalleServicioSeleccionado.descripcion}</p>
                    )}
                  </>
                ) : (
                  <p className="appointment-services-message">
                    {medicoSeleccionado ? 'Este médico aún no ha publicado servicios. Puedes continuar sin seleccionar uno.' : 'Selecciona un médico para consultar sus servicios.'}
                  </p>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="label" style={styles.labelModal} htmlFor="booking-clinic-date">
                    FECHA DE LA CITA
                  </label>
                  <input
                    type="date"
                    id="booking-clinic-date"
                    aria-label="Fecha de la cita"
                    aria-describedby="booking-clinic-zone"
                    min={zonaConsultorio ? dateInTimeZone(new Date(), zonaConsultorio) : undefined}
                    value={fechaCita}
                    onChange={(e) => setFechaCita(e.target.value)}
                    style={styles.modalInput}
                    required
                  />
                </div>

                <div>
                  <label className="label" style={styles.labelModal} htmlFor="booking-clinic-time">
                    HORA
                  </label>
                  <input
                    type="time"
                    id="booking-clinic-time"
                    aria-label="Hora de la cita"
                    aria-describedby="booking-clinic-zone"
                    value={horaCita}
                    onChange={(e) => setHoraCita(e.target.value)}
                    style={styles.modalInput}
                    required
                  />
                </div>
              </div>

              <p className="appointment-services-message" id="booking-clinic-zone">
                {zonaConsultorio ? `Hora del consultorio: ${zonaConsultorio}. La reserva usa esta zona aunque estés en otro país.` : 'Selecciona un médico para conocer la zona horaria del consultorio.'}
              </p>

              <div>
                <label className="label" style={styles.labelModal}>MOTIVO DE LA CITA</label>
                <textarea value={motivoCita} onChange={(e) => setMotivoCita(e.target.value)} style={styles.modalInput} rows="3" placeholder="Describe brevemente el motivo de tu consulta" required />
              </div>

              <label className="appointment-person-toggle">
                <input type="checkbox" checked={esParaOtraPersona} onChange={(e) => { setEsParaOtraPersona(e.target.checked); setBeneficiarioSeleccionado(''); setBeneficiarioNombre(''); setBeneficiarioTelefono(''); }} />
                <span>La cita es para otra persona</span>
              </label>

              {esParaOtraPersona && (
                <div className="appointment-beneficiary-fields">
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="booking-beneficiary" className="label" style={styles.labelModal}>Beneficiario registrado</label>
                    <select id="booking-beneficiary" value={beneficiarioSeleccionado} style={styles.modalSelect} onChange={(event) => {
                      const id = event.target.value;
                      const person = beneficiarios.find((item) => String(item.id) === id);
                      setBeneficiarioSeleccionado(id);
                      setBeneficiarioNombre(person?.nombre || '');
                      setBeneficiarioTelefono(person?.telefono || '');
                    }}>
                      <option value="">Registrar otra persona</option>
                      {beneficiarios.map((person) => <option key={person.id} value={person.id}>{person.nombre} · #{person.id}</option>)}
                    </select>
                    <p>Selecciona la misma persona para conservar su expediente. Los registros antiguos no se unen por coincidencia de nombre.</p>
                    {errorBeneficiarios && <p role="alert">{errorBeneficiarios}</p>}
                  </div>
                  <div>
                    <label htmlFor="booking-beneficiary-name" className="label" style={styles.labelModal}>NOMBRE COMPLETO</label>
                    <input id="booking-beneficiary-name" value={beneficiarioNombre} readOnly={!!beneficiarioSeleccionado} onChange={(e) => setBeneficiarioNombre(e.target.value)} style={styles.modalInput} required />
                  </div>
                  <div>
                    <label htmlFor="booking-beneficiary-phone" className="label" style={styles.labelModal}>TELÉFONO</label>
                    <input id="booking-beneficiary-phone" type="tel" value={beneficiarioTelefono} readOnly={!!beneficiarioSeleccionado && !!beneficiarios.find((person) => String(person.id) === beneficiarioSeleccionado)?.telefono} onChange={(e) => setBeneficiarioTelefono(e.target.value)} style={styles.modalInput} required />
                  </div>
                </div>
              )}

              <div style={styles.modalFooter}>
                <button
                  type="button"
                  style={styles.btnCancelar}
                  onClick={() => setMostrarModalAgendar(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoCita || medicos.length === 0}
                  className="primary-btn"
                >
                  {guardandoCita ? 'Agendando...' : 'Confirmar Cita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarModalEditar && (
        <div style={styles.overlayModal}>
          <div className="card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div>
                <span className="eyebrow">SOLICITUD</span>
                <h3 style={{ margin: '4px 0 0', fontSize: '18px', color: '#1d2927' }}>Editar cita</h3>
              </div>
              <button className="icon-button" onClick={() => setMostrarModalEditar(false)} aria-label="Cerrar edición">✕</button>
            </div>
            <p style={{ color: '#5c6b68', fontSize: '12px', lineHeight: 1.5 }}>
              El horario nuevo se validará contra la agenda real y quedará reservado hasta que el médico lo acepte.
            </p>
            {errorEdicion && <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: '12px', fontSize: '12px', marginBottom: '14px' }}>{errorEdicion}</div>}
            <p>Hora del consultorio: {medicos.find((item) => String(item.id) === String(medicoEdicion))?.zona_horaria || 'Zona pendiente: consulta al médico'}</p>
            <form onSubmit={handleEditarSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label" style={styles.labelModal}>MÉDICO</label>
                <select value={medicoEdicion} onChange={(e) => setMedicoEdicion(e.target.value)} style={styles.modalSelect} required>
                  {medicos.map((medico) => <option key={medico.id} value={medico.id}>{medico.nombre} — {medico.especialidad}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="label" htmlFor="edit-clinic-date" style={styles.labelModal}>NUEVA FECHA</label>
                  <input id="edit-clinic-date" type="date" min={dateInTimeZone(new Date(), medicos.find((item) => String(item.id) === String(medicoEdicion))?.zona_horaria)} value={fechaEdicion} onChange={(e) => setFechaEdicion(e.target.value)} style={styles.modalInput} required />
                </div>
                <div>
                  <label className="label" htmlFor="edit-clinic-time" style={styles.labelModal}>NUEVA HORA</label>
                  <input id="edit-clinic-time" type="time" value={horaEdicion} onChange={(e) => setHoraEdicion(e.target.value)} style={styles.modalInput} required />
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" style={styles.btnCancelar} onClick={() => setMostrarModalEditar(false)}>Cancelar</button>
                <button type="submit" disabled={guardandoEdicion} className="primary-btn">{guardandoEdicion ? 'Validando...' : 'Solicitar cambio'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {citaDetalle && (
        <CitaDetalleModal
          cita={citaDetalle}
          rol="paciente"
          onClose={() => setCitaDetalle(null)}
          onCancel={async (citaId) => {
            await handleCancelar(citaId);
            setCitaDetalle(null);
          }}
          formatearFecha={formatearFechaCorta}
          formatearHora={formatearHora}
          onResolveProposal={citaDetalle.solicitud_cambio?.estado === 'pendiente_paciente'
            ? responderPropuesta
            : undefined}
        />
      )}
    </div>
  );
}

const styles = {
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
  modalSelect: {
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
    cursor: 'pointer',
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
