import { useNavigate } from "react-router-dom";
import { Bitcoin, UserCircle, CirclePlus, Users, Receipt, Landmark, ChevronRight } from "lucide-react";
import "./FinanzasPage.css";

// Mismo contrato que HOME_MODULES en App.jsx: la rejilla de tarjetas es la de la
// Home (clases .home-page/.grid/.card de App.css). Aquí solo se reutiliza y se
// agranda con .finanzas-page — cuatro tarjetas piden más aire que ocho.
// Rutas absolutas y no relativas: toda la app cuelga de /home/* (ver index.jsx)
// y así no hay que razonar sobre cómo resuelve React Router un "costos-extra"
// suelto según dónde esté montada la ruta padre.
const MODULOS = [
  { to: "/home/finanzas/costos-extra",   icon: CirclePlus, title: "Costos extra",      desc: "Da de alta los movimientos que se cobran aparte y su importe." },
  { to: "/home/finanzas/nomina",         icon: Users,      title: "Nómina",            desc: "Sueldos y pagos al personal." },
  { to: "/home/finanzas/facturacion",    icon: Receipt,    title: "Facturación",       desc: "Facturas emitidas y su seguimiento." },
  { to: "/home/finanzas/estados-cuenta", icon: Landmark,   title: "Estados de cuenta", desc: "Saldos y movimientos por cuenta." },
];

export default function FinanzasPage() {
  const navigate = useNavigate();

  return (
    <div className="home-page finanzas-page">

      <header className="home-topbar">
        <div className="home-brand">
          <span className="home-brand-mark"><Bitcoin size={20} /></span>
          <span className="home-brand-name">Finanzas</span>
        </div>
        <button className="home-profile" onClick={() => navigate("/home/perfil")} title="Ver perfil">
          <UserCircle size={26} />
        </button>
      </header>

      <main className="home-main">
        <div className="home-head">
          <p className="fz-eyebrow">Control de Maniobras</p>
          <h1>Finanzas</h1>
          <p>Elige un módulo para comenzar.</p>
        </div>

        <div className="grid">
          {MODULOS.map(({ to, icon: Icon, title, desc }, i) => (
            <button
              key={to}
              className="card"
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => navigate(to)}
            >
              <span className="card-icon"><Icon size={52} /></span>
              <span className="card-title">{title}</span>
              <span className="card-desc">{desc}</span>
              <span className="card-go"><ChevronRight size={20} /></span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
