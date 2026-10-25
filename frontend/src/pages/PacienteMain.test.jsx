import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PacienteMain from './PacienteMain';
import * as api from '../services/api';
import * as clinicalApi from '../services/clinicalApi';
jest.mock('../services/clinicalApi', () => ({ obtenerPersonasClinicasAPI: jest.fn() }));
jest.mock('../services/api', () => ({ obtenerCitasAPI: jest.fn(), obtenerMedicosAPI: jest.fn(), obtenerNotificacionesAPI: jest.fn(), obtenerServiciosAPI: jest.fn(), agendarCitaAPI: jest.fn(), cancelarCitaAPI: jest.fn(), solicitarCambioCitaAPI: jest.fn(), resolverPropuestaCitaAPI: jest.fn(), enviarMensajeChat: jest.fn() }));

describe('patient administrative assistant', () => {
  beforeEach(() => {
    api.obtenerCitasAPI.mockResolvedValue([]);
    api.obtenerNotificacionesAPI.mockResolvedValue([]);
    api.obtenerServiciosAPI.mockResolvedValue([]);
    api.obtenerMedicosAPI.mockResolvedValue([]);
    api.enviarMensajeChat.mockReset().mockResolvedValue({ respuesta: 'Respuesta de prueba' });
  });

  test('available physicians shortcut sends its text with an empty input', async () => {
    render(<PacienteMain usuario={{ id: 1, rol: 'paciente', access_token: 'session' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Médicos disponibles' }));
    expect(await screen.findByText('Respuesta de prueba')).toBeTruthy();
    expect(api.enviarMensajeChat).toHaveBeenCalledWith('session', '¿Qué médicos están disponibles?');
  });

  test('manual form submission still trims and sends the input', async () => {
    render(<PacienteMain usuario={{ id: 1, rol: 'paciente', access_token: 'session' }} />);
    const input = screen.getByPlaceholderText('Pregúntale a AsisTme...');
    fireEvent.change(input, { target: { value: '  Quiero una cita  ' } });
    fireEvent.submit(input.closest('form'));
    expect(await screen.findByText('Respuesta de prueba')).toBeTruthy();
    expect(api.enviarMensajeChat).toHaveBeenCalledWith('session', 'Quiero una cita');
    expect(input.value).toBe('');
  });

  test('blank input sends nothing and a shortcut request failure remains visible', async () => {
    api.enviarMensajeChat.mockRejectedValue(new Error('Sin conexión'));
    render(<PacienteMain usuario={{ id: 1, rol: 'paciente', access_token: 'session' }} />);
    fireEvent.submit(screen.getByPlaceholderText('Pregúntale a AsisTme...').closest('form'));
    expect(api.enviarMensajeChat).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Médicos disponibles' }));
    expect(await screen.findByText('No pude conectar con el servidor.')).toBeTruthy();
  });
});

test('booking sends clinic wall-clock fields without browser timezone conversion', async () => {
  clinicalApi.obtenerPersonasClinicasAPI.mockResolvedValue([]);
  api.obtenerCitasAPI.mockResolvedValue([]);
  api.obtenerNotificacionesAPI.mockResolvedValue([]);
  api.obtenerServiciosAPI.mockResolvedValue([]);
  api.obtenerMedicosAPI.mockResolvedValue([{ id: 7, nombre: 'Médico de prueba', especialidad: 'Consulta', zona_horaria: 'America/Mexico_City' }]);
  api.agendarCitaAPI.mockResolvedValue({ cita: { id: 31 } });
  const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
  const dispatch = jest.spyOn(window, 'dispatchEvent');
  try {
    render(<PacienteMain usuario={{ id: 1, rol: 'paciente', access_token: 'test' }} abrirAgendar />);
    await screen.findByRole('option', { name: /Médico de prueba/ });
    expect(screen.getByText(/Hora del consultorio: America\/Mexico_City/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Fecha de la cita'), { target: { value: '2099-10-30' } });
    fireEvent.change(screen.getByLabelText('Hora de la cita'), { target: { value: '15:00' } });
    const motive = document.querySelector('textarea[required]');
    fireEvent.change(motive, { target: { value: 'Consulta' } });
    fireEvent.submit(motive.closest('form'));
    await waitFor(() => expect(api.agendarCitaAPI).toHaveBeenCalledTimes(1));
    expect(api.agendarCitaAPI.mock.calls[0][1]).toEqual(expect.objectContaining({ medico_id: 7, fecha_local: '2099-10-30', hora_local: '15:00' }));
    expect(api.agendarCitaAPI.mock.calls[0][1]).not.toHaveProperty('fecha_hora');
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'asis:notifications-updated' })));
  } finally { alert.mockRestore(); dispatch.mockRestore(); }
});

test.each(['aceptar', 'rechazar', 'contraofertar'])('patient %s refreshes notification indicators', async (action) => {
  api.obtenerCitasAPI.mockResolvedValue([{ id: 31, medico_id: 7, medico_nombre: 'Médico de prueba', estado: 'confirmada', fecha_hora: '2099-10-30T21:00:00Z', zona_horaria: 'America/Mexico_City', solicitud_cambio: { id: 21, solicitante_rol: 'medico', estado: 'pendiente_paciente', fecha_hora_solicitada: '2099-10-31T21:00:00Z' } }]);
  api.obtenerNotificacionesAPI.mockResolvedValue([]);
  api.obtenerServiciosAPI.mockResolvedValue([]);
  api.obtenerMedicosAPI.mockResolvedValue([]);
  api.resolverPropuestaCitaAPI.mockResolvedValue({});
  const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
  const dispatch = jest.spyOn(window, 'dispatchEvent');
  try {
    render(<PacienteMain usuario={{ id: 1, rol: 'paciente', access_token: 'test' }} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver cita' }))[0]);
    if (action === 'contraofertar') {
      fireEvent.change(screen.getByLabelText('Fecha propuesta'), { target: { value: '2099-11-01' } });
      fireEvent.change(screen.getByLabelText('Hora propuesta'), { target: { value: '15:00' } });
      fireEvent.submit(screen.getByLabelText('Hora propuesta').closest('form'));
    } else fireEvent.click(screen.getByRole('button', { name: action === 'aceptar' ? 'Aceptar cambio' : 'Rechazar cambio' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'asis:notifications-updated' })));
  } finally { alert.mockRestore(); dispatch.mockRestore(); }
});

test.each(['cancelar', 'solicitar'])('patient %s refreshes indicators only after a successful mutation', async (action) => {
  api.obtenerCitasAPI.mockResolvedValue([{ id: 31, medico_id: 7, medico_nombre: 'Médico de prueba', estado: 'confirmada', fecha_hora: '2099-10-30T21:00:00Z', zona_horaria: 'America/Mexico_City' }]);
  api.obtenerNotificacionesAPI.mockResolvedValue([]);
  api.obtenerServiciosAPI.mockResolvedValue([]);
  api.obtenerMedicosAPI.mockResolvedValue([{ id: 7, nombre: 'Médico de prueba', zona_horaria: 'America/Mexico_City' }]);
  api.cancelarCitaAPI.mockResolvedValue({});
  api.solicitarCambioCitaAPI.mockResolvedValue({});
  const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  const dispatch = jest.spyOn(window, 'dispatchEvent');
  try {
    render(<PacienteMain usuario={{ id: 1, rol: 'paciente', access_token: 'test' }} />);
    if (action === 'cancelar') {
      fireEvent.click((await screen.findAllByRole('button', { name: 'Ver cita' }))[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar cita' }));
    } else {
      fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
      fireEvent.change(screen.getByLabelText('NUEVA FECHA'), { target: { value: '2099-11-01' } });
      fireEvent.submit(screen.getByLabelText('NUEVA FECHA').closest('form'));
    }
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'asis:notifications-updated' })));
  } finally { alert.mockRestore(); confirm.mockRestore(); dispatch.mockRestore(); }
});

