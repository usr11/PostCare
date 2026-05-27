import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

// HU4: línea de tiempo unificada del paciente con filtros y paginación.
// Soporta:
//  - filtro "solo alertas"
//  - filtro por rango de fechas
//  - carga incremental (cursor `before`)
//  - actualización en vivo: cada 8s, recarga la página 1 si el filtro está
//    inactivo y se está viendo la cabeza del feed (no rompe paginación)

const TYPE_META = {
  message_bot: { label: "Bot", color: "bg-sky-100 text-sky-700", icon: "💬" },
  message_patient: { label: "Paciente", color: "bg-gray-100 text-gray-700", icon: "🗨️" },
  message_doctor: { label: "Médico", color: "bg-amber-100 text-amber-800", icon: "👨‍⚕️" },
  wound_image_uploaded: { label: "Foto de herida", color: "bg-purple-100 text-purple-700", icon: "📷" },
  alert_created: { label: "Alerta creada", color: "bg-red-100 text-red-700", icon: "⚠️" },
  alert_resolved: { label: "Alerta cerrada", color: "bg-green-100 text-green-700", icon: "✅" },
  alert_cancelled: { label: "Alerta cancelada", color: "bg-gray-100 text-gray-700", icon: "↩️" },
  sos_triggered: { label: "S.O.S.", color: "bg-red-200 text-red-800", icon: "🚨" },
  reminder_taken: { label: "Medicamento tomado", color: "bg-green-100 text-green-700", icon: "💊" },
  reminder_omitted: { label: "Medicamento omitido", color: "bg-red-100 text-red-700", icon: "❌" },
  reminder_paused_sos: { label: "Recordatorio pausado por S.O.S.", color: "bg-amber-100 text-amber-700", icon: "⏸️" },
  questionnaire_started: { label: "Cuestionario iniciado", color: "bg-sky-100 text-sky-700", icon: "📝" },
  questionnaire_completed: { label: "Cuestionario completo", color: "bg-green-100 text-green-700", icon: "✅" },
  questionnaire_incomplete: { label: "Cuestionario incompleto", color: "bg-red-100 text-red-700", icon: "❌" },
  appointment_created: { label: "Cita programada", color: "bg-sky-100 text-sky-700", icon: "📅" },
  appointment_confirmed: { label: "Cita confirmada", color: "bg-green-100 text-green-700", icon: "✅" },
  appointment_reschedule_requested: { label: "Solicitud de reagendamiento", color: "bg-amber-100 text-amber-800", icon: "🔄" },
  appointment_cancelled: { label: "Cita cancelada", color: "bg-gray-100 text-gray-700", icon: "🚫" },
  appointment_no_response: { label: "Cita sin respuesta", color: "bg-red-100 text-red-700", icon: "⌛" },
};

function meta(t) {
  return TYPE_META[t] || { label: t, color: "bg-gray-100 text-gray-700", icon: "•" };
}

