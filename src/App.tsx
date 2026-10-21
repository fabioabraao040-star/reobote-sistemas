/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute.tsx';
import Layout from './components/Layout.tsx';
import Login from './components/Login.tsx';
import Dashboard from './components/Dashboard.tsx';
import Cadastro from './pages/Cadastro.tsx';
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
          {/* Tela 1: Login */}
          <Route path="/" element={<Login />} />

          {/* Tela 2: Cadastro de Usuário */}
          <Route path="/cadastro" element={<Cadastro />} />

          {/* Telas Autenticadas (3 a 8) */}
          <Route element={<Layout />}>
            {/* Tela 3: Dashboard */}
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />

            {/* Tela 4: Atendimento WhatsApp */}
            <Route 
              path="/atendimento" 
              element={
                <ProtectedRoute>
                  <AtendimentoWhatsApp />
                </ProtectedRoute>
              } 
            />

            {/* Tela 5: Contatos */}
            <Route 
              path="/contatos" 
              element={
                <ProtectedRoute>
                  <Contatos />
                </ProtectedRoute>
              } 
            />

            {/* Tela 6: Atendentes */}
            <Route 
              path="/atendentes" 
              element={
                <ProtectedRoute>
                  <Atendentes />
                </ProtectedRoute>
              } 
            />

            {/* Tela 7: Automações */}
            <Route 
              path="/automacoes" 
              element={
                <ProtectedRoute>
                  <Automacoes />
                </ProtectedRoute>
              } 
            />

            {/* Tela 8: Mensagens Prontas */}
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
