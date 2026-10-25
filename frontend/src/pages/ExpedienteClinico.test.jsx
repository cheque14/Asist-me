import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ExpedienteClinico from './ExpedienteClinico';
import * as clinicalApi from '../services/clinicalApi';

jest.mock('../services/clinicalApi', () => ({
  obtenerPersonasClinicasAPI: jest.fn(), obtenerExpedienteAPI: jest.fn(), agregarNotaClinicaAPI: jest.fn(),
  actualizarPersonaClinicaAPI: jest.fn(),
}));

const patient = { rol: 'paciente', access_token: 'test' };
const doctor = { rol: 'medico', access_token: 'test' };
const person = { id: 'p1', nombre: 'Ana Pérez', tipo: 'titular', paciente_id: 7, telefono: '5551234567', fecha_nacimiento: '1990-05-17', acceso_clinico: true };
const second = { ...person, id: 'p2', nombre: 'Bea Pérez', tipo: 'beneficiario' };
const labels = {
  antecedentes: 'Antecedentes', alergias: 'Alergias', motivo: 'Motivo de consulta', exploracion: 'Exploración física',
  diagnostico: 'Diagnóstico', tratamiento: 'Tratamiento', seguimiento: 'Seguimiento',
};
const vitalLabels = {
  peso_kg: 'Peso (kg)', talla_cm: 'Talla (cm)', temperatura_c: 'Temperatura (°C)',
  frecuencia_cardiaca: 'Frecuencia cardíaca (lpm)', presion_arterial: 'Presión arterial (mmHg)', saturacion_oxigeno: 'Saturación de oxígeno (%)',
};
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => {
  jest.resetAllMocks();
  clinicalApi.obtenerPersonasClinicasAPI.mockResolvedValue([person]);
  clinicalApi.obtenerExpedienteAPI.mockImplementation(async (_, id) => ({ persona: id === second.id ? second : person, notas: [], citas: [{ id: 42, fecha_hora: '2026-10-25T12:00:00Z', zona_horaria: 'America/Mexico_City', estado: 'confirmada' }] }));
  clinicalApi.agregarNotaClinicaAPI.mockResolvedValue({ nota: { id: 'n2', motivo: 'Nueva consulta', autor_nombre: 'Dra. Sol', creado_en: '2026-10-25T12:00:00Z' } });
  clinicalApi.actualizarPersonaClinicaAPI.mockResolvedValue({ persona: { ...person, fecha_nacimiento: '1991-06-18' } });
});
const openRecord = async (usuario = doctor) => {
  const view = render(<ExpedienteClinico usuario={usuario} />);
  await screen.findByRole('heading', { name: 'Ana Pérez' });
  await screen.findByText('Sin notas clínicas registradas');
  return view;
};
const fillNote = () => {
  Object.entries(labels).forEach(([key, label]) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value: `${key} registrado` } }));
};

test('patients read demographics and clinical history without write controls', async () => {
  clinicalApi.obtenerExpedienteAPI.mockResolvedValue({ persona: person, notas: [{ id: 'n1', alergias: 'Sin alergias conocidas', diagnostico: 'Diagnóstico previo', autor_nombre: 'Dra. Sol', creado_en: '2026-10-25T12:00:00Z' }] });
  render(<ExpedienteClinico usuario={patient} />);
  await screen.findByText('Diagnóstico previo');
  expect(screen.getByText('5551234567')).toBeTruthy();
  expect(screen.getByText(/17.*1990/)).toBeTruthy();
  expect(screen.getByText('Sin alergias conocidas')).toBeTruthy();
  expect(screen.getAllByText('Sin datos registrados').length).toBeGreaterThan(0);
  expect(screen.getByText(/Dra. Sol/)).toBeTruthy();
  expect(document.querySelector('time').textContent).toContain('UTC');
  expect(screen.queryByRole('button', { name: 'Guardar entrada clínica' })).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByLabelText('Fecha de nacimiento registrada')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Guardar fecha de nacimiento' })).toBeNull();
  expect(clinicalApi.agregarNotaClinicaAPI).not.toHaveBeenCalled();
});

test('explicit denied clinical access explains consent and never fetches the beneficiary record', async () => {
  clinicalApi.obtenerPersonasClinicasAPI.mockResolvedValue([{ ...second, acceso_clinico: false }]);
  render(<ExpedienteClinico usuario={patient} />);
  await screen.findByText(/autorización explícita/);
  expect(clinicalApi.obtenerExpedienteAPI).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).toBeNull();
});

