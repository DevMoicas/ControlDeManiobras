# Graph Report - .  (2026-06-26)

## Corpus Check
- 57 files · ~135,111 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 202 nodes · 327 edges · 17 communities (16 shown, 1 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Auth & AdminGastos Pages|Auth & Admin/Gastos Pages]]
- [[_COMMUNITY_Maniobras Status Feature|Maniobras Status Feature]]
- [[_COMMUNITY_API Client & Documento Modals|API Client & Documento Modals]]
- [[_COMMUNITY_Vacios Feature|Vacios Feature]]
- [[_COMMUNITY_NPM Build Config|NPM Build Config]]
- [[_COMMUNITY_NPM Dependencies|NPM Dependencies]]
- [[_COMMUNITY_Documentos de Viaje Plan|Documentos de Viaje Plan]]
- [[_COMMUNITY_PWA Manifest|PWA Manifest]]
- [[_COMMUNITY_FRABA Container Brand|FRABA Container Brand]]
- [[_COMMUNITY_React Logo (192px)|React Logo (192px)]]
- [[_COMMUNITY_React Logo (512px)|React Logo (512px)]]
- [[_COMMUNITY_Robots Crawl Policy|Robots Crawl Policy]]

## God Nodes (most connected - your core abstractions)
1. `apiClient` - 18 edges
2. `useAuthContext()` - 17 edges
3. `getStatusConfig()` - 6 edges
4. `CtaPortModal` - 6 edges
5. `DocumentoCtaPortView (POST /api/documentos/cta-port/)` - 6 edges
6. `scripts` - 5 edges
7. `OperadorSelector()` - 5 edges
8. `SearchBar()` - 5 edges
9. `VacioStatusSelector()` - 5 edges
10. `GastosPage()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Control de Maniobras Web App (HTML Shell)` --conceptually_related_to--> `DocumentosViajePage`  [INFERRED]
  public/index.html → src/PLAN_DOCUMENTOS_VIAJE.md
- `StatusBadge()` --calls--> `getStatusConfig()`  [EXTRACTED]
  src/components/StatusBadge/StatusBadge.jsx → src/config/statusConfig.js
- `ManiobrasPage()` --calls--> `useAuthContext()`  [EXTRACTED]
  src/pages/ManiobrasPage.jsx → src/context/AuthContext.jsx
- `VaciosPage()` --calls--> `useAuthContext()`  [EXTRACTED]
  src/pages/VaciosPage.jsx → src/context/AuthContext.jsx
- `LoginPage()` --calls--> `useAuthContext()`  [EXTRACTED]
  src/Login/Login.jsx → src/context/AuthContext.jsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Excel Template to PDF Document Generation Pipeline** — src_plan_documentos_viaje_documento_bitacora_sueno_view, src_plan_documentos_viaje_documento_cta_port_view, src_plan_documentos_viaje_xlsx_a_pdf, src_plan_documentos_viaje_cta_pte_template, src_plan_documentos_viaje_libreoffice_pdf_pipeline [EXTRACTED 0.85]
- **Documentos de Viaje Frontend Modal Flow** — src_plan_documentos_viaje_documentos_viaje_page, src_plan_documentos_viaje_bitacora_sueno_modal, src_plan_documentos_viaje_cta_port_modal, src_plan_documentos_viaje_apiclient_download [EXTRACTED 0.85]

## Communities (17 total, 1 thin omitted)

### Community 0 - "Auth & Admin/Gastos Pages"
Cohesion: 0.08
Nodes (23): ALLOWED_CLAIMS, AuthContext, AuthProvider(), tokenStore, useAuthContext(), useGastos(), laneGrid, LoginPage() (+15 more)

### Community 1 - "Maniobras Status Feature"
Cohesion: 0.10
Nodes (14): getStatusConfig(), isValidStatus(), MANIOBRA_STATUSES_LIST, STATUS_MAP, STATUS_BACKEND, useManiobras(), useStatusUpdate(), COLUMNAS (+6 more)

### Community 2 - "API Client & Documento Modals"
Cohesion: 0.15
Nodes (13): apiClient, BitacoraSuenoModal(), ESTADO_INICIAL, ClienteSelector(), CtaPortModal(), ESTADO_INICIAL, FolioSelector(), VACIO_VACIO (+5 more)

### Community 3 - "Vacios Feature"
Cohesion: 0.12
Nodes (12): ALLOWED_TYPES, FotoModal(), useVacios(), useVacioStatusUpdate(), COLUMNAS, MODAL_CERRADO, VaciosPage(), PatioSelector() (+4 more)

### Community 4 - "NPM Build Config"
Cohesion: 0.11
Nodes (17): browserslist, development, production, devDependencies, autoprefixer, postcss, tailwindcss, eslintConfig (+9 more)

### Community 5 - "NPM Dependencies"
Cohesion: 0.11
Nodes (18): dependencies, axios, chart.js, date-fns, lucide-react, react, react-chartjs-2, react-datepicker (+10 more)

### Community 6 - "Documentos de Viaje Plan"
Cohesion: 0.17
Nodes (18): Control de Maniobras Web App (HTML Shell), apiClient.download (POST returning Blob), BitacoraSuenoModal, Cliente Model (+colonia, +ciudad), ClienteSelector, _concat_placas_remolques helper, CtaPortModal, CTA_PTE_FORMATO.xlsx (Excel template) (+10 more)

### Community 7 - "PWA Manifest"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 8 - "FRABA Container Brand"
Cohesion: 0.67
Nodes (3): FRABA Container Brand, Shipping Container Operations, FRABA Container Logo

### Community 9 - "React Logo (192px)"
Cohesion: 0.67
Nodes (3): Progressive Web App Icon, React JavaScript Library, React Logo (192px)

### Community 10 - "React Logo (512px)"
Cohesion: 0.67
Nodes (3): PWA App Icon, React Framework, React Logo (512px)

## Knowledge Gaps
- **70 isolated node(s):** `name`, `version`, `private`, `@tailwindcss/postcss`, `@testing-library/dom` (+65 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAuthContext()` connect `Auth & Admin/Gastos Pages` to `Maniobras Status Feature`, `Vacios Feature`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `apiClient` connect `API Client & Documento Modals` to `Auth & Admin/Gastos Pages`, `Maniobras Status Feature`, `Vacios Feature`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `dependencies` connect `NPM Dependencies` to `NPM Build Config`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _71 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth & Admin/Gastos Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.08139534883720931 - nodes in this community are weakly interconnected._
- **Should `Maniobras Status Feature` be split into smaller, more focused modules?**
  _Cohesion score 0.10344827586206896 - nodes in this community are weakly interconnected._
- **Should `Vacios Feature` be split into smaller, more focused modules?**
  _Cohesion score 0.12121212121212122 - nodes in this community are weakly interconnected._