function EventRow({ event }) {
  const m = meta(event.type);
  const dt = new Date(event.ts);
  const p = event.payload || {};

  let body = null;
  if (event.type.startsWith("message_") && p.text) {
    body = <p className="text-sm text-gray-700 whitespace-pre-line">{p.text}</p>;
  } else if (event.type === "wound_image_uploaded") {
    body = (
      <div className="flex items-center gap-3">
        <p className="text-sm text-gray-700">{p.text || "Foto adjunta"}</p>
        {p.attachment?.id && (
          <a
            href={api.woundImageAuthUrl(p.attachment.id)}
            target="_blank"
            rel="noreferrer"
            className="block"
          >
            <img
              src={api.woundImageAuthUrl(p.attachment.id)}
              alt="Foto de herida"
              className="rounded-lg border border-gray-200 max-h-24"
              loading="lazy"
            />
          </a>
        )}
      </div>
    );
  } else if (event.type.startsWith("alert_") || event.type === "sos_triggered") {
    body = (
      <>
        <p className="text-sm text-gray-700">{p.message}</p>
        {p.resolution_note && (
          <p className="text-xs text-gray-500 italic mt-1">"{p.resolution_note}"</p>
        )}
      </>
    );
  } else if (event.type.startsWith("reminder_")) {
    body = (
      <p className="text-sm text-gray-700">
        {p.medication_name} {p.medication_dose}
      </p>
    );
  } else if (event.type.startsWith("questionnaire_")) {
    body = (
      <p className="text-sm text-gray-700">
        {p.answers?.length
          ? `${p.answers.length} respuestas registradas`
          : "Sin respuestas"}
      </p>
    );
  } else if (event.type.startsWith("appointment_")) {
    body = (
      <p className="text-sm text-gray-700">
        {new Date(p.scheduled_at).toLocaleString("es-CO", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        — {p.location}
      </p>
    );
  }

  return (
    <li className="relative flex gap-3 pb-4">
      <div className="absolute left-3 top-7 bottom-0 w-px bg-gray-200" />
      <div
        className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs ${m.color}`}
        title={m.label}
      >
        <span>{m.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${m.color}`}>
            {m.label}
          </span>
          <span className="text-[11px] text-gray-400">
            {dt.toLocaleString("es-CO", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {event.actor && (
            <span className="text-[11px] text-gray-400">· {event.actor}</span>
          )}
        </div>
        {body && <div className="mt-1">{body}</div>}
      </div>
    </li>
  );
}

export default function PatientTimeline({ patientId }) {
  const [events, setEvents] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtersRef = useRef({ onlyAlerts: false, from: "", to: "" });

  // Carga la primera página con los filtros actuales.
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        limit: 25,
        filter: onlyAlerts ? "alerts" : undefined,
        from: from || undefined,
        to: to || undefined,
      };
      const data = await api.getPatientTimeline(patientId, params);
      setEvents(data.events || []);
      setHasMore(Boolean(data.has_more));
      filtersRef.current = { onlyAlerts, from, to };
    } catch (err) {
      setError(err.error || "No fue posible cargar la línea de tiempo.");
    } finally {
      setLoading(false);
    }
  }, [patientId, onlyAlerts, from, to]);

  useEffect(() => {
    reload();
  }, [reload]);

  // HU4: actualización en tiempo real cada 8s.
  // Sólo recarga cabecera si el usuario no ha paginado hacia atrás
  // (events.length <= 25, es decir, sólo la primera página).
  useEffect(() => {
    const interval = setInterval(() => {
      if (loading || loadingMore) return;
      if (events.length > 25) return; // usuario está paginando, no molestar
      reload();
    }, 8000);
    return () => clearInterval(interval);
  }, [reload, loading, loadingMore, events.length]);

  async function loadMore() {
    if (!events.length || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const last = events[events.length - 1].ts;
      const params = {
        limit: 25,
        before: last,
        filter: onlyAlerts ? "alerts" : undefined,
        from: from || undefined,
        to: to || undefined,
      };
      const data = await api.getPatientTimeline(patientId, params);
      setEvents((prev) => [...prev, ...(data.events || [])]);
      setHasMore(Boolean(data.has_more));
    } catch (err) {
      setError(err.error || "No fue posible cargar más eventos.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Historial clínico</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-600">
            Desde
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            Hasta
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1 text-xs"
            />
          </label>
          <button
            type="button"
            onClick={() => setOnlyAlerts((v) => !v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              onlyAlerts
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {onlyAlerts ? "Mostrar todo" : "Solo alertas"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-500">
          {onlyAlerts || from || to
            ? "No hay eventos que coincidan con los filtros."
            : "Aún no hay actividad registrada para este paciente."}
        </div>
      ) : (
        <>
          <ul className="space-y-0">
            {events.map((e, i) => (
              <EventRow key={`${e.type}-${e.ts}-${i}`} event={e} />
            ))}
          </ul>
          {hasMore && (
            <div className="text-center mt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {loadingMore ? "Cargando..." : "Cargar más"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
