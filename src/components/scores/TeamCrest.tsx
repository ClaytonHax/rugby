const SIZES = { sm: { box: 'size-5', text: 'text-[8px]' }, md: { box: 'size-7', text: 'text-[10px]' }, lg: { box: 'size-12', text: 'text-base' }, xl: { box: 'size-20', text: 'text-3xl' } } as const;
export type CrestSize = keyof typeof SIZES;

// every colour has at least 7:1 contrast against white initials
const COLOURS = ['#0B4F3C', '#7A1F2B', '#1F3A6E', '#5B2A86', '#8A4B08', '#12525F', '#3F4A1A', '#8B1E3F', '#2D3748', '#6B3410'];

export function crestColour(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLOURS[h % COLOURS.length];
}

export function crestInitials(name: string): string {
  const w = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}

/** Decorative by default (the name is always next to it); pass `title` to expose it. */
export function TeamCrest({ name, size = 'md', title, className = '' }: { name: string; size?: CrestSize; title?: string; className?: string }) {
  const s = SIZES[size];
  return (
    <span role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}
      className={`relative inline-flex shrink-0 items-center justify-center ${s.box} ${className}`}>
      <svg viewBox="0 0 24 28" className="absolute inset-0 size-full" aria-hidden>
        <path d="M2 2h20v13c0 6-5 9.5-10 11C7 24.500 2 21 2 15z" fill={crestColour(name)} stroke="#fff" strokeWidth="1.500" />
      </svg>
      <span className={`num relative -mt-0.5 leading-none text-white ${s.text}`}>{crestInitials(name)}</span>
    </span>
  );
}
