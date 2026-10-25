import React, { useEffect, useRef, useState } from 'react';
import { obtenerPersonasClinicasAPI, obtenerExpedienteAPI, agregarNotaClinicaAPI, actualizarPersonaClinicaAPI } from '../services/clinicalApi';
import { formatClinicDate, formatClinicTime, validClinicZone } from '../utils/dateTime';
import './ExpedienteClinico.css';

const clinicalFields = [
  ['antecedentes', 'Antecedentes'], ['alergias', 'Alergias'], ['motivo', 'Motivo de consulta'],
  ['exploracion', 'Exploración física'], ['diagnostico', 'Diagnóstico'],
  ['tratamiento', 'Tratamiento'], ['seguimiento', 'Seguimiento'],
];
const vitalFields = [
  ['peso_kg', 'Peso (kg)'], ['talla_cm', 'Talla (cm)'], ['temperatura_c', 'Temperatura (°C)'],
  ['frecuencia_cardiaca', 'Frecuencia cardíaca (lpm)'], ['presion_arterial', 'Presión arterial (mmHg)'],
  ['saturacion_oxigeno', 'Saturación de oxígeno (%)'],
];
const textLimits = { antecedentes: 8000, alergias: 4000, motivo: 2000, exploracion: 8000, diagnostico: 4000, tratamiento: 8000, seguimiento: 4000 };
const emptyDraft = () => Object.fromEntries([...clinicalFields, ...vitalFields, ['cita_id']].map(([key]) => [key, '']));
const missingValue = (value) => value == null || String(value).trim() === '' ? 'Sin datos registrados' : String(value);
const consentExplanation = 'Este expediente requiere autorización explícita. Reservar una cita para un beneficiario no autoriza consultar sus datos clínicos. Solicita al médico que revise el acceso.';

function appointmentLabel(appointment) {
  const zone = validClinicZone(appointment.zona_horaria) || 'UTC';
  const date = /(Z|[+-]\d{2}:?\d{2})$/i.test(appointment.fecha_hora || '')
    ? `${formatClinicDate(appointment.fecha_hora, zone)} · ${formatClinicTime(appointment.fecha_hora, zone)} · ${zone}`
    : 'Fecha sin zona registrada';
  return `#${appointment.id} · ${date}`;
}

function mergeNotes(previous, incoming) {
  const notes = [...previous];
  const ids = new Set(previous.map((note) => String(note.id)));
  incoming.forEach((note) => { if (!ids.has(String(note.id))) { ids.add(String(note.id)); notes.push(note); } });
  return notes.sort((a, b) => (new Date(a.creado_en) - new Date(b.creado_en)) || (Number(a.id) - Number(b.id)) || 0);
}

function formatBirthDate(value) {
  if (!value) return 'Sin datos registrados';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
}

function formatNoteDate(value) {
  if (!value) return 'Fecha no registrada';
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return `${value} (sin zona registrada)`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return `${new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date)} · UTC`;
}

export default function ExpedienteClinico({ usuario }) {
  // Remounting discards private state immediately, before a new session can render it.
  return <ClinicalPeople key={`${usuario?.access_token}:${usuario?.id}:${usuario?.rol}`} usuario={usuario} />;
}

