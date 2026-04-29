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

const BOARD_BADGE = {
  verde: "bg-green-100 text-green-700",
  amarillo: "bg-amber-100 text-amber-700",
  rojo: "bg-red-100 text-red-700",
};

const BOARD_LABEL = {
  verde: "Verde",
  amarillo: "Amarillo",
  rojo: "Rojo",
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [patients, setPatients] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolveAlert, setResolveAlert] = useState(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolveError, setResolveError] = useState("");
  const [resolving, setResolving] = useState(false);

  const clinicUser = sessionStorage.getItem("clinicUser") || "Personal clínico";

  async function reloadAll() {
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
    }
  }

  useEffect(() => {
    reloadAll().finally(() => setLoading(false));
    const interval = setInterval(reloadAll, 10000);
    return () => clearInterval(interval);
  }, []);

  function openResolve(alert) {
    setResolveAlert(alert);
    setResolveNote("");
    setResolveError("");
  }

  async function submitResolve(e) {
    e.preventDefault();
    if (!resolveAlert || !resolveNote.trim()) return;
    setResolving(true);
    setResolveError("");
    try {
      await api.resolveAlert(resolveAlert.id, {
        note: resolveNote.trim(),
        resolved_by: clinicUser,
        version: resolveAlert.version,
      });
      setAlerts((prev) => prev.filter((a) => a.id !== resolveAlert.id));
      setStats((prev) =>
        prev ? { ...prev, active_alerts: Math.max(0, prev.active_alerts - 1) } : prev
      );
      setResolveAlert(null);
      reloadAll();
    } catch (err) {
      if (err.status === 409) {
        setResolveError(
          err.error || "Otro usuario actualizó esta alerta. Recarga e intenta de nuevo."
        );
      } else {
        setResolveError(err.error || "No fue posible cerrar la alerta.");
      }
    } finally {
      setResolving(false);
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
                  onClick={() => openResolve(alert)}
                  className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                >
                  Cerrar caso
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
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Tablero
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
                          : p.status === "data_error"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {p.status === "active"
                        ? "Activo"
                        : p.status === "data_error"
                          ? "Datos por corregir"
                          : "Pendiente"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${BOARD_BADGE[p.board_status] || "bg-gray-100 text-gray-600"}`}
                    >
                      {BOARD_LABEL[p.board_status] || p.board_status}
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

      {resolveAlert && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <form
            onSubmit={submitResolve}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  resolveAlert.alert_type === "sos"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {resolveAlert.alert_type === "sos" ? "S.O.S." : "Alerta"}
              </span>
              <h3 className="text-lg font-bold text-gray-900">
                Cerrar caso de {resolveAlert.patient_name}
              </h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">{resolveAlert.message}</p>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Responsable
            </label>
            <input
              type="text"
              value={clinicUser}
              readOnly
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 mb-4"
            />

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nota / observación <span className="text-danger">*</span>
            </label>
            <textarea
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              rows={4}
              required
              placeholder="Describe el contacto realizado, instrucciones dadas, etc."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent mb-2"
            />

            {resolveError && (
              <p className="text-sm text-danger mb-3">{resolveError}</p>
            )}

            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={() => setResolveAlert(null)}
                disabled={resolving}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={resolving || !resolveNote.trim()}
                className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {resolving ? "Guardando..." : "Cerrar caso"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
