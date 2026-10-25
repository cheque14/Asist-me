import React, { useState } from 'react';
import Icon from '../components/Icon';
import './LandingPage.css';

const journeys = {
  medico: [
    ['Configura tu práctica', 'Define tus horarios de atención y publica los servicios que ofreces.'],
    ['Recibe y organiza citas', 'Revisa nuevas solicitudes, confirma consultas y propón cambios de horario.'],
    ['Acompaña cada proceso', 'Consulta la información de tus pacientes y da seguimiento a sus citas.'],
  ],
  paciente: [
    ['Elige tu médico', 'Consulta los profesionales registrados y los servicios que ofrecen.'],
    ['Solicita tu cita', 'Selecciona el servicio, la fecha y la hora. El médico revisará tu solicitud.'],
    ['Mantén el contacto', 'Recibe notificaciones y responde a las propuestas de reprogramación.'],
  ],
};

export default function LandingPage({ alIrALogin, alIrARegistro }) {
  const [profile, setProfile] = useState('medico');
  const switchTab = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'medico' : event.key === 'End' ? 'paciente' : profile === 'medico' ? 'paciente' : 'medico';
    setProfile(next);
    document.getElementById('journey-tab-' + next)?.focus();
  };

  return (
    <div className="landing">
      <a className="landing-skip" href="#contenido">Saltar al contenido</a>
      <header className="landing-nav">
        <a className="landing-brand" href="#inicio" aria-label="Asist-me, inicio"><img src="/asist-me-logo.svg" alt="Asist-me" width="300" height="72" /></a>
        <nav aria-label="Navegación pública"><a href="#soluciones">Soluciones</a><a href="#como-funciona">Cómo funciona</a><a href="#seguridad">Seguridad</a></nav>
        <div className="landing-nav-actions"><button className="login-link" onClick={alIrALogin}>Iniciar sesión</button><button className="landing-cta" onClick={alIrARegistro}>Crear cuenta</button></div>
      </header>

      <main id="contenido" className="landing-main">
        <section className="landing-hero" id="inicio">
          <div className="landing-copy">
            <span className="hero-badge"><Icon name="sparkles" size={15} />Atención médica, mejor conectada</span>
            <h1>Tu salud y tu práctica, <em>en sintonía.</em></h1>
            <p>Asist-me conecta médicos y pacientes en un solo lugar. Agenda, consulta y da seguimiento a tus citas sin llamadas ni procesos complicados.</p>
            <div className="landing-buttons"><button className="landing-primary" onClick={alIrARegistro}>Comenzar ahora <Icon name="arrow" size={17} /></button><a className="landing-secondary" href="#como-funciona"><Icon name="video" size={17} />Ver cómo funciona</a></div>
            <div className="trust-row"><span className="trust-symbol"><Icon name="users" size={22} /></span><p><strong>Para médicos y pacientes</strong><br />Una conexión para cada consulta.</p></div>
          </div>
          <div className="hero-visual">
            <div className="photo-frame"><img src="https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1080" alt="Profesional de salud durante una consulta médica" width="1080" height="1200" fetchPriority="high" /></div>
            <div className="landing-float-card float-appointment"><span className="landing-soft-icon"><Icon name="calendar" /></span><div><small>Ejemplo de cita</small><strong>Jueves, 10:30</strong><span>Consulta de seguimiento</span></div><i aria-hidden="true" /></div>
            <div className="landing-float-card float-assistant"><span className="ai-mark"><Icon name="sparkles" size={17} /></span><div><small>Ejemplo del asistente</small><p>Puedes solicitar un cambio de horario desde el detalle de tu cita.</p></div></div>
            <div className="privacy-pill"><Icon name="file" size={15} />Tu atención, en un solo lugar</div>
          </div>
        </section>

        <section className="logo-strip" aria-label="Áreas de atención"><span>Una experiencia creada para</span><div><strong>Medicina general</strong><strong>Odontología</strong><strong>Psicología</strong><strong>Nutrición</strong><strong>Especialidades</strong></div></section>

        <section className="landing-section" id="soluciones">
          <div className="center-heading"><h2>Menos administración.<br />Más tiempo para cuidar.</h2><p>Una plataforma que acompaña la organización de tu consulta y el seguimiento de tus citas.</p></div>
          <div className="feature-bento">
            <article className="feature-card large-feature"><div className="feature-icon"><Icon name="calendar" /></div><span>AGENDA INTELIGENTE</span><h3>Tu consulta fluye, incluso cuando no estás.</h3><p>Tus pacientes solicitan citas según tu disponibilidad. Revisa cada solicitud y coordina cambios desde tu agenda.</p><div className="mini-calendar" aria-label="Ejemplo de cita confirmada"><div><b>24</b><span>JUN</span></div><div><small>Ejemplo · 09:00</small><strong>Consulta de seguimiento</strong><span>Confirmada</span></div><i aria-hidden="true" /></div></article>
            <article className="feature-card assistant-feature"><div className="feature-icon peach-icon"><Icon name="message" /></div><span>ASISTENTE DIGITAL</span><h3>Una guía para el siguiente paso.</h3><div className="demo-chat" aria-label="Conversación de ejemplo"><p>¿Cómo solicito una cita?</p><p>Elige un médico, selecciona su servicio y consulta los horarios de atención.</p></div><small className="demo-disclaimer">Ejemplo orientativo. No sustituye una consulta médica.</small></article>
            <article className="feature-card records-feature"><div className="feature-icon blue-icon"><Icon name="file" /></div><span>HISTORIAL CLÍNICO</span><h3>La información correcta, justo cuando la necesitas.</h3><div className="record-preview"><Icon name="file" size={22} /><div><strong>Información del paciente</strong><span>Consulta y seguimiento desde tu perfil</span></div></div></article>
          </div>
        </section>

        <section className="journey-band" id="como-funciona">
          <div className="journey">
          <div className="journey-copy"><p className="journey-kicker">DOS EXPERIENCIAS, UNA CONEXIÓN</p><h2>Diseñado para quien cuida y para quien confía.</h2><p>Cada perfil tiene exactamente lo que necesita, sin menús complejos ni información innecesaria.</p><div className="journey-tabs" role="tablist" aria-label="Experiencia por perfil">{[['medico', 'Para médicos'], ['paciente', 'Para pacientes']].map(([value, label]) => <button key={value} id={'journey-tab-' + value} role="tab" type="button" aria-selected={profile === value} aria-controls="journey-panel" tabIndex={profile === value ? 0 : -1} className={profile === value ? 'active' : ''} onClick={() => setProfile(value)} onKeyDown={switchTab}>{label}</button>)}</div></div>
          <div className="journey-list" role="tabpanel" id="journey-panel" aria-labelledby={'journey-tab-' + profile} tabIndex="0">{journeys[profile].map(([title, text], index) => <article key={title}><b aria-hidden="true">0{index + 1}</b><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
          </div>
        </section>

        <section className="security-section" id="seguridad"><div className="security-mark"><Icon name="file" size={29} /></div><div><h2>La confianza empieza con un espacio propio.</h2></div><p>Accede con tu cuenta y utiliza las herramientas de tu perfil. No compartas tus credenciales ni publiques información clínica en conversaciones abiertas.</p></section>
        <section className="final-cta"><span className="hero-badge"><Icon name="sparkles" size={15} />Empieza a cuidar mejor tu tiempo</span><h2>Una consulta más cercana comienza aquí.</h2><p>Únete a Asist-me y transforma la forma en que médicos y pacientes se conectan.</p><button onClick={alIrARegistro}>Crear mi cuenta <Icon name="arrow" size={17} /></button></section>
      </main>
      <footer className="landing-footer"><a href="#inicio"><img src="/asist-me-logo.svg" alt="Asist-me, volver al inicio" width="300" height="72" /></a><p>Salud conectada, atención más humana.</p><nav aria-label="Enlaces del pie de página"><a href="#soluciones">Soluciones</a><a href="#como-funciona">Cómo funciona</a><a href="#seguridad">Seguridad</a></nav><span>© {new Date().getFullYear()} Asist-me</span></footer>
    </div>
  );
}
