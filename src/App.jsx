import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import './App.css';
import { useAuthContext } from './context/AuthContext';
import { useInactivityTimer } from './hooks/useInactivityTimer';
import InactivityModal from './components/InactivityModal/InactivityModal';
import logoFraba from './pages/Logo Fraba.png';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import { apiClient } from './api/apiClient';
import CatalogosPage from './pages/CatalogosPage';
import DocumentosViajePage from './pages/DocumentosViajePage';
import ManiobrasPage from './pages/ManiobrasPage';
import AdministracionNoEco from './pages/AdministracionNoEco';
import GastosPage from "./pages/GastosPage";
import AdministracionGastos from './pages/AdministracionGastos';
import VaciosPage from './pages/VaciosPage';
import AdminVaciosPage from './pages/AdminVaciosPage';
import PerfilPage from './pages/PerfilPage';
import MovimientosLocalesPage from './pages/MovimientosLocalesPage';
import FoliosPage from './pages/FoliosPage';
import FinanzasPage, { CuentasPorCobrarPage } from './pages/FinanzasPage';
import FacturacionPage from './pages/FacturacionPage';
import CuentasPorPagarPage from './pages/CuentasPorPagarPage';
import GastosFinancierosPage from './pages/GastosFinancierosPage';
import TableroFinanzasPage from './pages/TableroFinanzasPage';
import EstadosCuentaPage from './pages/EstadosCuentaPage';
import CompensacionPage from './pages/CompensacionPage';
import HistorialPagosPage from './pages/HistorialPagosPage';
import CostosExtraPage from './pages/CostosExtraPage';
import NominaPage from './pages/NominaPage';
import PendientesPage from './pages/PendientesPage';
import TorreControlPage from './pages/TorreControlPage';
import ReporteViajePage from './pages/ReporteViajePage';
import { useAlertasVencimiento } from './hooks/useAlertasVencimiento';
import AlertaVencimiento from './components/AlertaVencimiento/AlertaVencimiento';
import Seguimientos from './components/Seguimientos/Seguimientos';
import BarraLateral from './components/BarraLateral/BarraLateral';
import InicioEscena from './components/InicioEscena/InicioEscena';
// Los últimos: a igual especificidad, los temas ganan por orden.
import './temaOpcion1.css';
import './temaOpcion2.css';
// Hora en tiempo real bajo la fecha del inicio. Componente aparte para que el
// tic de cada segundo no vuelva a pintar la escena entera.
function Reloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <time className="inicio-hora" dateTime={ahora.toISOString()}>
      {ahora.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
    </time>
  );
}