test('failed patient action does not announce new notifications', async () => {
  api.obtenerCitasAPI.mockResolvedValue([{ id: 31, estado: 'confirmada', fecha_hora: '2099-10-30T21:00:00Z' }]);
  api.obtenerNotificacionesAPI.mockResolvedValue([]);
  api.obtenerServiciosAPI.mockResolvedValue([]);
  api.obtenerMedicosAPI.mockResolvedValue([]);
  api.cancelarCitaAPI.mockRejectedValue(new Error('Error de prueba'));
  const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  const dispatch = jest.spyOn(window, 'dispatchEvent');
  try {
    render(<PacienteMain usuario={{ id: 1, rol: 'paciente', access_token: 'test' }} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver cita' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar cita' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Error de prueba'));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'asis:notifications-updated' }));
  } finally { alert.mockRestore(); confirm.mockRestore(); dispatch.mockRestore(); }
});

test('repeat beneficiary booking explicitly reuses the selected person identity', async () => {
  api.obtenerCitasAPI.mockResolvedValue([]);
  api.obtenerNotificacionesAPI.mockResolvedValue([]);
  api.obtenerServiciosAPI.mockResolvedValue([]);
  api.obtenerMedicosAPI.mockResolvedValue([{ id: 7, nombre: 'Médico de prueba', zona_horaria: 'America/Mexico_City' }]);
  api.agendarCitaAPI.mockClear().mockResolvedValue({});
  clinicalApi.obtenerPersonasClinicasAPI.mockResolvedValue([{ id: 77, tipo: 'beneficiario', nombre: 'Beneficiaria registrada', telefono: '5555555555' }]);
  const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
  try {
    render(<PacienteMain usuario={{ id: 1, rol: 'paciente', access_token: 'test' }} abrirAgendar />);
    await screen.findByRole('option', { name: /Médico de prueba/ });
    fireEvent.click(screen.getByLabelText('La cita es para otra persona'));
    await screen.findByRole('option', { name: /Beneficiaria registrada/ });
    fireEvent.change(screen.getByLabelText('Beneficiario registrado'), { target: { value: '77' } });
    fireEvent.change(screen.getByLabelText('Fecha de la cita'), { target: { value: '2099-10-30' } });
    fireEvent.change(screen.getByLabelText('Hora de la cita'), { target: { value: '15:00' } });
    const motive = document.querySelector('textarea[required]');
    fireEvent.change(motive, { target: { value: 'Seguimiento' } });
    fireEvent.submit(motive.closest('form'));
    await waitFor(() => expect(api.agendarCitaAPI).toHaveBeenCalledTimes(1));
    expect(api.agendarCitaAPI.mock.calls[0][1]).toEqual(expect.objectContaining({ persona_atendida_id: 77, beneficiario_nombre: 'Beneficiaria registrada' }));
  } finally { alert.mockRestore(); }
});
