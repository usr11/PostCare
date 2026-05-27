export default function ChatMessage({ message }) {
  const isBot = message.sender === "bot";
  const isDoctor = message.sender === "doctor";
  const isMed = message.sender === "medication";
  const isAppt = message.sender === "appointment";
  const isLeft = isBot || isDoctor || isMed || isAppt;

  return (
    <div className={`flex ${isLeft ? "justify-start" : "justify-end"} mb-3`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isMed
            ? "bg-green-50 shadow-sm border border-green-200 text-gray-800"
            : isAppt
              ? "bg-sky-50 shadow-sm border border-sky-200 text-gray-800"
              : isDoctor
                ? "bg-amber-50 shadow-sm border border-amber-200 text-gray-800"
                : isBot
                  ? "bg-white shadow-sm border border-gray-100 text-gray-800"
                  : "bg-primary text-white"
        }`}
      >
        {isMed && (
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs font-semibold text-green-700">Recordatorio de Medicación</p>
          </div>
        )}
        {isAppt && (
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-3.5 h-3.5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-xs font-semibold text-sky-700">Recordatorio de Cita</p>
          </div>
        )}
        {isDoctor && (
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs font-semibold text-amber-700">Mensaje del Médico</p>
          </div>
        )}
        {isBot && (
          <p className="text-xs font-semibold text-primary mb-1">PostCare Bot</p>
        )}
        <p className="text-sm whitespace-pre-line">{message.text}</p>
        {message.list && (
          <ul className="mt-2 space-y-1">
            {message.list.map((item, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-primary">•</span>
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