test('an unknown access flag fails closed and unknown roles cannot write', async () => {
  clinicalApi.obtenerPersonasClinicasAPI.mockResolvedValue([{ ...person, acceso_clinico: undefined }]);
  render(<ExpedienteClinico usuario={{ ...patient, rol: 'administrador' }} />);
  await screen.findByText(/autorización explícita/);
  expect(clinicalApi.obtenerExpedienteAPI).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Guardar entrada clínica' })).toBeNull();
});

test('doctor entry offers all clinical sections, structured vitals and neutral empty defaults', async () => {
  await openRecord();
  Object.values(labels).forEach((label) => expect(screen.getByLabelText(label, { exact: true }).value).toBe(''));
  Object.values(vitalLabels).forEach((label) => expect(screen.getByLabelText(label, { exact: true }).maxLength).toBe(32));
  expect(screen.getByText(/Las correcciones se registran como una nueva entrada/)).toBeTruthy();
  fillNote();
  const vitals = { peso_kg: '70', talla_cm: '170', temperatura_c: '36.5', frecuencia_cardiaca: '75', presion_arterial: '120/80', saturacion_oxigeno: '98' };
  Object.entries(vitals).forEach(([key, value]) => fireEvent.change(screen.getByLabelText(vitalLabels[key], { exact: true }), { target: { value } }));
  fireEvent.change(screen.getByLabelText('Cita relacionada (opcional)'), { target: { value: '42' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrada clínica' }));
  await waitFor(() => expect(clinicalApi.agregarNotaClinicaAPI).toHaveBeenCalledWith('test', 'p1', {
    ...Object.fromEntries(Object.keys(labels).map((key) => [key, `${key} registrado`])), signos_vitales: vitals, cita_id: 42,
  }));
  await screen.findByText('Nueva consulta');
  expect(screen.getByText(/Dra. Sol/)).toBeTruthy();
  expect(screen.getByLabelText('Alergias', { exact: true }).value).toBe('');
});

test('cannot submit a blank note and optional appointment is omitted', async () => {
  await openRecord();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrada clínica' }));
  expect(clinicalApi.agregarNotaClinicaAPI).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('Registra al menos un dato clínico');
  fireEvent.change(screen.getByLabelText('Alergias', { exact: true }), { target: { value: 'Sin alergias conocidas' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrada clínica' }));
  await waitFor(() => expect(clinicalApi.agregarNotaClinicaAPI).toHaveBeenCalledTimes(1));
  expect(clinicalApi.agregarNotaClinicaAPI.mock.calls[0][2].cita_id).toBeUndefined();
});

test('preserves draft after save failure and appends a server-authored correction without overwriting earlier notes', async () => {
  clinicalApi.obtenerExpedienteAPI.mockResolvedValue({ persona: person, notas: [{ id: 'n1', diagnostico: 'Diagnóstico anterior', autor_nombre: 'Dr. Mar', creado_en: '2026-10-24T12:00:00Z' }] });
  clinicalApi.agregarNotaClinicaAPI.mockRejectedValueOnce(new Error('No se pudo guardar')).mockResolvedValueOnce({ nota: { id: 'n2', diagnostico: 'Corrección registrada', autor_nombre: 'Dra. Sol', creado_en: '2026-10-25T12:00:00Z' } });
  render(<ExpedienteClinico usuario={doctor} />);
  await screen.findByText('Diagnóstico anterior');
  fireEvent.change(screen.getByLabelText('Diagnóstico', { exact: true }), { target: { value: 'Corrección registrada' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrada clínica' }));
  await screen.findByText('No se pudo guardar');
  expect(screen.getByLabelText('Diagnóstico', { exact: true }).value).toBe('Corrección registrada');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrada clínica' }));
  await screen.findByText('Corrección registrada');
  expect(screen.getByText('Diagnóstico anterior')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /editar|eliminar/i })).toBeNull();
});

test('person changes clear sensitive drafts and ignore late record responses', async () => {
  const old = deferred();
  clinicalApi.obtenerPersonasClinicasAPI.mockResolvedValue([person, second]);
  clinicalApi.obtenerExpedienteAPI.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ persona: second, notas: [] });
  render(<ExpedienteClinico usuario={doctor} />);
  const select = await screen.findByRole('combobox', { name: 'Persona del expediente' });
  fireEvent.change(select, { target: { value: 'p2' } });
  await screen.findByRole('heading', { name: 'Bea Pérez' });
  await act(async () => old.resolve({ persona: person, notas: [{ id: 'old', diagnostico: 'Dato tardío de Ana' }] }));
  expect(screen.queryByText('Dato tardío de Ana')).toBeNull();
  fireEvent.change(screen.getByLabelText('Diagnóstico', { exact: true }), { target: { value: 'Borrador Bea' } });
  fireEvent.change(select, { target: { value: 'p1' } });
  await screen.findByRole('heading', { name: 'Ana Pérez' });
  expect(screen.getByLabelText('Diagnóstico', { exact: true }).value).toBe('');
});

test('late save results cannot append another person note and duplicate submits are blocked', async () => {
  const save = deferred();
  clinicalApi.obtenerPersonasClinicasAPI.mockResolvedValue([person, second]);
  clinicalApi.agregarNotaClinicaAPI.mockReturnValue(save.promise);
  await openRecord();
  fillNote();
  const button = screen.getByRole('button', { name: 'Guardar entrada clínica' });
  fireEvent.click(button); fireEvent.click(button);
  expect(clinicalApi.agregarNotaClinicaAPI).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByRole('combobox', { name: 'Persona del expediente' }), { target: { value: 'p2' } });
  await screen.findByRole('heading', { name: 'Bea Pérez' });
  await act(async () => save.resolve({ nota: { id: 'late', diagnostico: 'Nota tardía de Ana' } }));
  expect(screen.queryByText('Nota tardía de Ana')).toBeNull();
});

test('list errors are retryable and empty lists are informative', async () => {
  clinicalApi.obtenerPersonasClinicasAPI.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce([]);
  render(<ExpedienteClinico usuario={patient} />);
  expect(screen.getByRole('status').textContent).toContain('Cargando');
  await screen.findByText('Sin conexión');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Aún no hay personas con expediente disponible');
});

test('record fetch errors can retry without exposing the write form', async () => {
  clinicalApi.obtenerExpedienteAPI.mockRejectedValueOnce(new Error('Expediente no disponible')).mockResolvedValueOnce({ persona: person, notas: [] });
  render(<ExpedienteClinico usuario={doctor} />);
  await screen.findByText('Expediente no disponible');
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar expediente' }));
  await screen.findByRole('button', { name: 'Guardar entrada clínica' });
});

test('session changes erase loaded records and ignore an old subject list', async () => {
  const old = deferred();
  clinicalApi.obtenerPersonasClinicasAPI.mockReturnValueOnce(old.promise).mockResolvedValueOnce([]);
  const { rerender } = render(<ExpedienteClinico usuario={doctor} />);
  rerender(<ExpedienteClinico usuario={{ ...patient, access_token: 'other' }} />);
  await screen.findByText('Aún no hay personas con expediente disponible');
  await act(async () => old.resolve([person]));
  expect(clinicalApi.obtenerExpedienteAPI).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: person.nombre })).toBeNull();
});

test('selection of denied beneficiary unmounts the authorized record and clears its draft', async () => {
  clinicalApi.obtenerPersonasClinicasAPI.mockResolvedValue([person, { ...second, acceso_clinico: false }]);
  await openRecord();
  fillNote();
  fireEvent.change(screen.getByRole('combobox', { name: 'Persona del expediente' }), { target: { value: 'p2' } });
  await screen.findByText(/autorización explícita/);
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(clinicalApi.obtenerExpedienteAPI).toHaveBeenCalledTimes(1);
});

test('stored vital measurements retain labels while missing values remain unrecorded', async () => {
  clinicalApi.obtenerExpedienteAPI.mockResolvedValue({ persona: person, notas: [{ id: 'n1', signos_vitales: { presion_arterial: '120/80', temperatura_c: '36.5' } }] });
  render(<ExpedienteClinico usuario={patient} />);
  await screen.findByText('120/80');
  const history = screen.getByRole('region', { name: 'Entradas clínicas' });
  expect(within(history).getByText('Presión arterial (mmHg)')).toBeTruthy();
  expect(within(history).getByText('36.5')).toBeTruthy();
});

test('physician can update only date of birth, retains failed input, and uses returned demographics', async () => {
  clinicalApi.actualizarPersonaClinicaAPI.mockRejectedValueOnce(new Error('Fecha no guardada')).mockResolvedValueOnce({ persona: { ...person, fecha_nacimiento: '1991-06-18' } });
  await openRecord();
  const field = screen.getByLabelText('Fecha de nacimiento registrada');
  expect(field.value).toBe('1990-05-17');
  fireEvent.change(field, { target: { value: '1991-06-18' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar fecha de nacimiento' }));
  await screen.findByText('Fecha no guardada');
  expect(field.value).toBe('1991-06-18');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar fecha de nacimiento' }));
  await screen.findByText('Fecha de nacimiento guardada.');
  expect(clinicalApi.actualizarPersonaClinicaAPI).toHaveBeenLastCalledWith('test', 'p1', { fecha_nacimiento: '1991-06-18' });
  expect(screen.getByText(/18.*1991/)).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Ana Pérez' })).toBeTruthy();
  expect(clinicalApi.agregarNotaClinicaAPI).not.toHaveBeenCalled();
});

test('late demographic updates cannot change a different person and block duplicate saves', async () => {
  const save = deferred();
  clinicalApi.obtenerPersonasClinicasAPI.mockResolvedValue([person, second]);
  clinicalApi.actualizarPersonaClinicaAPI.mockReturnValue(save.promise);
  await openRecord();
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento registrada'), { target: { value: '1991-06-18' } });
  const button = screen.getByRole('button', { name: 'Guardar fecha de nacimiento' });
  fireEvent.click(button); fireEvent.click(button);
  expect(button.disabled).toBe(true);
  expect(clinicalApi.actualizarPersonaClinicaAPI).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole('combobox', { name: 'Persona del expediente' }), { target: { value: 'p2' } });
  await screen.findByRole('heading', { name: 'Bea Pérez' });
  await act(async () => save.resolve({ persona: { ...person, fecha_nacimiento: '1991-06-18' } }));
  expect(screen.getByLabelText('Fecha de nacimiento registrada').value).toBe('1990-05-17');
  expect(screen.queryByText('Fecha de nacimiento guardada.')).toBeNull();
});

test('clinical field bounds match backend and vitals alone do not create an incomplete note', async () => {
  await openRecord();
  const limits = { antecedentes: 8000, alergias: 4000, motivo: 2000, exploracion: 8000, diagnostico: 4000, tratamiento: 8000, seguimiento: 4000 };
  Object.entries(limits).forEach(([key, limit]) => expect(screen.getByLabelText(labels[key], { exact: true }).maxLength).toBe(limit));
  expect(screen.getByLabelText('Fecha de nacimiento registrada').min).toBe('1900-01-01');
  fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '70' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrada clínica' }));
  expect(screen.getByRole('alert').textContent).toContain('Registra al menos un dato clínico');
  expect(clinicalApi.agregarNotaClinicaAPI).not.toHaveBeenCalled();
});

test('pages through server history, retries a page error, and deduplicates appended notes', async () => {
  const previous = { id: 'n1', diagnostico: 'Diagnóstico inicial', creado_en: '2026-10-24T12:00:00Z' };
  const next = { id: 'n2', diagnostico: 'Diagnóstico siguiente', creado_en: '2026-10-25T12:00:00Z' };
  clinicalApi.obtenerExpedienteAPI.mockResolvedValueOnce({ persona: person, notas: [previous], paginacion: { limit: 1, offset: 0, total: 2, has_more: true } })
    .mockRejectedValueOnce(new Error('Página no disponible'))
    .mockResolvedValueOnce({ persona: person, notas: [previous, next], paginacion: { limit: 1, offset: 1, total: 2, has_more: false } });
  render(<ExpedienteClinico usuario={patient} />);
  await screen.findByText('Diagnóstico inicial');
  fireEvent.click(screen.getByRole('button', { name: 'Cargar más entradas' }));
  await screen.findByText('Página no disponible');
  expect(screen.getByText('Diagnóstico inicial')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cargar más entradas' }));
  await screen.findByText('Diagnóstico siguiente');
  expect(clinicalApi.obtenerExpedienteAPI).toHaveBeenLastCalledWith('test', 'p1', { limit: 1, offset: 1 });
  expect(screen.getAllByText('Diagnóstico inicial')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Cargar más entradas' })).toBeNull();
});

test('a late history page cannot reveal entries after selecting a denied beneficiary', async () => {
  const page = deferred();
  clinicalApi.obtenerPersonasClinicasAPI.mockResolvedValue([person, { ...second, acceso_clinico: false }]);
  clinicalApi.obtenerExpedienteAPI.mockResolvedValueOnce({ persona: person, notas: [], paginacion: { limit: 50, offset: 0, has_more: true } }).mockReturnValueOnce(page.promise);
  await openRecord();
  fireEvent.click(document.querySelector('summary'));
  fireEvent.click(screen.getByRole('button', { name: 'Cargar más entradas' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Persona del expediente' }), { target: { value: 'p2' } });
  await screen.findByText(/autorización explícita/);
  await act(async () => page.resolve({ persona: person, notas: [{ id: 'late', diagnostico: 'Página privada tardía' }], paginacion: { limit: 50, offset: 50, has_more: false } }));
  expect(screen.queryByText('Página privada tardía')).toBeNull();
});

test('optional appointment selection uses eligible server appointments with labeled dates and zones', async () => {
  clinicalApi.obtenerExpedienteAPI.mockResolvedValue({ persona: person, notas: [], citas: [
    { id: 42, fecha_hora: '2026-10-25T12:00:00Z', zona_horaria: 'America/Mexico_City', estado: 'confirmada' },
    { id: 43, fecha_hora: '2026-10-26T12:00:00Z', estado: 'reprogramada' },
    { id: 44, fecha_hora: '2026-10-24T12:00:00Z', estado: 'completada' },
    { id: 45, fecha_hora: '2026-10-24T12:00:00Z', estado: 'cancelada' },
  ] });
  await openRecord();
  const select = screen.getByRole('combobox', { name: 'Cita relacionada (opcional)' });
  expect(within(select).getByRole('option', { name: 'Ninguna' }).value).toBe('');
  expect(within(select).getByRole('option', { name: /#42.*America\/Mexico_City/ }).value).toBe('42');
  expect(within(select).getByRole('option', { name: /#43.*UTC/ })).toBeTruthy();
  expect(within(select).getByRole('option', { name: /#44/ })).toBeTruthy();
  expect(within(select).queryByRole('option', { name: /#45/ })).toBeNull();
});

test('missing eligible appointments gracefully permits an unlinked note', async () => {
  clinicalApi.obtenerExpedienteAPI.mockResolvedValue({ persona: person, notas: [] });
  await openRecord();
  expect(screen.queryByLabelText('Cita relacionada (opcional)')).toBeNull();
  expect(screen.getByText(/Puedes guardar la entrada sin vincular una cita/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Motivo de consulta', { exact: true }), { target: { value: 'Consulta sin vínculo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrada clínica' }));
  await waitFor(() => expect(clinicalApi.agregarNotaClinicaAPI).toHaveBeenCalledTimes(1));
  expect(clinicalApi.agregarNotaClinicaAPI.mock.calls[0][2].cita_id).toBeUndefined();
});

test('an oversized UTF-8 note is blocked locally without discarding its fields', async () => {
  await openRecord();
  ['Antecedentes', 'Exploración física', 'Tratamiento'].forEach((label) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value: 'á'.repeat(8000) } }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrada clínica' }));
  expect((await screen.findByRole('alert')).textContent).toContain('48 000 bytes');
  expect(clinicalApi.agregarNotaClinicaAPI).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Antecedentes', { exact: true }).value.length).toBe(8000);
});

test('pagination errors retain the physician draft and existing notes without browser persistence', async () => {
  const storage = jest.spyOn(Storage.prototype, 'setItem');
  try {
    clinicalApi.obtenerExpedienteAPI.mockResolvedValueOnce({ persona: person, notas: [{ id: 'n1', diagnostico: 'Dato existente' }], paginacion: { limit: 50, offset: 0, total: 51, has_more: true } }).mockRejectedValueOnce(new Error('No se pudo cargar la página'));
    render(<ExpedienteClinico usuario={doctor} />);
    await screen.findByText('Dato existente');
    fireEvent.click(document.querySelector('summary'));
    fireEvent.change(screen.getByLabelText('Diagnóstico', { exact: true }), { target: { value: 'Borrador privado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más entradas' }));
    await screen.findByText('No se pudo cargar la página');
    expect(screen.getByLabelText('Diagnóstico', { exact: true }).value).toBe('Borrador privado');
    expect(screen.getByText('Dato existente')).toBeTruthy();
    expect(clinicalApi.agregarNotaClinicaAPI).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  } finally { storage.mockRestore(); }
});

test.each([['medico', false], ['paciente', true]])('history is a native disclosure with the correct default for %s', async (rol, expanded) => {
  clinicalApi.obtenerExpedienteAPI.mockResolvedValue({ persona: person, notas: [{ id: 'n1', diagnostico: 'Nota accesible' }], paginacion: { limit: 50, offset: 0, total: 51, has_more: true } });
  render(<ExpedienteClinico usuario={{ ...patient, rol }} />);
  await screen.findByRole('heading', { name: person.nombre });
  const disclosure = document.querySelector('details');
  expect(disclosure).not.toBeNull();
  expect(disclosure.open).toBe(expanded);
  expect(disclosure.querySelector('summary').textContent).toBe('Entradas clínicas (51)');
  if (!expanded) {
    expect(screen.getByRole('button', { name: 'Cargar más entradas' })).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Guardar entrada clínica' })).toBeTruthy();
    fireEvent.click(disclosure.querySelector('summary'));
  }
  expect(screen.getByRole('article', { name: 'Entrada clínica 1' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cargar más entradas' })).toBeVisible();
});
