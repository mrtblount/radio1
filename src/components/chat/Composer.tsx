import { useRef, useState } from "react";

interface Props {
  disabled?: boolean;
  placeholder?: string;
  onSend: (body: string) => Promise<void> | void;
  onTyping?: () => void;
}

const TYPING_THROTTLE_MS = 2_500;

export function Composer({ disabled, placeholder, onSend, onTyping }: Props) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const lastTypingRef = useRef(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const clean = body.trim();
    if (!clean || sending || disabled) return;
    setSending(true);
    try {
      await onSend(clean);
      setBody("");
      if (areaRef.current) areaRef.current.style.height = "auto";
    } finally {
      setSending(false);
    }
    areaRef.current?.focus();
  };

  return (
    <div
      className="flex items-end gap-2 px-3 py-2.5"
      style={{ background: "var(--panel)", borderTop: "1px solid var(--line)" }}
    >
      <textarea
        ref={areaRef}
        data-testid="chat-composer"
        value={body}
        disabled={disabled || sending}
        placeholder={placeholder ?? "Message"}
        rows={1}
        onChange={(e) => {
          setBody(e.target.value);
          const el = e.target;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
          const now = Date.now();
          if (onTyping && now - lastTypingRef.current > TYPING_THROTTLE_MS) {
            lastTypingRef.current = now;
            onTyping();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        className="min-h-[42px] flex-1 resize-none rounded-md px-3.5 py-2.5 text-[0.95rem] outline-none"
        style={{
          background: "var(--panel-2)",
          border: "1px solid var(--line)",
          color: "var(--ink)",
          fontFamily: "var(--body)",
        }}
      />
      <button
        type="button"
        data-testid="chat-send"
        disabled={!body.trim() || sending || disabled}
        onClick={() => void submit()}
        className="display-type rounded-md px-4 font-bold"
        style={{
          height: 42,
          fontSize: "0.9rem",
          letterSpacing: "0.06em",
          background: body.trim() && !disabled ? "var(--tx)" : "var(--panel-2)",
          color: body.trim() && !disabled ? "#141414" : "var(--ink-dim)",
          transition: "background 120ms ease",
        }}
      >
        SEND
      </button>
    </div>
  );
}
