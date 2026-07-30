import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { LanguageProvider } from "@/lib/i18n";
import Index from "./pages/Index";

// The public landing page (Index) is the only eagerly-loaded route. Everything
// behind /app plus the standalone pages are split out, so a visitor to the
// marketing site never downloads the authenticated application.
const AppShell = lazy(() => import("@/components/layout/AppShell"));
const Ontology = lazy(() => import("./pages/Ontology"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Login = lazy(() => import("./pages/auth/Login"));
const AuthCallback = lazy(() => import("./pages/auth/AuthCallback"));
const Dashboard = lazy(() => import("./pages/dashboard/Dashboard"));
const ProjectOverview = lazy(() => import("./pages/project/ProjectOverview"));
const WorkPackageList = lazy(() => import("./pages/work-packages/WorkPackageList"));
const WorkPackageDetail = lazy(() => import("./pages/work-packages/WorkPackageDetail"));
const InspectionList = lazy(() => import("./pages/inspections/InspectionList"));
const DefectList = lazy(() => import("./pages/defects/DefectList"));
const DefectDetail = lazy(() => import("./pages/defects/DefectDetail"));
const ChangeOrderList = lazy(() => import("./pages/change-orders/ChangeOrderList"));
const ChangeOrderDetail = lazy(() => import("./pages/change-orders/ChangeOrderDetail"));
const ApprovalQueue = lazy(() => import("./pages/approvals/ApprovalQueue"));
const DocumentLibrary = lazy(() => import("./pages/documents/DocumentLibrary"));
const TeamView = lazy(() => import("./pages/team/TeamView"));
const MessagesPage = lazy(() => import("./pages/messages/MessagesPage"));
const AgentConsole = lazy(() => import("./pages/agent/AgentConsole"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Project data changes on human timescales and realtime sync pushes its
      // own invalidations, so don't refetch on every window focus.
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          {/* Project selection depends on who is signed in, so it nests inside
              auth. Language does not depend on either, and wraps both so the
              public pages can translate too. */}
          <ProjectProvider>
          <BrowserRouter>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/ontology" element={<Ontology />} />
                <Route path="/login" element={<Login />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
                <Route path="/app/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/app/project" element={<ProtectedRoute><ProjectOverview /></ProtectedRoute>} />
                <Route path="/app/work-packages" element={<ProtectedRoute><WorkPackageList /></ProtectedRoute>} />
                <Route path="/app/work-packages/:id" element={<ProtectedRoute><WorkPackageDetail /></ProtectedRoute>} />
                <Route path="/app/inspections" element={<ProtectedRoute><InspectionList /></ProtectedRoute>} />
                <Route path="/app/defects" element={<ProtectedRoute><DefectList /></ProtectedRoute>} />
                <Route path="/app/defects/:id" element={<ProtectedRoute><DefectDetail /></ProtectedRoute>} />
                <Route path="/app/change-orders" element={<ProtectedRoute><ChangeOrderList /></ProtectedRoute>} />
                <Route path="/app/change-orders/:id" element={<ProtectedRoute><ChangeOrderDetail /></ProtectedRoute>} />
                <Route path="/app/approvals" element={<ProtectedRoute><ApprovalQueue /></ProtectedRoute>} />
                <Route path="/app/documents" element={<ProtectedRoute><DocumentLibrary /></ProtectedRoute>} />
                <Route path="/app/team" element={<ProtectedRoute><TeamView /></ProtectedRoute>} />
                <Route path="/app/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                <Route path="/app/agent" element={<ProtectedRoute><AgentConsole /></ProtectedRoute>} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          </ProjectProvider>
        </AuthProvider>
      </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
