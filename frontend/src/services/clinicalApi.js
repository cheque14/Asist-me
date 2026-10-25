const API_URL = 'http://127.0.0.1:5001/api/expedientes';

async function clinicalRequest(token, path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo consultar el expediente clínico.');
  return data;
}

export const obtenerPersonasClinicasAPI = (token) => clinicalRequest(token, '/personas');
export const obtenerExpedienteAPI = (token, id, pagination = {}) => {
  const params = new URLSearchParams();
  if (pagination.limit != null) params.set('limit', pagination.limit);
  if (pagination.offset != null) params.set('offset', pagination.offset);
  const query = params.toString();
  return clinicalRequest(token, `/${encodeURIComponent(id)}${query ? `?${query}` : ''}`);
};
export const agregarNotaClinicaAPI = (token, id, nota) => clinicalRequest(token, `/${encodeURIComponent(id)}/notas`, {
  method: 'POST', body: JSON.stringify(nota),
});
export const actualizarPersonaClinicaAPI = (token, id, persona) => clinicalRequest(token, `/${encodeURIComponent(id)}/persona`, {
  method: 'PATCH', body: JSON.stringify(persona),
});
