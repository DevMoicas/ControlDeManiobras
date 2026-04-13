import { Routes, Route, useNavigate } from 'react-router-dom';
import './App.css';
import NoEcoPage from './pages/NoEcoPage';
import ManiobrasPage from './pages/ManiobrasPage';

// Componente Home (El panel de botones)
function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-container">
      <div className="buttons-grid">
        {/* Usamos las rutas relativas para que coincidan con el index.js */}
        <button onClick={() => navigate('maniobras')}>MANIOBRAS</button>
        <button onClick={() => navigate('gastos-efectivo')}>GASTOS EFECTIVO</button>
        <button onClick={() => navigate('vacios')}>VACIOS</button>
        <button onClick={() => navigate('no-eco')}>NO. ECO</button>
      </div>
    </div>
  );
}

// Componente para páginas vacías
function BlankPage({ title }) {
  return (
    <div className="blank-page">
      <h1 style={{ color: 'white', textAlign: 'center' }}>{title}</h1>
    </div>
  );
}

// COMPONENTE PRINCIPAL APP
// IMPORTANTE: Quitamos la etiqueta <Router> de aquí porque ya está en index.js
// COMPONENTE PRINCIPAL APP
function App() {
  return (
    // Quitamos la etiqueta <Route> de afuera, solo dejamos <Routes>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/maniobras" element={<ManiobrasPage />} />
      <Route path="/gastos-efectivo" element={<BlankPage title="GASTOS EFECTIVO" />} />
      <Route path="/vacios" element={<BlankPage title="VACIOS" />} />
      <Route path="/no-eco" element={<NoEcoPage />} />
    </Routes>
  );
}

export default App; 