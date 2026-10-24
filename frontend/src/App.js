// src/App.jsx
import React, { useState } from 'react';
import Login from './pages/login';
import RegisterRol from './pages/registerRol';
import Sidebar from './components/Sidebar';
import PacienteMain from './pages/PacienteMain';
import MedicoMain from './pages/MedicoMain';
import Servicios from './pages/Servicios';
import HistorialClinico from './pages/HistorialClinico';
import ChatBot from './components/ChatBot';
import HorariosMedico from './pages/HorariosMedico';

export default function App() {
  const [usuario, setUsuario] = useState(null); // Estado del usuario autenticado
  const [pantallaAuth, setPantallaAuth] = useState('login'); // 'login' o 'registro'
  const [vistaActual, setVistaActual] = useState('panel'); // 'panel', 'servicios', 'historial', 'citas'

  // Manejo de Inicio de Sesión o Registro exitoso
  const handleAuthExitoso = (datosUsuario, accessToken) => {
    setUsuario({ ...datosUsuario, access_token: accessToken });
    setVistaActual('panel');
  };

  // Cerrar sesión
  const handleCerrarSesion = () => {
    setUsuario(null);
    setPantallaAuth('login');
  };

  // 1. Si no hay usuario autenticado, renderizar vistas de autenticación
  if (!usuario) {
    return pantallaAuth === 'login' ? (
      <Login
        alIniciarSesionExitoso={handleAuthExitoso}
        irARegistroRol={() => setPantallaAuth('registro')}
      />
    ) : (
      <RegisterRol
        alRegistroExitoso={handleAuthExitoso}
        alVolver={() => setPantallaAuth('login')}
      />
    );
  }

  const esMedico = usuario.rol === 'medico';

  // 2. Si el usuario está autenticado, renderizar el Layout con el Sidebar
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <Sidebar
        vistaActual={vistaActual}
        setVistaActual={setVistaActual}
        usuario={usuario}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Renderizado dinámico de secciones */}
        {vistaActual === 'panel' && (esMedico ? <MedicoMain /> : <PacienteMain />)}
        {vistaActual === 'servicios' && <Servicios esMedico={esMedico} />}
        {vistaActual === 'historial' && <HistorialClinico />}
        {vistaActual === 'citas' && <PacienteMain />}
        {vistaActual === 'horarios' && esMedico && <HorariosMedico usuario={usuario} />}
      </main>

      {/* Asistente Flotante con IA */}
      <ChatBot usuarioId={usuario.id} />
    </div>
  );
}