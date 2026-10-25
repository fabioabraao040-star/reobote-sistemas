import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute.tsx';
import Layout from './components/Layout.tsx';
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
          {/* Tela inicial: Login direto (tela única de autenticação) */}
          <Route path="/" element={<Login />} />

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
                <ProtectedRoute requiredRole="admin">
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/atendimento"
              element={
                <ProtectedRoute requiredRole="user">
                  <AtendimentoWhatsApp />
                </ProtectedRoute>
              }
            />

            <Route
              path="/contatos"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Contatos />
                </ProtectedRoute>
              }
            />

            <Route
              path="/atendentes"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Atendentes />
                </ProtectedRoute>
              }
            />

            <Route
              path="/automacoes"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Automacoes />
                </ProtectedRoute>
              }
            />

            <Route
              path="/mensagens"
              element={
                <ProtectedRoute requiredRole="admin">
                  <MensagensProntas />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Fallback: redireciona rotas não encontradas para login */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
