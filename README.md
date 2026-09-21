# 🩺 Asist-me - Sistema de Gestión Médica & Asistencia IA

**Asist-me** es una plataforma web full-stack diseñada para la gestión clínica moderna. Facilita la interacción entre **pacientes** y **médicos especialistas**, permitiendo la administración de servicios, agenda de citas, visualización de historiales clínicos y asistencia médica inteligente impulsada por IA.

---

## 🚀 Características Principales

### 👤 Panel de Pacientes
* **Exploración de Servicios:** Catálogo visual e interactivo de servicios y especialidades disponibles.
* **Gestión de Citas:** Calendario integrado para consultar horarios y dar seguimiento a citas agendadas o aceptadas.
* **Historial Clínico:** Registro cronológico (*Timeline*) de atenciones médicas y diagnósticos.
* **Asistente Inteligente (MediBot):** Chatbot flotante interactivo para resolver dudas y apoyar en el proceso de atención.

### 🩺 Panel de Médicos
* **Métricas en Tiempo Real:** Dashboard con contadores de expedientes, citas del día y recetas emitidas.
* **Administración de Servicios:** Creación, edición y actualización de servicios médicos con precios y especialidades.
* **Gestión de Expedientes:** Creación de registros clínicos y seguimiento a historias médicas de pacientes.

### 🎨 Diseño y UI/UX
* **Interfaz Flotante (Soft Elevation):** Componentes con relieve tridimensional, sombras multinivel y efectos interactivos (*hover*).
* **Navegación Compacta:** Sidebar lateral oscuro con tipografía optimizada (**Inter**).
* **Diseño Responsivo:** Adaptado para diferentes resoluciones de pantalla.

---

## 🛠️ Tecnologías Utilizadas

### Frontend
* **React.js** (Create React App / SPA)
* **CSS3** (Estilos modulares, Flexbox, CSS Grid, fuentes de Google Fonts: *Inter*)
* **JavaScript (ES6+)**

### Backend
* **Python**
* **Flask** (REST API)
* **Flask-CORS** (Manejo de peticiones entre dominios)

### Base de Datos & IA
* **Supabase** (PostgreSQL + Row Level Security - RLS)
* **pgvector** (Búsqueda vectorial para RAG / MediBot)

---

## 📁 Estructura del Proyecto

```text
Asist-me/
├── backend/
│   ├── app.py              # Servidor principal de Flask
│   └── requirements.txt    # Dependencias de Python
└── frontend/
    ├── public/
    │   └── index.html      # Punto de entrada HTML y fuentes
    └── src/
        ├── components/     # Componentes reutilizables de React
        │   ├── ChatBot.jsx      # Componente flotante de MediBot
        │   ├── CitaCard.jsx     # Tarjetas de citas con relieve
        │   └── Sidebar.jsx      # Navegación lateral
        ├── pages/          # Vistas principales por rol
        │   ├── login.jsx            # Inicio de sesión
        │   ├── registerRol.jsx      # Selección de rol (Paciente/Médico)
        │   ├── PacienteMain.jsx     # Dashboard de paciente y calendario
        │   ├── MedicoMain.jsx       # Dashboard médico y métricas
        │   ├── Servicios.jsx        # Catálogo/Tabla de servicios
        │   └── HistorialClinico.jsx # Expediente y línea de tiempo
        ├── services/
        │   └── api.js      # Cliente HTTP (Fetch) para conectar con Flask
        ├── App.jsx         # Enrutador principal y estados globales
        ├── index.css       # Estilos globales y clases flotantes
        └── index.js        # Punto de entrada de React
