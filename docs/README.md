# Documentación del sistema

Vive en `main` y no en las ramas de componente por una razón concreta:
`main`, `backend/api` y `feature/inicio-botones` tienen **historias independientes** y
nunca se fusionan. Un documento en una rama de componente es invisible desde la otra
para siempre, y casi toda la documentación de este sistema habla de los dos a la vez.

`main` además no tiene workflow: corregir una errata aquí no puede desplegar ni romper
producción, a diferencia de cualquier commit en las otras dos ramas.

## Cómo trabajar aquí sin un tercer clon

Desde el clon del backend:

```bash
git worktree add ../ControlDeManiobras-docs main
```

Eso deja una carpeta con `main` desplegado que comparte el mismo `.git`. No descarga
nada de nuevo y no obliga a cambiar de rama: las tres copias abiertas a la vez.

## Qué hay aquí

### `decisions/` — Registros de decisiones de arquitectura (ADR)

Un ADR responde a **por qué se decidió algo, en qué fecha y qué se descartó**. No
describe cómo está el sistema hoy: eso lo dice el código, y caduca. El *porqué* no
caduca.

Numeración secuencial: `NNNN-titulo-en-minusculas.md`.

Se escribe uno cuando la decisión sería cara de revertir: un modelo de datos, una regla
de negocio que el esquema no obliga a cumplir, un permiso, un contrato de API.

**Un ADR no se edita cuando la decisión cambia.** Se escribe uno nuevo que lo sustituye
y se marca el viejo como `Superseded by ADR-XXXX`. El histórico es el valor.

### `planes/` — Planes e historial de despliegue

Documentos de trabajo que describen el **estado** del sistema y lo que quedó pendiente.

⚠️ **Estos sí caducan, y ya lo han hecho.** Sus resúmenes de "lo que falta" han
contradicho al código más de una vez. Antes de fiarse de uno, verificar contra el
código. Su valor real está en el histórico de incidentes y en los procedimientos
probados (cómo se aplica una migración, dónde estaban las trampas), no en su lista de
tareas.
