import { useEffect, useState } from "react";
import { api } from "../api";

const STATUS_LABEL = {
  active: "Activo",
  pending: "Pendiente",
  data_error: "Datos por corregir",
};

const STATUS_BADGE = {
  active: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  data_error: "bg-red-100 text-red-700",
};

function emptyForm() {
  return {
    document_number: "",
    name: "",
    phone: "",
    surgery_type: "",
    surgery_date: "",
    daily_questionnaire_time: "09:00",
    clinician_id: "",
  };
}

export default function Admissions() {
  const [patients, setPatients] = useState([]);
  const [clinicians, setClinicians] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [assigning, setAssigning] = useState(null);

  async function reload() {
    const [ps, cs, pr] = await Promise.all([
      api.listAdmissionPatients(),
      api.listClinicians(),
      api.listProtocols(),
    ]);
    setPatients(ps);
    setClinicians(cs);
    setProtocols(pr);
  }

  useEffect(() => {
    reload().catch((e) => console.error(e)).finally(() => setLoading(false));
  }, []);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    setCreating(true);
    try {
      const payload = {
        document_number: form.document_number.trim(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        surgery_type: form.surgery_type,
        surgery_date: form.surgery_date,
        daily_questionnaire_time: form.daily_questionnaire_time || "09:00",
        clinician_id: form.clinician_id ? Number(form.clinician_id) : null,
      };
      const created = await api.createPatient(payload);
      setFormSuccess(`Paciente ${created.name} registrado.`);
      setForm(emptyForm());
      reload();
    } catch (err) {
      setFormError(err.error || "No fue posible registrar el paciente.");
    } finally {
      setCreating(false);
    }
  }

  async function handleAssign(patientId, clinicianId) {
    setAssigning(patientId);
    try {
      await api.assignClinician(patientId, clinicianId ? Number(clinicianId) : null);
      reload();
    } catch (err) {
      alert(err.error || "No fue posible asignar el clínico.");
    } finally {
      setAssigning(null);
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
      <h1 className="text-2xl font-bold text-gray-900">Admisiones</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Registrar nuevo paciente
        </h2>
        <form onSubmit={handleCreate} className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Documento <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.document_number}
              onChange={(e) => update("document_number", e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Nombre completo <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Teléfono <span className="text-danger">*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              required
              pattern="^\+\d{7,15}$"
              placeholder="+573001234567"
              title="Incluye el indicativo de país, ej. +57"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Incluye el indicativo de país (ej. <code>+57</code>) — necesario para mensajería.
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Protocolo / tipo de cirugía <span className="text-danger">*</span>
            </label>
            <select
              value={form.surgery_type}
              onChange={(e) => update("surgery_type", e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Selecciona...</option>
              {protocols.map((p) => (
                <option key={p.surgery_type} value={p.surgery_type}>
                  {p.surgery_type} ({p.question_count} preguntas)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Fecha de cirugía <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              value={form.surgery_date}
              onChange={(e) => update("surgery_date", e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Hora del cuestionario diario
            </label>
            <input
              type="time"
              value={form.daily_questionnaire_time}
              onChange={(e) => update("daily_questionnaire_time", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">
              Asignar a clínico (opcional)
            </label>
            <select
              value={form.clinician_id}
              onChange={(e) => update("clinician_id", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Sin asignar</option>
              {clinicians.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} — {c.email}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {creating ? "Registrando..." : "Registrar paciente"}
            </button>
            {formError && <p className="text-sm text-danger">{formError}</p>}
            {formSuccess && <p className="text-sm text-success">{formSuccess}</p>}
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Pacientes en el sistema ({patients.length})
          </h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Paciente</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Documento</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Protocolo</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Clínico</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3 text-sm text-gray-900 font-medium">{p.name}</td>
                <td className="px-6 py-3 text-sm text-gray-600">{p.document_number}</td>
                <td className="px-6 py-3 text-sm text-gray-600">{p.surgery_type}</td>
                <td className="px-6 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[p.status] || "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <select
                    value={p.clinician_id || ""}
                    onChange={(e) => handleAssign(p.id, e.target.value)}
                    disabled={assigning === p.id}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  >
                    <option value="">Sin asignar</option>
                    {clinicians.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
