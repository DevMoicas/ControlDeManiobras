# Desarrollo del entorno tecnológico para FRABA CONTAINER

Este repositorio reúne el trabajo del proyecto **Desarrollo del entorno tecnológico para FRABA CONTAINER**, organizado en tres ramas principales. El objetivo de este README es proporcionar una descripción detallada del proyecto, las herramientas utilizadas durante el desarrollo y el objetivo principal del sistema.

---

##  Descripción del Proyecto

###  Descripción general del sistema

FRABA CONTAINER es un sistema web diseñado para automatizar y gestionar el control de operaciones logísticas de contenedores. La plataforma centraliza el registro de maniobras, gastos en efectivo, números económicos y contenedores vacíos, reemplazando procesos manuales basados en hojas de cálculo por una solución digital estructurada, accesible y segura.

El sistema está dividido en tres capas de desarrollo:

* **Frontend (Interfaz de usuario):** Aplicación React que permite la navegación, captura y visualización de datos.
* **Backend (API y lógica del servidor):** Servicio Django REST que expone los datos y gestiona la lógica de negocio.
* **Base de datos (Main):** Esquema relacional en PostgreSQL con archivos SQL y CSV de carga inicial.

---

###  Objetivo principal del software

Proveer una herramienta digital integral que permita registrar, consultar y administrar de forma eficiente las operaciones de FRABA CONTAINER, reduciendo errores humanos, mejorando la trazabilidad de la información y estableciendo control de acceso diferenciado entre usuarios.

---

###  Funcionalidades principales

* Registro y gestión de maniobras de contenedores
* Control de gastos en efectivo
* Administración de contenedores vacíos
* Gestión de números económicos (No. ECO)
* Panel de administración con rutas protegidas por rol
* Autenticación con control de acceso basado en permisos
* Navegación con botón de regreso al inicio
* Footer institucional en todas las pantallas

---

##  Tecnologías Utilizadas

###  Frontend

| Tecnología              | Descripción                |
| ----------------------- | -------------------------- |
| React 19.2.4            | Biblioteca principal de UI |
| JavaScript              | Lenguaje del frontend      |
| React Router DOM 7.13.2 | Manejo de rutas            |
| Tailwind CSS 3.4.19     | Framework de estilos       |
| CSS                     | Estilos personalizados     |
| Lucide React 1.8.0      | Íconos                     |
| Axios 1.16.0            | Cliente HTTP               |
| Chart.js 4.5.1          | Gráficas                   |
| React Chart.js 2 5.3.1  | Integración con React      |
| Recharts 3.8.1          | Gráficas alternativas      |
| React Datepicker 9.1.0  | Selección de fechas        |
| PostCSS 8.5.9           | Procesador CSS             |
| Autoprefixer 10.4.27    | Compatibilidad CSS         |

---

###  Backend

| Tecnología                   | Descripción          |
| ---------------------------- | -------------------- |
| Python                       | Lenguaje backend     |
| Django 6.0.3                 | Framework principal  |
| Django REST Framework 3.17.1 | API REST             |
| simplejwt 5.5.1              | Autenticación JWT    |
| django-cors-headers 4.9.0    | Manejo CORS          |
| django-filter 25.2           | Filtrado             |
| Flask 3.1.2                  | Servicios auxiliares |
| flask-cors 6.0.1             | CORS en Flask        |
| openai 2.7.2                 | Integración IA       |
| psycopg2-binary 2.9.12       | Conector PostgreSQL  |
| python-dotenv 1.2.2          | Variables de entorno |
| PyJWT 2.12.1                 | Tokens               |
| httpx 0.28.1                 | Cliente HTTP         |
| pydantic 2.12.4              | Validación           |

---

###  Base de Datos

| Tecnología | Descripción              |
| ---------- | ------------------------ |
| PostgreSQL | Base de datos relacional |
| SQL        | Definición de datos      |
| CSV        | Carga inicial            |

---

##  Ejecución del Proyecto

###  Rama `main`

Contiene archivos de soporte:

* Archivos `.sql` (estructura y datos)
* Archivos `.csv` (datos iniciales)

---

###  Rama `feature/inicio-botones` (Frontend)

**Requisitos:** Node.js

```bash
# Cambiar de rama
git checkout feature/inicio-botones

# Instalar dependencias
npm install

# Ejecutar
npm start
```
**Configuración del entorno:**

Crear un archivo .env en la raíz del proyecto frontend con la URL base de la API:

**.env:**

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

---

###  Rama `backend/api` (Backend)

**Requisitos:** Python 3.10+

```bash
# Cambiar de rama
git checkout backend/api

# Crear entorno virtual
python -m venv venv

# Activar entorno
source venv/bin/activate     # Linux/macOS
venv\Scripts\activate        # Windows

# Instalar dependencias
pip install -r requirements.txt
```
**Configurar variables de entorno:**

Crear un archivo .env en la raíz con el siguiente contenido:

**.env:**

```env
SECRET_KEY=tu_clave_secreta
DEBUG=True
DB_NAME=nombre_base_de_datos
DB_USER=usuario
DB_PASSWORD=contraseña
DB_HOST=localhost
DB_PORT=5432
```
**Aplicar migraciones**
```bash
# Migraciones
python manage.py migrate

# Ejecutar servidor
python manage.py runserver
```

---

##  Seguridad Implementada

###  Hashing de contraseñas

Uso de PBKDF2 con SHA-256 (Django), evitando almacenamiento en texto plano.

###  Validación de datos

* Validación en frontend
* Validación en backend (serializers)
* Protección contra SQL Injection mediante ORM

###  Control de acceso

* Roles: usuario / administrador
* Rutas protegidas (`ProtectedRoute`)
* Validación de permisos en backend

---

##  Créditos del Proyecto

Proyecto realizado por estudiantes de la **Facultad de Telemática de la Universidad de Colima**.

### Backend

* Ernesto Rosendo Licea
* Javier Alejandro Gónzalez Peredia

### Frontend

* Daniel Ramírez Chávez
* Ramón de Jesús Peregrino Larios

### Tester y Desarrollo General

* Luis Enrique Hernandez Valdivia

### Scrum Master

* Moises Alejandro Grimaldo Garcia


Este README sigue siendo una introducción general al proyecto. Más adelante se puede ampliar con:

- estructura de carpetas,
- comandos exactos por rama,
- variables de entorno,
- descripción de módulos o endpoints.
