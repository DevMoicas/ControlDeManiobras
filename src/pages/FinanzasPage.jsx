import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bitcoin, UserCircle, CirclePlus, Users, Receipt, Landmark, ChevronRight, Wallet, Percent,
  LayoutDashboard, HandCoins, ArrowLeftRight, History } from "lucide-react";
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
  // Facturación, Estados de cuenta y Compensación van juntas (usuario, 2026-10-22).
  { to: "/home/finanzas/cuentas-por-cobrar", icon: HandCoins, title: "Cuentas por cobrar", desc: "Facturación, estados de cuenta, compensación e historial de pagos." },
  { to: "/home/finanzas/cuentas-por-pagar", icon: Wallet,  title: "Cuentas por pagar", desc: "Gastos fijos, fletes y locales de terceros, y mantenimiento." },
  { to: "/home/finanzas/gastos-financieros", icon: Percent, title: "Gastos financieros", desc: "Intereses, impuestos y comisiones de cada mes." },
  // Dashboards (Fase 6): los nueve en una sola tarjeta. Las páginas por grupo
  // se quitaron por repetir lo mismo sin capturar nada (usuario, 2026-09-30).
  { to: "/home/finanzas/dashboards", icon: LayoutDashboard, title: "Dashboards", desc: "Ventas, gastos, utilidad, cobranza, pagos, clientes, servicios, costos y rentabilidad." },
];

// Submenú de Finanzas: mismo armazón que el hub, con sus páginas.
const CUENTAS_POR_COBRAR = [
  { to: "/home/finanzas/cuentas-por-cobrar/facturacion",    icon: Receipt,  title: "Facturación",       desc: "Facturas emitidas y su seguimiento." },
  { to: "/home/finanzas/cuentas-por-cobrar/estados-cuenta", icon: Landmark, title: "Estados de cuenta", desc: "Saldos y movimientos por cuenta." },
  { to: "/home/finanzas/cuentas-por-cobrar/compensacion",   icon: ArrowLeftRight, title: "Compensación", desc: "Registra los pagos de clientes y abónalos a sus facturas." },
  { to: "/home/finanzas/cuentas-por-cobrar/historial-pagos", icon: History, title: "Historial de pagos", desc: "Todos los pagos guardados y a qué facturas se abonaron." },
];

export function CuentasPorCobrarPage() {
  return <Hub titulo="Cuentas por cobrar" icono={HandCoins} modulos={CUENTAS_POR_COBRAR} />;
}

export default function FinanzasPage() {
  return <Hub titulo="Finanzas" icono={Bitcoin} modulos={MODULOS} />;
}

function Hub({ titulo, icono: Icono, modulos: todos }) {
  const navigate = useNavigate();
  // Todo el módulo es de admin y cargos de Finanzas (usuario, 2026-10-14), y eso
  // lo sabe el backend: hasta que responda no sale ninguna tarjeta.
  const [verFinanzas, setVerFinanzas] = useState(false);
  useEffect(() => {
    apiClient.get("/facturas/acceso/")
      .then((a) => setVerFinanzas(Boolean(a?.ver)))
      .catch(() => setVerFinanzas(false));
  }, []);
  const modulos = verFinanzas ? todos : [];

  return (
    <div className="home-page finanzas-page">

      <header className="home-topbar">
        <div className="home-brand">
          <span className="home-brand-mark"><Icono size={20} /></span>
          <span className="home-brand-name">{titulo}</span>
        </div>
        <button className="home-profile" onClick={() => navigate("/home/perfil")} title="Ver perfil">
          <UserCircle size={26} />
        </button>
      </header>

      <main className="home-main">
        <div className="home-head">
          <p className="fz-eyebrow">Control de Maniobras</p>
          <h1>{titulo}</h1>
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
