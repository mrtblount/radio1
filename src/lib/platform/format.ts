/** Human times are 12-hour (house law). */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatClock(ts: number): string {
  return `${formatDayLabel(ts)} · ${formatTime(ts)}`;
}

export function formatDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `0:${String(s).padStart(2, "0")}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
