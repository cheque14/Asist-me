import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MedicoMain from './MedicoMain';
import * as api from '../services/api';

jest.mock('../services/api', () => ({ obtenerCitasAPI: jest.fn(), obtenerSolicitudesCambioAPI: jest.fn(), proponerCambioCitaAPI: jest.fn(), resolverSolicitudCambioAPI: jest.fn() }));
const user = { id: 1, nombre: 'Prueba', rol: 'medico', access_token: 'test' };
const visits = [
  { id: 1, paciente_nombre: 'Primera', fecha_hora: '2099-10-25T10:00:00Z', estado: 'confirmada' },
  { id: 2, paciente_nombre: 'Reciente', fecha_hora: '2099-10-26T16:00:00Z', estado: 'pendiente' },
];
beforeEach(() => { jest.clearAllMocks(); api.obtenerCitasAPI.mockResolvedValue(visits); api.obtenerSolicitudesCambioAPI.mockResolvedValue([]); });

test('agenda is descending without changing the upcoming card', async () => {
  render(<MedicoMain usuario={user} />);
  await screen.findByText('Agenda de pacientes');
  await waitFor(() => expect(document.querySelectorAll('.schedule-list .appointment').length).toBe(2));
  const rows = document.querySelectorAll('.schedule-list .appointment');
  expect(rows[0].textContent).toContain('Reciente');
  expect(rows[1].textContent).toContain('Primera');
  expect(document.querySelector('.next-card').textContent).toContain('Primera');
});

test('retains change-request summary and displays request refresh failure', async () => {
  api.obtenerSolicitudesCambioAPI.mockResolvedValueOnce([{ id: 8, cita_id: 1, estado: 'pendiente_medico', fecha_hora_solicitada: '2099-10-27T12:00:00Z' }]).mockRejectedValue(new Error('No se pudieron consultar las solicitudes'));
  render(<MedicoMain usuario={user} />);
  expect(await screen.findByText('Revisión requerida')).toBeTruthy();
  fireEvent.click(within(document.querySelector('.schedule-card')).getByRole('button', { name: /Actualizar/ }));
  expect(await screen.findByText('No se pudieron consultar las solicitudes')).toBeTruthy();
  expect(screen.getByText('Contraoferta del paciente')).toBeTruthy();
  expect(screen.getByText('Agenda de pacientes')).toBeTruthy();
});

test('reports rejected doctor proposal inside the still-open dialog', async () => {
  api.proponerCambioCitaAPI.mockRejectedValue(new Error('Día no laboral'));
  render(<MedicoMain usuario={user} />);
  await waitFor(() => expect(document.querySelectorAll('.schedule-list .appointment').length).toBe(2));
  fireEvent.click(screen.getAllByRole('button', { name: 'Ver cita' })[0]);
  const dialog = screen.getByRole('dialog');
  fireEvent.change(dialog.querySelector('input[type="date"]'), { target: { value: '2099-10-28' } });
  fireEvent.change(dialog.querySelector('input[type="time"]'), { target: { value: '11:30' } });
  fireEvent.submit(dialog.querySelector('form'));
  expect(await within(dialog).findByRole('alert')).toHaveProperty('textContent', 'Día no laboral');
  expect(api.proponerCambioCitaAPI.mock.calls[0][2]).toEqual(expect.objectContaining({ fecha_local: '2099-10-28', hora_local: '11:30' }));
  expect(api.proponerCambioCitaAPI.mock.calls[0][2]).not.toHaveProperty('fecha_hora');
});

test('refreshes pending requests without a manual page reload', async () => {
  jest.useFakeTimers();
  try {
    render(<MedicoMain usuario={user} />);
    await act(async () => {});
    api.obtenerSolicitudesCambioAPI.mockResolvedValue([{ id: 8, cita_id: 1, estado: 'pendiente', fecha_hora_solicitada: '2099-10-27T12:00:00Z' }]);
    await act(async () => { jest.advanceTimersByTime(10000); });
    expect(screen.getByText('Revisión requerida')).toBeTruthy();
  } finally { jest.useRealTimers(); }
});

test('a late refresh cannot overwrite newer appointment results', async () => {
  let resolveOld;
  render(<MedicoMain usuario={user} />);
  await waitFor(() => expect(document.querySelectorAll('.schedule-list .appointment').length).toBe(2));
  api.obtenerCitasAPI.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
  const refresh = within(document.querySelector('.schedule-card')).getByRole('button', { name: /Actualizar/ });
  fireEvent.click(refresh);
  api.obtenerCitasAPI.mockResolvedValueOnce([{ ...visits[1], paciente_nombre: 'Resultado nuevo' }]);
  fireEvent.click(refresh);
  await waitFor(() => expect(document.querySelector('.schedule-list').textContent).toContain('Resultado nuevo'));
  await act(async () => { resolveOld(visits); });
  expect(document.querySelector('.schedule-list').textContent).toContain('Resultado nuevo');
  expect(document.querySelector('.schedule-list').textContent).not.toContain('Primera');
});
