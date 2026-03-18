/**
 * Official Amora brand logo components.
 *
 * Uses the real PNG brand assets from the design team.
 * Available variants for each mark:
 *   Beige  – cream/warm on transparent  → dark/teal backgrounds
 *   White  – white on transparent        → dark backgrounds
 *   Green1 – seafoam teal on transparent → light backgrounds
 *   Black  – black on transparent        → white/light backgrounds
 *
 * Amora-2-* = lotus mark (primary, used in nav)
 * Amora-*   = heart/tree mark (secondary, used in footer/content)
 */

type LogoVariant = "beige" | "white" | "teal" | "black";

const LOTUS_SRCS: Record<LogoVariant, string> = {
  beige:  "/assets/images/Amora-2-Beige.png",
  white:  "/assets/images/Amora-2-White.png",
  teal:   "/assets/images/Amora-2-Green1.png",
  black:  "/assets/images/Amora-2-Black.png",
};

const HEART_SRCS: Record<LogoVariant, string> = {
  beige:  "/assets/images/Amora-Beige.png",
  white:  "/assets/images/Amora-White.png",
  teal:   "/assets/images/Amora-Green1.png",
  black:  "/assets/images/Amora-Black.png",
};

/**
 * Lotus logo – primary Amora mark.
 * Includes the "AMORA" wordmark below the sacred-geometry lotus.
 *
 * @param variant  "beige" (default) | "white" | "teal" | "black"
 * @param height   rendered height in px (width scales automatically)
 */
export function AmoraLotusLogo({
  variant = "beige",
  height = 72,
  className = "",
}: {
  variant?: LogoVariant;
  height?: number;
  className?: string;
}) {
  return (
    <img
      src={LOTUS_SRCS[variant]}
      alt="Amora"
      height={height}
      style={{ height: `${height}px`, width: "auto" }}
      className={className}
      draggable={false}
    />
  );
}

/**
 * Heart / Tree-of-Life logo – secondary Amora mark.
 * Includes the "AM♡RA" wordmark integrated through the tree icon.
 *
 * @param variant  "beige" (default) | "white" | "teal" | "black"
 * @param height   rendered height in px (width scales automatically)
 */
export function AmoraHeartLogo({
  variant = "beige",
  height = 80,
  className = "",
}: {
  variant?: LogoVariant;
  height?: number;
  className?: string;
}) {
  return (
    <img
      src={HEART_SRCS[variant]}
      alt="Amora"
      height={height}
      style={{ height: `${height}px`, width: "auto" }}
      className={className}
      draggable={false}
    />
  );
}

/**
 * SVG fallback icon – used only if PNGs fail to load.
 * Lotus outline mark, transparent background, currentColor.
 */
export function AmoraLotusIcon({ className = "w-10 h-12" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 220 270"
      fill="none"
      className={className}
      aria-label="Amora lotus"
    >
      <path d="M110 16 C140 30 166 74 166 118 C166 162 140 208 110 224 C80 208 54 162 54 118 C54 74 80 30 110 16 Z" stroke="currentColor" strokeWidth="2.2"/>
      <path d="M110 16 C118 21 120 33 110 42 C100 33 102 21 110 16" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M110 42 C115 47 115 56 110 60 C105 56 105 47 110 42" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="110" cy="9" r="2.3" fill="currentColor"/>
      <path d="M62 196 C66 168 58 138 82 112 C96 97 102 78 110 60" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M158 196 C154 168 162 138 138 112 C124 97 118 78 110 60" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M110 130 C110 155 110 175 110 204" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M110 130 C94 152 76 170 62 196" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M110 130 C126 152 144 170 158 196" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M54 118 C36 114 18 126 10 140 C4 153 10 167 20 163" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
      <path d="M20 163 C10 169 8 181 16 186 C23 190 30 183 24 177 C18 171 20 163 28 162" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M54 118 C40 116 28 124 24 136 C20 147 27 158 35 154" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M35 154 C28 158 26 168 33 172 C39 174 44 167 40 162" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="46" cy="93" r="2.1" fill="currentColor"/>
      <path d="M166 118 C184 114 202 126 210 140 C216 153 210 167 200 163" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
      <path d="M200 163 C210 169 212 181 204 186 C197 190 190 183 196 177 C202 171 200 163 192 162" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M166 118 C180 116 192 124 196 136 C200 147 193 158 185 154" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M185 154 C192 158 194 168 187 172 C181 174 176 167 180 162" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="174" cy="93" r="2.1" fill="currentColor"/>
      <circle cx="46" cy="180" r="2.1" fill="currentColor"/>
      <circle cx="174" cy="180" r="2.1" fill="currentColor"/>
    </svg>
  );
}

