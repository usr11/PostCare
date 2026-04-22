import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import PatientChat from "./pages/PatientChat";
import PatientDetail from "./pages/PatientDetail";

function RequireRole({ role, children }) {
  const current = sessionStorage.getItem("role");
  if (!current) return <Navigate to="/login" replace />;
  if (role && current !== role) return <Navigate to="/login" replace />;
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
