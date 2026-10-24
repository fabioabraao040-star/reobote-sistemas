import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute.tsx';
import Layout from './components/Layout.tsx';
import LandingPage from './components/LandingPage.tsx';
import Login from './components/Login.tsx';
import Cadastro from './pages/Cadastro.tsx';
import ForgotPassword from './pages/ForgotPassword.tsx';
import ResetPassword from './pages/ResetPassword.tsx';
import Dashboard from './components/Dashboard.tsx';
import AtendimentoWhatsApp from './pages/AtendimentoWhatsApp.tsx';
import Contatos from './pages/Contatos.tsx';
import Atendentes from './pages/Atendentes.tsx';
import Automacoes from './pages/Automacoes.tsx';
import MensagensProntas from './pages/MensagensProntas.tsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Tela inicial: Landing Page com seleção de perfil */}
          <Route path="/" element={<LandingPage />} />

          {/* Telas públicas (não autenticadas) */}
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Telas Autenticadas */}
          <Route element={<Layout />}>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/atendimento"
              element={
                <ProtectedRoute>
                  <AtendimentoWhatsApp />
                </ProtectedRoute>
              }
            />

            <Route
              path="/contatos"
              element={
                <ProtectedRoute>
                  <Contatos />
                </ProtectedRoute>
              }
            />

            <Route
              path="/atendentes"
              element={
                <ProtectedRoute>
                  <Atendentes />
                </ProtectedRoute>
              }
            />

            <Route
              path="/automacoes"
              element={
                <ProtectedRoute>
                  <Automacoes />
                </ProtectedRoute>
              }
            />

            <Route
              path="/mensagens"
              element={
                <ProtectedRoute>
                  <MensagensProntas />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