// Inicio: solo el logo, los seguimientos y los avisos (usuario, 2026-11-19); la
// navegación entera vive en la barra lateral. Tres bloques separados:
// seguimientos | logo con la escena del patio | avisos (App.css, "INICIO").
function Home() {
  const { user } = useAuthContext();
  const { alertas, error: errorAlertas } = useAlertasVencimiento();
  // Hora local del equipo del usuario (su zona horaria). Se refresca cada
  // minuto para que el saludo y la fecha cambien solos si el inicio se queda
  // abierto al pasar de mañana a tarde o a otro día.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const hora = ahora.getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  const fecha = ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="home-page inicio">
      <main className="inicio-main">
        <div className="inicio-bloque inicio-bloque--seg">
          <Seguimientos />
        </div>

        <section className="inicio-bloque inicio-hero">
          <img src={logoFraba} alt="Logo Fraba" className="inicio-logo" />
          <h1 className="inicio-saludo">
            {saludo}{user?.username ? `, ${user.username}` : ''}
          </h1>
          <p className="inicio-fecha">{fecha}</p>
          <Reloj />
          <InicioEscena ahora={ahora} />
        </section>

        {/* Alertas de vencimiento — visibles para cualquier usuario con sesión.
            Si la consulta falla se avisa, en vez de dejar el hueco vacío: una
            alerta que no llega no puede parecerse a que no haya ninguna. */}
        <section className="inicio-bloque inicio-avisos" aria-labelledby="inicio-avisos-titulo">
          <h2 id="inicio-avisos-titulo" className="seg-header">Avisos</h2>
          <div className="home-alertas-container inicio-alertas">
            {errorAlertas ? (
              <div className="av-card av-card--fallo" role="alert">
                <p className="av-mensaje">
                  No se pudieron cargar las alertas de vencimiento.
                  Recarga la página; si sigue igual, vuelve a iniciar sesión.
                </p>
              </div>
            ) : alertas.length > 0 ? (
              alertas.map((alerta, index) => (
                <AlertaVencimiento key={`${alerta.tipo}-${index}`} alerta={alerta} />
              ))
            ) : (
              <p className="inicio-sin-avisos">Sin vencimientos próximos.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuthContext();

  // Folios solo para admin con cargo Sistemas (usuario, 2026-10-14); Finanzas
  // para admin y cargos de Finanzas. Lo decide el backend: hasta que conteste
  // no salen ni en la barra lateral ni en las tarjetas del inicio.
  const [verFolios, setVerFolios] = useState(false);
  const [verFinanzas, setVerFinanzas] = useState(false);
  useEffect(() => {
    apiClient.get('/folios/acceso/')
      .then((a) => setVerFolios(Boolean(a?.ver)))
      .catch(() => setVerFolios(false));
    apiClient.get('/facturas/acceso/')
      .then((a) => setVerFinanzas(Boolean(a?.ver)))
      .catch(() => setVerFinanzas(false));
  }, []);

  // Comparación de rediseños: Diseño opcional 2 (temaOpcion2.css) en Maniobras
  // y Diseño opcional 1 (temaOpcion1.css) en todo lo demás. Va en <body> y no
  // en la raíz de este árbol: alertas y desplegables se pintan por portal en
  // body. Al salir (login) se quita: el login conserva su propio diseño.
  const temaActivo = location.pathname.startsWith('/home/maniobras') ? 'tema-opcion2' : 'tema-opcion1';
  useEffect(() => {
    document.body.classList.add(temaActivo);
    return () => document.body.classList.remove(temaActivo);
  }, [temaActivo]);

  // Al cambiar de página, volver arriba. React Router NO reposiciona el scroll:
  // se conserva el de la página anterior, así que entrar a una página desde una
  // ya scrolleada la abría por la mitad. <ScrollRestoration/> no sirve aquí,
  // solo existe en los data routers y esta app usa <BrowserRouter>.
  // El scroller es la ventana — las páginas leen window.scrollY para su scroll
  // infinito—, por eso se mueve window y no un contenedor.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // ── Aviso de inactividad ────────────────────────────────────────────────────
  const [showWarnModal, setShowWarnModal] = useState(false);

  // A los 20 min la sesión se cierra de verdad: logout (que invalida el refresh
  // en el servidor) y salida al login, que muestra el aviso. Antes solo se
  // pintaba un modal y los tokens seguían vivos hasta que alguien pulsara
  // Aceptar: si el usuario se marchaba, la pantalla decía "expirada" pero la
  // sesión no lo estaba. No se espera al logout para no dejar al usuario dentro
  // si la red va lenta; limpia los tokens igual, falle o no la petición.
  const handleExpire = useCallback(() => {
    setShowWarnModal(false);
    logout();
    navigate('/', { replace: true, state: { sesionCaducada: true } });
  }, [logout, navigate]);

  // Timer activo solo con sesión iniciada
  const { confirmarAviso } = useInactivityTimer({
    enabled: !!user,
    onWarn: setShowWarnModal,
    onExpire: handleExpire,
  });

  // Aceptar del aviso (10 min): cierra el modal y devuelve el mando a la
  // actividad. NO reinicia el contador por sí solo — eso lo hará la primera
  // interacción que llegue después. Si el usuario acepta y se marcha, expira.
  const handleWarnAceptar = useCallback(() => {
    setShowWarnModal(false);
    confirmarAviso();
  }, [confirmarAviso]);

  return (
    <div className="app-shell">
      <BarraLateral verFolios={verFolios} verFinanzas={verFinanzas} isAdmin={isAdmin} />

      <div className="app-contenido">
      {/* Contenido principal — crece para llenar el espacio disponible */}
      <div style={{ flex: 1, position: 'relative', paddingBottom: '40px' }}>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="maniobras" element={<ManiobrasPage title="MANIOBRAS" />} />
          <Route path="gastos-efectivo" element={<GastosPage title="GASTOS EFECTIVO" />} />
          <Route path="vacios" element={<VaciosPage />} />
          <Route path="movimientos-locales" element={<MovimientosLocalesPage />} />
          <Route path="folios" element={<FoliosPage />} />
          <Route path="catalogos" element={<CatalogosPage />} />
          <Route path="documentos-viaje" element={<DocumentosViajePage />} />
          <Route path="pendientes" element={<PendientesPage />} />
          <Route path="torre-control" element={<TorreControlPage />} />
          <Route path="reportes-viaje" element={<ReporteViajePage />} />

          {/* Finanzas: hub con sus cuatro subpáginas. Solo Costos extra tiene
              contenido; las otras tres esperan a tenerlo. */}
          <Route path="finanzas" element={<FinanzasPage />} />
          <Route path="finanzas/costos-extra" element={<CostosExtraPage />} />
          {/* Nómina: sueldos, primas y finiquitos. Admin-only también en la API
              y en la base (ver la migración 0067), así que sin este candado un
              usuario normal solo vería la pantalla romperse con un 403. */}
          <Route
            path="finanzas/nomina"
            element={
              <ProtectedRoute requireAdmin>
                <NominaPage />
              </ProtectedRoute>
            }
          />
          <Route path="finanzas/cuentas-por-cobrar" element={<CuentasPorCobrarPage />} />
          <Route path="finanzas/cuentas-por-cobrar/facturacion" element={<FacturacionPage />} />
          <Route path="finanzas/cuentas-por-cobrar/estados-cuenta" element={<EstadosCuentaPage />} />
          <Route path="finanzas/cuentas-por-cobrar/compensacion" element={<CompensacionPage />} />
          <Route path="finanzas/cuentas-por-cobrar/historial-pagos" element={<HistorialPagosPage />} />
          <Route path="finanzas/cuentas-por-pagar" element={<CuentasPorPagarPage />} />
          <Route path="finanzas/gastos-financieros" element={<GastosFinancierosPage />} />
          <Route path="finanzas/dashboards" element={<TableroFinanzasPage />} />
          <Route path="perfil" element={<PerfilPage />} />


          {/* Ruta protegida — solo administradores */}
          <Route
            path="admin-no-eco"
            element={
              <ProtectedRoute requireAdmin>
                <AdministracionNoEco />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin-gastos"
            element={
              <ProtectedRoute requireAdmin>
                <AdministracionGastos />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin-vacios"
            element={
              <ProtectedRoute requireAdmin>
                <AdminVaciosPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>

      {/* Footer */}
      <footer
        style={{
          backgroundColor: '#1565C0',
          padding: '10px 0',
          textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.15)',
          flexShrink: 0
        }}
      >
        <span style={{ color: 'white', fontSize: '13px' }}>
          © 2026 FRABA Todos los derechos reservados
        </span>
      </footer>
      </div>

      {/* Modal de aviso de inactividad (10 min). El de expiración vive ahora en
          el login: a los 20 min ya no hay sesión que avisar desde aquí. */}
      {showWarnModal && (
        <InactivityModal tipo="warn" onAceptar={handleWarnAceptar} />
      )}

    </div>
  );
}

export default AppRoutes;