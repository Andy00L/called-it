import { teamCode, teamFlagSrc } from '../../lib/teams';

/**
 * A printed team roundel: the vendored circle-flag SVG when the team has one
 * (public/flags, MIT circle-flags), otherwise a quiet coded disc. Roundels
 * are the product's only team mark; the feed serves no crests or photos.
 */
export function FlagRoundel({
  teamName,
  size,
  className = '',
}: {
  teamName: string;
  size: number;
  className?: string;
}) {
  const src = teamFlagSrc(teamName);
  const ringClasses =
    'box-border rounded-full border border-[rgba(18,23,15,0.14)] [box-shadow:inset_0_0_0_1.5px_rgba(255,255,255,0.7)]';
  if (src === null) {
    return (
      <span
        aria-hidden
        className={`${ringClasses} inline-flex items-center justify-center bg-soft font-mono text-[9px] font-semibold text-ink-muted ${className}`}
        style={{ width: size, height: size }}
      >
        {teamCode(teamName)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      loading="lazy"
      className={`${ringClasses} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
