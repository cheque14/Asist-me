import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import HistorialClinico from './HistorialClinico';
import { obtenerCitasAPI } from '../services/api';

jest.mock('../services/api', () => ({ obtenerCitasAPI: jest.fn() }));

const user = { rol: 'paciente', nombre: 'Titular', access_token: 'test' };
const appointment = (overrides = {}) => ({
  id: 1, paciente_id: 7, paciente_nombre: 'Titular', paciente_telefono: '5551111111',
  fecha_hora: '2026-10-25T01:30:00Z', zona_horaria: 'America/Mexico_City',
  motivo: 'Consulta titular', estado: 'completada', medico_nombre: 'Dra. Sol', ...overrides,
});
const beneficiary = (overrides = {}) => appointment({
  id: 2, es_para_otra_persona: true, beneficiario_nombre: 'Ana',
  beneficiario_telefono: '5552222222', motivo: 'Consulta Ana', ...overrides,
});
beforeEach(() => { jest.resetAllMocks(); obtenerCitasAPI.mockResolvedValue([appointment(), beneficiary()]); });

test.each(['paciente', 'medico'])('labels history and separates attended people for %s', async (rol) => {
  render(<HistorialClinico usuario={{ ...user, rol }} />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Historial de citas');
  const people = await screen.findByRole('region', { name: 'Personas atendidas' });
  fireEvent.click(within(people).getByRole('button', { name: /Ana/ }));
  const detail = screen.getByRole('region', { name: 'Citas de Ana' });
  expect(within(detail).getByText('Consulta Ana')).toBeTruthy();
  expect(within(detail).queryByText('Consulta titular')).toBeNull();
  expect(within(detail).getByText(/5552222222/)).toBeTruthy();
  expect(within(detail).queryByText(/5551111111/)).toBeNull();
  expect(within(detail).getByText(/Cuenta titular: Titular/)).toBeTruthy();
  expect(within(people).getByRole('button', { name: /Ana/ }).getAttribute('aria-pressed')).toBe('true');
});

test('never merges legacy beneficiaries by matching name or phone', async () => {
  obtenerCitasAPI.mockResolvedValue([beneficiary(), beneficiary({ id: 3, motivo: 'Otra visita' })]);
  render(<HistorialClinico usuario={user} />);
  const people = await screen.findByRole('region', { name: 'Personas atendidas' });
  const rows = within(people).getAllByRole('button', { name: /Ana/ });
  expect(rows).toHaveLength(2);
  fireEvent.click(rows[1]);
  expect(screen.getByText('Otra visita')).toBeTruthy();
  expect(screen.queryByText('Consulta Ana')).toBeNull();
});

test('groups stable clinical identities but keeps distinct identities apart', async () => {
  obtenerCitasAPI.mockResolvedValue([
    beneficiary({ persona_atendida_id: 40 }), beneficiary({ id: 3, persona_atendida_id: 40, motivo: 'Seguimiento Ana' }),
    beneficiary({ id: 4, persona_atendida_id: 41, motivo: 'Otra persona' }),
  ]);
  render(<HistorialClinico usuario={user} />);
  const people = await screen.findByRole('region', { name: 'Personas atendidas' });
  expect(within(people).getAllByRole('button')).toHaveLength(2);
  fireEvent.click(within(people).getAllByRole('button')[0]);
  expect(screen.getByText('Seguimiento Ana')).toBeTruthy();
  expect(screen.getByText('Consulta Ana')).toBeTruthy();
  expect(screen.queryByText('Otra persona')).toBeNull();
});

test('uses clinic day and time with an explicit IANA zone and preserves appointment status', async () => {
  obtenerCitasAPI.mockResolvedValue([appointment()]);
  render(<HistorialClinico usuario={user} />);
  await screen.findByText('Consulta titular');
  const time = document.querySelector('time');
  expect(time.textContent).toContain('24');
  expect(time.textContent).toContain('19:30');
  expect(time.textContent).toContain('America/Mexico_City');
  expect(screen.getByText('Completada')).toBeTruthy();
  expect(screen.getByText(/Dra. Sol/)).toBeTruthy();
});

test.each([undefined, 'invalid-zone'])('labels UTC fallback instead of device time for zone %s', async (zona_horaria) => {
  obtenerCitasAPI.mockResolvedValue([appointment({ zona_horaria })]);
  render(<HistorialClinico usuario={user} />);
  await screen.findByText('Consulta titular');
  expect(document.querySelector('time').textContent).toContain('UTC');
  expect(document.querySelector('time').textContent).toContain('01:30');
});

test('missing beneficiary contact never falls back to account-holder contact', async () => {
  obtenerCitasAPI.mockResolvedValue([beneficiary({ beneficiario_nombre: null, beneficiario_telefono: null })]);
  render(<HistorialClinico usuario={user} />);
  await screen.findByText('Consulta Ana');
  expect(screen.getByRole('heading', { name: 'Beneficiario sin nombre registrado' })).toBeTruthy();
  expect(screen.getByText('Teléfono no registrado')).toBeTruthy();
  expect(screen.queryByText(/5551111111/)).toBeNull();
});

test('shows loading, retryable errors, and an honest empty state', async () => {
  obtenerCitasAPI.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce([]);
  render(<HistorialClinico usuario={user} />);
  expect(screen.getByRole('status').textContent).toContain('Cargando');
  expect((await screen.findByRole('alert')).textContent).toContain('Sin conexión');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Aún no hay citas registradas');
  expect(obtenerCitasAPI).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('an old session response cannot populate a different account history', async () => {
  let resolveOld;
  obtenerCitasAPI.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce([]);
  const { rerender } = render(<HistorialClinico usuario={user} />);
  rerender(<HistorialClinico usuario={{ ...user, access_token: 'other' }} />);
  await screen.findByText('Aún no hay citas registradas');
  await act(async () => resolveOld([appointment()]));
  expect(screen.queryByText('Consulta titular')).toBeNull();
});
