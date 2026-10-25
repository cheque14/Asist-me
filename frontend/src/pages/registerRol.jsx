// src/pages/registerRol.jsx
import React, { useState, useEffect } from 'react';
import { registerAPI, obtenerEspecialidadesAPI } from '../services/api';
import Icon from '../components/Icon';

export default function RegisterRol({ alRegistroExitoso, alVolver }) {
  const [rolSeleccionado, setRolSeleccionado] = useState(null); // 'paciente' o 'medico'
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [licenciaMedica, setLicenciaMedica] = useState('');
  const [especialidadId, setEspecialidadId] = useState('');
  const [listaEspecialidades, setListaEspecialidades] = useState([]);
  const [cargandoEspecialidades, setCargandoEspecialidades] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  // Cargar especialidades para médicos
  useEffect(() => {
    if (rolSeleccionado === 'medico') {
      const fetchEspecialidades = async () => {
        setCargandoEspecialidades(true);
        try {
          const data = await obtenerEspecialidadesAPI();
          if (Array.isArray(data) && data.length > 0) {
            setListaEspecialidades(data);
            setEspecialidadId(data[0].id);
          } else {
            setError('No se encontraron especialidades disponibles.');
          }
        } catch (err) {
          setError('No se pudo conectar con el catálogo de especialidades.');
        } finally {
          setCargandoEspecialidades(false);
        }
      };
      fetchEspecialidades();
    }
  }, [rolSeleccionado]);

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!nombres.trim() || !apellidos.trim() || !username.trim() || !email || !password) {
      return setError('Completa todos los campos obligatorios.');
    }
    if (password.length < 6) {
      return setError('La contraseña debe tener al menos 6 caracteres.');
    }
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username.trim())) {
      return setError('El usuario debe tener de 3 a 30 caracteres válidos.');
    }
    if (rolSeleccionado === 'medico' && !especialidadId) {
      return setError('Debes seleccionar una especialidad médica.');
    }

    setCargando(true);
    setError('');
    setMensaje('');

    try {
      const payload = {
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim(),
        telefono: rolSeleccionado === 'paciente' ? telefono.trim() : '',
        password,
        rol: rolSeleccionado,
        licencia_medica: licenciaMedica.trim(),
        especialidad_id: Number(especialidadId),
      };

      const res = await registerAPI(payload);
      if (res.access_token) {
        alRegistroExitoso(res.usuario, res.access_token);
      } else {
        setMensaje(
          res.requiere_confirmacion
            ? 'Revisa tu correo para confirmar la cuenta antes de iniciar sesión.'
            : res.mensaje || 'Registro completado con éxito.'
        );
      }
    } catch (err) {
      setError(err.message || 'Error al completar el registro.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={styles.contenedor}>
      <div className="card" style={styles.tarjeta}>
        <div style={styles.topBar}>
          <button
            type="button"
            style={styles.btnVolver}
            onClick={rolSeleccionado ? () => setRolSeleccionado(null) : alVolver}
          >
            ← {rolSeleccionado ? 'Cambiar perfil' : 'Volver al login'}
          </button>

          <div style={styles.brandBadge}>
            <img className="register-brand-logo" src="/asist-me-logo.svg" alt="Asist-me" />
          </div>
        </div>

        <div style={styles.encabezado}>
          <p className="eyebrow" style={{ textAlign: 'center', marginBottom: '6px' }}>
            REGISTRO DE USUARIO
          </p>
          <h2 style={styles.titulo}>
            {rolSeleccionado
              ? `Registro de ${rolSeleccionado === 'medico' ? 'Médico' : 'Paciente'}`
              : 'Selecciona tu tipo de cuenta'}
          </h2>
          <p style={styles.subtitulo}>
            {rolSeleccionado
              ? 'Ingresa tus datos personales para activar tu portal.'
              : '¿Cómo vas a utilizar la plataforma AsisTme?'}
          </p>
        </div>

        {error && <div style={styles.mensajeError}>{error}</div>}
        {mensaje && <div style={styles.mensajeExito}>{mensaje}</div>}

        {!rolSeleccionado ? (
          <div style={styles.opcionesGrid}>
            <div
              className="card"
              style={styles.cardOpcion}
              onClick={() => setRolSeleccionado('paciente')}
            >
              <span className="soft-icon blue">
                <Icon name="users" size={22} />
              </span>
              <div>
                <strong style={styles.opcionTitulo}>Soy Paciente</strong>
                <p style={styles.opcionDesc}>
                  Agenda citas, revisa tu historial clínico y mantén contacto directo con tus médicos.
                </p>
              </div>
              <Icon name="arrow" size={16} className="opcionArrow" />
            </div>

            <div
              className="card"
              style={styles.cardOpcion}
              onClick={() => setRolSeleccionado('medico')}
            >
              <span className="soft-icon sage">
                <Icon name="calendar" size={22} />
              </span>
              <div>
                <strong style={styles.opcionTitulo}>Soy Médico</strong>
                <p style={styles.opcionDesc}>
                  Gestiona tu agenda de consultas, expedientes electrónicos y horarios de atención.
                </p>
              </div>
              <Icon name="arrow" size={16} className="opcionArrow" />
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegisterSubmit} style={styles.formulario}>
            <div style={styles.filaDoble}>
              <div style={styles.campo}>
                <label style={styles.label}>NOMBRES</label>
                <input
                  type="text"
                  placeholder="Ej. Ana"
                  value={nombres}
                  onChange={(e) => setNombres(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>
              <div style={styles.campo}>
                <label style={styles.label}>APELLIDOS</label>
                <input
                  type="text"
                  placeholder="Ej. García"
                  value={apellidos}
                  onChange={(e) => setApellidos(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>
            </div>

            <div style={styles.campo}>
              <label style={styles.label}>NOMBRE DE USUARIO</label>
              <input
                type="text"
                placeholder="anagarcia"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.input}
                minLength={3}
                maxLength={30}
                required
              />
            </div>

            <div style={styles.campo}>
              <label style={styles.label}>CORREO ELECTRÓNICO</label>
              <input
                type="email"
                placeholder="ana@asistme.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                required
              />
            </div>

            {rolSeleccionado === 'paciente' && (
              <div style={styles.campo}>
                <label style={styles.label} htmlFor="registro-telefono">TELÉFONO</label>
                <input
                  id="registro-telefono"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="Ej. +52 55 1234 5678"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>
            )}

            <div style={styles.campo}>
              <label style={styles.label}>CONTRASEÑA</label>
              <input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                required
              />
            </div>

            {rolSeleccionado === 'medico' && (
              <>
                <div style={styles.campo}>
                  <label style={styles.label}>ESPECIALIDAD MÉDICA</label>
                  {cargandoEspecialidades ? (
                    <div style={{ fontSize: '12px', color: '#174f49', padding: '8px 0' }}>
                      Cargando catálogo de especialidades...
                    </div>
                  ) : (
                    <select
                      value={especialidadId}
                      onChange={(e) => setEspecialidadId(e.target.value)}
                      style={styles.select}
                      required
                    >
                      {listaEspecialidades.map((esp) => (
                        <option key={esp.id} value={esp.id}>
                          {esp.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div style={styles.campo}>
                  <label style={styles.label}>LICENCIA / CÉDULA MÉDICA</label>
                  <input
                    type="text"
                    placeholder="Ej. MED-987452"
                    value={licenciaMedica}
                    onChange={(e) => setLicenciaMedica(e.target.value)}
                    style={styles.input}
                    required
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={cargando || cargandoEspecialidades}
              className="primary-btn"
              style={styles.btnSubmit}
            >
              {cargando ? 'Registrando cuenta...' : 'Completar Registro'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  contenedor: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '24px',
    background: 'radial-gradient(circle at 78% 8%, #edf3ef 0, transparent 28%), #f7f9f7',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    boxSizing: 'border-box',
  },
  tarjeta: {
    width: '100%',
    maxWidth: '520px',
    padding: '36px 32px',
    borderRadius: '24px',
    backgroundColor: '#ffffff',
    boxShadow: '0 24px 60px rgba(40, 65, 59, 0.08)',
    border: '1px solid #e9eeeb',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  btnVolver: {
    background: 'none',
    border: 'none',
    color: '#7c8986',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    padding: 0,
    fontFamily: 'inherit',
  },
  brandBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  encabezado: {
    marginBottom: '24px',
    textAlign: 'center',
  },
  titulo: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1d2927',
    margin: '0 0 6px 0',
    letterSpacing: '-0.6px',
  },
  subtitulo: {
    fontSize: '13px',
    color: '#7c8986',
    margin: 0,
  },
  opcionesGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  cardOpcion: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    borderRadius: '18px',
    border: '1px solid #e9eeeb',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, border-color 0.15s ease',
  },
  opcionTitulo: {
    display: 'block',
    fontSize: '15px',
    color: '#1d2927',
    marginBottom: '3px',
  },
  opcionDesc: {
    fontSize: '12px',
    color: '#7c8986',
    margin: 0,
    lineHeight: '1.4',
  },
  formulario: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  filaDoble: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  campo: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#7c8986',
    marginBottom: '6px',
    letterSpacing: '0.8px',
  },
  input: {
    backgroundColor: '#ffffff',
    border: '1px solid #e9eeeb',
    borderRadius: '12px',
    padding: '11px 14px',
    fontSize: '13px',
    color: '#1d2927',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    width: '100%',
  },
  select: {
    backgroundColor: '#ffffff',
    border: '1px solid #e9eeeb',
    borderRadius: '12px',
    padding: '11px 14px',
    fontSize: '13px',
    color: '#1d2927',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    width: '100%',
    cursor: 'pointer',
  },
  btnSubmit: {
    width: '100%',
    height: '46px',
    justifyContent: 'center',
    marginTop: '10px',
    fontSize: '14px',
  },
  mensajeError: {
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecaca',
    padding: '12px 14px',
    borderRadius: '14px',
    fontSize: '12px',
    marginBottom: '16px',
    textAlign: 'center',
    fontWeight: '500',
  },
  mensajeExito: {
    backgroundColor: '#edf3ec',
    color: '#174f49',
    border: '1px solid #dfe9df',
    padding: '12px 14px',
    borderRadius: '14px',
    fontSize: '12px',
    marginBottom: '16px',
    textAlign: 'center',
    fontWeight: '500',
  },
};
