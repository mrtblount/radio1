import { useRef, useState } from "react";

interface Props {
  disabled?: boolean;
  placeholder?: string;
  onSend: (body: string) => Promise<void> | void;
  onTyping?: () => void;
  /** Team member names offered as @-mention completions (D23). */
  mentionNames?: string[];
  /** Rendered before the input — the thread's inline talk key. */
  leading?: React.ReactNode;
}

const TYPING_THROTTLE_MS = 2_500;

/** The @token being typed immediately before the caret, if any. */
function mentionToken(beforeCaret: string): string | null {
  const m = /(?:^|\s)@([^\s@]*)$/.exec(beforeCaret);
  return m ? m[1] : null;
}

export function Composer({
  disabled,
  placeholder,
  onSend,
  onTyping,
  mentionNames,
  leading,
}: Props) {
  const [body, setBody] = useState("");
  const [caret, setCaret] = useState(0);
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
      setCaret(0);
      if (areaRef.current) areaRef.current.style.height = "auto";
    } finally {
      setSending(false);
    }
    areaRef.current?.focus();
  };

  // Suggestions follow the caret: typing @ mid-draft works, and moving the
  // caret out of a token dismisses the overlay.
  const token = mentionToken(body.slice(0, caret));
  const suggestions =
    token !== null && mentionNames?.length
      ? mentionNames
          .filter((n) => n.toLowerCase().startsWith(token.toLowerCase()))
          .slice(0, 5)
      : [];

  const insertMention = (name: string) => {
    const head = body.slice(0, caret).replace(/@[^\s@]*$/, `@${name} `);
    const next = head + body.slice(caret);
    setBody(next);
    setCaret(head.length);
    const el = areaRef.current;
    el?.focus();
    requestAnimationFrame(() => {
      el?.setSelectionRange(head.length, head.length);
    });
  };

  return (
    <div
      className="relative flex items-end gap-2 px-3 py-2.5"
      style={{ background: "var(--surface)", borderTop: "1.5px solid var(--line)" }}
    >
      {leading}
      {suggestions.length > 0 && (
        <div
          data-testid="mention-suggest"
          className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-2xl"
          style={{ background: "var(--surface)", border: "1.5px solid var(--line)", boxShadow: "0 12px 32px rgba(27,26,30,0.14)" }}
        >
          {suggestions.map((n) => (
            <button
              key={n}
              type="button"
              data-testid={`mention-option-${n}`}
              onClick={() => insertMention(n)}
              className="block w-full px-3.5 py-2.5 text-left text-sm"
              style={{ color: "var(--ink)" }}
            >
              <span style={{ color: "var(--tx)" }}>@</span>
              {n}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={areaRef}
        data-testid="chat-composer"
        value={body}
        disabled={disabled || sending}
        placeholder={placeholder ?? "Message"}
        rows={1}
        onChange={(e) => {
          setBody(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          const el = e.target;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
          const now = Date.now();
          if (onTyping && now - lastTypingRef.current > TYPING_THROTTLE_MS) {
            lastTypingRef.current = now;
            onTyping();
          }
        }}
        onSelect={(e) => {
          const el = e.target as HTMLTextAreaElement;
          setCaret(el.selectionStart ?? el.value.length);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        className="min-h-[44px] flex-1 resize-none rounded-3xl px-4 py-2.5 text-[0.95rem] outline-none"
        style={{
          background: "var(--surface-2)",
          border: "1.5px solid transparent",
          color: "var(--ink)",
          fontFamily: "var(--body)",
        }}
      />
      <button
        type="button"
        data-testid="chat-send"
        disabled={!body.trim() || sending || disabled}
        onClick={() => void submit()}
        className="display-type rounded-full px-5"
        style={{
          height: 44,
          fontSize: "0.85rem",
          letterSpacing: "0.05em",
          border: "none",
          cursor: "pointer",
          background: body.trim() && !disabled ? "var(--ink)" : "var(--surface-2)",
          color: body.trim() && !disabled ? "var(--canvas)" : "var(--ink-faint)",
          transition: "background 120ms ease",
        }}
      >
        SEND
      </button>
    </div>
  );
}
