import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import './App.css';

function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-container">
      <div className="buttons-grid">
        <button onClick={() => navigate('/maniobras')}>MANIOBRAS</button>
        <button onClick={() => navigate('/gastos-efectivo')}>GASTOS EFECTIVO</button>
        <button onClick={() => navigate('/vacios')}>VACIOS</button>
        <button onClick={() => navigate('/no-eco')}>NO. ECO</button>
      </div>
    </div>
  );
}

function BlankPage({ title }) {
  return (
    <div className="blank-page"></div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/maniobras" element={<BlankPage title="MANIOBRAS" />} />
        <Route path="/gastos-efectivo" element={<BlankPage title="GASTOS EFECTIVO" />} />
        <Route path="/vacios" element={<BlankPage title="VACIOS" />} />
        <Route path="/no-eco" element={<BlankPage title="NO. ECO" />} />
      </Routes>
    </Router>
  );
}

export default App;