function ClinicalPeople({ usuario }) {
  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const token = usuario?.access_token;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    if (!token) {
      setError('Inicia sesión para consultar los expedientes.');
      setLoading(false);
      return () => { active = false; };
    }
    obtenerPersonasClinicasAPI(token)
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('No se pudo interpretar la lista de personas.');
        if (active) setPeople(data);
      })
      .catch((err) => { if (active) setError(err.message || 'No se pudieron cargar las personas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, attempt]);

  const selected = people.find((person) => String(person.id) === selectedId) || people[0];
  return (
    <main className="clinical-page medical-record-page">
      <header className="clinical-header">
        <div>
          <h1>Expediente clínico</h1>
          <p>Datos de la persona atendida y entradas clínicas registradas por su médico.</p>
        </div>
      </header>
      {loading ? <p role="status" className="clinical-state">Cargando personas…</p> : error ? (
        <div className="record-error" role="alert">
          <p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Reintentar</button>
        </div>
      ) : !selected ? (
        <div className="clinical-state"><h2>Aún no hay personas con expediente disponible</h2><p>Las personas vinculadas a la atención médica aparecerán aquí.</p></div>
      ) : (
        <>
          <div className="record-person-picker">
            <label htmlFor="clinical-person">Persona del expediente</label>
            <select id="clinical-person" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
              {people.map((person) => <option key={person.id} value={person.id}>{person.nombre || 'Nombre no registrado'} · {person.tipo === 'beneficiario' ? 'Beneficiario' : 'Titular'} · #{person.id}</option>)}
            </select>
            <p>El expediente pertenece a la persona atendida, no a la cuenta que reservó la cita.</p>
          </div>
          {selected.acceso_clinico !== true ? (
            <section className="clinical-state" aria-label="Acceso clínico restringido"><h2>Acceso clínico restringido</h2><p>{consentExplanation}</p></section>
          ) : <PersonRecord key={String(selected.id)} person={selected} token={token} canWrite={usuario?.rol === 'medico'} />}
        </>
      )}
    </main>
  );
}

function PersonRecord({ person, token, canWrite }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState('');
  const mounted = useRef(false);
  const submitting = useRef(false);
  const paging = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setRecord(null);
    obtenerExpedienteAPI(token, person.id)
      .then((data) => {
        if (!data?.persona || String(data.persona.id) !== String(person.id) || !Array.isArray(data.notas)) {
          throw new Error('No se pudo verificar el expediente de la persona seleccionada.');
        }
        if (active) setRecord(data);
      })
      .catch((err) => { if (active) setError(err.message || 'No se pudo cargar el expediente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, person.id, attempt]);

  const changeDraft = (event) => {
    setDraft((current) => ({ ...current, [event.target.name]: event.target.value }));
    setSaved(false);
  };

  const loadMore = async () => {
    if (paging.current || !record?.paginacion?.has_more) return;
    paging.current = true;
    setLoadingMore(true);
    setPageError('');
    const { limit, offset } = record.paginacion;
    const nextOffset = offset + limit;
    try {
      const data = await obtenerExpedienteAPI(token, person.id, { limit, offset: nextOffset });
      if (String(data?.persona?.id) !== String(person.id) || !Array.isArray(data.notas) || data.paginacion?.offset !== nextOffset) {
        throw new Error('No se pudo verificar la siguiente página del expediente.');
      }
      if (data.persona.acceso_clinico === false) throw new Error('El acceso clínico ya no está autorizado.');
      if (mounted.current) setRecord((current) => ({ ...current, notas: mergeNotes(current.notas, data.notas), paginacion: data.paginacion }));
    } catch (err) {
      if (mounted.current) setPageError(err.message || 'No se pudieron cargar más entradas. Intenta nuevamente.');
    } finally {
      if (mounted.current) { paging.current = false; setLoadingMore(false); }
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canWrite || !record || record.persona.acceso_clinico === false || submitting.current) return;
    setSaveError('');
    setSaved(false);
    const text = Object.fromEntries(clinicalFields.map(([key]) => [key, draft[key].trim()]));
    const vitals = Object.fromEntries(vitalFields.filter(([key]) => draft[key].trim()).map(([key]) => [key, draft[key].trim()]));
    if (!Object.values(text).some(Boolean)) {
      setSaveError('Registra al menos un dato clínico antes de guardar.');
      return;
    }
    const appointmentId = draft.cita_id.trim();
    if (appointmentId && (!/^\d+$/.test(appointmentId) || !Number.isSafeInteger(Number(appointmentId)) || Number(appointmentId) < 1)) {
      setSaveError('La cita relacionada debe tener un identificador entero positivo.');
      return;
    }
    const payload = { ...text, signos_vitales: vitals, ...(appointmentId ? { cita_id: Number(appointmentId) } : {}) };
    if (new Blob([JSON.stringify(payload)]).size > 48000) {
      setSaveError('La entrada supera el límite de 48 000 bytes. Reduce el texto antes de guardar; tus datos siguen en el formulario.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      const response = await agregarNotaClinicaAPI(token, person.id, payload);
      if (!response?.nota?.id) throw new Error('No se pudo confirmar la entrada guardada. Consulta el historial antes de volver a intentar.');
      if (mounted.current) {
        setRecord((current) => ({
          ...current,
          notas: mergeNotes(current.notas, [response.nota]),
          ...(current.paginacion ? { paginacion: {
            ...current.paginacion,
            total: current.paginacion.total + (current.notas.some((note) => String(note.id) === String(response.nota.id)) ? 0 : 1),
          } } : {}),
        }));
        setDraft(emptyDraft());
        setSaved(true);
      }
    } catch (err) {
      if (mounted.current) setSaveError(err.message || 'No se pudo guardar la entrada. Tus datos siguen en el formulario.');
    } finally {
      if (mounted.current) { submitting.current = false; setSaving(false); }
    }
  };

  if (loading) return <p role="status" className="clinical-state">Cargando expediente…</p>;
  if (error) return <div className="record-error" role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Reintentar expediente</button></div>;
  if (!record) return null;
  if (record.persona.acceso_clinico === false) return <div className="clinical-state"><h2>Acceso clínico restringido</h2><p>{consentExplanation}</p></div>;
  const subject = record.persona;
  const appointments = (Array.isArray(record.citas) ? record.citas : []).filter((appointment) => ['confirmada', 'reprogramada', 'completada'].includes(appointment.estado));

  return (
    <div className="clinical-record record-content">
      <header className="record-demographics">
        <h2>{subject.nombre || 'Nombre no registrado'}</h2>
        <dl>
          <div><dt>Persona atendida</dt><dd>{subject.tipo === 'beneficiario' ? 'Beneficiario' : 'Titular'}</dd></div>
          <div><dt>Fecha de nacimiento</dt><dd>{formatBirthDate(subject.fecha_nacimiento)}</dd></div>
          <div><dt>Teléfono</dt><dd>{missingValue(subject.telefono)}</dd></div>
        </dl>
        {canWrite && <BirthDateForm person={subject} token={token} onSaved={(value) => setRecord((current) => ({ ...current, persona: { ...current.persona, fecha_nacimiento: value } }))} />}
      </header>

      <section className="record-notes" aria-label="Entradas clínicas">
        <details className="record-history-disclosure" open={!canWrite}>
        <summary>Entradas clínicas ({record.paginacion?.total ?? record.notas.length})</summary>
        <p>Historial de solo lectura. Las correcciones se registran como una nueva entrada, sin modificar las anteriores.</p>
        {!record.notas.length ? <p className="record-empty">Sin notas clínicas registradas</p> : (
          <ol className="record-note-list">
            {record.notas.map((note, index) => (
              <li key={note.id || index}>
                <article className="record-note" aria-label={`Entrada clínica ${index + 1}`}>
                  <header><h3>Entrada clínica {index + 1}</h3><p>{note.autor_nombre || (note.medico_id ? `Médico #${note.medico_id}` : 'Autor no registrado')} · <time dateTime={note.creado_en}>{formatNoteDate(note.creado_en)}</time></p></header>
                  {note.cita_id != null && <p>Cita relacionada: #{note.cita_id}</p>}
                  <dl className="record-clinical-details">
                    {clinicalFields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{missingValue(note[key])}</dd></div>)}
                  </dl>
                  <h4>Signos vitales</h4>
                  <dl className="record-vital-details">
                    {vitalFields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{missingValue(note.signos_vitales?.[key])}</dd></div>)}
                  </dl>
                </article>
              </li>
            ))}
          </ol>
        )}
        {pageError && <p className="record-error" role="alert">{pageError}</p>}
        {record.paginacion?.has_more && <button className="record-load-more" type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Cargando más entradas…' : 'Cargar más entradas'}</button>}
        </details>
      </section>

      {canWrite && (
        <section className="record-new-entry" aria-labelledby="new-entry-heading">
          <h2 id="new-entry-heading">Nueva entrada clínica</h2>
          <p id="clinical-entry-help">Registra solo datos evaluados. Un campo vacío significa que no hay datos registrados; escribe «sin alergias conocidas» únicamente si lo confirmaste.</p>
          <p>Para corregir un dato previo, agrega otra entrada; el historial no se modifica.</p>
          <form onSubmit={submit} aria-describedby="clinical-entry-help" autoComplete="off">
            <fieldset disabled={saving}>
              <legend>Evaluación clínica</legend>
              <div className="record-form-grid">
                {clinicalFields.map(([key, label]) => <div className="record-field" key={key}><label htmlFor={`entry-${key}`}>{label}</label><textarea id={`entry-${key}`} name={key} value={draft[key]} onChange={changeDraft} rows={3} maxLength={textLimits[key]} /></div>)}
              </div>
            </fieldset>
            <fieldset disabled={saving}>
              <legend>Signos vitales (opcionales)</legend>
              <div className="record-form-grid record-vital-grid">
                {vitalFields.map(([key, label]) => <div className="record-field" key={key}><label htmlFor={`entry-${key}`}>{label}</label><input id={`entry-${key}`} name={key} value={draft[key]} onChange={changeDraft} maxLength={32} inputMode={key === 'presion_arterial' ? 'text' : 'decimal'} /></div>)}
              </div>
            </fieldset>
            {appointments.length > 0 ? <div className="record-field record-appointment-field">
              <label htmlFor="entry-appointment">Cita relacionada (opcional)</label>
              <select id="entry-appointment" name="cita_id" value={draft.cita_id} onChange={changeDraft} disabled={saving} aria-describedby="entry-appointment-help">
                <option value="">Ninguna</option>
                {appointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{appointmentLabel(appointment)}</option>)}
              </select>
              <small id="entry-appointment-help">Solo se muestran citas elegibles de esta persona. El servidor valida la relación.</small>
            </div> : <p>No hay citas elegibles disponibles. Puedes guardar la entrada sin vincular una cita.</p>}
            {saveError && <p className="record-error" role="alert">{saveError}</p>}
            {saved && <p className="record-success" role="status">Entrada clínica guardada.</p>}
            <button className="record-save" type="submit" disabled={saving}>{saving ? 'Guardando entrada…' : 'Guardar entrada clínica'}</button>
          </form>
        </section>
      )}
    </div>
  );
}

function BirthDateForm({ person, token, onSaved }) {
  const [birthDate, setBirthDate] = useState(person.fecha_nacimiento?.slice(0, 10) || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const mounted = useRef(false);
  const submitting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    setSaved(false);
    if (!birthDate) { setError('Selecciona una fecha de nacimiento.'); return; }
    submitting.current = true;
    setSaving(true);
    try {
      const response = await actualizarPersonaClinicaAPI(token, person.id, { fecha_nacimiento: birthDate });
      if (String(response?.persona?.id) !== String(person.id)) throw new Error('No se pudo confirmar la actualización de esta persona.');
      if (mounted.current) {
        onSaved(response.persona.fecha_nacimiento);
        setBirthDate(response.persona.fecha_nacimiento?.slice(0, 10) || '');
        setSaved(true);
      }
    } catch (err) {
      if (mounted.current) setError(err.message || 'No se pudo guardar la fecha de nacimiento.');
    } finally {
      if (mounted.current) { submitting.current = false; setSaving(false); }
    }
  };

  return (
    <form className="record-birthdate-form" onSubmit={submit} autoComplete="off" aria-label="Actualizar fecha de nacimiento">
      <div className="record-field">
        <label htmlFor="record-birthdate">Fecha de nacimiento registrada</label>
        <input id="record-birthdate" type="date" value={birthDate} onChange={(event) => { setBirthDate(event.target.value); setSaved(false); }} required min="1900-01-01" max={new Date().toISOString().slice(0, 10)} disabled={saving} />
      </div>
      <button type="submit" disabled={saving}>{saving ? 'Guardando fecha…' : 'Guardar fecha de nacimiento'}</button>
      {error && <p className="record-error" role="alert">{error}</p>}
      {saved && <p className="record-success" role="status">Fecha de nacimiento guardada.</p>}
    </form>
  );
}
