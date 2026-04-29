const API_BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export const api = {
  verifyDocument: (document_number) =>
    request("/onboarding/verify", {
      method: "POST",
      body: JSON.stringify({ document_number }),
    }),

  confirmIdentity: (patient_id, confirmed) =>
    request("/onboarding/confirm", {
      method: "POST",
      body: JSON.stringify({ patient_id, confirmed }),
    }),

  startQuestionnaire: (patient_id) =>
    request(`/symptoms/start/${patient_id}`, { method: "POST" }),

  submitAnswer: (record_id, question_id, answer_value) =>
    request("/symptoms/answer", {
      method: "POST",
      body: JSON.stringify({ record_id, question_id, answer_value }),
    }),

  getHistory: (patient_id) => request(`/symptoms/history/${patient_id}`),

  triggerSOS: (patient_id, message) =>
    request("/sos/trigger", {
      method: "POST",
      body: JSON.stringify({ patient_id, message }),
    }),

  cancelSOS: (alert_id, note) =>
    request(`/sos/cancel/${alert_id}`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  getPatients: () => request("/dashboard/patients"),
  getPatient: (id) => request(`/dashboard/patients/${id}`),
  getAlerts: (status = "active") => request(`/dashboard/alerts?status=${status}`),
  getAlert: (id) => request(`/dashboard/alerts/${id}`),
  resolveAlert: (id, { note, resolved_by, version }) =>
    request(`/dashboard/alerts/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ note, resolved_by, version }),
    }),
  getAlertHistory: (patient_id) =>
    request(`/dashboard/alerts/history/${patient_id}`),
  getStats: () => request("/dashboard/stats"),

  sendMessage: (patient_id, sender, text) =>
    request("/messages/send", {
      method: "POST",
      body: JSON.stringify({ patient_id, sender, text }),
    }),

  getMessages: (patient_id, afterId = 0) =>
    request(`/messages/${patient_id}?after=${afterId}`),

  markMessagesRead: (patient_id) =>
    request(`/messages/${patient_id}/read`, { method: "POST" }),

  getMedications: (patient_id) => request(`/medications/${patient_id}`),

  addMedication: (patient_id, name, dose, schedule_times) =>
    request("/medications/", {
      method: "POST",
      body: JSON.stringify({ patient_id, name, dose, schedule_times }),
    }),

  deleteMedication: (med_id) =>
    request(`/medications/${med_id}`, { method: "DELETE" }),

  getPendingReminders: (patient_id) =>
    request(`/medications/reminders/${patient_id}`),

  confirmTake: (reminder_id) =>
    request(`/medications/reminders/${reminder_id}/take`, { method: "POST" }),

  postponeReminder: (reminder_id) =>
    request(`/medications/reminders/${reminder_id}/postpone`, { method: "POST" }),

  getReminderHistory: (patient_id) =>
    request(`/medications/reminders/history/${patient_id}`),

  chatWithAI: (patient_id, message, history) =>
    request("/chat/ai", {
      method: "POST",
      body: JSON.stringify({ patient_id, message, history }),
    }),
};
