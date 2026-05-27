import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import PatientTimeline from "../components/PatientTimeline";

export default function PatientDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const [medications, setMedications] = useState([]);
  const [reminderHistory, setReminderHistory] = useState([]);
  const [medForm, setMedForm] = useState({ name: "", dose: "", times: "" });
  const [addingMed, setAddingMed] = useState(false);

  const [alertHistory, setAlertHistory] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [protocolError, setProtocolError] = useState("");
  const [changingProtocol, setChangingProtocol] = useState(false);

  const [appointments, setAppointments] = useState([]);
  const [apptForm, setApptForm] = useState({ scheduled_at: "", location: "", notes: "" });
  const [apptError, setApptError] = useState("");
  const [savingAppt, setSavingAppt] = useState(false);

  function reloadAppointments() {
    api.listAppointments(id).then(setAppointments).catch(console.error);
  }

  useEffect(() => {
    api.getPatient(id).then(setData).catch(console.error).finally(() => setLoading(false));
    api.getMessages(id).then(setMessages).catch(console.error);
    api.getMedications(id).then(setMedications).catch(console.error);
    api.getReminderHistory(id).then(setReminderHistory).catch(console.error);
    api.getAlertHistory(id).then(setAlertHistory).catch(console.error);
    api.listProtocols().then(setProtocols).catch(console.error);
    reloadAppointments();
  }, [id]);

  async function handleCreateAppointment(e) {
    e.preventDefault();
    setApptError("");
    if (!apptForm.scheduled_at || !apptForm.location.trim()) return;
    setSavingAppt(true);
    try {
      await api.createAppointment({
        patient_id: Number(id),
        scheduled_at: apptForm.scheduled_at,
        location: apptForm.location.trim(),
        notes: apptForm.notes.trim() || null,
      });
      setApptForm({ scheduled_at: "", location: "", notes: "" });
      reloadAppointments();
    } catch (err) {
      setApptError(err.error || "No fue posible programar la cita.");
    } finally {
      setSavingAppt(false);
    }
  }

  async function handleCancelAppointment(apptId) {
    if (!confirm("¿Cancelar esta cita?")) return;
    try {
      await api.cancelAppointment(apptId);
      reloadAppointments();
    } catch (err) {
      alert(err.error || "No fue posible cancelar la cita.");
    }
  }

  async function handleProtocolChange(surgeryType) {
    if (!data || surgeryType === data.patient.surgery_type) return;
    setProtocolError("");
    setChangingProtocol(true);
    try {
      const updated = await api.changeProtocol(id, surgeryType);
      setData((prev) => (prev ? { ...prev, patient: updated } : prev));
    } catch (err) {
      setProtocolError(err.error || "No fue posible cambiar el protocolo.");
    } finally {
      setChangingProtocol(false);
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      const lastId = messages.length > 0 ? messages[messages.length - 1].id : 0;
      api
        .getMessages(id, lastId)
        .then((newMsgs) => {
          if (newMsgs.length > 0) setMessages((prev) => [...prev, ...newMsgs]);
        })
        .catch(console.error);
    }, 4000);
    return () => clearInterval(interval);
  }, [id, messages]);

  // HU2: refresca citas en tiempo real para ver confirmaciones / reagendamientos.
  useEffect(() => {
    const interval = setInterval(reloadAppointments, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!msgText.trim() || sending) return;
    setSending(true);
    try {
      const msg = await api.sendMessage(id, "doctor", msgText.trim());
      setMessages((prev) => [...prev, msg]);
      setMsgText("");
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setSending(false);
    }
  }

  async function handleAddMed(e) {
    e.preventDefault();
    if (!medForm.name || !medForm.dose || !medForm.times) return;
    setAddingMed(true);
    try {
      const times = medForm.times.split(",").map((t) => t.trim());
      const med = await api.addMedication(id, medForm.name, medForm.dose, times);
      setMedications((prev) => [...prev, med]);
      setMedForm({ name: "", dose: "", times: "" });
    } catch (err) {
      console.error("Error adding medication:", err);
    } finally {
      setAddingMed(false);
    }
  }

  async function handleDeleteMed(medId) {
    try {
      await api.deleteMedication(medId);
      setMedications((prev) => prev.filter((m) => m.id !== medId));
    } catch (err) {
      console.error("Error deleting medication:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-gray-500">Paciente no encontrado.</p>;
  }

  const { patient, records, alerts } = data;
  const statusLabel = { taken: "Tomada", omitted: "Omitida", pending: "Pendiente" };
  const statusColor = {
    taken: "bg-green-100 text-green-700",
    omitted: "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-700",
  };

  // Estado para citas con etiqueta "no_response".
  const apptStatusBadge = (a) => {
    if (a.status === "confirmed")
      return { label: "Confirmada por paciente", cls: "bg-green-100 text-green-700" };
    if (a.status === "reschedule_requested")
      return { label: "Solicita reagendar", cls: "bg-amber-100 text-amber-700" };
    if (a.status === "cancelled")
      return { label: "Cancelada", cls: "bg-gray-100 text-gray-600" };
    if (a.status === "no_response")
      return { label: "Sin respuesta", cls: "bg-red-100 text-red-700" };
    if (a.reminder_sent_at)
      return { label: "Recordatorio enviado", cls: "bg-sky-100 text-sky-700" };
    return { label: "Pendiente", cls: "bg-gray-100 text-gray-700" };
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/dashboard" className="text-sm text-gray-500 hover:text-primary">
          &larr; Volver
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{patient.name}</h1>
      </div>

      <PatientTimeline patientId={Number(id)} />

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Información del Paciente</h2>
          <dl className="space-y-3">
            {[
              ["Documento", patient.document_number],
              ["Teléfono", patient.phone],
              ["Fecha de cirugía", new Date(patient.surgery_date).toLocaleDateString("es-CO")],
              ["Estado", patient.status === "active" ? "Activo" : "Pendiente"],
              ["Onboarding", patient.onboarded ? "Completado" : "Pendiente"],
              ["Clínico responsable", patient.clinician_name || "Sin asignar"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-sm text-gray-500">{label}</dt>
                <dd className="text-sm font-medium text-gray-900">{value}</dd>
              </div>
            ))}
            <div className="pt-3 border-t border-gray-100">
              <label className="block text-sm text-gray-500 mb-1">Protocolo asignado</label>
              <select
                value={patient.surgery_type}
                onChange={(e) => handleProtocolChange(e.target.value)}
                disabled={changingProtocol || protocols.length === 0}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
              >
                {protocols.map((p) => (
                  <option key={p.surgery_type} value={p.surgery_type}>
                    {p.surgery_type} ({p.question_count} preguntas)
                  </option>
                ))}
              </select>
              {protocolError && (
                <p className="text-xs text-danger mt-2">{protocolError}</p>
              )}
            </div>
          </dl>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Alertas ({alerts.length})</h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-500">Sin alertas registradas.</p>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border-l-4 ${
                    alert.status === "active" ? "border-l-danger bg-red-50" : "border-l-gray-300 bg-gray-50"
                  }`}
                >
                  <span className={`text-xs font-medium ${alert.status === "active" ? "text-red-700" : "text-gray-500"}`}>
                    {alert.alert_type === "sos" ? "S.O.S." : "Alerta"} - {alert.status === "active" ? "Activa" : alert.status === "cancelled" ? "Cancelada" : "Resuelta"}
                  </span>
                  <p className="text-sm text-gray-700">{alert.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(alert.created_at).toLocaleString("es-CO")}</p>
                  {alert.resolved_at && (
                    <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600">
                      <p><strong>Cerrada por:</strong> {alert.resolved_by || "—"}</p>
                      <p><strong>Cuándo:</strong> {new Date(alert.resolved_at).toLocaleString("es-CO")}</p>
                      {alert.resolution_note && (
                        <p className="mt-1"><strong>Nota:</strong> {alert.resolution_note}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {alertHistory.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Historial de cierres</h2>
          <div className="space-y-3">
            {alertHistory.map((a) => (
              <div key={a.id} className="border-l-4 border-gray-300 pl-3 py-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">
                    {a.alert_type === "sos" ? "S.O.S." : "Alerta"} · {a.status === "cancelled" ? "Cancelada" : "Resuelta"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {a.resolved_at && new Date(a.resolved_at).toLocaleString("es-CO")}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-1">{a.message}</p>
                <p className="text-xs text-gray-600 mt-1">
                  Cerrada por <strong>{a.resolved_by || "—"}</strong>
                </p>
                {a.resolution_note && (
                  <p className="text-xs text-gray-600 mt-0.5 italic">"{a.resolution_note}"</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Citas de control */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Citas de control</h2>

        <form
          onSubmit={handleCreateAppointment}
          className="grid md:grid-cols-4 gap-3 items-end mb-6"
        >
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha y hora</label>
            <input
              type="datetime-local"
              value={apptForm.scheduled_at}
              onChange={(e) => setApptForm({ ...apptForm, scheduled_at: e.target.value })}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Lugar</label>
            <input
              type="text"
              value={apptForm.location}
              onChange={(e) => setApptForm({ ...apptForm, location: e.target.value })}
              required
              placeholder="Ej: Consultorio 305"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notas</label>
            <input
              type="text"
              value={apptForm.notes}
              onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })}
              placeholder="Opcional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={savingAppt}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {savingAppt ? "Guardando..." : "Programar cita"}
          </button>
          {apptError && (
            <p className="md:col-span-4 text-sm text-danger">{apptError}</p>
          )}
        </form>

        {appointments.length === 0 ? (
          <p className="text-sm text-gray-500">Sin citas programadas.</p>
        ) : (
          <div className="space-y-2">
            {appointments.map((a) => {
              const dt = new Date(a.scheduled_at);
              const statusBadge = apptStatusBadge(a);
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between py-2 border-b border-gray-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {dt.toLocaleString("es-CO", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-xs text-gray-500">{a.location}</p>
                    {a.notes && <p className="text-xs text-gray-400 italic">{a.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge.cls}`}>
                      {statusBadge.label}
                    </span>
                    {a.status !== "cancelled" && (
                      <button
                        onClick={() => handleCancelAppointment(a.id)}
                        className="text-xs text-gray-400 hover:text-danger transition-colors"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Medicamentos */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Medicamentos</h2>

        {medications.length > 0 && (
          <div className="mb-6">
            <table className="w-full mb-4">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Medicamento</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Dosis</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Horarios</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {medications.map((med) => (
                  <tr key={med.id} className="border-b border-gray-50">
                    <td className="py-3 text-sm font-medium text-gray-900">{med.name}</td>
                    <td className="py-3 text-sm text-gray-600">{med.dose}</td>
                    <td className="py-3 text-sm text-gray-600">{med.schedule_times.join(", ")}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleDeleteMed(med.id)}
                        className="text-xs text-gray-400 hover:text-danger transition-colors"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={handleAddMed} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">Nombre</label>
            <input
              type="text"
              value={medForm.name}
              onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
              placeholder="Ej: Acetaminofén"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="block text-xs text-gray-500 mb-1">Dosis</label>
            <input
              type="text"
              value={medForm.dose}
              onChange={(e) => setMedForm({ ...medForm, dose: e.target.value })}
              placeholder="Ej: 500 mg"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">Horarios (separados por coma)</label>
            <input
              type="text"
              value={medForm.times}
              onChange={(e) => setMedForm({ ...medForm, times: e.target.value })}
              placeholder="Ej: 08:00, 16:00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={addingMed || !medForm.name || !medForm.dose || !medForm.times}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            Agregar
          </button>
        </form>
      </div>

      {/* Historial de Adherencia */}
      {reminderHistory.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Historial de Medicación</h2>
          <div className="space-y-2">
            {reminderHistory.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                <div>
                  <span className="text-sm font-medium text-gray-900">{r.medication_name}</span>
                  <span className="text-sm text-gray-500 ml-2">{r.medication_dose}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {new Date(r.scheduled_at).toLocaleString("es-CO", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[r.status] || "bg-gray-100 text-gray-600"}`}>
                    {statusLabel[r.status] || r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mensajes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Mensajes al Paciente</h2>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="h-72 overflow-y-auto bg-gray-50 p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                No hay mensajes aún. Escribe una instrucción para el paciente.
              </p>
            )}
            {messages.map((msg) => {
              const att = msg.attachment;
              const isImg = att && att.type === "wound_image";
              return (
                <div key={msg.id} className={`flex ${msg.sender === "doctor" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                      msg.sender === "doctor" ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-800"
                    }`}
                  >
                    <p className={`text-xs font-semibold mb-0.5 ${msg.sender === "doctor" ? "text-sky-100" : "text-primary"}`}>
                      {msg.sender === "doctor" ? "Médico" : "Paciente"}
                    </p>
                    <p className="text-sm">{msg.text}</p>
                    {isImg && (
                      <a
                        href={api.woundImageAuthUrl(att.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="block mt-2"
                      >
                        <img
                          src={api.woundImageAuthUrl(att.id)}
                          alt="Foto de herida"
                          className="rounded-lg max-h-48 border border-white/40"
                          loading="lazy"
                        />
                      </a>
                    )}
                    <p className={`text-[10px] mt-1 ${msg.sender === "doctor" ? "text-sky-200" : "text-gray-400"}`}>
                      {new Date(msg.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSend} className="flex border-t border-gray-200">
            <input
              type="text"
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              placeholder="Escribe una instrucción para el paciente..."
              className="flex-1 px-4 py-3 text-sm focus:outline-none"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !msgText.trim()}
              className="px-6 py-3 bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      </div>

      {/* Historial de Seguimiento */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Historial de Seguimiento</h2>
        {records.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay registros de seguimiento.</p>
        ) : (
          <div className="space-y-4">
            {records.map((record) => (
              <div key={record.id} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-900">
                    {new Date(record.date).toLocaleDateString("es-CO")}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      record.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : record.status === "incomplete"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {record.status === "completed" ? "Completado" : record.status === "incomplete" ? "Incompleto" : "En progreso"}
                  </span>
                </div>
                {record.answers.length > 0 && (
                  <div className="space-y-2">
                    {record.answers.map((answer) => (
                      <div key={answer.id} className="flex justify-between text-sm">
                        <span className="text-gray-600">{answer.question_text}</span>
                        <span className="font-medium text-gray-900">{answer.answer_value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
