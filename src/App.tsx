import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/layout/AppShell";
import Index from "./pages/Index";
import Ontology from "./pages/Ontology";
import NotFound from "./pages/NotFound";
import Login from "./pages/auth/Login";
import Dashboard from "./pages/dashboard/Dashboard";
import ProjectOverview from "./pages/project/ProjectOverview";
import WorkPackageList from "./pages/work-packages/WorkPackageList";
import WorkPackageDetail from "./pages/work-packages/WorkPackageDetail";
import InspectionList from "./pages/inspections/InspectionList";
import DefectList from "./pages/defects/DefectList";
import DefectDetail from "./pages/defects/DefectDetail";
import ChangeOrderList from "./pages/change-orders/ChangeOrderList";
import ApprovalQueue from "./pages/approvals/ApprovalQueue";
import DocumentLibrary from "./pages/documents/DocumentLibrary";
import TeamView from "./pages/team/TeamView";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/ontology" element={<Ontology />} />
              <Route path="/login" element={<Login />} />
              <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
              <Route path="/app/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/app/project" element={<ProtectedRoute><ProjectOverview /></ProtectedRoute>} />
              <Route path="/app/work-packages" element={<ProtectedRoute><WorkPackageList /></ProtectedRoute>} />
              <Route path="/app/work-packages/:id" element={<ProtectedRoute><WorkPackageDetail /></ProtectedRoute>} />
              <Route path="/app/inspections" element={<ProtectedRoute><InspectionList /></ProtectedRoute>} />
              <Route path="/app/defects" element={<ProtectedRoute><DefectList /></ProtectedRoute>} />
              <Route path="/app/defects/:id" element={<ProtectedRoute><DefectDetail /></ProtectedRoute>} />
              <Route path="/app/change-orders" element={<ProtectedRoute><ChangeOrderList /></ProtectedRoute>} />
              <Route path="/app/approvals" element={<ProtectedRoute><ApprovalQueue /></ProtectedRoute>} />
              <Route path="/app/documents" element={<ProtectedRoute><DocumentLibrary /></ProtectedRoute>} />
              <Route path="/app/team" element={<ProtectedRoute><TeamView /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
