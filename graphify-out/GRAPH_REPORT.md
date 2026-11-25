# Graph Report - ControlDeManiobras  (2026-11-25)

## Corpus Check
- 138 files · ~219,802 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 684 nodes · 1736 edges · 36 communities (35 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4d4c0626`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_apiClient|apiClient]]
- [[_COMMUNITY_ManiobrasPage.jsx|ManiobrasPage.jsx]]
- [[_COMMUNITY_CuentasPorPagarPage.jsx|CuentasPorPagarPage.jsx]]
- [[_COMMUNITY_App.jsx|App.jsx]]
- [[_COMMUNITY_GastosPage.jsx|GastosPage.jsx]]
- [[_COMMUNITY_Dashboards.jsx|Dashboards.jsx]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_useAlerta()|useAlerta()]]
- [[_COMMUNITY_VaciosPage.jsx|VaciosPage.jsx]]
- [[_COMMUNITY_CampoFecha.jsx|CampoFecha.jsx]]
- [[_COMMUNITY_overlayMotion|overlayMotion]]
- [[_COMMUNITY_ReporteViajePage.jsx|ReporteViajePage.jsx]]
- [[_COMMUNITY_TorreControlPage.jsx|TorreControlPage.jsx]]
- [[_COMMUNITY_statusConfig.js|statusConfig.js]]
- [[_COMMUNITY_useAuthContext()|useAuthContext()]]
- [[_COMMUNITY_EstadosCuentaPage.jsx|EstadosCuentaPage.jsx]]
- [[_COMMUNITY_NominaPage.jsx|NominaPage.jsx]]
- [[_COMMUNITY_useInactivityTimer.js|useInactivityTimer.js]]
- [[_COMMUNITY_Manifest.json|Manifest.json]]
- [[_COMMUNITY_FRABA Container Brand|FRABA Container Brand]]
- [[_COMMUNITY_React Logo (192px)|React Logo (192px)]]
- [[_COMMUNITY_React Logo (512px)|React Logo (512px)]]
- [[_COMMUNITY_BarraScrollTabla.jsx|BarraScrollTabla.jsx]]
- [[_COMMUNITY_SearchBar.jsx|SearchBar.jsx]]
- [[_COMMUNITY_Robots Crawl Policy (allow all)|Robots Crawl Policy (allow all)]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]

## God Nodes (most connected - your core abstractions)
1. `apiClient` - 57 edges
2. `useAlerta()` - 41 edges
3. `useConfirmacion()` - 37 edges
4. `useDropdownNav()` - 33 edges
5. `useAuthContext()` - 26 edges
6. `useAutoRefresco()` - 26 edges
7. `overlayMotion` - 16 edges
8. `contentMotion` - 15 edges
9. `CampoFecha()` - 14 edges
10. `useConComparacion()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `CompensacionPage()` --calls--> `numero()`  [INFERRED]
  src/pages/CompensacionPage.jsx → src/utils/reporteViaje.mjs
- `Home()` --calls--> `useAuthContext()`  [EXTRACTED]
  src/App.jsx → src/context/AuthContext.jsx
- `AppRoutes()` --calls--> `useInactivityTimer()`  [EXTRACTED]
  src/App.jsx → src/hooks/useInactivityTimer.js
- `LoginPage()` --calls--> `useAuthContext()`  [EXTRACTED]
  src/Login/Login.jsx → src/context/AuthContext.jsx
- `CalendarioVacaciones()` --calls--> `useAlerta()`  [EXTRACTED]
  src/components/CalendarioVacaciones/CalendarioVacaciones.jsx → src/components/Alertas/Alertas.jsx

## Import Cycles
- None detected.

## Communities (36 total, 1 thin omitted)

### Community 0 - "apiClient"
Cohesion: 0.06
Nodes (47): contentMotion, overlayMotion, apiClient, BitacoraGastosModal(), CAMPOS_IMPRESOS, ESTADO_INICIAL, BitacoraSuenoModal(), ESTADO_INICIAL (+39 more)

### Community 1 - "ManiobrasPage.jsx"
Cohesion: 0.12
Nodes (28): STATUS_MAP, BarraFiltros(), aplicarCambioTipoServicio(), DobleInput(), TipoFullInput(), celda(), COLUMNAS_ACTIVOS, COLUMNAS_PENDIENTES (+20 more)

### Community 2 - "CuentasPorPagarPage.jsx"
Cohesion: 0.11
Nodes (19): CalendarioVacaciones(), DIAS, nombreDelMes(), ColorSelector(), COLUMNAS, COLUMNAS_MONEDA, columnasVisibles(), GASTO_VACIO (+11 more)

### Community 3 - "App.jsx"
Cohesion: 0.16
Nodes (10): AlertaVencimiento(), TEXTOS, useAlertasVencimiento(), DashboardGastos(), AdministracionNoEco(), CUENTAS_POR_COBRAR, CuentasPorCobrarPage(), FinanzasPage() (+2 more)

### Community 4 - "GastosPage.jsx"
Cohesion: 0.20
Nodes (15): useAlerta(), useConfirmacion(), NoEcoPage(), GastosFijos(), FacturacionPage(), Sugerencias(), GastosFinancierosPage(), GastosPage() (+7 more)

### Community 5 - "Dashboards.jsx"
Cohesion: 0.06
Nodes (46): FORMATO, ALCANCES, BloqueTreemap(), COLOR, COLOR_TRAMO, COMPOSICION, CONCEPTOS, CostosPorUnidad() (+38 more)

### Community 6 - "dependencies"
Cohesion: 0.06
Nodes (35): browserslist, development, production, dependencies, axios, chart.js, date-fns, @floating-ui/react (+27 more)

### Community 7 - "useAlerta()"
Cohesion: 0.08
Nodes (21): BarraScrollTabla(), BotonArriba(), CostosExtraSelector(), formatearCosto(), conValor(), VACIO, COLUMNAS_AUDITORIA, COLUMNAS_FACTURACION (+13 more)

### Community 8 - "VaciosPage.jsx"
Cohesion: 0.07
Nodes (35): AHORA, CampoFecha(), MESES, PRIMER_MES, ULTIMO_MES, ENTRADAS, formatear(), interpretar() (+27 more)

### Community 9 - "CampoFecha.jsx"
Cohesion: 0.20
Nodes (9): Brand Commitments, Capabilities and Constraints, Evidence on Hand, Operating Context, Platform, Product, Product Principles, Product Purpose (+1 more)

### Community 10 - "overlayMotion"
Cohesion: 0.07
Nodes (34): METODOS_ESCRITURA, refrescarAccessToken(), request(), baseResource(), getFresh(), getInflightOrNull(), inflight, invalidateByEndpoint() (+26 more)

### Community 11 - "ReporteViajePage.jsx"
Cohesion: 0.13
Nodes (23): useReportesViaje(), MANIOBRA_VACIO, mostrarNumero(), SERVICIOS, SiNo(), aTriEstado(), cargaNueva(), CARGAS_VACIAS (+15 more)

### Community 12 - "TorreControlPage.jsx"
Cohesion: 0.16
Nodes (17): useArrastre(), useTorreControl(), DIAS, MESES_CORTO, nombreDelMes(), TorreControlPage(), celdasDelMes(), desplazarMes() (+9 more)

### Community 13 - "statusConfig.js"
Cohesion: 0.22
Nodes (13): alternarStatus(), formatStatusLabel(), getPredominantStatusId(), getStatusConfig(), hasAnyStatus(), isValidStatusValue(), joinStatusIds(), MANIOBRA_STATUSES_LIST (+5 more)

### Community 14 - "useAuthContext()"
Cohesion: 0.19
Nodes (11): AlertasProvider(), ALLOWED_CLAIMS, AuthContext, AuthProvider(), tokenStore, useAuthContext(), AdminVaciosPage(), CostosExtraPage() (+3 more)

### Community 15 - "EstadosCuentaPage.jsx"
Cohesion: 0.16
Nodes (13): EMPRESAS, EstadosCuentaPage(), ESTATUS, ETIQUETA, fechaLarga(), moneda(), NOMBRE_EMPRESA, suma() (+5 more)

### Community 16 - "NominaPage.jsx"
Cohesion: 0.15
Nodes (10): FiltrosLista(), COLUMNAS_MANIOBRA, Cuentas(), CuentasPorPagarPage(), EMPRESAS, moneda(), NOMBRE_EMPRESA, PERIODICIDADES (+2 more)

### Community 17 - "useInactivityTimer.js"
Cohesion: 0.40
Nodes (6): conAceptar(), conActividad(), conTick(), estadoInicial(), ACTIVITY_EVENTS, useInactivityTimer()

### Community 18 - "Manifest.json"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 19 - "FRABA Container Brand"
Cohesion: 0.67
Nodes (3): FRABA Container Brand, Shipping Container Operations, FRABA Container Logo

### Community 20 - "React Logo (192px)"
Cohesion: 0.67
Nodes (3): Progressive Web App Icon, React JavaScript Library, React Logo (192px)

### Community 21 - "React Logo (512px)"
Cohesion: 0.67
Nodes (3): PWA App Icon, React Framework, React Logo (512px)

### Community 22 - "BarraScrollTabla.jsx"
Cohesion: 0.40
Nodes (7): INICIAL, medidas(), siguienteIntento(), aJpeg(), ALLOWED_TYPES, FotoModal(), prepararImagen()

### Community 23 - "SearchBar.jsx"
Cohesion: 0.12
Nodes (8): BLOQUES, BUQUE_CARGA, cielo(), COLORES, G, InicioEscena(), LLANTAS, POSICIONES

### Community 29 - "Community 29"
Cohesion: 0.22
Nodes (7): AlertaContext, DESENLACE, FAMILIA, VIDA_MS, alertaMotion, useMovimientosLocales(), MovimientosLocalesPage()

### Community 30 - "Community 30"
Cohesion: 0.40
Nodes (3): ESTADOS, HistorialPagosPage(), moneda()

### Community 31 - "Community 31"
Cohesion: 0.52
Nodes (5): arbol(), BarraLateral(), contiene(), Grupo(), visibles()

### Community 32 - "Community 32"
Cohesion: 0.39
Nodes (4): InactivityModal(), laneGrid, LoginPage(), pasoSiguiente()

### Community 33 - "Community 33"
Cohesion: 0.43
Nodes (5): useFolios(), chunk(), COLUMNAS, FoliosPage(), FolioTabla()

### Community 34 - "Community 34"
Cohesion: 0.57
Nodes (5): renombrarFolio(), sincronizarFolioFull(), codigoFolioFull(), sinSufijoFull(), tieneSufijoFull()

### Community 35 - "Community 35"
Cohesion: 0.33
Nodes (3): ConfirmacionContext, ConfirmacionProvider(), PerfilPage()

## Knowledge Gaps
- **170 isolated node(s):** `name`, `version`, `private`, `@floating-ui/react`, `@tailwindcss/postcss` (+165 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `apiClient` connect `apiClient` to `ManiobrasPage.jsx`, `CuentasPorPagarPage.jsx`, `App.jsx`, `GastosPage.jsx`, `Dashboards.jsx`, `useAlerta()`, `VaciosPage.jsx`, `overlayMotion`, `ReporteViajePage.jsx`, `TorreControlPage.jsx`, `statusConfig.js`, `useAuthContext()`, `EstadosCuentaPage.jsx`, `NominaPage.jsx`, `BarraScrollTabla.jsx`, `Community 29`, `Community 30`, `Community 33`, `Community 35`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `useAlerta()` connect `GastosPage.jsx` to `apiClient`, `Community 33`, `CuentasPorPagarPage.jsx`, `Community 35`, `useAlerta()`, `VaciosPage.jsx`, `overlayMotion`, `ReporteViajePage.jsx`, `TorreControlPage.jsx`, `useAuthContext()`, `EstadosCuentaPage.jsx`, `NominaPage.jsx`, `Community 29`, `Community 30`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `useConfirmacion()` connect `GastosPage.jsx` to `apiClient`, `CuentasPorPagarPage.jsx`, `Community 35`, `useAlerta()`, `VaciosPage.jsx`, `overlayMotion`, `ReporteViajePage.jsx`, `TorreControlPage.jsx`, `useAuthContext()`, `NominaPage.jsx`, `BarraScrollTabla.jsx`, `Community 30`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _170 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `apiClient` be split into smaller, more focused modules?**
  _Cohesion score 0.06442577030812324 - nodes in this community are weakly interconnected._
- **Should `ManiobrasPage.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11586452762923351 - nodes in this community are weakly interconnected._
- **Should `CuentasPorPagarPage.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11051693404634581 - nodes in this community are weakly interconnected._