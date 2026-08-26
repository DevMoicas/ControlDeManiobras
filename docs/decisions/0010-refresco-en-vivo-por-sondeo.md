# ADR-0010: El refresco en vivo se hace por sondeo, no con WebSockets

## Estado

Aceptada

## Fecha

2026-08-26

## Contexto

Tres o cuatro personas trabajan a la vez con el sistema abierto. El navegador pedía los
datos **una sola vez, al montar la pantalla**, y no volvía a preguntar: mientras nadie
pulsara F5 o cambiara de página, cada quien miraba la foto del momento en que abrió.

Se pidió el comportamiento de Google Docs/Sheets: que los cambios de otra persona
aparezcan solos, sin recargar.

La infraestructura condiciona la respuesta más que la teoría:

- **App Service B1**, un core, con **gunicorn WSGI** en `gthread`: 3 workers × 4 hilos
  = **12 peticiones concurrentes** para toda la API, incluida la Carta Porte que tarda
  ~9 s en generarse.
- **La factura real de Azure en agosto de 2026 fue de $16.55**, no los $45–60 que
  presupuestaba el plan de despliegue. Se midió sobre el export de costes diario.

Ese segundo dato es el que da la vuelta al análisis, y hay un detalle que lo prueba:
del 1 al 19 de agosto el gasto diario fue **idéntico hasta el octavo decimal**
($0.462492), fines de semana incluidos. Eso es la firma de un coste que se paga *por
tiempo encendido*, no por uso. **Triplicar el número de usuarios no mueve la factura.**

## Decisión

Sondeo desde el navegador cada **3 segundos**, preguntando primero *"¿ha cambiado
algo?"* y pidiendo datos solo cuando la respuesta se mueve.

El reloj son **dos números** (`CambiosMixin`, `GET <recurso>/cambios/`):

- `t` — la última modificación (`MAX(updated_at)`)
- `n` — cuántas filas hay (`COUNT`)

Dos y no uno **porque borrar no mueve la fecha máxima**: la fila que se va no baja el
máximo de las que quedan, así que con solo la marca de tiempo el navegador creería que
no ha pasado nada y seguiría enseñando la fila borrada indefinidamente. El contador es
lo que cierra ese hueco.

Cuando el reloj cambia, se piden **solo las filas tocadas** (`?modificado_desde=`) y se
fusionan por `id` sobre lo que ya hay en pantalla.

## Alternativas descartadas

### WebSockets con Django Channels

La respuesta técnicamente correcta y la que menos encaja con lo que hay. Exige pasar el
arranque de WSGI a ASGI —con la conversión LibreOffice de 9 s conviviendo en el mismo
proceso— y **Redis obligatorio**: con tres workers, la capa de memoria no vale, porque
un cambio que entra por el worker 1 no llegaría a quien esté conectado al worker 3.

Redis cuesta ~$16.50/mes: **más que todo el sistema junto**. No es encarecer la factura
un tercio, es **duplicarla**. A cambio se ganan 3 segundos de latencia con seis
personas conectadas. Azure Web PubSub tiene plan gratuito, pero con techo de 20
conexiones y 20.000 mensajes al día, y ya hay ~20 usuarios dados de alta.

### SSE (Server-Sent Events)

Parece la opción sencilla —`EventSource` es nativo del navegador— y es la que puede
**tirar el sistema**. Cada conexión abierta ocupa **un hilo de gunicorn de forma
permanente**: cuatro personas dejan ocho hilos para todo lo demás, y a las doce no
queda ninguno y la aplicación se bloquea *para todos*. Es el mismo agotamiento de
workers que ya mordió en la fase 3.1.5 y por el que se descartó el *tarpit*.

### Bajar el intervalo hasta que duela

Se midió, y no duele: con seis personas, un tick cada 3 s son 57.600 peticiones al día,
**2.2 MB** de tráfico y 2 peticiones/segundo sobre los doce hilos. Por eso el intervalo
elegido es 3 s y no 10: el coste de acercarse al tiempo real era cero.

## Consecuencias

- **Coste añadido: $0/mes**, y sigue siendo $0 con el triple de uso. Incluso recargando
  la lista entera cada vez, 6 personas generan 22.8 GB/mes, por debajo de los 100 GB de
  salida que Azure no cobra.
- **El sondeo tiene cupo propio** (`SondeoThrottle`, 120/minuto). A 3 s son 20
  peticiones/minuto por pantalla abierta: compartiendo el cupo general de 200, dos
  pestañas se comen el 20% sin hacer nada y un rato de trabajo intenso acabaría en un
  429, que en pantalla se ve como un error sin explicación.
- **No pisa a quien está escribiendo.** El estado de edición vive dentro de
  `CeldaEditable` a propósito (si viviera en la página, cada tecla repintaría todas las
  filas), así que no se puede consultar desde fuera. Se mira el **foco del navegador**,
  que además cubre más casos: la celda abierta, la fila nueva a medio llenar, los
  modales y los catorce selectores.
- **La fila que cambia da un destello de un segundo.** Sin él, el riesgo no es el
  parpadeo sino lo contrario: que los cambios se cuelen sin que nadie los vea.
- **Renombrar un folio tuvo que arreglarse**: escribía en `maniobras` con un `update()`
  masivo, donde `auto_now` no corre, así que ese cambio habría sido invisible para el
  reloj y las demás pantallas seguirían mostrando el código viejo hasta un F5.
- **Sin índice en `updated_at`, a propósito y medido.** El `COUNT` obliga a recorrer la
  tabla, así que Postgres ignora el índice y hace `Seq Scan` igual: 0.147 ms con él
  contra 0.189 ms sin él. Con 414 maniobras creciendo a 87 al año, el umbral queda a
  décadas vista — y cuando llegue, la salida no será indexar sino quitar el `COUNT`.
- **Esto no es edición colaborativa.** Dos personas en la misma celda siguen pisándose:
  gana el último que guarda. Eso es CRDT y no estaba sobre la mesa; los WebSockets
  tampoco lo habrían resuelto.
- **La reversión a WebSockets está acotada a un solo archivo**: `useAutoRefresco.js`.
  Sustituir su temporizador por un socket que llame a `onCambio` deja intacto todo lo
  demás. La nota está escrita dentro del archivo.

## Referencias

- `api/views.py`: `CambiosMixin`, aplicado a `ManiobraViewSet` y `VacioViewSet`.
- `api/throttling.py`: `SondeoThrottle`.
- `src/hooks/useAutoRefresco.js`: la pieza intercambiable, con el coste medido dentro.
- `src/hooks/useVacios.js` y `useManiobras.js`: la fusión por id.
- `api/test_refresco_automatico.py`: 13 pruebas, incluida la que fija por qué el reloj
  lleva dos números.
- Commits `0a011368` (backend) y `95dc8c1` (frontend).
