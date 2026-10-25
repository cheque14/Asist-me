// src/App.jsx
import React, { useState } from 'react';
import Login from './pages/login';
import RegisterRol from './pages/registerRol';
import Sidebar from './components/Sidebar';
import PacienteMain from './pages/PacienteMain';
import MedicoMain from './pages/MedicoMain';
import Servicios from './pages/Servicios';
import HistorialClinico from './pages/HistorialClinico';
import ExpedienteClinico from './pages/ExpedienteClinico';
import ChatBot from './components/ChatBot';
import HorariosMedico from './pages/HorariosMedico';
import CalendarioCitas from './pages/CalendarioCitas';
import Notificaciones from './pages/Notificaciones';
import PerfilUsuario from './pages/PerfilUsuario';
import LandingPage from './pages/LandingPage';

export default function App() {
  const [usuario, setUsuario] = useState(null); // Estado del usuario autenticado
  const [pantallaAuth, setPantallaAuth] = useState('landing');
  const [vistaActual, setVistaActual] = useState('panel'); // 'panel', 'servicios', 'historial', 'citas', 'horarios'
  const [abrirAgendar, setAbrirAgendar] = useState(false);

  // Manejo de Inicio de Sesión o Registro exitoso
  const handleAuthExitoso = (datosUsuario, accessToken) => {
    setUsuario({ ...datosUsuario, access_token: accessToken });
    setVistaActual('panel');
  };

  // Cerrar sesión
  const handleCerrarSesion = () => {
    setUsuario(null);
    setPantallaAuth('landing');
    setVistaActual('panel');
    setAbrirAgendar(false);
  };

  // 1. Si no hay usuario autenticado, renderizar vistas de autenticación
  if (!usuario) {
    if (pantallaAuth === 'landing') {
      return (
        <LandingPage
          alIrALogin={() => setPantallaAuth('login')}
          alIrARegistro={() => setPantallaAuth('registro')}
        />
      );
    }
    return pantallaAuth === 'login' ? (
      <Login
        alIniciarSesionExitoso={handleAuthExitoso}
        irARegistroRol={() => setPantallaAuth('registro')}
        alVolverALanding={() => setPantallaAuth('landing')}
      />
    ) : (
      <RegisterRol
        alRegistroExitoso={handleAuthExitoso}
        alVolver={() => setPantallaAuth('login')}
      />
    );
  }

  const esMedico = usuario.rol === 'medico';

  // 2. Si el usuario está autenticado, renderizar el Layout con el Sidebar y el Bento Dashboard
  return (
    <div className="app-shell">
      <Sidebar
        vistaActual={vistaActual}
        setVistaActual={setVistaActual}
        usuario={usuario}
        onCerrarSesion={handleCerrarSesion}
      />

      <main className="app-main">
        {/* Renderizado dinámico de secciones con props completas */}
        {vistaActual === 'panel' && (
          esMedico ? (
            <MedicoMain usuario={usuario} setVistaActual={setVistaActual} />
          ) : (
            <PacienteMain
              usuario={usuario}
              setVistaActual={setVistaActual}
              abrirAgendar={abrirAgendar}
              onAgendarAbierto={() => setAbrirAgendar(false)}
            />
          )
        )}
        {vistaActual === 'servicios' && <Servicios esMedico={esMedico} usuario={usuario} />}
        {vistaActual === 'historial' && <HistorialClinico usuario={usuario} />}
        {vistaActual === 'expediente' && <ExpedienteClinico usuario={usuario} />}
        {vistaActual === 'citas' && (
          <CalendarioCitas
            usuario={usuario}
            setVistaActual={setVistaActual}
            onNuevaCita={() => {
              if (esMedico) {
                setVistaActual('horarios');
              } else {
                setAbrirAgendar(true);
                setVistaActual('panel');
              }
            }}
          />
        )}
        {vistaActual === 'notificaciones' && <Notificaciones usuario={usuario} setVistaActual={setVistaActual} />}
        {vistaActual === 'perfil' && <PerfilUsuario usuario={usuario} onProfileUpdated={(updated) => setUsuario((current) => ({ ...current, ...updated }))} onCerrarSesion={handleCerrarSesion} />}
        {vistaActual === 'horarios' && esMedico && <HorariosMedico usuario={usuario} />}
      </main>

      {/* Asistente Flotante con IA (disponible en cualquier vista) */}
      <ChatBot accessToken={usuario.access_token} />
    </div>
  );
}
