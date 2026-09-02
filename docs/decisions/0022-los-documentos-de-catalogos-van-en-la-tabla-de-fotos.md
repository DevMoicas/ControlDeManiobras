# ADR-0022: los documentos de Catálogos van en la tabla de fotos, sin recomprimir

## Estado

Aceptada

## Fecha

2026-09-02

## Contexto

Tractos y Remolques necesitaban guardar comprobantes: **Tarjeta de Circulación, Permisos
Full, Físico Mecánica y Humo** (los dos últimos también en remolques), cada uno con su
fecha de vencimiento salvo la tarjeta, y todos con aviso de vencimiento próximo.

El proyecto ya guardaba archivos: `api_fotoregistro`, bytes con su mime colgados de
`(tipo, registro_id)`, para las fotos de maniobras y vacíos. Pero esas fotos **el
navegador las recomprime a JPEG hasta caber en 2 MB**, que es exactamente lo contrario de
lo que necesita un comprobante.

## Decisión

**La fecha en su tabla, el archivo en `api_fotoregistro`** con seis tipos nuevos
(`tracto_tarjeta`, `tracto_full`, `tracto_fisico`, `tracto_humo`, `remolque_full`,
`remolque_fisico`). Migración **0065**: cinco columnas `date` nullable y un `AlterField`
de `choices` que no toca la base.

Los documentos **no comparten reglas con las fotos de trabajo**, aunque compartan tabla:

- Entran **tal cual**, sin recompresión, y admiten **PDF**, hasta **10 MB** (las fotos
  siguen en 2 MB y solo imagen).
- El PDF se reconoce por su **firma** (`%PDF-`) y no por el `content_type`, que lo fija el
  cliente — el mismo criterio que ya se aplicaba a las imágenes con Pillow.
- Al revés también se cierra: un PDF sigue siendo un 400 como foto de maniobra, donde la
  pantalla pinta un `<img>`.
- **Permisos Full usa los dos huecos** que la tabla ya tenía (el permiso suele venir en dos
  hojas); el resto solo el primero, y pedir el hueco 2 en esos es un 400.

**Cada aviso nuevo se adelanta lo que le sirve a quien renueva ese trámite**, y los plazos
anteriores no se tocaron:

| Vencimiento | Avisa |
|---|---|
| Permisos Full (tracto y remolque) | 1 mes antes, como la licencia |
| Físico Mecánica y Humo | el día que vencen, y siguen mientras la fecha esté pasada |

Salieron a producción con 60 días los tres, y el usuario los ajustó a esto el mismo día al
verlos funcionando. Lo que hizo falta para poder ajustarlos fue mover la antelación a la
tabla de trámites (`días`, o `None` para "sin antelación") en vez de tenerla como un límite
común: era ese límite el que obligaba a que los tres avisaran igual.

La Físico Mecánica y el Humo son **las primeras alertas del sistema que hablan de algo YA
vencido** —hasta entonces todas filtraban por `fecha >= hoy`—, así que su consulta no lleva
tope por abajo: una verificación caducada hace meses sigue siendo un camión que no debería
estar circulando. Por lo mismo la tarjeta dice "venció" y no "vence" cuando la fecha ya
pasó, comparando la fecha y no el tipo de alerta.

En pantalla, **una columna por concepto**: la celda enseña la fecha y a su lado el clip del
archivo. La Tarjeta de Circulación, que quedó sin fecha, lleva columna propia.
`/api/fotos/catalogos/` dice de una sola consulta qué unidades ya tienen cada documento,
para pintar el clip lleno o vacío **sin descargar un solo byte**.

## Alternativas descartadas

### Azure Blob Storage

Es donde "deberían" ir los archivos grandes, y se descartó por proporción: son unos cientos
de documentos de pocos MB. Traía infraestructura nueva, otra línea en la factura, tokens
SAS que gestionar y un segundo sitio donde algo puede quedar huérfano. Postgres ya guarda
los bytes de las fotos desde el principio y el disco está pagado.

### Columnas `bytea` en `tractos` y `remolques`

Obligaría a arrastrar los archivos en **cada** lectura del catálogo —el serializer usa
`fields='__all__'`— aunque la pantalla solo quiera las placas.

### Una tabla nueva solo para documentos

Es el mismo problema ya resuelto: bytes con su mime colgados de `(tipo, registro_id)`.
Habría duplicado el ViewSet de subida, la validación y el borrado.

### Recomprimir como las fotos de maniobras

Una tarjeta de circulación reducida a JPEG deja de servir de comprobante. Es la razón de
que estos tipos existan en vez de reutilizar `maniobra`.

### Abrir el documento en otra pestaña

Fue la primera versión. El usuario pidió verlo dentro de la app y no había contrapartida:
el navegador ya trae el visor. Ahora la imagen va en un `<img>` y el PDF en un `<iframe>`,
y **queda un enlace a otra pestaña** porque el visor de PDF empotrado no existe en casi
ningún navegador de móvil y ahí el marco saldría en blanco sin decir por qué.

## Consecuencias

- Hizo falta **una línea de CSP** en los dos sitios que la sirven (`vite.config.js` y
  `public/staticwebapp.config.json`): `frame-src 'self' blob:`. Sin ella el iframe caía en
  `default-src 'self'` y Chrome lo tapaba con "Este contenido está bloqueado". Se abre solo
  a `blob:`, que únicamente puede crear código del mismo origen; `frame-ancestors 'none'` y
  `object-src 'none'` se quedan como estaban.
- Todo el visor va por una **URL de blob** y no por el data URI que devuelve la API: Chrome
  no carga un `data:` ni en un iframe ni como navegación de nivel superior.
- El archivo se sube desde el clip y **no** desde el modal de alta: subirlo necesita que el
  registro ya exista y tenga id.
- **Borrar sigue siendo del admin** (decisión A1); reemplazar lo puede hacer cualquiera,
  como editar un catálogo. Se probó con test porque en local no hay forma cómoda de entrar
  como admin: el segundo factor pide un código que no está sincronizado.
- La base crece con los archivos. Con ~40 unidades y 4 documentos, son cientos de MB en el
  peor caso sobre disco ya provisionado; si algún día eso cambia, la conversación es Blob
  Storage y el punto de cambio es `_guardar()`.
