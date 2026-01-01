"use client";

import { useEffect, useState } from "react";

type PosClockProps = {
  className?: string;
};

const formatTime = (value: Date) =>
  new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);

export function PosClock({ className }: PosClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const time = now ? formatTime(now) : "--:--:--";
  const date = now ? formatDate(now) : "--/--/----";
  const classes = [
    "rounded-2xl bg-white/70 px-4 py-2 text-center shadow-sm",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="font-display text-2xl tracking-[0.2em]">{time}</div>
      <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        {date}
      </div>
    </div>
  );
}
