import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";

/**
 * Logo mark — an electric-violet tile with an ascending "sparkline + lens" glyph
 * (a nod to SalesLens: a focused view on rising sales). Original artwork; the
 * gradient is fixed so the mark looks the same in light and dark.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-block size-7 shrink-0", className)} aria-hidden>
      <svg viewBox="0 0 32 32" className="size-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sl-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7C5CFF" />
            <stop offset="1" stopColor="#B488FF" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#sl-mark)" />
        <polyline
          points="7,21.5 13,15.5 18,18 24.5,9.5"
          fill="none"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24.5" cy="9.5" r="3.6" fill="#fff" />
        <circle cx="24.5" cy="9.5" r="1.7" fill="url(#sl-mark)" />
      </svg>
    </span>
  );
}

/** Logo mark + wordmark, used in the header, login, and landing. */
export function Brand({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
    </span>
  );
}
