import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Home as HomeIcon, CircleDollarSign, UserCircle, Truck, Wallet, Container, Library, FileText, Hash, Bitcoin, ListChecks, TowerControl, ClipboardList, ChevronRight } from 'lucide-react';
import './App.css';
import { useAuthContext } from './context/AuthContext';
import { useInactivityTimer } from './hooks/useInactivityTimer';
import InactivityModal from './components/InactivityModal/InactivityModal';
import logoFraba from './pages/Logo Fraba.png';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
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
import FinanzasPage from './pages/FinanzasPage';
import CostosExtraPage from './pages/CostosExtraPage';
import NominaPage from './pages/NominaPage';
import PendientesPage from './pages/PendientesPage';
import TorreControlPage from './pages/TorreControlPage';
import ReporteViajePage from './pages/ReporteViajePage';
import { useAlertasVencimiento } from './hooks/useAlertasVencimiento';
import AlertaVencimiento from './components/AlertaVencimiento/AlertaVencimiento';
import Seguimientos from './components/Seguimientos/Seguimientos';
const HOME_MODULES = [
  { to: 'maniobras',       icon: Truck,       title: 'Maniobras',           desc: 'Registra y consulta los servicios.' },
  { to: 'gastos-efectivo', icon: CircleDollarSign,      title: 'Gastos efectivo',     desc: 'Controla los gastos de cada operación.' },
  { to: 'vacios',          icon: Container, title: 'Vacíos',              desc: 'Administra los contenedores vacíos.' },
  { to: 'movimientos-locales', icon: Wallet, title: 'Movimientos locales', desc: 'Controla los movimientos locales pendientes y pagados.' },
  { to: 'folios',          icon: Hash,        title: 'Folios',              desc: 'Genera y administra los folios de Manzanillo y Lázaro Cárdenas.' },
  { to: 'catalogos',       icon: Library,     title: 'Catálogos',           desc: 'Gestiona operadores, placas, patios, unidades, etc.' },
  { to: 'documentos-viaje',icon: FileText,    title: 'Documentos de viaje', desc: 'Genera la documentación de cada viaje.' },
  { to: 'finanzas',        icon: Bitcoin,   title: 'Finanzas',            desc: 'Costos extra, nómina, facturación y estados de cuenta.' },
  { to: 'pendientes',      icon: ListChecks,  title: 'Pendientes',          desc: 'Listas de pendientes por persona.' },
  { to: 'torre-control',   icon: TowerControl, title: 'Torre de control',    desc: 'Tablero de unidades ocupadas por día.' },
  { to: 'reportes-viaje',  icon: ClipboardList, title: 'Reportes de viaje',   desc: 'El reporte del coordinador por cada folio.' },
];

function Home() {
  const navigate = useNavigate();
  const { alertas, error: errorAlertas } = useAlertasVencimiento();

  return (
    <div className="home-page">

      <header className="home-topbar">
        <div className="home-brand">
          <span className="home-brand-mark"><Truck size={20} /></span>
          <span className="home-brand-name">Control de Maniobras</span>
        </div>
        <button className="home-profile" onClick={() => navigate('perfil')} title="Ver perfil">
          <UserCircle size={26} />
        </button>
      </header>

      <main className="home-main">
        <div className="home-head">
          {/* Columna derecha: el resumen de seguimientos y, debajo, las alertas
              de vencimiento. Va anclada al borde de la ventana y FUERA del flujo
              (ver .home-lateral en App.css) para no empujar el logo hacia abajo.
              Al apilarlas en el mismo contenedor, las alertas caen bajo el panel
              sin depender de su altura. */}
          <div className="home-lateral">
            <Seguimientos />

            {/* Alertas de vencimiento — visibles para cualquier usuario con sesión.
                Si la consulta falla se avisa, en vez de dejar el hueco vacío: una
                alerta que no llega no puede parecerse a que no haya ninguna. */}
            {(alertas.length > 0 || errorAlertas) && (
              <div className="home-alertas-container">
                {errorAlertas ? (
                  <div className="av-card av-card--fallo" role="alert">
                    <p className="av-mensaje">
                      No se pudieron cargar las alertas de vencimiento.
                      Recarga la página; si sigue igual, vuelve a iniciar sesión.
                    </p>
                  </div>
                ) : (
                  alertas.map((alerta, index) => (
                    <AlertaVencimiento key={`${alerta.tipo}-${index}`} alerta={alerta} />
                  ))
                )}
              </div>
            )}
          </div>

          <img src={logoFraba} alt="Logo Fraba" className="home-logo" />
          <h1>Control de Maniobras</h1>
          <p>Elige un módulo para comenzar.</p>
        </div>

        <div className="grid">
          {HOME_MODULES.map(({ to, icon: Icon, title, desc }, i) => (
            <button
              key={to}
              className="card"
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => navigate(to)}
            >
              <span className="card-icon"><Icon size={45} /></span>
              <span className="card-title">{title}</span>
              <span className="card-desc">{desc}</span>
              <span className="card-go"><ChevronRight size={18} /></span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

function BlankPage({ title }) {
  return (
    <div className="blank-page">
      <h1 style={{ color: 'white', textAlign: 'center' }}>{title}</h1>
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthContext();

  const showBackButton = location.pathname !== '/home' && location.pathname !== '/home/';
  // Dentro de una subpágina de Finanzas hay DOS niveles a los que volver, así
  // que se añade el atajo al hub. En el hub mismo no: desde ahí solo se sube.
  const enSubpaginaFinanzas = location.pathname.startsWith('/home/finanzas/');
  // El hub de Finanzas es la única página con barra superior propia
  // (.home-topbar), y el botón flotante le caería justo encima. Ahí baja por
  // debajo de la barra; en el resto se queda donde ha estado siempre.
  const enHubFinanzas = /^\/home\/finanzas\/?$/.test(location.pathname);

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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

      {/* Contenido principal — crece para llenar el espacio disponible */}
      <div style={{ flex: 1, position: 'relative', paddingBottom: '40px' }}>

        {showBackButton && (
          /* Los botones se apilan en una zona con flex en vez de posicionarse
             uno a uno: así el segundo no depende del ancho del primero, que
             cambia al ocultarse la etiqueta en pantallas angostas.
             Orden de migas: Inicio (arriba del todo) y luego Finanzas. */
          <div className={`home-back-zona${enHubFinanzas ? ' home-back-zona--bajo' : ''}`}>
            <button
              onClick={() => navigate('/home')}
              className="home-back"
              title="Regresar al inicio"
            >
              <span className="home-back-icon"><HomeIcon size={24} /></span>
              <span className="home-back-label">Inicio</span>
            </button>

            {enSubpaginaFinanzas && (
              <button
                onClick={() => navigate('/home/finanzas')}
                className="home-back"
                title="Regresar a Finanzas"
              >
                <span className="home-back-icon"><Bitcoin size={24} /></span>
                <span className="home-back-label">Finanzas</span>
              </button>
            )}
          </div>
        )}

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
          <Route path="finanzas/facturacion" element={<BlankPage title="FACTURACIÓN" />} />
          <Route path="finanzas/estados-cuenta" element={<BlankPage title="ESTADOS DE CUENTA" />} />
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

      {/* Modal de aviso de inactividad (10 min). El de expiración vive ahora en
          el login: a los 20 min ya no hay sesión que avisar desde aquí. */}
      {showWarnModal && (
        <InactivityModal tipo="warn" onAceptar={handleWarnAceptar} />
      )}

    </div>
  );
}

export default AppRoutes;