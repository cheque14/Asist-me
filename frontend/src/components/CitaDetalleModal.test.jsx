import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CitaDetalleModal from './CitaDetalleModal';

const appointment = { id: 31, estado: 'confirmada', medico_nombre: 'Médico', fecha_hora: '2099-10-30T21:00:00Z', zona_horaria: 'America/Mexico_City' };
const props = { cita: appointment, rol: 'medico', onClose: jest.fn(), formatearFecha: () => 'Fecha', formatearHora: () => 'Hora' };

test('proposal sends raw clinic-local fields and includes completed state', async () => {
  const propose = jest.fn().mockResolvedValue({});
  render(<CitaDetalleModal {...props} onProposeChange={propose} onUpdateStatus={jest.fn()} />);
  expect(screen.getByRole('option', { name: 'Completada' })).toBeTruthy();
  expect(screen.getByText(/America\/Mexico_City/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Fecha propuesta'), { target: { value: '2099-10-31' } });
  fireEvent.change(screen.getByLabelText('Hora propuesta'), { target: { value: '15:00' } });
  fireEvent.submit(screen.getByLabelText('Hora propuesta').closest('form'));
  await waitFor(() => expect(propose).toHaveBeenCalledWith(31, { fecha_local: '2099-10-31', hora_local: '15:00' }));
});

test('dialog focuses inside, traps Tab, closes with Escape and returns focus', () => {
  const close = jest.fn();
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();
  const view = render(<CitaDetalleModal {...props} onClose={close} onCancel={jest.fn()} />);
  const first = screen.getByRole('button', { name: 'Cerrar detalle' });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar cita' }));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(close).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(document.activeElement).toBe(opener);
  opener.remove();
});
