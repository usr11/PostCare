import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import ChatButtons from "../components/ChatButtons";
import ChatMessage from "../components/ChatMessage";

const PHASES = {
  DOCUMENT_INPUT: "document_input",
  CONFIRM_IDENTITY: "confirm_identity",
  ONBOARDED: "onboarded",
  QUESTIONNAIRE: "questionnaire",
  COMPLETED: "completed",
  ERROR: "error",
};

export default function PatientChat() {
  const navigate = useNavigate();
  const [showSOSConfirm, setShowSOSConfirm] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "bot",
      text: "¡Hola! Soy tu asistente de seguimiento postquirúrgico. Por favor, ingresa tu número de documento para comenzar.",
    },
  ]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState(PHASES.DOCUMENT_INPUT);
  const [patient, setPatient] = useState(null);
  const [buttons, setButtons] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [recordId, setRecordId] = useState(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, buttons]);

  function addMessage(sender, text, list) {
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), sender, text, list },
    ]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userInput = input.trim();
    setInput("");

    if (phase === PHASES.DOCUMENT_INPUT) {
      addMessage("user", userInput);
      setLoading(true);
      try {
        const data = await api.verifyDocument(userInput);
        setPatient(data.patient);
        addMessage(
          "bot",
          `He encontrado tu registro:\n\nNombre: ${data.patient.name}\nCirugía: ${data.patient.surgery_type}\nFecha: ${data.patient.surgery_date}\n\n¿Estos datos son correctos?`
        );
        setButtons([
          { label: "Sí, soy yo", value: "yes" },
          { label: "No, hay un error", value: "no" },
        ]);
        setPhase(PHASES.CONFIRM_IDENTITY);
      } catch {
        addMessage(
          "bot",
          "No encuentro este documento. Comunícate con tu clínica."
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (phase === PHASES.QUESTIONNAIRE && currentQuestion) {
      addMessage("user", userInput);
      addMessage(
        "bot",
        "Por favor usa las opciones proporcionadas para responder."
      );
      setButtons(
        currentQuestion.options.map((o) => ({ label: o.label, value: o.value }))
      );
      return;
    }
  }

  async function handleButtonSelect(option) {
    setButtons(null);
    addMessage("user", option.label);
    setLoading(true);

    try {
      if (phase === PHASES.CONFIRM_IDENTITY) {
        const confirmed = option.value === "yes";
        const data = await api.confirmIdentity(patient.id, confirmed);
        if (confirmed) {
          addMessage("bot", data.message, data.rules);
          setPhase(PHASES.ONBOARDED);
          setButtons([{ label: "Iniciar cuestionario diario", value: "start" }]);
        } else {
          addMessage("bot", data.message);
          setPhase(PHASES.ERROR);
        }
        return;
      }

      if (phase === PHASES.ONBOARDED && option.value === "start") {
        const data = await api.startQuestionnaire(patient.id);
        setRecordId(data.record_id);
        if (data.message) addMessage("bot", data.message);
        if (data.question) {
          setCurrentQuestion(data.question);
          addMessage("bot", data.question.question_text);
          setButtons(data.question.options);
          setPhase(PHASES.QUESTIONNAIRE);
        }
        return;
      }

      if (phase === PHASES.QUESTIONNAIRE && currentQuestion) {
        const data = await api.submitAnswer(
          recordId,
          currentQuestion.id,
          option.value
        );
        if (data.status === "completed") {
          addMessage("bot", data.message);
          setCurrentQuestion(null);
          setPhase(PHASES.COMPLETED);
        } else if (data.question) {
          setCurrentQuestion(data.question);
          addMessage("bot", data.question.question_text);
          setButtons(data.question.options);
        }
        return;
      }
    } catch (err) {
      addMessage("bot", err.error || "Ha ocurrido un error. Intenta de nuevo.");
      if (currentQuestion) {
        setButtons(currentQuestion.options);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSOS() {
    if (!patient) return;
    setShowSOSConfirm(false);
    setLoading(true);
    try {
      const data = await api.triggerSOS(patient.id);
      addMessage("bot", data.message);
    } catch {
      addMessage("bot", "Error al enviar la alerta. Llama al 123 de inmediato.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("role");
    navigate("/login");
  }

  const showInput =
    phase === PHASES.DOCUMENT_INPUT ||
    (phase === PHASES.QUESTIONNAIRE && !buttons);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex flex-col">
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">PostCare Bot</h1>
              <p className="text-xs text-green-500">En línea</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-danger rounded-lg hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Salir
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {buttons && (
            <ChatButtons
              options={buttons}
              onSelect={handleButtonSelect}
              disabled={loading}
            />
          )}
          {loading && (
            <div className="flex justify-start mb-3">
              <div className="bg-white shadow-sm border border-gray-100 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.15s" }}
                  />
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.3s" }}
                  />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {showInput && (
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <form
            onSubmit={handleSubmit}
            className="max-w-2xl mx-auto flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                phase === PHASES.DOCUMENT_INPUT
                  ? "Ingresa tu número de documento..."
                  : "Escribe un mensaje..."
              }
              className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-6 py-2 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      )}

      {patient && (
        <button
          onClick={() => setShowSOSConfirm(true)}
          disabled={loading}
          className="fixed bottom-6 right-6 w-16 h-16 bg-danger text-white rounded-full shadow-lg shadow-red-300 hover:bg-danger-dark transition-all hover:scale-110 disabled:opacity-50 flex items-center justify-center z-50"
        >
          <div className="text-center leading-tight">
            <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[10px] font-bold">S.O.S.</span>
          </div>
        </button>
      )}

      {showSOSConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Alerta de Emergencia
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Se enviará una alerta urgente al equipo médico. Si tu situación es
              grave, llama al <strong>123</strong> o dirígete a urgencias.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSOSConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSOS}
                className="flex-1 px-4 py-2.5 bg-danger text-white rounded-xl text-sm font-bold hover:bg-danger-dark transition-colors"
              >
                Enviar S.O.S.
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
