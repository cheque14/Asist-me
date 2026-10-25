import { requiresResponse } from './appointmentState';

test('unread state is independent from recipient pending actions', () => {
  const appointment = { estado: 'confirmada', solicitud_cambio: { estado: 'pendiente_paciente', solicitante_rol: 'medico' } };
  expect(requiresResponse(appointment, 'paciente')).toBe(true);
  expect(requiresResponse(appointment, 'medico')).toBe(false);
  expect(requiresResponse({ ...appointment, estado: 'cancelada' }, 'paciente')).toBe(false);
  expect(requiresResponse({ ...appointment, solicitud_cambio: { estado: 'pendiente_medico', solicitante_rol: 'medico' } }, 'medico')).toBe(true);
});
