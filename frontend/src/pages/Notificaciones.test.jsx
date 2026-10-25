import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Notificaciones from './Notificaciones';
import * as api from '../services/api';
jest.mock('../services/api', () => ({ obtenerNotificacionesAPI: jest.fn(), obtenerCitasAPI: jest.fn(), resolverPropuestaCitaAPI: jest.fn(), marcarNotificacionLeidaAPI: jest.fn() }));

test('a failed proposal does not leak its error into another appointment', async () => {
  api.obtenerNotificacionesAPI.mockResolvedValue([
    { id: 1, cita_id: 31, mensaje: 'Notificación A', leida: true },
    { id: 2, cita_id: 32, mensaje: 'Notificación B', leida: true },
  ]);
  api.obtenerCitasAPI.mockResolvedValue([31, 32].map((id) => ({ id, medico_nombre: 'Médico ' + id, estado: 'confirmada', fecha_hora: '2099-10-25T12:00:00Z', solicitud_cambio: { id: id + 100, estado: 'pendiente_paciente', fecha_hora_solicitada: '2099-10-26T12:00:00Z' } })));
  api.resolverPropuestaCitaAPI.mockRejectedValue(new Error('Día no laboral'));
  render(<Notificaciones usuario={{ rol: 'paciente', access_token: 'test' }} />);
  fireEvent.click(await screen.findByText('Notificación A'));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Aceptar cambio' }));
  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveProperty('textContent', 'Día no laboral');
  const close = within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' });
  await waitFor(() => expect(close.disabled).toBe(false));
  fireEvent.click(close);
  fireEvent.click(screen.getByText('Notificación B'));
  expect(within(screen.getByRole('dialog')).queryByRole('alert')).toBeNull();
});

test('a read notification still exposes a pending response', async () => {
  api.obtenerNotificacionesAPI.mockResolvedValue([{ id: 1, cita_id: 31, mensaje: 'Cambio propuesto', leida: true }]);
  api.obtenerCitasAPI.mockResolvedValue([{ id: 31, estado: 'confirmada', solicitud_cambio: { id: 1, estado: 'pendiente_paciente', solicitante_rol: 'medico' } }]);
  render(<Notificaciones usuario={{ rol: 'paciente', access_token: 'test' }} />);
  expect(await screen.findByText('Requiere respuesta')).toBeTruthy();
});

test('appointment load failure remains visible and notification offers a retry', async () => {
  api.obtenerNotificacionesAPI.mockResolvedValue([{ id: 1, cita_id: 31, mensaje: 'Cambio propuesto', leida: false }]);
  api.obtenerCitasAPI.mockRejectedValue(new Error('Sin conexión a citas'));
  api.marcarNotificacionLeidaAPI.mockResolvedValue({});
  render(<Notificaciones usuario={{ rol: 'paciente', access_token: 'test' }} />);
  fireEvent.click(await screen.findByText('Cambio propuesto'));
  expect(await screen.findByRole('button', { name: 'Reintentar cargar cita' })).toBeTruthy();
  expect(screen.getByText('Sin conexión a citas')).toBeTruthy();
});
