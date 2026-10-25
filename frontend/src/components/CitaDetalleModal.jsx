import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { formatClinicDate, formatClinicTime, validClinicZone } from '../utils/dateTime';

const estadoLabels = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  reprogramada: 'Reprogramada',
  rechazada: 'Rechazada',
  completada: 'Completada',
};

export default function CitaDetalleModal({ cita, rol, onClose, onCancel, formatearFecha, formatearHora, onProposeChange, onResolveProposal, notificationMessage, actionError, onUpdateStatus }) {
  const [fechaPropuesta, setFechaPropuesta] = useState('');
  const [horaPropuesta, setHoraPropuesta] = useState('10:00');
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState('');
  const dialog = useRef(null);
  const pendingRef = useRef(false);
  pendingRef.current = pending;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const appointmentId = cita?.id;
  useEffect(() => {
    if (!appointmentId) return undefined;
    const opener = document.activeElement;
    const element = dialog.current;
    element?.querySelector('button:not([disabled])')?.focus();
    const containFocus = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!pendingRef.current) closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const controls = [...element.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')];
      if (!controls.length) { event.preventDefault(); element.focus(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    element?.addEventListener('keydown', containFocus);
    return () => {
      element?.removeEventListener('keydown', containFocus);
      if (opener?.isConnected) opener.focus();
    };
  }, [appointmentId]);
  const runAction = async (action) => {
    if (pending) return;
    setPending(true);
    setLocalError('');
    try { await action(); }
    catch (error) { setLocalError(error.message || 'No se pudo completar la acción.'); }
    finally { setPending(false); }
  };
  if (!cita) return null;
  const nombre = rol === 'medico'
    ? (cita.es_para_otra_persona ? cita.beneficiario_nombre : cita.paciente_nombre) || 'Paciente'
    : cita.medico_nombre || 'Médico especialista';
  const zone = validClinicZone(cita.zona_horaria);
  const proposalZone = validClinicZone(cita.solicitud_cambio?.zona_horaria) || zone;
  const hasPendingProposal = cita.solicitud_cambio && ['pendiente', 'pendiente_paciente', 'pendiente_medico'].includes(cita.solicitud_cambio.estado);
  const closed = ['cancelada', 'rechazada', 'completada'].includes(cita.estado);

  return (
    <div ref={dialog} tabIndex="-1" className="appointment-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="appointment-detail-title">
      <article className="card appointment-detail-modal">
        <div className="appointment-detail-header">
          <div>
            <span className="eyebrow">DETALLE DE CITA</span>
            <h2 id="appointment-detail-title">{nombre}</h2>
          </div>
          <button className="icon-button" disabled={pending} onClick={onClose} aria-label="Cerrar detalle">✕</button>
        </div>
        <div className="appointment-detail-status">
          <Icon name="calendar" size={17} />
          <span>{estadoLabels[cita.estado] || cita.estado || 'Sin estado'}</span>
        </div>
        {notificationMessage && <p className="notification-detail-message">{notificationMessage}</p>}
        {(localError || actionError) && <p className="appointment-action-error" role="alert">{localError || actionError}</p>}
        {rol === 'medico' && onUpdateStatus && (
          <label className="appointment-status-control">Estado de la cita
            <select aria-label="Estado de la cita" value={cita.estado || 'pendiente'} disabled={pending} onChange={(event) => {
              const estado = event.target.value;
              runAction(() => onUpdateStatus(cita.id, estado));
            }}>
              <option value="pendiente">Pendiente</option>
              <option value="confirmada">Aprobada</option>
              <option value="cancelada">Cancelada</option>
              {cita.estado === 'reprogramada' && <option value="reprogramada" disabled>Reprogramada (cambio aceptado)</option>}
              <option value="rechazada">Rechazada</option>
              <option value="completada">Completada</option>
            </select>
          </label>
        )}
        <dl className="appointment-detail-grid">
          <div><dt>Fecha</dt><dd>{zone ? formatClinicDate(cita.fecha_hora, zone) : formatearFecha(cita.fecha_hora)}</dd></div>
          <div><dt>Hora</dt><dd>{zone ? formatClinicTime(cita.fecha_hora, zone) : formatearHora(cita.fecha_hora)}</dd></div>
          <div className="appointment-detail-full"><dt>Zona horaria del consultorio</dt><dd>{zone || 'Zona no configurada: verifica con el médico antes de cambiar el horario.'}</dd></div>
          <div><dt>{rol === 'medico' ? 'Paciente' : 'Médico'}</dt><dd>{nombre}</dd></div>
          {rol === 'medico' && (
            <div><dt>Teléfono del paciente</dt><dd>{(cita.es_para_otra_persona ? cita.beneficiario_telefono : cita.paciente_telefono) || 'No registrado'}</dd></div>
          )}
          <div><dt>Especialidad</dt><dd>{cita.especialidad || 'Medicina General'}</dd></div>
          <div className="appointment-detail-full"><dt>Motivo de la cita</dt><dd>{cita.motivo || cita.notas || 'Consulta médica programada'}</dd></div>
          {cita.solicitud_cambio && ['pendiente', 'pendiente_paciente', 'pendiente_medico'].includes(cita.solicitud_cambio.estado) && (
            <div className="appointment-detail-proposal appointment-detail-full">
              <dt>Nuevo horario propuesto</dt>
              <dd>
                {formatClinicDate(cita.solicitud_cambio.fecha_hora_solicitada, proposalZone)} · {formatClinicTime(cita.solicitud_cambio.fecha_hora_solicitada, proposalZone)} · {proposalZone || 'UTC (zona pendiente)'}
              </dd>
            </div>
          )}
          {cita.es_para_otra_persona && (
            <div className="appointment-detail-full"><dt>Paciente atendido</dt><dd>{cita.beneficiario_nombre} · {cita.beneficiario_telefono}</dd><dt>Titular que reservó</dt><dd>{cita.paciente_nombre}</dd></div>
          )}
        </dl>
        <div className="appointment-detail-actions">
          <button className="detail-secondary-button" disabled={pending} onClick={onClose}>Cerrar</button>
          {rol === 'medico' && onProposeChange && !closed && !hasPendingProposal && (
            <form className="appointment-proposal-form" onSubmit={(event) => {
              event.preventDefault();
              runAction(() => onProposeChange(cita.id, { fecha_local: fechaPropuesta, hora_local: horaPropuesta }));
            }}>
              <input type="date" aria-label="Fecha propuesta" disabled={pending} value={fechaPropuesta} onChange={(event) => setFechaPropuesta(event.target.value)} required />
              <input type="time" aria-label="Hora propuesta" disabled={pending} value={horaPropuesta} onChange={(event) => setHoraPropuesta(event.target.value)} required />
              <button className="detail-secondary-button" type="submit" disabled={pending}>{pending ? 'Enviando…' : 'Proponer horario'}</button>
            </form>
          )}
          {rol === 'paciente' && onResolveProposal && hasPendingProposal && !closed && cita.solicitud_cambio.estado !== 'pendiente_medico' && cita.solicitud_cambio.solicitante_rol !== 'paciente' && (
            <div className="appointment-proposal-actions">
              <button className="detail-secondary-button" disabled={pending} onClick={() => runAction(() => onResolveProposal(cita.solicitud_cambio.id, 'rechazar'))}>Rechazar cambio</button>
              <button className="detail-danger-button" disabled={pending} onClick={() => runAction(() => onResolveProposal(cita.solicitud_cambio.id, 'aceptar'))}>Aceptar cambio</button>
              <form onSubmit={(event) => {
                event.preventDefault();
                runAction(() => onResolveProposal(cita.solicitud_cambio.id, 'contraofertar', { fecha_local: fechaPropuesta, hora_local: horaPropuesta }));
              }}>
                <input type="date" aria-label="Fecha propuesta" disabled={pending} value={fechaPropuesta} onChange={(event) => setFechaPropuesta(event.target.value)} required />
                <input type="time" aria-label="Hora propuesta" disabled={pending} value={horaPropuesta} onChange={(event) => setHoraPropuesta(event.target.value)} required />
                <button className="detail-secondary-button" type="submit" disabled={pending}>Proponer otro horario</button>
              </form>
            </div>
          )}
          {onCancel && !closed && (
            <button className="detail-danger-button" disabled={pending} onClick={() => runAction(() => onCancel(cita.id))}>Cancelar cita</button>
          )}
        </div>
      </article>
    </div>
  );
}
