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

<<<<<<< HEAD
**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
=======
# Asist-me
>>>>>>> 9706ab37d78df8ede56e5f4cfe41a8616d1e50b8



=======
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
>>>>>>> c6dd6792751e94d2be15e99bba15150ea6300a1b
