import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./pages/LandingPage', () => function Landing({ alIrALogin, alIrARegistro }) {
  return <><h1>Página pública</h1><button onClick={alIrALogin}>Entrar</button><button onClick={alIrARegistro}>Crear cuenta</button></>;
});
jest.mock('./pages/login', () => function Login({ alVolverALanding, irARegistroRol, alIniciarSesionExitoso }) {
  return <><h1>Acceso</h1><button onClick={alVolverALanding}>Volver al inicio</button><button onClick={irARegistroRol}>Registrarse</button><button onClick={() => alIniciarSesionExitoso({ id: 1, rol: 'medico' }, 'test-token')}>Acceder en prueba</button></>;
});
jest.mock('./components/Sidebar', () => function Sidebar({ onCerrarSesion }) { return <button onClick={onCerrarSesion}>Cerrar sesión</button>; });
jest.mock('./pages/MedicoMain', () => function Dashboard() { return <h1>Panel médico de prueba</h1>; });
jest.mock('./components/ChatBot', () => function Chat() { return null; });
jest.mock('./pages/registerRol', () => function Register({ alVolver }) {
  return <><h1>Registro</h1><button onClick={alVolver}>Volver al acceso</button></>;
});

test('starts on the landing and connects login, home, and registration', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Página pública' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(screen.getByRole('heading', { name: 'Acceso' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
  expect(screen.getByRole('heading', { name: 'Página pública' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  expect(screen.getByRole('heading', { name: 'Registro' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Volver al acceso' }));
  fireEvent.click(screen.getByRole('button', { name: 'Registrarse' }));
  expect(screen.getByRole('heading', { name: 'Registro' })).toBeTruthy();
  expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).toBeNull();
});

test('logout clears the account and returns directly to the landing', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Acceder en prueba' }));
  expect(screen.getByRole('heading', { name: 'Panel médico de prueba' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  expect(screen.getByRole('heading', { name: 'Página pública' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Panel médico de prueba' })).toBeNull();
});
