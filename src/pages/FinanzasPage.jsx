import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bitcoin, UserCircle, CirclePlus, Users, Receipt, Landmark, ChevronRight, Wallet, Percent,
  ChartColumn, CalendarClock, ChartPie, Gauge, LayoutDashboard } from "lucide-react";
import { apiClient } from "../api/apiClient";
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
  { to: "/home/finanzas/cuentas-por-pagar", icon: Wallet,  title: "Cuentas por pagar", desc: "Gastos fijos, fletes y locales de terceros, y mantenimiento." },
  { to: "/home/finanzas/gastos-financieros", icon: Percent, title: "Gastos financieros", desc: "Intereses, impuestos y comisiones de cada mes." },
  { to: "/home/finanzas/estados-cuenta", icon: Landmark,   title: "Estados de cuenta", desc: "Saldos y movimientos por cuenta." },
  // Dashboards (Fase 6): los cuatro grupos de la P44 y todos juntos (P41).
  { to: "/home/finanzas/tablero/ventas-gastos-utilidad", icon: ChartColumn, title: "Ventas, gastos y utilidad", desc: "Ventas, costo de ventas y utilidad de cada mes." },
  { to: "/home/finanzas/tablero/cobranza-pagos", icon: CalendarClock, title: "Cobranza y pagos", desc: "Cuentas por cobrar, cobranza semanal y cuentas por pagar." },
  { to: "/home/finanzas/tablero/clientes-servicios", icon: ChartPie, title: "Clientes y servicios", desc: "Ventas por cliente y por tipo de servicio." },
  { to: "/home/finanzas/tablero/costos-rentabilidad", icon: Gauge, title: "Costos y rentabilidad", desc: "Costo por unidad y rentabilidad por operación." },
  { to: "/home/finanzas/tablero/todos", icon: LayoutDashboard, title: "Dashboards", desc: "Todos los dashboards juntos, para comparar." },
];

const POR_CARGO = new Set([
  "/home/finanzas/facturacion",
  "/home/finanzas/cuentas-por-pagar",
  "/home/finanzas/gastos-financieros",
]);
const porCargo = (to) => POR_CARGO.has(to) || to.startsWith("/home/finanzas/tablero/");

export default function FinanzasPage() {
  const navigate = useNavigate();
  // Estas tres se abren por cargo, y eso lo sabe el backend: hasta que responda
  // no salen, para no enseñar una puerta que da 403.
  const [verFinanzas, setVerFinanzas] = useState(false);
  useEffect(() => {
    apiClient.get("/facturas/acceso/")
      .then((a) => setVerFinanzas(Boolean(a?.ver)))
      .catch(() => setVerFinanzas(false));
  }, []);
  const modulos = MODULOS.filter((m) => !porCargo(m.to) || verFinanzas);

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
          {modulos.map(({ to, icon: Icon, title, desc }, i) => (
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
