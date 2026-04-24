import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Home as HomeIcon } from 'lucide-react';
import './App.css';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import NoEcoPage from './pages/NoEcoPage';
import ManiobrasPage from './pages/ManiobrasPage';
import AdministracionNoEco from './pages/AdministracionNoEco';

function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-page"> {/* NUEVO CONTENEDOR */}
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
    <>
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
        <Route path="gastos-efectivo" element={<BlankPage title="GASTOS EFECTIVO" />} />
        <Route path="vacios" element={<BlankPage title="VACIOS" />} />
        <Route path="no-eco" element={<NoEcoPage />} />

        {/* Ruta protegida — solo administradores */}
        <Route
          path="admin-no-eco"
          element={
            <ProtectedRoute requireAdmin>
              <AdministracionNoEco />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default AppRoutes;