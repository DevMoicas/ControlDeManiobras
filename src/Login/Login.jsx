import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';


const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuthContext();
  const [username, setUsuario] = useState('');
  const [password, setPassword] = useState('');

   const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(username, password); // <- reemplaza el fetch + localStorage
      navigate('/home');
    } catch (err) {
      console.log("Error en login:", err.message);
    }
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb]">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-[#2563eb]">Control de Maniobras</h2>
          <p className="text-gray-500 mt-2">Inicio de sesión</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <input 
              type="text"
              required
              value={username}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-[#2563eb] transition-all"
              placeholder="Introduce tu usuario"
              onChange={(e) => setUsuario(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input 
              type="password"
              required
              value={password}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-[#2563eb] transition-all"
              placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-[#2563eb] text-white py-3 px-4 rounded-xl font-bold hover:bg-blue-700 hover:-translate-y-[2px] active:scale-95 transition-all duration-300 shadow-md hover:shadow-lg"
          >
            Iniciar sesión
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;