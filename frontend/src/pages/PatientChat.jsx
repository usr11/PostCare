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
  EMERGENCY: "emergency",
  PHOTO_REQUEST: "photo_request",
  ERROR: "error",
};

const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
  const [lastMsgId, setLastMsgId] = useState(0);
  const [questionnaireStartedAt, setQuestionnaireStartedAt] = useState(null);
  const [aiHistory, setAiHistory] = useState([]);
  const [activeSOSAlertId, setActiveSOSAlertId] = useState(null);
  const [previousPhase, setPreviousPhase] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const seenReminderIds = useRef(new Set());
  const seenAppointmentIds = useRef(new Set());
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, buttons]);

  useEffect(() => {
    if (!patient) return;

    const interval = setInterval(async () => {
      try {
        const newMsgs = await api.getMessages(patient.id, lastMsgId);
        const doctorMsgs = newMsgs.filter((m) => m.sender === "doctor");
        if (doctorMsgs.length > 0) {
          for (const msg of doctorMsgs) {
            addMessage("doctor", msg.text);
          }
          setLastMsgId(newMsgs[newMsgs.length - 1].id);
          api.markMessagesRead(patient.id);
        }
      } catch {
        /* polling error, skip */
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [patient, lastMsgId]);

  useEffect(() => {
    if (!patient) return;

    const interval = setInterval(async () => {
      try {
        const reminders = await api.getPendingReminders(patient.id);
        const newOnes = reminders.filter((r) => !seenReminderIds.current.has(r.id));
        if (newOnes.length > 0) {
          for (const r of newOnes) {
            addMessage(
              "medication",
              `Es hora de tu medicamento:\n${r.medication_name} - ${r.medication_dose}`,
            );
            seenReminderIds.current.add(r.id);
          }
          const last = newOnes[newOnes.length - 1];
          const btns = [
            { label: "Ya la tomé", value: `med_take_${last.id}` },
          ];
          if (!last.postponed) {
            btns.push({ label: "Posponer 1 hora", value: `med_postpone_${last.id}` });
          }
          if (phase !== PHASES.QUESTIONNAIRE && phase !== PHASES.EMERGENCY) {
            setButtons(btns);
          }
        }
      } catch {
        /* skip */
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [patient, phase]);

  useEffect(() => {
    if (!patient) return;

    const interval = setInterval(async () => {
      try {
        const upcoming = await api.getUpcomingAppointments(patient.id);
        const newOnes = upcoming.filter(
          (a) => !seenAppointmentIds.current.has(a.id),
        );
        if (newOnes.length === 0) return;

        for (const a of newOnes) {
          const dt = new Date(a.scheduled_at);
          const fecha = dt.toLocaleDateString("es-CO", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          const hora = dt.toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
          });
          addMessage(
            "appointment",
            `Tienes una cita de control programada:\n📅 ${fecha}\n🕐 ${hora}\n📍 ${a.location}\n\n¿Confirmas tu asistencia?`,
          );
          seenAppointmentIds.current.add(a.id);
        }

        const last = newOnes[newOnes.length - 1];
        if (phase !== PHASES.QUESTIONNAIRE && phase !== PHASES.EMERGENCY) {
          setButtons([
            { label: "Confirmar asistencia", value: `appt_confirm_${last.id}` },
            { label: "Reagendar", value: `appt_reschedule_${last.id}` },
          ]);
        }
      } catch {
        /* skip */
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [patient, phase]);

  useEffect(() => {
    if (!questionnaireStartedAt || phase !== PHASES.QUESTIONNAIRE) return;

    const timeout = setTimeout(() => {
      addMessage(
        "bot",
        "El cuestionario ha expirado por inactividad (más de 1 hora). Se ha marcado como incompleto."
      );
      setButtons(null);
      setCurrentQuestion(null);
      setPhase(PHASES.COMPLETED);
    }, 3600000);

    return () => clearTimeout(timeout);
  }, [questionnaireStartedAt, phase]);

  function addMessage(sender, text, list, attachment) {
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), sender, text, list, attachment },
    ]);
  }

  async function uploadPhoto(file) {
    if (!patient || !file) return;
    setPhotoError("");

    if (!ALLOWED_IMAGE_MIMES.includes(file.type)) {
      setPhotoError("Solo se aceptan imágenes JPG o PNG.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setPhotoError("La imagen supera 10 MB. Comprime o reduce la foto.");
      return;
    }

    setUploadingPhoto(true);
    try {
      const data = await api.uploadWoundImage(patient.id, file);
      // Mostrar imagen como mensaje propio del paciente con thumbnail clickable.
      addMessage("user", "📷 Foto de herida enviada", null, {
        type: "wound_image",
        id: data.image.id,
        url: api.woundImageUrl(data.image.id, patient.id),
      });
      addMessage("bot", data.ack);
      // Volver al estado correspondiente.
      if (phase === PHASES.PHOTO_REQUEST) {
        // Si quedaba cuestionario en curso lo retomamos, si no quedamos completados.
        setPhase(currentQuestion ? PHASES.QUESTIONNAIRE : PHASES.COMPLETED);
        if (currentQuestion) setButtons(currentQuestion.options);
      }
    } catch (err) {
      setPhotoError(err.error || "No fue posible subir la foto.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function triggerPhotoRequest(promptText) {
    addMessage(
      "bot",
      promptText ||
        "Por favor toma una foto de la herida y adjúntala. Acepto JPG o PNG hasta 10 MB.",
    );
    setButtons(null);
    setPhase(PHASES.PHOTO_REQUEST);
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
      } catch (err) {
        if (err.status === 423) {
          addMessage("bot", err.message);
          setPhase(PHASES.ERROR);
        } else {
          addMessage(
            "bot",
            "No encuentro este documento. Comunícate con tu clínica."
          );
        }
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

    if (patient && (phase === PHASES.ONBOARDED || phase === PHASES.COMPLETED)) {
      addMessage("user", userInput);
      setLoading(true);
      try {
        const newHistory = [...aiHistory, { role: "user", content: userInput }];
        const data = await api.chatWithAI(patient.id, userInput, aiHistory);
        addMessage("bot", data.reply);
        setAiHistory([...newHistory, { role: "assistant", content: data.reply }]);
        if (data.suggest_sos) {
          setButtons([{ label: "🚨 Abrir S.O.S.", value: "__sos__" }]);
        }
        api.sendMessage(patient.id, "patient", userInput).catch(() => {});
      } catch (err) {
        addMessage("bot", err.error || "No pude procesar tu mensaje. Intenta de nuevo.");
      } finally {
        setLoading(false);
      }
      return;
    }
  }

  async function handleButtonSelect(option) {
    if (option.value === "__sos__") {
      setButtons(null);
      setShowSOSConfirm(true);
      return;
    }

    if (option.value === "__cancel_sos__") {
      addMessage("user", option.label);
      handleCancelFalseAlarm();
      return;
    }

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
        try {
          const data = await api.startQuestionnaire(patient.id);
          setRecordId(data.record_id);
          setQuestionnaireStartedAt(Date.now());
          if (data.message) addMessage("bot", data.message);
          if (data.question) {
            setCurrentQuestion(data.question);
            addMessage("bot", data.question.question_text);
            setButtons(data.question.options);
            setPhase(PHASES.QUESTIONNAIRE);
          }
        } catch {
          addMessage(
            "bot",
            "Ya completaste tu cuestionario de hoy. ¡Descansa y nos vemos mañana!"
          );
          setPhase(PHASES.COMPLETED);
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
          // HU1: si el protocolo pide foto al finalizar, abrimos el adjunto.
          if (data.request_photo) triggerPhotoRequest(data.photo_prompt);
        } else if (data.question) {
          // HU1: si la respuesta dispara petición de foto, interrumpimos al
          // paciente para que adjunte antes de seguir; al subir la foto
          // (o saltar) retomamos en la siguiente pregunta.
          if (data.request_photo) {
            setCurrentQuestion(data.question);
            triggerPhotoRequest(data.photo_prompt);
            return;
          }
          setCurrentQuestion(data.question);
          addMessage("bot", data.question.question_text);
          setButtons(data.question.options);
        }
        return;
      }
      if (option.value?.startsWith("med_take_")) {
        const reminderId = parseInt(option.value.replace("med_take_", ""));
        const data = await api.confirmTake(reminderId);
        addMessage("bot", data.message);
        return;
      }

      if (option.value?.startsWith("med_postpone_")) {
        const reminderId = parseInt(option.value.replace("med_postpone_", ""));
        const data = await api.postponeReminder(reminderId);
        addMessage("bot", data.message);
        return;
      }

      if (option.value?.startsWith("appt_confirm_")) {
        const apptId = parseInt(option.value.replace("appt_confirm_", ""));
        const data = await api.confirmAppointment(apptId);
        addMessage("bot", data.message);
        return;
      }

      if (option.value?.startsWith("appt_reschedule_")) {
        const apptId = parseInt(option.value.replace("appt_reschedule_", ""));
        const data = await api.requestReschedule(apptId);
        addMessage("bot", data.message);
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
      // HU 1: interrumpir flujo activo (cuestionario, recordatorios, AI chat).
      setPreviousPhase(phase);
      setPhase(PHASES.EMERGENCY);
      setCurrentQuestion(null);
      setQuestionnaireStartedAt(null);
      setActiveSOSAlertId(data.alert_id);
      addMessage("bot", data.message);
      setButtons([
        { label: "Cancelar falsa alarma", value: "__cancel_sos__" },
      ]);
    } catch {
      addMessage("bot", "Error al enviar la alerta. Llama al 123 de inmediato.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelFalseAlarm() {
    if (!activeSOSAlertId) return;
    setButtons(null);
    setLoading(true);
    try {
      const data = await api.cancelSOS(activeSOSAlertId, "Falsa alarma reportada por el paciente.");
      addMessage("bot", data.message);
      setActiveSOSAlertId(null);
      setPhase(previousPhase === PHASES.QUESTIONNAIRE ? PHASES.ONBOARDED : (previousPhase || PHASES.ONBOARDED));
      setPreviousPhase(null);
    } catch (err) {
      addMessage("bot", err.error || "No fue posible cancelar la alerta.");
      setButtons([{ label: "Cancelar falsa alarma", value: "__cancel_sos__" }]);
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
    phase === PHASES.ONBOARDED ||
    phase === PHASES.COMPLETED ||
    (phase === PHASES.QUESTIONNAIRE && !buttons);

  const sosDisabled = phase === PHASES.EMERGENCY || loading;
  const photoEnabled =
    patient &&
    (phase === PHASES.ONBOARDED ||
      phase === PHASES.QUESTIONNAIRE ||
      phase === PHASES.COMPLETED ||
      phase === PHASES.PHOTO_REQUEST);

  function onFileSelected(e) {
    const file = e.target.files?.[0];
    if (file) uploadPhoto(file);
  }

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
            <ChatMessage
              key={msg.id}
              message={msg}
              patientId={patient?.id}
            />
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

      {photoEnabled && (
        <div className="border-t border-gray-100 bg-white px-4 py-2">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              onChange={onFileSelected}
              className="hidden"
              data-testid="wound-photo-input"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto || loading}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                phase === PHASES.PHOTO_REQUEST
                  ? "bg-amber-50 border-amber-300 text-amber-700"
                  : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h4l2-3h6l2 3h4v12H3V7zM12 17a4 4 0 100-8 4 4 0 000 8z" />
              </svg>
              {uploadingPhoto
                ? "Subiendo foto..."
                : phase === PHASES.PHOTO_REQUEST
                  ? "Adjuntar foto de la herida"
                  : "Adjuntar evidencia (JPG/PNG)"}
            </button>
            {photoError && (
              <p className="text-xs text-danger truncate">{photoError}</p>
            )}
          </div>
        </div>
      )}

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

      {patient && phase !== PHASES.ERROR && (
        <button
          onClick={() => setShowSOSConfirm(true)}
          disabled={sosDisabled}
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
