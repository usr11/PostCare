import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import PatientChat from "./pages/PatientChat";
import PatientDetail from "./pages/PatientDetail";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<PatientChat />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/patient/:id" element={<PatientDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
