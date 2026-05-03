import { useEffect, useState, useRef} from "react";
import { useNavigate } from "react-router-dom"; // 👈 AGREGADO

import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

export default function AdministracionNoEco() {

  const navigate = useNavigate(); // 👈 AGREGADO

  const [conteo, setConteo] = useState({
    tractos: 0,
    remolques: 0,
    choferes: 0,
  });

  useEffect(() => {

  const cache = sessionStorage.getItem("adminConteo");
  if (cache) {
    setConteo(JSON.parse(cache));
    return;
  }

  const fetchSafe = async (url) => {
    const res = await fetch(url);

    if (!res.ok) {
      if (res.status === 429) return [];
      throw new Error("Error");
    }

    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  };

  const fetchData = async () => {
    const tractos = await fetchSafe("http://127.0.0.1:8000/api/tractos/");
    const remolques = await fetchSafe("http://127.0.0.1:8000/api/remolques/");
    const choferes = await fetchSafe("http://127.0.0.1:8000/api/choferes/");

    const nuevoConteo = {
      tractos: tractos.length,
      remolques: remolques.length,
      choferes: choferes.length,
    };

    sessionStorage.setItem("adminConteo", JSON.stringify(nuevoConteo));
    setConteo(nuevoConteo);
  };

  fetchData();
}, []);

  const data = {
    labels: ["Tractos", "Remolques", "Choferes"],
    datasets: [
      {
        label: "Cantidad de registros",
        data: [
          conteo.tractos,
          conteo.remolques,
          conteo.choferes,
        ],
        backgroundColor: [
          "rgba(54, 162, 235, 0.7)",
          "rgba(75, 192, 192, 0.7)",
          "rgba(255, 159, 64, 0.7)"
        ],
        borderColor: [
          "rgba(54, 162, 235, 1)",
          "rgba(75, 192, 192, 1)",
          "rgba(255, 159, 64, 1)"
        ],
        borderWidth: 1
      },
    ],
  };

  const options = {
    plugins: {
      legend: {
        display: true,
        onClick: null
      }
    }
  };

  return (
    <div>

      {/* HEADER BIEN ACOMODADO */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-100">
        
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <span className="text-2xl mt-10">📊</span>
          <span span className="text-2xl mt-10">Administración NoEco</span>
        </h2>

        {/* BOTÓN REGRESAR */}
        <button
          onClick={() => navigate("/home/no-eco")}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Regresar
        </button>

      </div>

      <div className="p-6">

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          
          <div className="bg-gray-100 p-4 rounded-xl text-center">
            <p className="text-gray-500">Tractos</p>
            <p className="text-2xl font-bold">{conteo.tractos}</p>
          </div>

          <div className="bg-gray-100 p-4 rounded-xl text-center">
            <p className="text-gray-500">Remolques</p>
            <p className="text-2xl font-bold">{conteo.remolques}</p>
          </div>

          <div className="bg-gray-100 p-4 rounded-xl text-center">
            <p className="text-gray-500">Choferes</p>
            <p className="text-2xl font-bold">{conteo.choferes}</p>
          </div>

        </div>

        {/* Gráfica */}
        <div className="bg-white p-6 rounded-xl shadow">
          <Bar data={data} options={options} />
        </div>

      </div>
    </div>
  );
}