import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { cancelarCitaAPI, obtenerCitasAPI, actualizarEstadoCitaAPI, proponerCambioCitaAPI } from '../services/api';
import CitaDetalleModal from '../components/CitaDetalleModal';
import { dateInTimeZone, formatClinicDate, formatClinicTime, validClinicZone } from '../utils/dateTime';

const WEEKDAYS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat('es-MX', { month: 'short' });

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromAppointment(appointment) {
  const key = dateInTimeZone(new Date(appointment.fecha_hora), validClinicZone(appointment.zona_horaria) || 'UTC');
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatTime(value, zone) { return formatClinicTime(value, zone); }
function formatDate(value, zone) { return formatClinicDate(value, zone); }

function initials(name, fallback) {
  if (!name) return fallback;
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function CalendarioCitas({ usuario, setVistaActual, onNuevaCita }) {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [citaDetalle, setCitaDetalle] = useState(null);

  const cargarCitas = async () => {
    if (!usuario?.access_token) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError('');
    try {
      const data = await obtenerCitasAPI(usuario.access_token);
      setCitas(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las citas.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarCitas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.access_token]);

  const citasActivas = useMemo(
    () => citas.filter((cita) => cita.estado !== 'cancelada'),
    [citas]
  );

  const citasPorDia = useMemo(() => {
    const grouped = new Map();
    citasActivas.forEach((cita) => {
      const date = dateFromAppointment(cita);
      if (!date) return;
      const key = dateKey(date);
      grouped.set(key, [...(grouped.get(key) || []), cita]);
    });
    return grouped;
  }, [citasActivas]);

  const calendarDays = useMemo(() => {
    const firstDay = startOfMonth(month);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const firstCell = new Date(firstDay);
    firstCell.setDate(firstDay.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstCell);
      date.setDate(firstCell.getDate() + index);
      return date;
    });
  }, [month]);

  const selectedAppointments = citasPorDia.get(dateKey(selectedDate)) || [];
  const monthAppointments = citasActivas.filter((cita) => {
    const date = dateFromAppointment(cita);
    return date && date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
  });

  const moveMonth = (offset) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const selectDay = (date) => {
    setSelectedDate(date);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      setMonth(startOfMonth(date));
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('¿Deseas cancelar esta cita?')) return;
    try {
      await cancelarCitaAPI(usuario.access_token, id);
      window.dispatchEvent(new Event('asis:notifications-updated'));
      await cargarCitas();
    } catch (err) {
      setError(err.message || 'No se pudo cancelar la cita.');
    }
  };

  const handleNewAppointment = () => {
    // The existing booking flow lives in the patient dashboard; doctors manage availability first.
    if (onNuevaCita) {
      onNuevaCita();
      return;
    }
    setVistaActual?.(usuario?.rol === 'paciente' ? 'panel' : 'horarios');
  };

  const handleStatus = async (citaId, estado) => {
    await actualizarEstadoCitaAPI(usuario.access_token, citaId, estado);
    setCitaDetalle((current) => current?.id === citaId ? { ...current, estado } : current);
    await cargarCitas();
    window.dispatchEvent(new Event('asis:notifications-updated'));
  };

  const handlePropose = async (citaId, fechaHora) => {
    await proponerCambioCitaAPI(usuario.access_token, citaId, {
      ...(typeof fechaHora === 'object' ? fechaHora : { fecha_hora: fechaHora }),
      motivo: 'Cambio propuesto por el médico',
    });
    setCitaDetalle((current) => current?.id === citaId ? null : current);
    await cargarCitas();
    window.dispatchEvent(new Event('asis:notifications-updated'));
  };

  const selectedLabel = selectedDate.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="calendar-page" aria-label="Calendario y citas">
      <header className="calendar-header">
        <div>
          <h1>Calendario y citas</h1>
          <p>Organiza tu disponibilidad y acompaña cada encuentro con claridad.</p>
        </div>
        <div className="calendar-header-actions">
          <button className="calendar-secondary-button" type="button" onClick={() => setVistaActual?.('horarios')}>
            <Icon name="settings" size={16} />
            Disponibilidad
          </button>
          <button className="calendar-primary-button" type="button" onClick={handleNewAppointment}>
            <Icon name="plus" size={17} />
            Nueva cita
          </button>
        </div>
      </header>

      {error && <div className="calendar-error" role="alert">{error}</div>}

      <div className="calendar-layout">
        <section className="calendar-surface">
          <div className="calendar-toolbar">
            <div className="calendar-month-controls">
              <button type="button" className="calendar-icon-button" onClick={() => moveMonth(-1)} aria-label="Mes anterior">‹</button>
              <h2>{MONTH_FORMATTER.format(month)}</h2>
              <button type="button" className="calendar-icon-button" onClick={() => moveMonth(1)} aria-label="Mes siguiente">›</button>
            </div>
            <div className="calendar-view-toggle" aria-label="Vista del calendario">
              <button type="button">Día</button>
              <button type="button">Semana</button>
              <button type="button" className="active">Mes</button>
            </div>
          </div>

          <div className="calendar-weekdays">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-grid" aria-label={MONTH_FORMATTER.format(month)}>
            {calendarDays.map((date) => {
              const key = dateKey(date);
              const appointments = citasPorDia.get(key) || [];
              const isCurrentMonth = date.getMonth() === month.getMonth();
              const isSelected = key === dateKey(selectedDate);
              const isToday = key === dateKey(today);
              return (
                <button
                  className={`calendar-day ${isCurrentMonth ? '' : 'outside'} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                  key={key}
                  type="button"
                  onClick={() => selectDay(date)}
                  aria-label={`${date.toLocaleDateString('es-MX')} — ${appointments.length} citas`}
                >
                  <span className="calendar-day-number">{date.getDate()}</span>
                  {appointments.length > 0 && (
                    <span className="calendar-day-meta">
                      <span className="calendar-dots">
                        {appointments.slice(0, 3).map((appointment) => <i key={appointment.id} className={`status-dot ${appointment.estado}`} />)}
                      </span>
                      {isSelected && <small>{appointments.length} {appointments.length === 1 ? 'cita' : 'citas'}</small>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="calendar-legend">
            <span><i className="status-dot confirmada" /> Confirmada</span>
            <span><i className="status-dot pendiente" /> Por confirmar</span>
            <span><i className="status-dot videollamada" /> Videollamada</span>
          </div>
        </section>

        <aside className="calendar-sidebar">
          <section className="calendar-summary-card">
            <div className="calendar-summary-date">
              <span>{selectedDate.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '').toUpperCase()}</span>
              <strong>{selectedDate.getDate()}</strong>
            </div>
            <div>
              <small>{SHORT_MONTH_FORMATTER.format(selectedDate)} de {selectedDate.getFullYear()}</small>
              <strong>{monthAppointments.length} {monthAppointments.length === 1 ? 'cita programada' : 'citas programadas'}</strong>
            </div>
            <button type="button" className="calendar-icon-button" onClick={cargarCitas} aria-label="Actualizar citas">
              <Icon name="more" size={18} />
            </button>
          </section>

          <section className="calendar-agenda-card">
            <div className="calendar-card-heading">
              <small>Agenda del día</small>
              <span>{selectedAppointments.length === 0 ? 'Libre' : `${selectedAppointments.length} ${selectedAppointments.length === 1 ? 'cita' : 'citas'}`}</span>
            </div>
            <h2>{selectedLabel}</h2>
            {cargando ? (
              <p className="calendar-empty">Cargando citas...</p>
            ) : selectedAppointments.length === 0 ? (
              <p className="calendar-empty">No hay citas para este día.</p>
            ) : (
              <div className="calendar-appointment-list">
                {selectedAppointments.map((cita) => {
                  const isDoctor = usuario?.rol === 'medico';
                  const name = isDoctor ? cita.paciente_nombre : cita.medico_nombre;
                  return (
                    <article className="calendar-appointment" key={cita.id}>
                      <strong>{formatTime(cita.fecha_hora, cita.zona_horaria)}</strong>
                      <span className={`calendar-avatar ${isDoctor ? 'blue' : 'lilac'}`}>
                        {initials(name, isDoctor ? 'PA' : 'DR')}
                      </span>
                      <div>
                        <b>{name || (isDoctor ? 'Paciente' : 'Médico especialista')}</b>
                        <small>{cita.especialidad || 'Consulta médica'} · {cita.estado}</small>
                      </div>
                      <button type="button" className="calendar-chevron" onClick={() => setCitaDetalle(cita)} aria-label="Ver detalle de la cita">
                        <Icon name="chevron" size={16} />
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
            <div className="calendar-free-slot">
              <Icon name="plus" size={15} />
              <span>{selectedAppointments.length === 0 ? 'Selecciona otra fecha para revisar tu agenda' : 'Disponible para nuevas consultas'}</span>
            </div>
          </section>

          <section className="calendar-sync-card">
            <span className="calendar-sync-icon"><Icon name="calendar" size={18} /></span>
            <div><strong>Calendario sincronizado</strong><small>Datos actualizados desde Asist-me</small></div>
            <i aria-label="Sincronizado" />
          </section>
        </aside>
      </div>

      {citaDetalle && (
        <CitaDetalleModal
          cita={citaDetalle}
          rol={usuario?.rol}
          onUpdateStatus={usuario?.rol === 'medico' ? handleStatus : undefined}
          onProposeChange={usuario?.rol === 'medico' ? handlePropose : undefined}
          onClose={() => setCitaDetalle(null)}
          onCancel={async (citaId) => {
            await handleCancel(citaId);
            setCitaDetalle(null);
          }}
          formatearFecha={formatDate}
          formatearHora={formatTime}
        />
      )}
    </div>
  );
}
