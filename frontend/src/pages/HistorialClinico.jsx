import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { obtenerCitasAPI } from '../services/api';
import { formatClinicDate, formatClinicTime, validClinicZone } from '../utils/dateTime';
import './ExpedienteClinico.css';

const formatAppointment = (value, zone) => {
  if (!value) return 'Fecha pendiente';
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return 'Fecha sin zona registrada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha pendiente';
  const clinicZone = validClinicZone(zone);
  const timeZone = clinicZone || 'UTC';
  return `${formatClinicDate(value, timeZone)} · ${formatClinicTime(value, timeZone)} · ${timeZone}${clinicZone ? '' : ' (zona de clínica no disponible)'}`;
};

const initialsFor = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

const groupAppointments = (appointments) => {
  const groups = new Map();
  appointments.forEach((appointment) => {
    const beneficiary = appointment.es_para_otra_persona === true || appointment.persona_tipo === 'beneficiario';
    const key = appointment.persona_atendida_id != null
      ? `persona:${appointment.persona_atendida_id}`
      : beneficiary ? `beneficiario:cita:${appointment.id}` : `titular:${appointment.paciente_id}`;
    const person = groups.get(key) || {
      id: key,
      nombre: beneficiary
        ? appointment.beneficiario_nombre || 'Beneficiario sin nombre registrado'
        : appointment.paciente_nombre || 'Titular sin nombre registrado',
      telefono: beneficiary ? appointment.beneficiario_telefono : appointment.paciente_telefono,
      tipo: beneficiary ? 'Beneficiario' : 'Titular',
      account: appointment.paciente_nombre || 'Nombre no registrado',
      appointments: [],
    };
    person.appointments.push(appointment);
    groups.set(key, person);
  });
  return [...groups.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
};

const statusLabels = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  reprogramada: 'Reprogramada',
  cancelada: 'Cancelada',
  completada: 'Completada',
};

export default function HistorialClinico({ usuario }) {
  return <AppointmentHistory key={`${usuario?.access_token}:${usuario?.id}:${usuario?.rol}`} usuario={usuario} />;
}

function AppointmentHistory({ usuario }) {
  const [citas, setCitas] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const esMedico = usuario?.rol === 'medico';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    obtenerCitasAPI(usuario?.access_token)
      .then((data) => { if (active) setCitas(Array.isArray(data) ? data : []); })
      .catch((err) => { if (active) setError(err.message || 'No se pudo cargar el historial de citas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [usuario?.access_token, attempt]);

  const patients = useMemo(() => groupAppointments(citas), [citas]);

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) || patients[0];
  const visits = [...(selectedPatient?.appointments || [])].sort(
    (a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora),
  );
  const displayName = selectedPatient?.nombre || 'Persona atendida';
  const initials = initialsFor(displayName);

  return (
    <div className="clinical-page appointment-history">
      <header className="clinical-header">
        <div>
          <h1>Historial de citas</h1>
          <p>Consulta las citas de cada persona atendida. Este historial no es un expediente clínico.</p>
        </div>
        {!loading && !error && <span className="clinical-count">{patients.length} {patients.length === 1 ? 'persona' : 'personas'}</span>}
      </header>

      {error ? <div className="calendar-error" role="alert">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>Reintentar</button></div> : loading ? (
        <div className="clinical-state" role="status">Cargando historial…</div>
      ) : patients.length === 0 ? (
        <div className="clinical-state">
          <Icon name="users" size={30} />
          <h2>Aún no hay citas registradas</h2>
          <p>Las personas atendidas aparecerán aquí cuando tengan citas agendadas.</p>
        </div>
      ) : (
        <div className="clinical-layout">
            <section className="clinical-patient-list" aria-label="Personas atendidas">
              <div className="clinical-section-title">
                <h2>Personas atendidas</h2>
                <span>{patients.length}</span>
              </div>
              {patients.map((patient) => {
                const active = String(patient.id) === String(selectedPatient?.id);
                return (
                  <button
                    type="button"
                    key={patient.id}
                    className={`clinical-patient-row ${active ? 'active' : ''}`}
                    onClick={() => setSelectedPatientId(patient.id)}
                    aria-pressed={active}
                  >
                    <span className="clinical-avatar" aria-hidden="true">{initialsFor(patient.nombre)}</span>
                    <span className="clinical-patient-copy">
                      <strong>{patient.nombre}</strong>
                      <small>{patient.tipo} · {patient.appointments.length} {patient.appointments.length === 1 ? 'cita' : 'citas'}</small>
                      {patient.id.startsWith('beneficiario:cita:') && <small>Cita #{patient.appointments[0].id} · identidad histórica sin vincular</small>}
                    </span>
                    <Icon name="chevron" size={16} />
                  </button>
                );
              })}
            </section>

          <section className="clinical-record" aria-label={`Citas de ${displayName}`}>
            <div className="clinical-record-header">
              <span className="clinical-avatar large">{initials}</span>
              <div>
                <h2>{displayName}</h2>
                <p>{selectedPatient?.tipo} · Cuenta titular: {selectedPatient?.account}</p>
                <p>{selectedPatient?.telefono || 'Teléfono no registrado'}</p>
              </div>
              <span className="clinical-count">{visits.length} {visits.length === 1 ? 'cita' : 'citas'}</span>
            </div>
            <div className="clinical-visit-list">
              <h3>Historial de citas</h3>
              {visits.map((visit) => (
                <article className="clinical-visit" key={visit.id}>
                  <span className="clinical-visit-marker" aria-hidden="true" />
                  <div className="clinical-visit-content">
                    <div className="clinical-visit-topline">
                      <time dateTime={visit.fecha_hora}>{formatAppointment(visit.fecha_hora, visit.zona_horaria)}</time>
                      <span className={`clinical-status status-${visit.estado || 'pendiente'}`}>
                        {statusLabels[visit.estado] || visit.estado || 'Pendiente'}
                      </span>
                    </div>
                    <strong>{visit.motivo || 'Consulta médica'}</strong>
                    <p>{visit.especialidad || 'Consulta'}{!esMedico && visit.medico_nombre ? ` · ${visit.medico_nombre}` : ''}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
