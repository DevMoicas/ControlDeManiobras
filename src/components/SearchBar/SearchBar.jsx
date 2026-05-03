import { Search } from 'lucide-react';

export default function SearchBar({ value, onChange }) {
  return (
    <div className="w-full flex justify-center mb-4">
      <div className="relative w-11/12 md:w-2/3">
        
        {/* Icono */}
        <Search
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500"
          size={20}
        />

        {/* Input */}
        <input
          type="text"
          placeholder="Busqueda"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}