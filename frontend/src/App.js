// src/App.jsx
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Servicios from './pages/Servicios';
import HistorialClinico from './pages/HistorialClinico';
import ChatBot from './components/ChatBot';
import './index.css'; // Importa el archivo CSS global


export default function App() {
  const [vistaActual, setVistaActual] = useState('servicios');
  const [usuario, setUsuario] = useState({ nombre: 'Giselle Guzmán', rol: 'paciente' });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Menu Lateral */}
      <Sidebar vistaActual={vistaActual} setVistaActual={setVistaActual} usuario={usuario} />

      {/* Contenido Principal según la pestaña seleccionada */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {vistaActual === 'servicios' && <Servicios esMedico={usuario.rol === 'medico'} />}
        {vistaActual === 'historial' && <HistorialClinico />}
      </main>

      {/* Asistente Flotante con IA */}
      <ChatBot usuarioId={1} />
    </div>
  );
}