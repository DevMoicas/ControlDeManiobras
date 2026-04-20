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
    <div className="home-container">
      <div className="buttons-grid">
        <button onClick={() => navigate('maniobras')}>MANIOBRAS</button>
        <button onClick={() => navigate('gastos-efectivo')}>GASTOS EFECTIVO</button>
        <button onClick={() => navigate('vacios')}>VACIOS</button>
        <button onClick={() => navigate('no-eco')}>NO. ECO</button>
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