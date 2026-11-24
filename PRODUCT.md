# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personal de FRABA, empresa de transporte de contenedores con base en el puerto de
Manzanillo. Operación (capturistas, coordinadores) registra maniobras, gastos,
vacíos y reportes de viaje. Finanzas y Dashboards son solo para dirección,
comercial y administradores: dirección los usa para ver cómo va el negocio
(ventas, utilidad, cobranza) y administración para el detalle del día a día
(cobrar, pagar, vigilar costos). Se consulta sobre todo en computadora.

## Product Purpose

Sistema interno (Control de Maniobras) que sustituye hojas de Excel y formatos en
papel: maniobras y su status, gastos, nómina, vacíos, torre de control, reportes
de viaje firmados, facturación, cuentas por cobrar y por pagar, y nueve
dashboards financieros. Éxito: que las cifras del sistema sean la fuente única y
se lean sin reconstruirlas a mano.

## Operating Context

- Servicios: sencillo, full y carga suelta; locales y foráneos.
- Las cifras de los dashboards las calcula el backend; el frontend solo las pinta.
- Los dashboards filtran por periodo y comparan contra otro periodo (por defecto,
  el mismo rango del año anterior).
- Despliegue: Static Web App en Azure, sin staging; cada push a la rama del
  frontend publica en producción.

## Capabilities and Constraints

- Vite + React, recharts ya instalado, lucide-react para iconos.
- Moneda MXN, formato es-MX.
- Avisos de datos incompletos (facturas sin maniobra, pagos fijos sin capturar)
  deben seguir visibles: explican por qué una cifra puede no cuadrar.

## Brand Commitments

Diseño opcional 1 (src/temaOpcion1.css): navy + teal, DM Sans, Fraunces solo en
títulos de página. Nada más es obligatorio.

## Evidence on Hand

Datos reales en la BD de producción; no hay testimonios ni métricas públicas.

## Product Principles

1. Las cifras mandan: legibilidad y exactitud por encima de la decoración.
2. Un dato nunca sin contexto: periodo, comparación y avisos de qué falta.
3. Cambiar solo lo necesario; no romper lo que la operación ya usa.
