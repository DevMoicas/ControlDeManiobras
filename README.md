# Desarrollo del entorno tecnológico para FRABA CONTAINER

Este repositorio reúne el trabajo del proyecto **Desarrollo del entorno tecnológico para FRABA CONTAINER** en tres ramas principales. La intención de este README es dar contexto general sobre qué parte del sistema se está construyendo en cada rama y qué tecnologías se están usando, sin entrar todavía en el funcionamiento detallado.

## Contexto general

El proyecto está organizado para separar el desarrollo por capas:

- una rama enfocada en la interfaz de usuario,
- una rama enfocada en el backend y la API,
- y una rama principal con archivos base y datos de apoyo.

## Ramas del repositorio

### `main`

Rama base del repositorio. Aquí se concentran archivos de soporte y datos iniciales del proyecto, como:

- archivos `.sql` para inserción de datos,
- archivos `.csv` como fuente de información,
- y el esquema de base de datos.

**Tecnologías y formatos usados:**

- SQL
- CSV
- modelado de base de datos relacional

### `feature/inicio-botones`

Rama enfocada en el frontend del sistema. Aquí se trabaja la interfaz visual y la navegación de la aplicación.

**Tecnologías usadas:**

- React
- JavaScript
- React Router DOM
- Tailwind CSS
- CSS
- Lucide React

### `backend/api`

Rama enfocada en la API y la lógica del servidor. Aquí se trabaja la exposición de datos y la conexión con la base de datos.

**Tecnologías usadas:**

- Python
- Django
- Django REST Framework
- PostgreSQL
- python-dotenv
- django-cors-headers

## Objetivo del repositorio

El objetivo general es construir una solución para control de maniobras separando responsabilidades entre:

- presentación visual,
- servicio de datos,
- y preparación de información para la base de datos.

## Instalación y ejecución por rama

Las instrucciones siguientes sirven como guía general. Cada rama puede tener archivos distintos, así que primero cambia a la rama correspondiente y luego revisa sus dependencias.

### `main`

Esta rama contiene archivos base y datos de apoyo, por lo que no se ejecuta como una aplicación.

Uso general:

- revisar los archivos `.sql` y `.csv`,
- consultar el esquema de base de datos,
- y tomar estos archivos como material de carga inicial.

### `feature/inicio-botones`

Esta rama corresponde al frontend.

Pasos generales de ejecución:

1. Instalar Node.js.
2. Cambiar a la rama `feature/inicio-botones`.
3. Instalar dependencias del proyecto frontend.
4. Ejecutar la aplicación en modo desarrollo.

### `backend/api`

Esta rama corresponde al backend y la API.

Pasos generales de ejecución:

1. Instalar Python.
2. Cambiar a la rama `backend/api`.
3. Crear y activar un entorno virtual.
4. Instalar las dependencias del backend.
5. Ejecutar las migraciones o el arranque del servidor según corresponda.

## Nota

Este README sigue siendo una introducción general al proyecto. Más adelante se puede ampliar con:

- estructura de carpetas,
- comandos exactos por rama,
- variables de entorno,
- descripción de módulos o endpoints.