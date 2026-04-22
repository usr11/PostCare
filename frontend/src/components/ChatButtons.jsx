export default function ChatButtons({ options, onSelect, disabled }) {
  return (
    <div className="flex flex-wrap gap-2 mb-3 justify-start pl-2">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option)}
          disabled={disabled}
          className="px-4 py-2 bg-white border border-primary text-primary rounded-full text-sm font-medium hover:bg-sky-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
