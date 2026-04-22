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

  getPatients: () => request("/dashboard/patients"),
  getPatient: (id) => request(`/dashboard/patients/${id}`),
  getAlerts: (status = "active") => request(`/dashboard/alerts?status=${status}`),
  resolveAlert: (id) => request(`/dashboard/alerts/${id}/resolve`, { method: "POST" }),
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
};
