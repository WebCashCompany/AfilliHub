// src/App.tsx - COM PERSISTÊNCIA GLOBAL
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PersistenceProvider } from "@/contexts/PersistenceContext"; // ✅ NOVO
import { DashboardProvider } from "@/contexts/DashboardContext";
import { WhatsAppProvider } from "@/contexts/WhatsAppContext";
import { DashboardLayout } from "@/layouts/DashboardLayout";
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <PersistenceProvider> {/* ✅ NOVO - Envolve tudo */}
        <DashboardProvider>
          <WhatsAppProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
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
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </WhatsAppProvider>
        </DashboardProvider>
      </PersistenceProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;