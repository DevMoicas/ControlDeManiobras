import { FileText } from "lucide-react";
import "./DocumentosViajePage.css";

export default function DocumentosViajePage() {
  return (
    <div className="documentos-container">
      <div className="documentos-header">
        <h1 className="documentos-title">
          <FileText size={36} color="#2563EB" />
          DOCUMENTOS DE VIAJE
        </h1>
      </div>
    </div>
  );
}
