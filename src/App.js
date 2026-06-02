import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Home as HomeIcon, UserCircle } from 'lucide-react';
import './App.css';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import NoEcoPage from './pages/NoEcoPage';
import ManiobrasPage from './pages/ManiobrasPage';
import AdministracionNoEco from './pages/AdministracionNoEco';
import GastosPage from "./pages/GastosPage";
import AdministracionGastos from './pages/AdministracionGastos';
import VaciosPage from './pages/VaciosPage';
import AdminVaciosPage from './pages/AdminVaciosPage';
import PerfilPage from './pages/PerfilPage';
function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-page"> {/* NUEVO CONTENEDOR */}

      {/* Botón de perfil — esquina superior derecha */}
      <button
        onClick={() => navigate('perfil')}
        style={{
          position: 'absolute',
          top: '5px',
          right: '20px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'black',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '5px',
        }}
        title="Ver perfil"
      >
        <UserCircle size={32} />
      </button>

      <div className="container">
        <h1>Control de Maniobras</h1>

        <div className="description">
          Sistema para automatizar y gestionar registros en Excel de forma rápida y eficiente.
        </div>

        <div className="grid">
          <div className="card" onClick={() => navigate('maniobras')}>
            <div className="icon">🚚</div>
            <div className="title">MANIOBRAS</div>
          </div>

          <div className="card" onClick={() => navigate('gastos-efectivo')}>
            <div className="icon">💰</div>
            <div className="title">GASTOS EFECTIVO</div>
          </div>

          <div className="card" onClick={() => navigate('vacios')}>
            <div className="icon">📭</div>
            <div className="title">VACÍOS</div>
          </div>

          <div className="card" onClick={() => navigate('no-eco')}>
            <div className="icon">🔢</div>
            <div className="title">NO. ECO</div>
          </div>
        </div>
      </div>
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

  const showBackButton = location.pathname !== '/home' && location.pathname !== '/home/';

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
          <Route path="no-eco" element={<NoEcoPage />} />
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
  );
}

export default AppRoutes;