// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PersistenceProvider } from "@/contexts/PersistenceContext.tsx";
import { UserPreferencesProvider } from "@/contexts/UserPreferencesContext.tsx";
import { DashboardProvider } from "@/contexts/DashboardContext.tsx";
import { WhatsAppProvider } from "@/contexts/WhatsAppContext.tsx";
import { AuthProvider } from "@/contexts/AuthContext.tsx";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardHome } from "@/pages/DashboardHome";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { AutomationPage } from "@/pages/AutomationPage";
import { ProductsPage } from "@/pages/ProductsPage";
import { DistributionPage } from "@/pages/DistributionPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { GoalsPage } from "@/pages/GoalsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TrashPage } from "@/pages/TrashPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Inner app precisa estar dentro do BrowserRouter para o AuthProvider
// poder usar hooks de rota se necessário
function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        {/* Pública */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protegidas — ProtectedRoute renderiza o DashboardLayout via Outlet */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/automation" element={<AutomationPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/distribution" element={<DistributionPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/trash" element={<TrashPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <PersistenceProvider>
        <UserPreferencesProvider>
          <DashboardProvider>
            <WhatsAppProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </WhatsAppProvider>
          </DashboardProvider>
        </UserPreferencesProvider>
      </PersistenceProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;