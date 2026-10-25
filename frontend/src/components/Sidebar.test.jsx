import React from 'react';
import { render, screen } from '@testing-library/react';
import Sidebar from './Sidebar';
import * as api from '../services/api';
jest.mock('../services/api', () => ({ obtenerConteoNotificacionesNoLeidasAPI: jest.fn(), obtenerCitasAPI: jest.fn() }));

test('read proposals keep an independent pending action indicator and separate clinical navigation', async () => {
  api.obtenerConteoNotificacionesNoLeidasAPI.mockResolvedValue(0);
  api.obtenerCitasAPI.mockResolvedValue([{ estado: 'confirmada', solicitud_cambio: { estado: 'pendiente_paciente' } }]);
  render(<Sidebar usuario={{ rol: 'paciente', nombre: 'Paciente', access_token: 'test' }} setVistaActual={jest.fn()} />);
  expect(await screen.findByRole('button', { name: '1 por responder' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Notificaciones, 0 sin leer, 1 requieren respuesta' })).toBeTruthy();
  expect(document.querySelector('.app-notification-indicator')).toBeNull();
  expect(screen.getByRole('button', { name: 'Historial de citas' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Expediente clínico' })).toBeTruthy();
});
