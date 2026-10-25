import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CalendarioCitas from './CalendarioCitas';
import * as api from '../services/api';
jest.mock('../services/api', () => ({ obtenerCitasAPI: jest.fn(), actualizarEstadoCitaAPI: jest.fn(), proponerCambioCitaAPI: jest.fn() }));
const today = new Date();
const visit = { id: 31, paciente_nombre: 'Paciente de prueba', medico_nombre: 'Médico de prueba', fecha_hora: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).toISOString(), estado: 'pendiente' };
beforeEach(() => { jest.clearAllMocks(); api.obtenerCitasAPI.mockResolvedValue([visit]); api.actualizarEstadoCitaAPI.mockResolvedValue({}); api.proponerCambioCitaAPI.mockResolvedValue({}); });

test('calendar doctor detail allows approval and a new proposal', async () => {
  render(<CalendarioCitas usuario={{ rol: 'medico', access_token: 'test' }} />);
  await screen.findByText('Paciente de prueba');
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de la cita' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Estado de la cita' }), { target: { value: 'confirmada' } });
  await waitFor(() => expect(api.actualizarEstadoCitaAPI).toHaveBeenCalledWith('test', 31, 'confirmada'));
  await waitFor(() => expect(within(dialog).getByRole('combobox').value).toBe('confirmada'));
  fireEvent.change(within(dialog).getByLabelText('Fecha propuesta'), { target: { value: '2099-10-28' } });
  fireEvent.change(within(dialog).getByLabelText('Hora propuesta'), { target: { value: '11:30' } });
  fireEvent.submit(dialog.querySelector('form'));
  await waitFor(() => expect(api.proponerCambioCitaAPI).toHaveBeenCalledWith('test', 31, expect.objectContaining({ fecha_local: '2099-10-28', hora_local: '11:30' })));
});

test('calendar patients cannot change the appointment status or send doctor proposals', async () => {
  render(<CalendarioCitas usuario={{ rol: 'paciente', access_token: 'test' }} />);
  await screen.findByText('Médico de prueba');
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de la cita' }));
  expect(screen.queryByRole('combobox', { name: 'Estado de la cita' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Proponer horario' })).toBeNull();
});