/**
 * SVG fallback icon – heart/tree mark.
 */
export function AmoraHeartIcon({ className = "w-8 h-10" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 108" fill="currentColor" className={className} aria-label="Amora tree of life">
      <path d="M50 56 C46 49 36 46 36 38 C36 32 40 28 45 28 C48 28 50 30 50 30 C50 30 52 28 55 28 C60 28 64 32 64 38 C64 46 54 49 50 56Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
      <line x1="50" y1="28" x2="50" y2="19" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <line x1="50" y1="19" x2="50" y2="9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M50 9 C48 7 47 5 49 4 C51 3 52 5 51 8Z"/>
      <path d="M50 9 C52 7 53 5 51 4 C49 3 48 5 49 8Z"/>
      <path d="M49 20 C44 14 36 10 28 6" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <path d="M28 6 C25 4 24 2 26 1 C28 0 29 2 28 6Z"/>
      <path d="M28 6 C26 4 27 2 29 1 C31 0 30 3 28 6Z"/>
      <path d="M51 20 C56 14 64 10 72 6" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <path d="M72 6 C75 4 76 2 74 1 C72 0 71 2 72 6Z"/>
      <path d="M72 6 C74 4 73 2 71 1 C69 0 70 3 72 6Z"/>
      <path d="M47 21 C38 14 26 10 14 6" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      <path d="M14 6 C11 4 10 2 12 1 C14 0 15 2 14 5Z"/>
      <path d="M14 6 C12 4 13 2 15 2 C17 1 16 4 14 6Z"/>
      <path d="M53 21 C62 14 74 10 86 6" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      <path d="M86 6 C89 4 90 2 88 1 C86 0 85 2 86 5Z"/>
      <path d="M86 6 C88 4 87 2 85 2 C83 1 84 4 86 6Z"/>
      <path d="M46 23 C34 16 20 12 6 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <path d="M6 9 C4 8 3 6 5 5 C6 4 8 5 7 8Z"/>
      <path d="M6 9 C4 7 5 5 7 5 C9 5 8 7 6 9Z"/>
      <path d="M54 23 C66 16 80 12 94 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <path d="M94 9 C96 8 97 6 95 5 C94 4 92 5 93 8Z"/>
      <path d="M94 9 C96 7 95 5 93 5 C91 5 92 7 94 9Z"/>
      <line x1="50" y1="56" x2="50" y2="68" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M50 68 L50 90" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M48 70 C42 76 34 81 24 87" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M24 87 C18 91 13 95 8 100" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <path d="M52 70 C58 76 66 81 76 87" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M76 87 C82 91 87 95 92 100" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <path d="M46 72 C37 78 26 83 14 90" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round"/>
      <path d="M14 90 C9 94 5 97 2 101" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M54 72 C63 78 74 83 86 90" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round"/>
      <path d="M86 90 C91 94 95 97 98 101" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M44 74 C33 81 20 86 7 92" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M7 92 C4 94 2 97 1 100" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round"/>
      <path d="M56 74 C67 81 80 86 93 92" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M93 92 C96 94 98 97 99 100" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round"/>
      <circle cx="3" cy="102" r="1.8"/>
      <circle cx="97" cy="102" r="1.8"/>
    </svg>
  );
}

/**
 * Default export – nav logo using the official beige lotus PNG.
 */
export default function AmoraLogo({
  variant = "beige",
  height = 68,
  className = "",
}: {
  variant?: LogoVariant;
  height?: number;
  className?: string;
}) {
  return (
    <AmoraLotusLogo variant={variant} height={height} className={className} />
  );
}
