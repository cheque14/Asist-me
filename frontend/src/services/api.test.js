import { enviarMensajeChat, resolverPropuestaCitaAPI } from './api';

afterEach(() => jest.restoreAllMocks());
test('chat sends authenticated identity only via bearer token', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ respuesta: 'Hola' }) });
  await enviarMensajeChat('session', 'Hola');
  const options = fetch.mock.calls[0][1];
  expect(options.headers.Authorization).toBe('Bearer session');
  expect(JSON.parse(options.body)).toEqual({ mensaje: 'Hola' });
});
test('counteroffers preserve local wall time and legacy ISO clients remain supported', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  await resolverPropuestaCitaAPI('session', 1, 'contraofertar', { fecha_local: '2099-10-30', hora_local: '15:00' });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ accion: 'contraofertar', fecha_local: '2099-10-30', hora_local: '15:00' });
  await resolverPropuestaCitaAPI('session', 1, 'contraofertar', '2099-10-30T21:00:00Z');
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ accion: 'contraofertar', fecha_hora: '2099-10-30T21:00:00Z' });
});
