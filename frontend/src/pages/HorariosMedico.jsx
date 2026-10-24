import React, { useEffect, useState } from 'react';
import {
  guardarHorariosMedicoAPI,
  obtenerHorariosMedicoAPI,
} from '../services/api';

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
        setZonaHoraria(resultado.zona_horaria);
        setHorarios(resultado.horarios.map((horario, index) => ({
          ...horario,
          hora_inicio: horario.hora_inicio.slice(0, 5),
          hora_fin: horario.hora_fin.slice(0, 5),
          key: `saved-${index}`,
        })));
      } catch (err) {
        setError(err.message || 'No se pudieron cargar los horarios.');
      } finally {
        setCargando(false);
      }
    };

    cargar();
  }, [usuario.access_token]);

  const actualizarBloque = (key, campo, valor) => {
    setHorarios((actuales) => actuales.map((horario) => (
      horario.key === key ? { ...horario, [campo]: valor } : horario
    )));
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
      setMensaje(resultado.mensaje);
    } catch (err) {
      setError(err.message || 'No se pudo guardar el horario.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section style={styles.pagina}>
      <header style={styles.encabezado}>
        <h1 style={styles.titulo}>Mi horario de atención</h1>
        <p style={styles.descripcion}>
          Configura los días y bloques de atención. El asistente usará este horario y la duración del tipo de cita para mostrar espacios disponibles.
        </p>
      </header>

      {error && <div role="alert" style={styles.alertaError}>{error}</div>}
      {mensaje && <div role="status" style={styles.alertaExito}>{mensaje}</div>}

      {cargando ? (
        <p>Cargando horario...</p>
      ) : (
        <form onSubmit={guardar}>
          <div className="tarjeta-flotante" style={styles.tarjeta}>
            <label htmlFor="zona-horaria" style={styles.etiqueta}>
              ZONA HORARIA DE LA CONSULTA
            </label>
            <input
              id="zona-horaria"
              className="input-flotante"
              value={zonaHoraria}
              onChange={(evento) => setZonaHoraria(evento.target.value)}
              placeholder="Ej. America/Mexico_City"
              style={styles.zonaInput}
              required
            />
            <small style={styles.ayuda}>
              Usa una zona IANA, por ejemplo America/Mexico_City o America/Costa_Rica.
            </small>
          </div>

          <div style={styles.listaDias}>
            {dias.map((nombreDia, dia) => {
              const bloquesDia = horarios
                .filter((horario) => horario.dia_semana === dia)
                .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

              return (
                <div className="tarjeta-flotante" style={styles.tarjetaDia} key={nombreDia}>
                  <div style={styles.cabeceraDia}>
                    <h2 style={styles.nombreDia}>{nombreDia}</h2>
                    <button
                      type="button"
                      onClick={() => agregarBloque(dia)}
                      style={styles.botonAgregar}
                    >
                      + Agregar bloque
                    </button>
                  </div>
                  {bloquesDia.length === 0 ? (
                    <p style={styles.sinBloques}>Sin horario de atención</p>
                  ) : (
                    <div style={styles.bloques}>
                      {bloquesDia.map((bloque) => (
                        <div style={styles.filaBloque} key={bloque.key}>
                          <label style={styles.campoHora}>
                            <span>Desde</span>
                            <input
                              type="time"
                              value={bloque.hora_inicio}
                              onChange={(evento) => actualizarBloque(
                                bloque.key,
                                'hora_inicio',
                                evento.target.value,
                              )}
                              required
                            />
                          </label>
                          <label style={styles.campoHora}>
                            <span>Hasta</span>
                            <input
                              type="time"
                              value={bloque.hora_fin}
                              onChange={(evento) => actualizarBloque(
                                bloque.key,
                                'hora_fin',
                                evento.target.value,
                              )}
                              required
                            />
                          </label>
                          <button
                            type="button"
                            aria-label={`Quitar bloque de ${nombreDia}`}
                            onClick={() => quitarBloque(bloque.key)}
                            style={styles.botonQuitar}
                          >
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button type="submit" disabled={guardando} style={styles.botonGuardar}>
            {guardando ? 'Guardando...' : 'Guardar horario'}
          </button>
        </form>
      )}
    </section>
  );
}

const styles = {
  pagina: { padding: '36px', flex: 1, backgroundColor: '#f1f5f9' },
  encabezado: { marginBottom: '24px' },
  titulo: { margin: 0, color: '#0f172a', fontSize: '26px' },
  descripcion: { color: '#64748b', maxWidth: '760px', lineHeight: 1.6 },
  tarjeta: { padding: '22px', marginBottom: '20px', maxWidth: '720px' },
  etiqueta: { display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' },
  zonaInput: { width: '100%', maxWidth: '400px', boxSizing: 'border-box' },
  ayuda: { display: 'block', color: '#64748b', marginTop: '8px' },
  listaDias: { display: 'grid', gap: '14px', maxWidth: '900px' },
  tarjetaDia: { padding: '20px' },
  cabeceraDia: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' },
  nombreDia: { margin: 0, color: '#0f172a', fontSize: '18px' },
  bloques: { display: 'grid', gap: '10px', marginTop: '14px' },
  filaBloque: { display: 'flex', alignItems: 'end', gap: '12px', flexWrap: 'wrap' },
  campoHora: { display: 'grid', gap: '6px', color: '#64748b', fontSize: '12px' },
  sinBloques: { margin: '12px 0 0', color: '#94a3b8', fontSize: '14px' },
  botonAgregar: { border: 0, background: 'transparent', color: '#0284c7', cursor: 'pointer', fontWeight: 600 },
  botonQuitar: { border: 0, background: 'transparent', color: '#b91c1c', padding: '8px', cursor: 'pointer' },
  botonGuardar: { marginTop: '20px', padding: '12px 20px', border: 0, borderRadius: '10px', background: '#0284c7', color: 'white', fontWeight: 600, cursor: 'pointer' },
  alertaError: { color: '#b91c1c', background: '#fee2e2', padding: '12px', borderRadius: '10px', marginBottom: '16px' },
  alertaExito: { color: '#166534', background: '#dcfce7', padding: '12px', borderRadius: '10px', marginBottom: '16px' },
};
