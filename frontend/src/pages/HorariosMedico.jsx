// src/pages/HorariosMedico.jsx
import React, { useEffect, useState } from 'react';
import {
  guardarHorariosMedicoAPI,
  obtenerHorariosMedicoAPI,
} from '../services/api';
import Icon from '../components/Icon';

const dias = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];

const nuevoBloque = (dia) => ({
  key: `${Date.now()}-${Math.random()}`,
  dia_semana: dia,
  hora_inicio: '09:00',
  hora_fin: '17:00',
});

export default function HorariosMedico({ usuario }) {
  const [zonaHoraria, setZonaHoraria] = useState('UTC');
  const [horarios, setHorarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    const cargar = async () => {
      try {
        const resultado = await obtenerHorariosMedicoAPI(usuario.access_token);
        setZonaHoraria(resultado.zona_horaria || 'UTC');
        setHorarios(
          resultado.horarios.map((horario, index) => ({
            ...horario,
            hora_inicio: horario.hora_inicio.slice(0, 5),
            hora_fin: horario.hora_fin.slice(0, 5),
            key: `saved-${index}`,
          }))
        );
      } catch (err) {
        setError(err.message || 'No se pudieron cargar los horarios configurados.');
      } finally {
        setCargando(false);
      }
    };

    if (usuario?.access_token) {
      cargar();
    } else {
      setCargando(false);
    }
  }, [usuario?.access_token]);

  const actualizarBloque = (key, campo, valor) => {
    setHorarios((actuales) =>
      actuales.map((horario) =>
        horario.key === key ? { ...horario, [campo]: valor } : horario
      )
    );
  };

  const agregarBloque = (dia) => {
    setHorarios((actuales) => [...actuales, nuevoBloque(dia)]);
  };

  const quitarBloque = (key) => {
    setHorarios((actuales) => actuales.filter((horario) => horario.key !== key));
  };

  const guardar = async (evento) => {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    setMensaje('');

    try {
      const resultado = await guardarHorariosMedicoAPI(usuario.access_token, {
        zona_horaria: zonaHoraria,
        horarios: horarios.map(({ dia_semana, hora_inicio, hora_fin }) => ({
          dia_semana,
          hora_inicio,
          hora_fin,
        })),
      });
      setMensaje(resultado.mensaje || 'Horarios guardados correctamente.');
    } catch (err) {
      setError(err.message || 'No se pudo guardar el horario.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bento-dashboard" aria-label="Configuración de Horarios de Atención">
      {/* Header */}
      <section className="bento-hero">
        <div>
          <p className="eyebrow">DISPONIBILIDAD Y CONSULTA</p>
          <h1>Horarios de Atención</h1>
          <p className="subtitle">
            Define tus días y bloques de atención. El asistente inteligente usará estos intervalos para ofrecer citas a tus pacientes.
          </p>
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className="primary-btn"
            disabled={guardando || cargando}
            onClick={guardar}
          >
            <Icon name="clock" size={17} />
            <span>{guardando ? 'Guardando...' : 'Guardar horarios'}</span>
          </button>
        </div>
      </section>

      {error && (
        <div style={styles.alertaError}>
          <span>{error}</span>
        </div>
      )}

      {mensaje && (
        <div style={styles.alertaExito}>
          <span>{mensaje}</span>
        </div>
      )}

      {cargando ? (
        <article className="card" style={{ padding: '36px', textAlign: 'center' }}>
          <p style={{ color: '#7c8986' }}>Cargando disponibilidad médica...</p>
        </article>
      ) : (
        <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Tarjeta de Zona Horaria */}
          <article className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
              <span className="soft-icon sage">
                <Icon name="clock" size={20} />
              </span>
              <div>
                <strong style={{ fontSize: '15px', color: '#1d2927' }}>Zona Horaria del Consultorio</strong>
                <span style={{ display: 'block', fontSize: '12px', color: '#7c8986' }}>
                  Asegura que los pacientes vean los horarios en tu hora local.
                </span>
              </div>
            </div>

            <div style={{ maxWidth: '420px' }}>
              <input
                id="zona-horaria"
                value={zonaHoraria}
                onChange={(evento) => setZonaHoraria(evento.target.value)}
                placeholder="Ej. America/Mexico_City o America/Bogota"
                style={styles.zonaInput}
                required
              />
              <small style={styles.ayuda}>
                Formato estándar IANA (ejemplo: America/Mexico_City, America/Costa_Rica, America/Lima).
              </small>
            </div>
          </article>

          {/* Días y Bloques */}
          <div style={styles.gridDias}>
            {dias.map((nombreDia, dia) => {
              const bloquesDia = horarios
                .filter((horario) => horario.dia_semana === dia)
                .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

              const tieneBloques = bloquesDia.length > 0;

              return (
                <article
                  key={nombreDia}
                  className="card"
                  style={{
                    padding: '22px',
                    backgroundColor: tieneBloques ? '#ffffff' : '#f9fbf9',
                  }}
                >
                  <div style={styles.cabeceraDia}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        className="avatar"
                        style={{
                          width: '32px',
                          height: '32px',
                          fontSize: '11px',
                          backgroundColor: tieneBloques ? '#174f49' : '#e9eeeb',
                          color: tieneBloques ? '#ffffff' : '#7c8986',
                        }}
                      >
                        {nombreDia.substring(0, 2)}
                      </span>
                      <h3 style={styles.nombreDia}>{nombreDia}</h3>
                      {tieneBloques && (
                        <span className="mode" style={{ fontSize: '9px', padding: '4px 8px' }}>
                          {bloquesDia.length} {bloquesDia.length === 1 ? 'bloque' : 'bloques'}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => agregarBloque(dia)}
                      style={styles.btnAgregarBloque}
                    >
                      <Icon name="plus" size={14} />
                      <span>Agregar bloque</span>
                    </button>
                  </div>

                  {!tieneBloques ? (
                    <div style={styles.sinBloques}>
                      <span>No atiendes este día</span>
                    </div>
                  ) : (
                    <div style={styles.bloquesContainer}>
                      {bloquesDia.map((bloque) => (
                        <div style={styles.bloqueItem} key={bloque.key}>
                          <div style={styles.timeInputPill}>
                            <Icon name="clock" size={14} style={{ color: '#7c8986' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={styles.labelTime}>Desde</span>
                              <input
                                type="time"
                                value={bloque.hora_inicio}
                                onChange={(evento) =>
                                  actualizarBloque(
                                    bloque.key,
                                    'hora_inicio',
                                    evento.target.value
                                  )
                                }
                                style={styles.inputTime}
                                required
                              />
                            </div>
                            <span style={{ color: '#c4d1cd' }}>→</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={styles.labelTime}>Hasta</span>
                              <input
                                type="time"
                                value={bloque.hora_fin}
                                onChange={(evento) =>
                                  actualizarBloque(
                                    bloque.key,
                                    'hora_fin',
                                    evento.target.value
                                  )
                                }
                                style={styles.inputTime}
                                required
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            aria-label={`Quitar bloque`}
                            onClick={() => quitarBloque(bloque.key)}
                            style={styles.btnQuitar}
                            title="Eliminar este bloque"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={guardando}
              className="primary-btn"
            >
              <Icon name="clock" size={17} />
              <span>{guardando ? 'Guardando...' : 'Guardar horarios de atención'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const styles = {
  alertaError: {
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecaca',
    padding: '12px 18px',
    borderRadius: '14px',
    fontSize: '13px',
    fontWeight: '500',
    marginBottom: '20px',
  },
  alertaExito: {
    backgroundColor: '#edf3ec',
    color: '#174f49',
    border: '1px solid #dfe9df',
    padding: '12px 18px',
    borderRadius: '14px',
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '20px',
  },
  zonaInput: {
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
  ayuda: {
    display: 'block',
    color: '#7c8986',
    fontSize: '11px',
    marginTop: '6px',
  },
  gridDias: {
    display: 'grid',
    gap: '16px',
  },
  cabeceraDia: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  nombreDia: {
    margin: 0,
    color: '#1d2927',
    fontSize: '16px',
    fontWeight: '700',
  },
  btnAgregarBloque: {
    border: '1px solid #e9eeeb',
    background: '#ffffff',
    color: '#174f49',
    padding: '6px 12px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '700',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
  },
  sinBloques: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px dashed #e9eeeb',
    color: '#a3b0ac',
    fontSize: '12px',
    fontStyle: 'italic',
  },
  bloquesContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '14px',
  },
  bloqueItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  timeInputPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    backgroundColor: '#f3f6f4',
    borderRadius: '14px',
    border: '1px solid #e9eeeb',
  },
  labelTime: {
    fontSize: '11px',
    color: '#7c8986',
    fontWeight: '600',
  },
  inputTime: {
    border: 'none',
    backgroundColor: '#ffffff',
    padding: '5px 8px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#1d2927',
    fontFamily: 'inherit',
    outline: 'none',
  },
  btnQuitar: {
    border: 'none',
    background: '#fef2f2',
    color: '#b91c1c',
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '700',
    transition: 'all 0.15s ease',
  },
};
