import { Link } from 'react-router-dom';

export function Logo({ light = false, to = '/' }: { light?: boolean; to?: string }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2 font-display text-2xl font-bold tracking-wide ${light ? 'text-white' : 'text-pitch'}`}>
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <rect width="64" height="64" rx="14" fill={light ? '#E0A526' : '#0B4F3C'} />
        <path d="M12 44h40" stroke={light ? '#10201B' : '#F6F4EC'} strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="32" cy="27" rx="15" ry="9" transform="rotate(-30 32 27)" fill={light ? '#0B4F3C' : '#E0A526'} />
      </svg>
      Tryline
    </Link>
  );
}
