import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer
} from "recharts";
import axios from "axios";
import "./AdministracionGastos.css";

export default function DashboardGastos() {
  const [data, setData] = useState([]);

  useEffect(() => {
    axios.get("http://127.0.0.1:8000/api/gastos/")
      .then(res => setData(res.data))
      .catch(err => console.error(err));
  }, []);

  // 🔹 Formato moneda MXN
  const formatCurrency = (value) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN"
    }).format(value);

  // 🔷 KPIs
  const kpis = useMemo(() => {
    if (!data.length) {
      return { totalGastos: 0, totalEntregado: 0, promedioGasto: 0, balance: 0 };
    }

    const totalGastos = data.reduce(
      (acc, item) => acc + (Number(item.gastos_totales) || 0), 0
    );

    const totalEntregado = data.reduce(
      (acc, item) => acc + (Number(item.entregado) || 0), 0
    );

    const promedioGasto = totalGastos / data.length;
    const balance = totalEntregado - totalGastos;

    return { totalGastos, totalEntregado, promedioGasto, balance };
  }, [data]);

  // 🔷 Datos gráficas
  const dataComparacion = useMemo(() => {
    return data.map(item => ({
      fecha: item.fecha_entrega_mercancia,
      entregado: Number(item.entregado) || 0,
      gastos: Number(item.gastos_totales) || 0
    }));
  }, [data]);

  const dataCasetas = useMemo(() => {
    return data.map(item => ({
      fecha: item.fecha_entrega_mercancia,
      ida: Number(item.casetas_ida) || 0,
      regreso: Number(item.casetas_regreso) || 0
    }));
  }, [data]);

  const dataTiempo = useMemo(() => {
    const grouped = {};

    data.forEach(item => {
      const fecha = item.fecha_entrega_mercancia;
      const gasto = Number(item.gastos_totales) || 0;

      if (!grouped[fecha]) grouped[fecha] = 0;
      grouped[fecha] += gasto;
    });

    return Object.keys(grouped).map(fecha => ({
      fecha,
      gastos: grouped[fecha]
    }));
  }, [data]);

  return (
    <div className="gastos-container">

      <h1 className="gastos-title">Dashboard de Gastos</h1>

      {/* 🔥 KPIs */}
      <div className="kpi-grid">

        <div className="kpi-card">
          <p>Total Gastos</p>
          <h3>{formatCurrency(kpis.totalGastos)}</h3>
        </div>

        <div className="kpi-card">
          <p>Total Entregado</p>
          <h3>{formatCurrency(kpis.totalEntregado)}</h3>
        </div>

        <div className="kpi-card">
          <p>Promedio por Viaje</p>
          <h3>{formatCurrency(kpis.promedioGasto)}</h3>
        </div>

        <div className={`kpi-card ${kpis.balance >= 0 ? "positivo" : "negativo"}`}>
          <p>Balance</p>
          <h3>{formatCurrency(kpis.balance)}</h3>
        </div>

      </div>

      {/* 🔷 Card 1 */}
      <div className="card">
        <div className="card-header">
          <h2>Entregado vs Gastos</h2>
          <p>Detecta diferencias entre lo entregado y lo gastado.</p>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dataComparacion}>
            <CartesianGrid stroke="#e5e7eb" />
            <XAxis dataKey="fecha" />
            <YAxis />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "none",
                boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
              }}
            />
            <Legend />
            <Bar dataKey="entregado" fill="#3b82f6" name="Entregado" />
            <Bar dataKey="gastos" fill="#ef4444" name="Gastos" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 🔷 Card 2 */}
      <div className="card">
        <div className="card-header">
          <h2>Casetas Ida vs Regreso</h2>
          <p>Comparación de costos por trayecto.</p>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dataCasetas}>
            <CartesianGrid stroke="#e5e7eb" />
            <XAxis dataKey="fecha" />
            <YAxis />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "none",
                boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
              }}
            />
            <Legend />
            <Bar dataKey="ida" fill="#10b981" name="Ida" />
            <Bar dataKey="regreso" fill="#f59e0b" name="Regreso" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 🔷 Card 3 */}
      <div className="card">
        <div className="card-header">
          <h2>Gastos en el Tiempo</h2>
          <p>Evolución de gastos acumulados.</p>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dataTiempo}>
            <CartesianGrid stroke="#e5e7eb" />
            <XAxis dataKey="fecha" />
            <YAxis />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "none",
                boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
              }}
            />
            <Line
              type="monotone"
              dataKey="gastos"
              stroke="#6366f1"
              strokeWidth={3}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}