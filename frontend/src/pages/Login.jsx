import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  function handleRole(role) {
    sessionStorage.setItem("role", role);
    navigate(role === "patient" ? "/chat" : "/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-2xl bg-primary mx-auto flex items-center justify-center mb-6 shadow-lg shadow-sky-200">
            <span className="text-white font-bold text-3xl">P</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">PostCare</h1>
          <p className="text-gray-500">
            Plataforma de seguimiento postquirúrgico
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-4">
          <p className="text-sm text-gray-600 text-center mb-2">
            Selecciona cómo deseas ingresar
          </p>

          <button
            onClick={() => handleRole("patient")}
            className="w-full flex items-center gap-4 px-6 py-4 rounded-xl border-2 border-gray-100 hover:border-primary hover:bg-sky-50 transition-all group"
          >
            <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center shrink-0 group-hover:bg-sky-200 transition-colors">
              <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Soy Paciente</p>
              <p className="text-xs text-gray-500">
                Accede a tu seguimiento postquirúrgico
              </p>
            </div>
          </button>

          <button
            onClick={() => handleRole("clinic")}
            className="w-full flex items-center gap-4 px-6 py-4 rounded-xl border-2 border-gray-100 hover:border-primary hover:bg-sky-50 transition-all group"
          >
            <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center shrink-0 group-hover:bg-sky-200 transition-colors">
              <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Panel Clínico</p>
              <p className="text-xs text-gray-500">
                Monitorea pacientes y alertas
              </p>
            </div>
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Seguimiento postquirúrgico ambulatorio seguro
        </p>
      </div>
    </div>
  );
}
