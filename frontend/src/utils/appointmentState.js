const PENDING = ['pendiente', 'pendiente_paciente', 'pendiente_medico'];
export function requiresResponse(appointment, role) {
  const proposal = appointment?.solicitud_cambio;
  if (!proposal || !PENDING.includes(proposal.estado) || ['cancelada', 'rechazada', 'completada'].includes(appointment.estado)) return false;
  if (role === 'medico') return proposal.estado === 'pendiente_medico' || (proposal.estado === 'pendiente' && proposal.solicitante_rol !== 'medico');
  return proposal.estado === 'pendiente_paciente' || (proposal.estado === 'pendiente' && proposal.solicitante_rol === 'medico');
}
