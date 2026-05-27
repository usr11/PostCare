import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./contexts/AuthContext";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import PatientChat from "./pages/PatientChat";
import PatientDetail from "./pages/PatientDetail";

const CLINIC_ROLES = new Set(["clinician", "admin", "quality_lead", "admissions"]);

function RequireRole({ role, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (role === "patient") {
    if (sessionStorage.getItem("role") !== "patient") {
      return <Navigate to="/login" replace />;
    }
    return children;
  }

  if (role === "clinic") {
    if (!user || !CLINIC_ROLES.has(user.role)) {
      return <Navigate to="/login" replace />;
    }
    return children;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/chat"
          element={
            <RequireRole role="patient">
              <PatientChat />
            </RequireRole>
          }
        />
        <Route
          element={
            <RequireRole role="clinic">
              <Layout />
            </RequireRole>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/patient/:id" element={<PatientDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
