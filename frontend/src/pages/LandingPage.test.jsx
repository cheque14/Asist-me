import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LandingPage from './LandingPage';

test('routes access separately from signup and links the walkthrough', () => {
  const login = jest.fn();
  const signup = jest.fn();
  render(<LandingPage alIrALogin={login} alIrARegistro={signup} />);
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  expect(login).toHaveBeenCalledTimes(1);
  expect(signup).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Comenzar ahora' }));
  expect(signup).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: 'Ver cómo funciona' }).getAttribute('href')).toBe('#como-funciona');
});

test('switches the walkthrough to the patient experience', () => {
  render(<LandingPage alIrALogin={() => {}} alIrARegistro={() => {}} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Para pacientes' }));
  expect(screen.getByRole('heading', { name: 'Elige tu médico' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Para pacientes' }).getAttribute('aria-selected')).toBe('true');
});
