export default function ChatMessage({ message }) {
  const isBot = message.sender === "bot";

  return (
    <div className={`flex ${isBot ? "justify-start" : "justify-end"} mb-3`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isBot
            ? "bg-white shadow-sm border border-gray-100 text-gray-800"
            : "bg-primary text-white"
        }`}
      >
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
