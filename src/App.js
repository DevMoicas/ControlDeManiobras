import { useState, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Home as HomeIcon, CircleDollarSign, UserCircle, Truck, Wallet, Container, Library, FileText, ChevronRight } from 'lucide-react';
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
import { useAlertasVencimiento } from './hooks/useAlertasVencimiento';
import AlertaVencimiento from './components/AlertaVencimiento/AlertaVencimiento';
const HOME_MODULES = [
  { to: 'maniobras',       icon: Truck,       title: 'Maniobras',           desc: 'Registra y consulta los servicios.' },
  { to: 'gastos-efectivo', icon: CircleDollarSign,      title: 'Gastos efectivo',     desc: 'Controla los gastos en efectivo de cada operación.' },
  { to: 'vacios',          icon: Container, title: 'Vacíos',              desc: 'Administra los contenedores vacíos.' },
  { to: 'movimientos-locales', icon: Wallet, title: 'Movimientos locales', desc: 'Controla los movimientos locales pendientes y pagados.' },
  { to: 'catalogos',       icon: Library,     title: 'Catálogos',           desc: 'Gestiona operadores, placas, patios, unidades, etc.' },
  { to: 'documentos-viaje',icon: FileText,    title: 'Documentos de viaje', desc: 'Genera y consulta la documentación de cada viaje.' },
];

function Home() {
  const navigate = useNavigate();
  const { alertas } = useAlertasVencimiento();

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
        {/* Alertas de vencimiento — solo visibles en Home */}
        {alertas.length > 0 && (
          <div className="home-alertas-container">
            {alertas.map((alerta, index) => (
              <AlertaVencimiento key={`${alerta.tipo}-${index}`} alerta={alerta} />
            ))}
          </div>
        )}

        <div className="home-head">
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

  // ── Modales de inactividad ──────────────────────────────────────────────────
  const [showWarnModal,    setShowWarnModal]    = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);

  // Al expirar: mostrar el modal SIN hacer logout todavía. El logout ocurre al
  // hacer click en Aceptar para garantizar que el modal sea visible antes de salir.
  const handleExpire = useCallback(() => {
    setShowWarnModal(false);
    setShowExpiredModal(true);
  }, []);

  // Timer activo solo con sesión iniciada
  useInactivityTimer({
    enabled: !!user,
    onWarn: setShowWarnModal,
    onExpire: handleExpire,
  });

  // Aceptar del aviso (10 min): solo cierra el modal. El timer NO se reinicia (Option B).
  const handleWarnAceptar = () => setShowWarnModal(false);

  // Aceptar de expiración (20 min): logout completo + redirección al login ("/").
  const handleExpiredAceptar = useCallback(() => {
    setShowExpiredModal(false);
    logout();
    navigate('/');
  }, [logout, navigate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

      {/* Contenido principal — crece para llenar el espacio disponible */}
      <div style={{ flex: 1, position: 'relative', paddingBottom: '40px' }}>

        {showBackButton && (
          <button
            onClick={() => navigate('/home')}
            style={{
              position: 'absolute',
              top: '5px',
              left: '20px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'black',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '5px'
            }}
            title="Regresar al Home"
          >
            <HomeIcon size={32} />
          </button>
        )}

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="maniobras" element={<ManiobrasPage title="MANIOBRAS" />} />
          <Route path="gastos-efectivo" element={<GastosPage title="GASTOS EFECTIVO" />} />
          <Route path="vacios" element={<VaciosPage />} />
          <Route path="movimientos-locales" element={<MovimientosLocalesPage />} />
          <Route path="catalogos" element={<CatalogosPage />} />
          <Route path="documentos-viaje" element={<DocumentosViajePage />} />
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

      {/* Modal de aviso de inactividad (10 min) */}
      {showWarnModal && (
        <InactivityModal tipo="warn" onAceptar={handleWarnAceptar} />
      )}

      {/* Modal de sesión expirada (20 min) */}
      {showExpiredModal && (
        <InactivityModal tipo="expired" onAceptar={handleExpiredAceptar} />
      )}

    </div>
  );
}

export default AppRoutes;