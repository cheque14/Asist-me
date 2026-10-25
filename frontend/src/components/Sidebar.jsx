import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import { obtenerConteoNotificacionesNoLeidasAPI, obtenerCitasAPI } from '../services/api';
import { requiresResponse } from '../utils/appointmentState';

export default function Sidebar({ vistaActual, setVistaActual, usuario, onCerrarSesion }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const esMedico = usuario?.rol === 'medico';
  const nombre = usuario?.nombre || usuario?.email || 'Usuario';
  const initials = nombre.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  useEffect(() => {
    let active = true;
    if (!usuario?.access_token) return undefined;
    let sequence = 0;
    const refreshCount = async () => {
      const current = ++sequence;
      const [unread, appointments] = await Promise.allSettled([
        obtenerConteoNotificacionesNoLeidasAPI(usuario.access_token), obtenerCitasAPI(usuario.access_token),
      ]);
      if (!active || sequence !== current) return;
      if (unread.status === 'fulfilled') setUnreadCount(unread.value);
      if (appointments.status === 'fulfilled') setPendingCount(appointments.value.filter((cita) => requiresResponse(cita, usuario.rol)).length);
    };
    refreshCount();
    const timer = window.setInterval(refreshCount, 30000);
    window.addEventListener('asis:notifications-updated', refreshCount);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('asis:notifications-updated', refreshCount);
    };
  }, [usuario?.access_token, usuario?.rol]);

  const links = [
    { id: 'panel', label: 'Inicio' },
    { id: 'citas', label: 'Agenda' },
    { id: 'historial', label: 'Historial de citas' },
    { id: 'expediente', label: 'Expediente clínico' },
  ];

  return (
    <header className="app-topbar">
      <button className="app-brand" type="button" onClick={() => setVistaActual('panel')} aria-label="Ir al inicio">
        <img className="app-brand-logo" src="/asist-me-logo.svg" alt="" />
      </button>

      <nav className="app-primary-nav" aria-label="Navegación principal">
        {links.map((link) => (
          <button
            key={link.id}
            type="button"
            className={`app-nav-link ${vistaActual === link.id ? 'active' : ''}`}
            aria-current={vistaActual === link.id ? 'page' : undefined}
            onClick={() => setVistaActual(link.id)}
          >
            {link.label}
          </button>
        ))}
        <details className="app-more-menu">
          <summary className={['servicios', 'horarios'].includes(vistaActual) ? 'active' : ''}>Más</summary>
          <div className="app-more-popover">
            {esMedico && <button type="button" onClick={() => setVistaActual('horarios')}>Mis horarios</button>}
            <button type="button" onClick={() => setVistaActual('servicios')}>Servicios</button>
            {onCerrarSesion && <button type="button" onClick={onCerrarSesion}>Cerrar sesión</button>}
          </div>
        </details>
      </nav>

      <div className="app-topbar-actions">
        <button
          className={`app-icon-button ${vistaActual === 'notificaciones' ? 'active' : ''}`}
          type="button"
          aria-label={`Notificaciones, ${unreadCount} sin leer, ${pendingCount} requieren respuesta`}
          onClick={() => setVistaActual('notificaciones')}
        >
          <Icon name="bell" size={21} />
          {unreadCount > 0 && <span className="app-notification-indicator" aria-hidden="true" />}
        </button>
        {pendingCount > 0 && <button className="app-nav-link" onClick={() => setVistaActual('notificaciones')}>{pendingCount} por responder</button>}
        <button
          className="app-profile-button"
          type="button"
          aria-label={`Ver perfil de ${nombre}`}
          onClick={() => setVistaActual('perfil')}
        >
          <span className="app-profile-avatar">{initials || 'US'}</span>
        </button>
      </div>
    </header>
  );
}
