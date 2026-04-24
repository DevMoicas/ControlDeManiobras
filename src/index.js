import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './Index.css';
import App from './App';
import LoginPage from './Login/Login';
import { AuthProvider } from './context/AuthContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
     <AuthProvider>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/home/*" element={<App />} />
      </Routes>
     </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);