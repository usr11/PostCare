import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

function StatCard({ label, value, color = "text-gray-900" }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [patients, setPatients] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, p, a] = await Promise.all([
          api.getStats(),
          api.getPatients(),
          api.getAlerts(),
        ]);
        setStats(s);
        setPatients(p);
        setAlerts(a);
      } catch (err) {
        console.error("Error loading dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleResolve(alertId) {
    try {
      await api.resolveAlert(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      setStats((prev) =>
        prev ? { ...prev, active_alerts: prev.active_alerts - 1 } : prev
      );
    } catch (err) {
      console.error("Error resolving alert:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Panel de Control</h1>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Pacientes" value={stats.total_patients} />
          <StatCard
            label="Pacientes Activos"
            value={stats.active_patients}
            color="text-primary"
          />
          <StatCard
            label="Alertas Activas"
            value={stats.active_alerts}
            color="text-danger"
          />
          <StatCard
            label="Cuestionarios Completos"
            value={stats.completed_records}
            color="text-success"
          />
        </div>
      )}

      {alerts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Alertas Activas
          </h2>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`bg-white rounded-xl shadow-sm border-l-4 p-4 flex items-center justify-between ${
                  alert.severity === "critical"
                    ? "border-l-danger"
                    : "border-l-warning"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        alert.alert_type === "sos"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {alert.alert_type === "sos" ? "S.O.S." : "Alerta"}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {alert.patient_name}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{alert.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(alert.created_at).toLocaleString("es-CO")}
                  </p>
                </div>
                <button
                  onClick={() => handleResolve(alert.id)}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Resolver
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pacientes</h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Nombre
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Documento
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Cirugía
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Estado
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {p.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {p.document_number}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {p.surgery_type}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        p.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {p.status === "active" ? "Activo" : "Pendiente"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      to={`/dashboard/patient/${p.id}`}
                      className="text-sm text-primary hover:text-primary-dark font-medium"
                    >
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
