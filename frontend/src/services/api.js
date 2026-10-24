// src/services/api.js
const API_URL = "http://127.0.0.1:5000/api";

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

// Funciones de chat, servicios y citas creadas previamente...
export const enviarMensajeChat = async (usuarioId, mensaje) => {
  const response = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario_id: usuarioId, mensaje }),
  });
  return await response.json();
};

export const obtenerEspecialidadesAPI = async () => {
  try {
    const response = await fetch(`${API_URL}/especialidades`);
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error al obtener especialidades de la API:", error);
    throw error;
  }
};