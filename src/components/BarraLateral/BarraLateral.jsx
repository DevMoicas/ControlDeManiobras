import { useEffect, useId, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home, Truck, Route as RouteIcon, Container, CircleDollarSign, Wallet, Hash, FileText,
  ClipboardList, TowerControl, Bitcoin, Receipt, HandCoins, Landmark, ArrowLeftRight,
  History, CirclePlus, Users, Percent, LayoutDashboard, Wrench, Library, ListChecks,
  UserCircle, ChevronDown, Menu, Coins, Tag, Banknote,
} from 'lucide-react';
import './BarraLateral.css';

// Árbol de navegación (usuario, 2026-11-19): Viajes, Finanzas, Dashboards y
// Mantenimiento; el resto de módulos se reparte en el grupo que le toca.
// `ver` decide si sale; sin `to` es un grupo que se despliega.
function arbol({ verFolios, verFinanzas, isAdmin }) {
  return [
    { label: 'Inicio', icon: Home, to: '/home', end: true },
    {
      label: 'Viajes', icon: RouteIcon, hijos: [
        { label: 'Control de Maniobras', icon: Truck, to: '/home/maniobras' },
        { label: 'Vacíos', icon: Container, to: '/home/vacios' },
        {
          label: 'Gastos', icon: Coins, hijos: [
            { label: 'Gastos de viaje', icon: CircleDollarSign, to: '/home/gastos-efectivo' },
            { label: 'Gastos TAG', icon: Tag, to: '/home/gastos-tag' },
            { label: 'Gastos mantenimiento', icon: Banknote, to: '/home/gastos-mantenimiento' },
          ],
        },
        { label: 'Movimientos locales', icon: Wallet, to: '/home/movimientos-locales' },
        { label: 'Folios', icon: Hash, to: '/home/folios', ver: verFolios },
        { label: 'Documentos de viaje', icon: FileText, to: '/home/documentos-viaje' },
        { label: 'Reportes de viaje', icon: ClipboardList, to: '/home/reportes-viaje' },
        { label: 'Torre de control', icon: TowerControl, to: '/home/torre-control' },
      ],
    },
    {
      label: 'Finanzas', icon: Bitcoin, ver: verFinanzas, hijos: [
        { label: 'Facturas', icon: Receipt, to: '/home/finanzas/cuentas-por-cobrar/facturacion' },
        {
          label: 'Cuentas por cobrar', icon: HandCoins, hijos: [
            { label: 'Estados de cuenta', icon: Landmark, to: '/home/finanzas/cuentas-por-cobrar/estados-cuenta' },
            { label: 'Compensación', icon: ArrowLeftRight, to: '/home/finanzas/cuentas-por-cobrar/compensacion' },
            { label: 'Historial de pagos', icon: History, to: '/home/finanzas/cuentas-por-cobrar/historial-pagos' },
          ],
        },
        { label: 'Cuentas por pagar', icon: Wallet, to: '/home/finanzas/cuentas-por-pagar' },
        { label: 'Costos extra', icon: CirclePlus, to: '/home/finanzas/costos-extra' },
        { label: 'Nómina', icon: Users, to: '/home/finanzas/nomina', ver: isAdmin },
        { label: 'Gastos financieros', icon: Percent, to: '/home/finanzas/gastos-financieros' },
      ],
    },
    { label: 'Dashboards', icon: LayoutDashboard, to: '/home/finanzas/dashboards', ver: verFinanzas },
    { label: 'Mantenimiento', icon: Wrench, to: '/home/mantenimiento' },
    { label: 'Catálogos', icon: Library, to: '/home/catalogos' },
    { label: 'Pendientes', icon: ListChecks, to: '/home/pendientes' },
  ];
}

const visibles = (items) => items.filter((i) => i.ver !== false);
const contiene = (item, path) =>
  item.to ? path.startsWith(item.to) : visibles(item.hijos).some((h) => contiene(h, path));

function Grupo({ item, nivel }) {
  const { pathname } = useLocation();
  const id = useId();
  const activo = contiene(item, pathname);
  const [abierto, setAbierto] = useState(activo);
  // Al entrar a una página del grupo desde fuera, se abre solo.
  useEffect(() => { if (activo) setAbierto(true); }, [activo]);
  const Icon = item.icon;

  return (
    <li>
      <button
        type="button"
        className={`bl-item bl-grupo${activo ? ' bl-grupo--activo' : ''}`}
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((a) => !a)}
      >
        <Icon size={18} aria-hidden="true" />
        <span className="bl-texto">{item.label}</span>
        <ChevronDown size={16} aria-hidden="true" className="bl-chevron" />
      </button>
      <ul id={id} className="bl-lista bl-sublista" hidden={!abierto}>
        {visibles(item.hijos).map((h) => <Nodo key={h.label} item={h} nivel={nivel + 1} />)}
      </ul>
    </li>
  );
}

function Nodo({ item, nivel = 0 }) {
  if (item.hijos) return <Grupo item={item} nivel={nivel} />;
  const Icon = item.icon;
  if (item.proximamente) {
    return (
      <li>
        <span className="bl-item bl-item--off" aria-disabled="true">
          <Icon size={18} aria-hidden="true" />
          <span className="bl-texto">{item.label}</span>
          <span className="bl-pronto">Próximamente</span>
        </span>
      </li>
    );
  }
  // NavLink pone aria-current="page" en la activa; es el gancho del estilo.
  return (
    <li>
      <NavLink to={item.to} end={item.end} className="bl-item">
        <Icon size={18} aria-hidden="true" />
        <span className="bl-texto">{item.label}</span>
      </NavLink>
    </li>
  );
}

export default function BarraLateral({ verFolios, verFinanzas, isAdmin }) {
  const { pathname } = useLocation();
  const menuId = useId();
  // Solo en pantallas angostas: ahí la barra se pliega tras un botón "Menú".
  const [menuAbierto, setMenuAbierto] = useState(false);
  useEffect(() => { setMenuAbierto(false); }, [pathname]);

  return (
    <aside className="bl" aria-label="Navegación principal">
      <div className="bl-marca">
        <span className="bl-marca-icono"><Truck size={18} aria-hidden="true" /></span>
        <span className="bl-marca-nombre">Control de Maniobras</span>
        <button
          type="button"
          className="bl-menu"
          aria-expanded={menuAbierto}
          aria-controls={menuId}
          onClick={() => setMenuAbierto((a) => !a)}
        >
          <Menu size={18} aria-hidden="true" />
          <span>Menú</span>
        </button>
      </div>

      <nav id={menuId} className={`bl-nav${menuAbierto ? ' bl-nav--abierto' : ''}`} aria-label="Módulos">
        <ul className="bl-lista">
          {visibles(arbol({ verFolios, verFinanzas, isAdmin })).map((i) => <Nodo key={i.label} item={i} />)}
        </ul>
        <ul className="bl-lista bl-pie">
          <Nodo item={{ label: 'Perfil', icon: UserCircle, to: '/home/perfil' }} />
        </ul>
      </nav>
    </aside>
  );
}
