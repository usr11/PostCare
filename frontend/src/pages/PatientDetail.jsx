import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

export default function PatientDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    api
      .getPatient(id)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));

    api.getMessages(id).then(setMessages).catch(console.error);
  }, [id]);

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

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          to="/dashboard"
          className="text-sm text-gray-500 hover:text-primary"
        >
          &larr; Volver
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{patient.name}</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Información del Paciente
          </h2>
          <dl className="space-y-3">
            {[
              ["Documento", patient.document_number],
              ["Teléfono", patient.phone],
              ["Cirugía", patient.surgery_type],
              ["Fecha de cirugía", new Date(patient.surgery_date).toLocaleDateString("es-CO")],
              ["Estado", patient.status === "active" ? "Activo" : "Pendiente"],
              ["Onboarding", patient.onboarded ? "Completado" : "Pendiente"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-sm text-gray-500">{label}</dt>
                <dd className="text-sm font-medium text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Alertas ({alerts.length})
          </h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-500">Sin alertas registradas.</p>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border-l-4 ${
                    alert.status === "active"
                      ? "border-l-danger bg-red-50"
                      : "border-l-gray-300 bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-medium ${
                        alert.status === "active"
                          ? "text-red-700"
                          : "text-gray-500"
                      }`}
                    >
                      {alert.alert_type === "sos" ? "S.O.S." : "Alerta"} -{" "}
                      {alert.status === "active" ? "Activa" : "Resuelta"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{alert.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(alert.created_at).toLocaleString("es-CO")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Mensajes al Paciente
        </h2>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="h-72 overflow-y-auto bg-gray-50 p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                No hay mensajes aún. Escribe una instrucción para el paciente.
              </p>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === "doctor" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    msg.sender === "doctor"
                      ? "bg-primary text-white"
                      : "bg-white border border-gray-200 text-gray-800"
                  }`}
                >
                  <p className={`text-xs font-semibold mb-0.5 ${msg.sender === "doctor" ? "text-sky-100" : "text-primary"}`}>
                    {msg.sender === "doctor" ? "Médico" : "Paciente"}
                  </p>
                  <p className="text-sm">{msg.text}</p>
                  <p className={`text-[10px] mt-1 ${msg.sender === "doctor" ? "text-sky-200" : "text-gray-400"}`}>
                    {new Date(msg.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Historial de Seguimiento
        </h2>
        {records.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aún no hay registros de seguimiento.
          </p>
        ) : (
          <div className="space-y-4">
            {records.map((record) => (
              <div
                key={record.id}
                className="border border-gray-100 rounded-lg p-4"
              >
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
                    {record.status === "completed"
                      ? "Completado"
                      : record.status === "incomplete"
                        ? "Incompleto"
                        : "En progreso"}
                  </span>
                </div>
                {record.answers.length > 0 && (
                  <div className="space-y-2">
                    {record.answers.map((answer) => (
                      <div
                        key={answer.id}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-600">
                          {answer.question_text}
                        </span>
                        <span className="font-medium text-gray-900">
                          {answer.answer_value}
                        </span>
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
