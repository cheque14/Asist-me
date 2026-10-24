// src/pages/registerRol.jsx
import React, { useState, useEffect } from 'react';
import { registerAPI, obtenerEspecialidadesAPI } from '../services/api';

export default function RegisterRol({ alRegistroExitoso, alVolver }) {
  const [rolSeleccionado, setRolSeleccionado] = useState(null); // 'paciente' o 'medico'
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [licenciaMedica, setLicenciaMedica] = useState('');
  const [especialidadId, setEspecialidadId] = useState('');
  const [listaEspecialidades, setListaEspecialidades] = useState([]);
  const [cargandoEspecialidades, setCargandoEspecialidades] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  // Efecto: Cargar especialidades directamente desde Supabase
  useEffect(() => {
    if (rolSeleccionado === 'medico') {
      const fetchEspecialidades = async () => {
        setCargandoEspecialidades(true);
        try {
          const data = await obtenerEspecialidadesAPI();
          if (Array.isArray(data) && data.length > 0) {
            setListaEspecialidades(data);
            setEspecialidadId(data[0].id); // Asigna la primera especialidad de Supabase por defecto
          } else {
            setError("No se encontraron especialidades en la base de datos.");
          }
        } catch (err) {
          setError("No se pudo conectar con Supabase para obtener las especialidades.");
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
      return setError('Llena todos los campos obligatorios');
    }
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) {
      return setError('El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.');
    }
    if (rolSeleccionado === 'medico' && !especialidadId) {
      return setError('Debes seleccionar una especialidad médica');
    }

    setCargando(true);
    setError('');
    setMensaje('');

    try {
      const payload = {
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        username: username.trim().toLowerCase(),
        email,
        password,
        rol: rolSeleccionado,
        licencia_medica: licenciaMedica,
        especialidad_id: Number(especialidadId)
      };

      const res = await registerAPI(payload);
      if (res.access_token) {
        alRegistroExitoso(res.usuario, res.access_token);
      } else {
        setMensaje(res.requiere_confirmacion
          ? 'Revisa tu correo para confirmar la cuenta antes de iniciar sesión.'
          : res.mensaje);
      }
    } catch (err) {
      setError(err.message || 'Error al completar el registro');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={styles.contenedor}>
      <div className="tarjeta-flotante" style={styles.tarjeta}>
        <button style={styles.btnVolver} onClick={rolSeleccionado ? () => setRolSeleccionado(null) : alVolver}>
          ← {rolSeleccionado ? 'Cambiar tipo de cuenta' : 'Volver al login'}
        </button>

        <div style={styles.logoContenedor}>🩺</div>
        <h2 style={{ textAlign: 'center', margin: '0 0 6px 0', color: '#0f172a', fontWeight: '700' }}>
          {rolSeleccionado ? `Registro de ${rolSeleccionado === 'medico' ? 'Médico' : 'Paciente'}` : 'Crear cuenta en Asist-me'}
        </h2>
        <p style={{ textAlign: 'center', color: '#64748b', fontSize: '14px', margin: '0 0 24px 0' }}>
          {rolSeleccionado ? 'Ingresa tus datos personales para continuar' : 'Selecciona el tipo de cuenta que deseas crear'}
        </p>

        {error && <div style={styles.mensajeError}>⚠️ {error}</div>}
        {mensaje && <div style={styles.mensajeExito}>{mensaje}</div>}

        {!rolSeleccionado ? (
          <>
            <div className="tarjeta-flotante" style={styles.opcion} onClick={() => setRolSeleccionado('paciente')}>
              <div style={styles.iconoOpcion}>👤</div>
              <div>
                <h4 style={{ margin: '0 0 4px 0', color: '#0f172a', fontWeight: '600' }}>Paciente</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Agenda citas con especialistas, consulta tu historial clínico y recibe atención.
                </p>
              </div>
            </div>

            <div className="tarjeta-flotante" style={styles.opcion} onClick={() => setRolSeleccionado('medico')}>
              <div style={{ ...styles.iconoOpcion, backgroundColor: '#e0e7ff', color: '#4338ca' }}>🩺</div>
              <div>
                <h4 style={{ margin: '0 0 4px 0', color: '#0f172a', fontWeight: '600' }}>Médico / Especialista</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Gestiona expedientes, administra tus servicios, precios y horarios de atención.
                </p>
              </div>
            </div>
          </>
        ) : (
          <form onSubmit={handleRegisterSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={styles.label}>NOMBRES</label>
              <input
                type="text"
                className="input-flotante"
                placeholder="Ej. Fernando José"
                value={nombres}
                onChange={(e) => setNombres(e.target.value)}
                style={styles.inputFull}
                required
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={styles.label}>APELLIDOS</label>
              <input
                type="text"
                className="input-flotante"
                placeholder="Ej. García López"
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
                style={styles.inputFull}
                required
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={styles.label}>NOMBRE DE USUARIO</label>
              <input
                type="text"
                className="input-flotante"
                placeholder="Ej. fernando.garcia"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.inputFull}
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9._-]{3,30}"
                autoComplete="username"
                required
              />
              <small style={{ color: '#64748b' }}>También podrás iniciar sesión con tu correo.</small>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={styles.label}>CORREO ELECTRÓNICO</label>
              <input
                type="email"
                className="input-flotante"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.inputFull}
                required
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={styles.label}>CONTRASEÑA</label>
              <input
                type="password"
                className="input-flotante"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.inputFull}
                required
              />
            </div>

            {rolSeleccionado === 'medico' && (
              <>
                <div style={{ marginBottom: '14px' }}>
                  <label style={styles.label}>ESPECIALIDAD MÉDICA (DESDE SUPABASE)</label>
                  {cargandoEspecialidades ? (
                    <div style={{ fontSize: '13px', color: '#0284c7', padding: '10px 0' }}>
                      Cargando catálogo desde Supabase...
                    </div>
                  ) : (
                    <select
                      className="input-flotante"
                      value={especialidadId}
                      onChange={(e) => setEspecialidadId(e.target.value)}
                      style={styles.inputFull}
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

                <div style={{ marginBottom: '20px' }}>
                  <label style={styles.label}>LICENCIA / CÉDULA MÉDICA</label>
                  <input
                    type="text"
                    className="input-flotante"
                    placeholder="Ej. MED-123456"
                    value={licenciaMedica}
                    onChange={(e) => setLicenciaMedica(e.target.value)}
                    style={styles.inputFull}
                    required
                  />
                </div>
              </>
            )}

            <button type="submit" disabled={cargando || cargandoEspecialidades} style={styles.btnSubmit}>
              {cargando ? 'Creando cuenta...' : 'Completar Registro'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  contenedor: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  tarjeta: { padding: '40px', width: '100%', maxWidth: '440px' },
  btnVolver: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', marginBottom: '20px', fontWeight: '500', fontSize: '13px' },
  logoContenedor: { width: '64px', height: '64px', backgroundColor: '#0284c7', color: '#fff', borderRadius: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '32px', margin: '0 auto 20px auto', boxShadow: '0 8px 16px -4px rgba(2, 132, 199, 0.4)' },
  opcion: { display: 'flex', alignItems: 'center', gap: '16px', padding: '18px', cursor: 'pointer', marginBottom: '16px' },
  iconoOpcion: { fontSize: '22px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '12px', borderRadius: '14px' },
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: '#475569', marginBottom: '6px' },
  inputFull: { width: '100%', boxSizing: 'border-box' },
  btnSubmit: { width: '100%', backgroundColor: '#0284c7', color: '#ffffff', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '600', fontSize: '15px', cursor: 'pointer', boxShadow: '0 8px 20px -4px rgba(2, 132, 199, 0.4)' },
  mensajeError: { backgroundColor: '#fee2e2', color: '#b91c1c', padding: '10px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px', textAlign: 'center' },
  mensajeExito: { backgroundColor: '#dcfce7', color: '#166534', padding: '10px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }
};