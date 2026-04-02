import { useState, useEffect } from "react";
import "./NoEcoPage.css";

export default function NoEcoPage() {
  const [vista, setVista] = useState("tractos");
  const [data, setData] = useState([]);

  // 🔥 Fetch dinámico según vista
  useEffect(() => {
    fetch(`http://localhost:3001/${vista}`)
      .then(res => res.json())
      .then(res => setData(res))
      .catch(err => console.error(err));
  }, [vista]);

  return (
    <div className="noeco-container">
      <h1 className="noeco-title">NO. ECO</h1>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-button ${vista === "tractos" ? "active" : ""}`}
          onClick={() => setVista("tractos")}
        >
          Tractos
        </button>

        <button
          className={`tab-button ${vista === "remolques" ? "active" : ""}`}
          onClick={() => setVista("remolques")}
        >
          Remolques
        </button>

        <button
          className={`tab-button ${vista === "choferes" ? "active" : ""}`}
          onClick={() => setVista("choferes")}
        >
          Choferes
        </button>
      </div>

      {/* Tabla */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              {data.length > 0 &&
                Object.keys(data[0]).map((key) => (
                  <th key={key}>{key}</th>
                ))}
            </tr>
          </thead>

          <tbody>
            {data.map((item, index) => (
              <tr key={index}>
                {Object.values(item).map((val, i) => (
                  <td key={i}>{val}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}