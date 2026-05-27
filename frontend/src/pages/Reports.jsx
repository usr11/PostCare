import { useState } from "react";
import { api } from "../api";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function weekAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

/**
 * Donut SVG simple para 2 segmentos. Calcula stroke-dasharray sobre
 * un círculo de radio 70 (perímetro ~439.8).
 */
function DonutChart({ respondedPct, ignoredPct }) {
  const R = 70;
  const C = 2 * Math.PI * R;
  const respondedLen = (respondedPct / 100) * C;
  const ignoredLen = (ignoredPct / 100) * C;

  return (
    <div className="flex items-center gap-8">
      <svg viewBox="0 0 180 180" className="w-44 h-44 -rotate-90">
        <circle cx="90" cy="90" r={R} fill="none" stroke="#e5e7eb" strokeWidth="22" />
        <circle
          cx="90"
          cy="90"
          r={R}
          fill="none"
          stroke="#22c55e"
          strokeWidth="22"
          strokeDasharray={`${respondedLen} ${C - respondedLen}`}
          strokeDashoffset="0"
        />
        <circle
          cx="90"
          cy="90"
          r={R}
          fill="none"
          stroke="#ef4444"
          strokeWidth="22"
          strokeDasharray={`${ignoredLen} ${C - ignoredLen}`}
          strokeDashoffset={`-${respondedLen}`}
        />
      </svg>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-success" />
          <span className="text-sm text-gray-700">
            Respondidas: <strong>{respondedPct}%</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-danger" />
          <span className="text-sm text-gray-700">
            Ignoradas: <strong>{ignoredPct}%</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

function buildCsv(report) {
  const rows = [
    ["from", "to", "responded", "ignored", "total", "responded_pct", "ignored_pct"],
    [
      report.from,
      report.to,
      report.totals.responded,
      report.totals.ignored,
      report.totals.total,
      report.totals.responded_pct,
      report.totals.ignored_pct,
    ],
    [],
    ["date", "responded", "ignored"],
    ...report.by_day.map((d) => [d.date, d.responded, d.ignored]),
  ];
  return rows.map((r) => r.join(",")).join("\n");
}

function downloadCsv(report) {
  const csv = buildCsv(report);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cumplimiento_${report.from}_${report.to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [from, setFrom] = useState(weekAgoISO());
  const [to, setTo] = useState(todayISO());
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate(e) {
    e.preventDefault();
    setError("");
    setReport(null);

    if (!from || !to) {
      setError("Selecciona ambas fechas.");
      return;
    }
    if (from > to) {
      setError("La fecha de inicio no puede ser posterior a la fecha de fin.");
      return;
    }

    setLoading(true);
    try {
      const data = await api.getComplianceReport(from, to);
      setReport(data);
    } catch (err) {
      setError(err.error || "No fue posible generar el reporte.");
    } finally {
      setLoading(false);
    }
  }

  const empty = report && report.totals.total === 0;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">
        Reporte de Cumplimiento
      </h1>

      <form
        onSubmit={generate}
        className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-wrap items-end gap-4"
      >
        <div>
          <label className="block text-xs text-gray-500 mb-1">Fecha de inicio</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            max={to || undefined}
            required
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Fecha de fin</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            min={from || undefined}
            required
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {loading ? "Generando..." : "Generar reporte"}
        </button>
        {report && !empty && (
          <button
            type="button"
            onClick={() => downloadCsv(report)}
            className="px-5 py-2 bg-white border border-primary text-primary rounded-xl text-sm font-bold hover:bg-sky-50 transition-colors"
          >
            Exportar CSV
          </button>
        )}
        {error && <p className="basis-full text-sm text-danger">{error}</p>}
      </form>

      {report && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Resultados del {report.from} al {report.to}
            </h2>
            {!empty && (
              <p className="text-sm text-gray-500">
                {report.totals.total} encuestas en el rango
              </p>
            )}
          </div>

          {empty ? (
            <p className="text-center py-12 text-gray-500">
              No hay estadísticas para esta fecha.
            </p>
          ) : (
            <>
              <DonutChart
                respondedPct={report.totals.responded_pct}
                ignoredPct={report.totals.ignored_pct}
              />

              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-xs text-green-700 font-medium">Respondidas</p>
                  <p className="text-2xl font-bold text-success">
                    {report.totals.responded}
                  </p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-xs text-red-700 font-medium">Ignoradas</p>
                  <p className="text-2xl font-bold text-danger">
                    {report.totals.ignored}
                  </p>
                </div>
              </div>

              {report.by_day.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Desglose por día
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                        <th className="text-left py-2">Fecha</th>
                        <th className="text-right py-2">Respondidas</th>
                        <th className="text-right py-2">Ignoradas</th>
                        <th className="text-right py-2">% Cumplimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_day.map((d) => {
                        const total = d.responded + d.ignored;
                        const pct = total ? Math.round((d.responded / total) * 100) : 0;
                        return (
                          <tr key={d.date} className="border-b border-gray-50">
                            <td className="py-2">{d.date}</td>
                            <td className="text-right">{d.responded}</td>
                            <td className="text-right">{d.ignored}</td>
                            <td className="text-right font-medium">{pct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
