import React, { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { actualizarPerfilAPI } from '../services/api';

export default function PerfilUsuario({ usuario, onCerrarSesion, onProfileUpdated }) {
  const [form, setForm] = useState({
    nombres: usuario?.nombres || '',
    apellidos: usuario?.apellidos || '',
    email: usuario?.correo_pendiente || usuario?.email || '',
    telefono: usuario?.telefono || '',
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  useEffect(() => {
    setForm({
      nombres: usuario?.nombres || '', apellidos: usuario?.apellidos || '',
      email: usuario?.correo_pendiente || usuario?.email || '', telefono: usuario?.telefono || '',
    });
  }, [usuario?.id, usuario?.nombres, usuario?.apellidos, usuario?.email, usuario?.correo_pendiente, usuario?.telefono]);

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async (event, retryEmail = false) => {
    event?.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const result = await actualizarPerfilAPI(usuario.access_token, { ...form, reintentar_confirmacion: retryEmail });
      onProfileUpdated?.(result.usuario);
      setFeedback({ type: 'success', text: result.usuario.correo_pendiente
        ? 'Perfil actualizado. Confirma el cambio desde el enlace enviado a tu correo.'
        : 'Perfil actualizado correctamente.' });
    } catch (error) {
      if (error.usuario) onProfileUpdated?.(error.usuario);
      setFeedback({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };
  const name = usuario?.nombre || [usuario?.nombres, usuario?.apellidos].filter(Boolean).join(' ') || 'Usuario';
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const role = usuario?.rol === 'medico' ? 'Médico' : 'Paciente';

  return (
    <main className="profile-page">
      <header className="profile-header">
        <h1>Mi perfil</h1>
        <p>Información de tu cuenta en AsisTme.</p>
      </header>
      <section className="profile-surface" aria-label="Datos del perfil">
        <div className="profile-identity">
          <span className="app-profile-avatar profile-avatar-large">{initials || 'US'}</span>
          <div>
            <h2>{name}</h2>
            <span className="profile-role">{role}</span>
          </div>
        </div>
        <form className="profile-fields profile-edit-form" onSubmit={submit}>
          <label><span>Nombre</span><input name="nombres" autoComplete="given-name" maxLength="100" value={form.nombres} onChange={update} required /></label>
          <label><span>Apellidos</span><input name="apellidos" autoComplete="family-name" maxLength="100" value={form.apellidos} onChange={update} required /></label>
          <label><span>Nombre de usuario</span><input value={usuario?.username || ''} disabled /></label>
          <label><span>Correo electrónico</span><input name="email" type="email" autoComplete="email" value={form.email} onChange={update} disabled={Boolean(usuario?.correo_pendiente)} required /></label>
          {usuario?.correo_pendiente && <p className="profile-pending-email" role="status">Pendiente de confirmación: {usuario.correo_pendiente}. Revisa la bandeja de entrada de esa dirección.</p>}
          <label><span>Teléfono</span><input name="telefono" type="tel" autoComplete="tel" maxLength="20" placeholder="+52 55 1234 5678" value={form.telefono} onChange={update} /></label>
          <label><span>Tipo de cuenta</span><input value={role} disabled /></label>
          {feedback && <p className={`profile-feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}
          <button className="profile-save" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          {usuario?.correo_pendiente && <button className="profile-resend" type="button" disabled={saving} onClick={(event) => submit(event, true)}>{saving ? 'Enviando…' : 'Reenviar confirmación de correo'}</button>}
        </form>
        {onCerrarSesion && (
          <button className="profile-signout" type="button" onClick={onCerrarSesion}>
            <Icon name="arrow" size={16} /> Cerrar sesión
          </button>
        )}
      </section>
    </main>
  );
}
