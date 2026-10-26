import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import MasterAdminDashboard from './pages/MasterAdminDashboard.tsx';

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
            {/* ADM MASTER - Painel exclusivo com configuração Meta WhatsApp */}
            <Route
              path="/master-admin"
              element={
                <ProtectedRoute allowedRoles={['master_admin']}>
                  <MasterAdminDashboard />
                </ProtectedRoute>
              }
            />

            {/* ADM - Painel administrativo da empresa (sem configuração Meta) */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={['admin', 'user']}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            {/* USUÁRIO / ATENDENTE - Painel de atendimento */}
            <Route
              path="/atendimento"
              element={
                <ProtectedRoute allowedRoles={['admin', 'user']}>
                  <AtendimentoWhatsApp />
                </ProtectedRoute>
              }
            />

            <Route
              path="/contatos"
              element={
                <ProtectedRoute allowedRoles={['admin', 'user']}>
                  <Contatos />
                </ProtectedRoute>
              }
            />

            <Route
              path="/atendentes"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Atendentes />
                </ProtectedRoute>
              }
            />

            <Route
              path="/automacoes"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Automacoes />
                </ProtectedRoute>
              }
            />

            <Route
              path="/mensagens"
              element={
                <ProtectedRoute allowedRoles={['admin', 'user']}>
                  <MensagensProntas />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Fallback: redireciona rotas não encontradas para landing page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}