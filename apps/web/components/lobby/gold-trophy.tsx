/**
 * The gold trophy (broadcast lobby skin): a generic globe-on-stem cup drawn
 * from the accepted broadcast export, the lobby's one hero ornament. Placed
 * exactly once per screen (playbook: a brand ornament is used once, never
 * sprinkled), so the SVG gradient ids are safe as static values.
 */
export function GoldTrophy({ width = 86 }: { width?: number }) {
  const height = Math.round((width / 86) * 140);
  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox="0 0 120 196"
      className="relative [filter:drop-shadow(0_10px_26px_rgba(212,175,55,0.55))]"
    >
      <defs>
        <linearGradient id="trophy-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6e5013" />
          <stop offset="0.26" stopColor="#f7e39b" />
          <stop offset="0.5" stopColor="#e2b64f" />
          <stop offset="0.74" stopColor="#b98a28" />
          <stop offset="1" stopColor="#5f440e" />
        </linearGradient>
        <radialGradient id="trophy-globe" cx="0.35" cy="0.28" r="0.95">
          <stop offset="0" stopColor="#fff6d8" />
          <stop offset="0.45" stopColor="#f3d879" />
          <stop offset="0.75" stopColor="#cfa143" />
          <stop offset="1" stopColor="#8a6418" />
        </radialGradient>
        <linearGradient id="trophy-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#155f3a" />
          <stop offset="1" stopColor="#072c19" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="189" rx="38" ry="5" fill="rgba(0,0,0,0.4)" />
      <rect x="22" y="183" width="76" height="10" rx="4" fill="url(#trophy-body)" />
      <path
        d="M30 155 L90 155 L96 180 C96.5 183 94 185 91 185 L29 185 C26 185 23.5 183 24 180 Z"
        fill="url(#trophy-base)"
      />
      <rect x="30" y="163" width="60" height="2.5" rx="1.2" fill="rgba(243,220,146,0.45)" />
      <rect x="27" y="172" width="66" height="2.5" rx="1.2" fill="rgba(243,220,146,0.3)" />
      <rect x="37" y="147" width="46" height="10" rx="4" fill="url(#trophy-body)" />
      <path
        d="M60 56 C42 61 33 75 36 92 C39 108 51 117 51 132 C51 140 48 145 45 149 L75 149 C72 145 69 140 69 132 C69 117 81 108 84 92 C87 75 78 61 60 56 Z"
        fill="url(#trophy-body)"
      />
      <path
        d="M46 64 C41 74 40 86 43 96 C45 104 50 111 51 119 C46 110 40 100 39 90 C38 79 41 70 46 64 Z"
        fill="rgba(255,252,235,0.3)"
      />
      <path d="M39 20 C27 32 27 51 41 63 C34 51 35 33 45 22 Z" fill="url(#trophy-body)" />
      <path d="M81 20 C93 32 93 51 79 63 C86 51 85 33 75 22 Z" fill="url(#trophy-body)" />
      <circle cx="60" cy="34" r="26" fill="url(#trophy-globe)" />
      <ellipse cx="60" cy="34" rx="11" ry="26" fill="none" stroke="rgba(122,90,20,0.4)" strokeWidth="1" />
      <ellipse cx="60" cy="34" rx="20" ry="26" fill="none" stroke="rgba(122,90,20,0.3)" strokeWidth="1" />
      <ellipse cx="60" cy="34" rx="26" ry="9" fill="none" stroke="rgba(122,90,20,0.4)" strokeWidth="1" />
      <ellipse cx="60" cy="34" rx="26" ry="18" fill="none" stroke="rgba(122,90,20,0.25)" strokeWidth="1" />
      <circle cx="60" cy="34" r="26" fill="none" stroke="rgba(255,246,214,0.5)" strokeWidth="1.3" />
      <ellipse
        cx="50"
        cy="24"
        rx="9"
        ry="5.5"
        fill="rgba(255,255,255,0.5)"
        transform="rotate(-24 50 24)"
      />
      <path
        d="M60 2 L61.7 6.6 L66.3 8.3 L61.7 10 L60 14.6 L58.3 10 L53.7 8.3 L58.3 6.6 Z"
        fill="#fff8dd"
      />
      <path
        d="M89 44 L90.1 47 L93.1 48.1 L90.1 49.2 L89 52.2 L87.9 49.2 L84.9 48.1 L87.9 47 Z"
        fill="#fff3c4"
        opacity="0.85"
      />
    </svg>
  );
}
