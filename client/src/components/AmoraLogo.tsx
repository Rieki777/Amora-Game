interface AmoraLogoProps {
  className?: string;
  iconSize?: number;
  showText?: boolean;
  textClassName?: string;
}

/**
 * Official Amora Tree of Life logo mark.
 * Tree with branches reaching up, roots reaching down, heart at center.
 */
export function AmoraLogoIcon({ className = "w-8 h-8", iconSize }: { className?: string; iconSize?: number }) {
  const size = iconSize ?? 32;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 72"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {/* Tree trunk */}
      <line x1="30" y1="54" x2="30" y2="30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>

      {/* Heart at center of trunk */}
      <path
        d="M30 33 C30 33 25 27.5 25 24 C25 21 27 19 30 21.5 C33 19 35 21 35 24 C35 27.5 30 33 30 33 Z"
        fill="currentColor"
      />

      {/* Upper branches - left */}
      <path d="M30 28 C26 22 18 19 12 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M30 23 C27 17 22 12 18 7"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M30 19 C29 13 29 8 30 3"   stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>

      {/* Upper branches - right */}
      <path d="M30 28 C34 22 42 19 48 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M30 23 C33 17 38 12 42 7"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>

      {/* Roots - left */}
      <path d="M30 46 C26 50 18 53 12 57" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M30 50 C27 54 22 58 18 63" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M30 54 C29 60 29 65 30 70" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>

      {/* Roots - right */}
      <path d="M30 46 C34 50 42 53 48 57" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M30 50 C33 54 38 58 42 63" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

/**
 * Full Amora logo: tree icon + "AM♡RA" wordmark
 */
export default function AmoraLogo({ className = "", iconSize, showText = true, textClassName = "" }: AmoraLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <AmoraLogoIcon iconSize={iconSize} />
      {showText && (
        <span className={`font-display font-bold tracking-widest ${textClassName}`}>
          AM♡RA
        </span>
      )}
    </span>
  );
}
