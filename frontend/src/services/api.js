// src/services/api.js
const API_URL = "http://127.0.0.1:5001/api";

export const loginAPI = async (identificador, password) => {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identificador, password }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error al iniciar sesión");
  return data;
};

export const registerAPI = async (datosRegistro) => {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datosRegistro),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error al registrarse");
  return data;
};

export const obtenerSesionAPI = async (accessToken) => {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: "Bearer " + accessToken },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "La sesión no es válida");
  return data.usuario;
};

export const actualizarPerfilAPI = async (accessToken, perfil) => {
  const response = await fetch(`${API_URL}/auth/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: JSON.stringify(perfil),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "No se pudo actualizar el perfil");
    error.usuario = data.usuario;
    throw error;
  }
  return data;
};

// Médicos
export const obtenerMedicosAPI = async () => {
  const response = await fetch(`${API_URL}/medicos`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudieron cargar los médicos");
  return data;
};

// Horarios y disponibilidad
export const obtenerHorariosMedicoAPI = async (accessToken) => {
  const response = await fetch(`${API_URL}/medico/horarios`, {
    headers: { Authorization: "Bearer " + accessToken },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudieron cargar los horarios");
  return data;
};

export const guardarHorariosMedicoAPI = async (accessToken, horario) => {
  const response = await fetch(`${API_URL}/medico/horarios`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: JSON.stringify(horario),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudieron guardar los horarios");
  return data;
};

export const obtenerDisponibilidadMedicoAPI = async (medicoId, fecha, tipoCitaId) => {
  const params = new URLSearchParams({
    fecha,
    tipo_cita_id: tipoCitaId,
  });
  const response = await fetch(`${API_URL}/medicos/${medicoId}/disponibilidad?${params}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo consultar la disponibilidad");
  return data;
};

// Citas médicas (Conexión real Médico - Paciente)
export const obtenerCitasAPI = async (accessToken) => {
  const response = await fetch(`${API_URL}/citas`, {
    headers: { Authorization: "Bearer " + accessToken },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudieron cargar las citas");
  return data;
};

export const agendarCitaAPI = async (accessToken, datosCita) => {
  const response = await fetch(`${API_URL}/citas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: JSON.stringify(datosCita),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo agendar la cita");
  return data;
};

export const cancelarCitaAPI = async (accessToken, citaId) => {
  const response = await fetch(`${API_URL}/citas/${citaId}/cancelar`, {
    method: "PUT",
    headers: { Authorization: "Bearer " + accessToken },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo cancelar la cita");
  return data;
};

export const actualizarEstadoCitaAPI = async (accessToken, citaId, estado) => {
  const response = await fetch(`${API_URL}/citas/${citaId}/estado`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: JSON.stringify({ estado }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo actualizar el estado");
  return data;
};

export const solicitarCambioCitaAPI = async (accessToken, citaId, datosCambio) => {
  const response = await fetch(`${API_URL}/citas/${citaId}/solicitudes-cambio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: JSON.stringify(datosCambio),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo solicitar el cambio");
  return data;
};

export const proponerCambioCitaAPI = async (accessToken, citaId, datosCambio) => {
  const response = await fetch(`${API_URL}/citas/${citaId}/propuestas-cambio`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
    body: JSON.stringify(datosCambio),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo proponer el cambio");
  return data;
};

export const resolverPropuestaCitaAPI = async (accessToken, solicitudId, accion, fechaHora) => {
  const response = await fetch(`${API_URL}/citas/propuestas-cambio/${solicitudId}/resolver`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
    body: JSON.stringify({ accion, ...(fechaHora && typeof fechaHora === 'object' ? fechaHora : { fecha_hora: fechaHora }) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo responder la propuesta");
  return data;
};

export const obtenerNotificacionesAPI = async (accessToken) => {
  const response = await fetch(`${API_URL}/notificaciones`, {
    headers: { Authorization: "Bearer " + accessToken },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudieron cargar las notificaciones");
  return data;
};

export const obtenerConteoNotificacionesNoLeidasAPI = async (accessToken) => {
  const response = await fetch(`${API_URL}/notificaciones/no-leidas/count`, {
    headers: { Authorization: "Bearer " + accessToken },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo consultar el estado de las notificaciones");
  return data.count || 0;
};

export const marcarNotificacionLeidaAPI = async (accessToken, notificationId) => {
  const response = await fetch(`${API_URL}/notificaciones/${notificationId}/leer`, {
    method: "PUT",
    headers: { Authorization: "Bearer " + accessToken },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo actualizar la notificación");
  return data;
};

export const obtenerSolicitudesCambioAPI = async (accessToken) => {
  const response = await fetch(`${API_URL}/citas/solicitudes-cambio`, {
    headers: { Authorization: "Bearer " + accessToken },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudieron cargar las solicitudes");
  return data;
};

export const resolverSolicitudCambioAPI = async (accessToken, solicitudId, aceptar) => {
  const response = await fetch(`${API_URL}/citas/solicitudes-cambio/${solicitudId}/resolver`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: JSON.stringify({ aceptar }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo resolver la solicitud");
  return data;
};

// Servicios médicos
export const obtenerServiciosAPI = async () => {
  const response = await fetch(`${API_URL}/servicios`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudieron cargar los servicios");
  return data;
};

export const crearServicioAPI = async (accessToken, datosServicio) => {
  const response = await fetch(`${API_URL}/servicios`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: JSON.stringify(datosServicio),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo crear el servicio");
  return data;
};

// Chatbot con persistencia
export const enviarMensajeChat = async (accessToken, mensaje) => {
  const response = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
    body: JSON.stringify({ mensaje }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo enviar el mensaje.');
  return data;
};

export const obtenerEspecialidadesAPI = async () => {
  const response = await fetch(`${API_URL}/especialidades`);
  if (!response.ok) {
    throw new Error(`Error HTTP: ${response.status}`);
  }
  return await response.json();
};
