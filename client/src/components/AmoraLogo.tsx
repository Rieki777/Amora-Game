interface AmoraLogoProps {
  className?: string;
  iconOnly?: boolean;
  color?: string;
}

/**
 * Amora Heart/Tree logo mark.
 * Heart at center, organic branches reaching up with leaf buds,
 * root system spreading down. Traced from official brand assets.
 * Uses currentColor - wrap with a text-* class to set color.
 */
export function AmoraHeartIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 108"
      fill="currentColor"
      className={className}
      aria-label="Amora tree of life logo"
    >
      {/* ── HEART at center (outline) ── */}
      <path
        d="M50 56
           C46 49 36 46 36 38
           C36 32 40 28 45 28
           C48 28 50 30 50 30
           C50 30 52 28 55 28
           C60 28 64 32 64 38
           C64 46 54 49 50 56Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* ── SHORT TRUNK above heart ── */}
      <line x1="50" y1="28" x2="50" y2="19" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>

      {/* ── BRANCHES (fan from trunk top at y=19) ── */}

      {/* Center-left branch */}
      <path d="M49 20 C44 14 36 10 28 6" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      {/* Leaf buds at tip */}
      <path d="M28 6 C25 4 24 2 26 1 C28 0 29 2 28 6Z"/>
      <path d="M28 6 C26 4 27 2 29 1 C31 0 30 3 28 6Z"/>

      {/* Center-right branch (mirror) */}
      <path d="M51 20 C56 14 64 10 72 6" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <path d="M72 6 C75 4 76 2 74 1 C72 0 71 2 72 6Z"/>
      <path d="M72 6 C74 4 73 2 71 1 C69 0 70 3 72 6Z"/>

      {/* Outer-left branch */}
      <path d="M47 21 C38 14 26 10 14 6" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      <path d="M14 6 C11 4 10 2 12 1 C14 0 15 2 14 5Z"/>
      <path d="M14 6 C12 4 13 2 15 2 C17 1 16 4 14 6Z"/>

      {/* Outer-right branch (mirror) */}
      <path d="M53 21 C62 14 74 10 86 6" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      <path d="M86 6 C89 4 90 2 88 1 C86 0 85 2 86 5Z"/>
      <path d="M86 6 C88 4 87 2 85 2 C83 1 84 4 86 6Z"/>

      {/* Far-left branch */}
      <path d="M46 23 C34 16 20 12 6 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <path d="M6 9 C4 8 3 6 5 5 C6 4 8 5 7 8Z"/>
      <path d="M6 9 C4 7 5 5 7 5 C9 5 8 7 6 9Z"/>

      {/* Far-right branch (mirror) */}
      <path d="M54 23 C66 16 80 12 94 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <path d="M94 9 C96 8 97 6 95 5 C94 4 92 5 93 8Z"/>
      <path d="M94 9 C96 7 95 5 93 5 C91 5 92 7 94 9Z"/>

      {/* Center-top bud */}
      <line x1="50" y1="19" x2="50" y2="9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M50 9 C48 7 47 5 49 4 C51 3 52 5 51 8Z"/>
      <path d="M50 9 C52 7 53 5 51 4 C49 3 48 5 49 8Z"/>

      {/* ── SHORT TRUNK below heart ── */}
      <line x1="50" y1="56" x2="50" y2="68" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>

      {/* ── ROOTS (fan from trunk base at y=68) ── */}

      {/* Center root */}
      <path d="M50 68 L50 90" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M50 90 L50 104" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>

      {/* Center-left root */}
      <path d="M48 70 C42 76 34 81 24 87" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M24 87 C18 91 13 95 8 100" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>

      {/* Center-right root (mirror) */}
      <path d="M52 70 C58 76 66 81 76 87" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M76 87 C82 91 87 95 92 100" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>

      {/* Outer-left root */}
      <path d="M46 72 C37 78 26 83 14 90" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round"/>
      <path d="M14 90 C9 94 5 97 2 101" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>

      {/* Outer-right root (mirror) */}
      <path d="M54 72 C63 78 74 83 86 90" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round"/>
      <path d="M86 90 C91 94 95 97 98 101" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>

      {/* Far-left root (thin tendril) */}
      <path d="M44 74 C33 81 20 86 7 92" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M7 92 C4 94 2 97 1 100" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round"/>

      {/* Far-right root (mirror) */}
      <path d="M56 74 C67 81 80 86 93 92" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M93 92 C96 94 98 97 99 100" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round"/>

      {/* Dots at base of roots */}
      <circle cx="3" cy="102" r="1.8"/>
      <circle cx="97" cy="102" r="1.8"/>
    </svg>
  );
}

/**
 * Full Amora wordmark logo: heart/tree icon integrated with AM♡RA lettering.
 * Matches the official brand lockup where the heart serves as the O.
 */
export function AmoraWordmark({ className = "", size = 200 }: { className?: string; size?: number }) {
  const scale = size / 200;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 170"
      fill="currentColor"
      className={className}
      width={size}
      height={size * 0.85}
      aria-label="Amora"
    >
      {/* ── Branches (canopy above text) ── */}

      {/* Trunk stub from heart up */}
      <line x1="100" y1="72" x2="100" y2="58" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>

      {/* Center-top bud */}
      <line x1="100" y1="58" x2="100" y2="44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M100 44 C97 41 96 38 98 36 C100 34 102 37 101 42Z"/>
      <path d="M100 44 C103 41 104 38 102 36 C100 34 98 37 99 42Z"/>

      {/* Center-left branch */}
      <path d="M98 60 C90 52 80 47 68 40" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <path d="M68 40 C64 37 62 34 64 32 C66 30 69 32 68 38Z"/>
      <path d="M68 40 C65 37 66 34 68 33 C70 32 70 36 68 40Z"/>

      {/* Center-right branch */}
      <path d="M102 60 C110 52 120 47 132 40" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <path d="M132 40 C136 37 138 34 136 32 C134 30 131 32 132 38Z"/>
      <path d="M132 40 C135 37 134 34 132 33 C130 32 130 36 132 40Z"/>

      {/* Outer-left branch */}
      <path d="M96 62 C84 54 68 49 52 43" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
      <path d="M52 43 C48 41 46 38 48 36 C50 34 53 36 52 41Z"/>
      <path d="M52 43 C49 40 50 37 52 36 C54 35 54 39 52 43Z"/>

      {/* Outer-right branch */}
      <path d="M104 62 C116 54 132 49 148 43" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
      <path d="M148 43 C152 41 154 38 152 36 C150 34 147 36 148 41Z"/>
      <path d="M148 43 C151 40 150 37 148 36 C146 35 146 39 148 43Z"/>

      {/* Far-left branch */}
      <path d="M94 65 C80 57 62 52 44 46" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M44 46 C40 44 38 42 40 40 C42 38 45 40 44 44Z"/>
      <path d="M44 46 C41 43 42 40 44 39 C46 38 46 42 44 46Z"/>

      {/* Far-right branch */}
      <path d="M106 65 C120 57 138 52 156 46" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M156 46 C160 44 162 42 160 40 C158 38 155 40 156 44Z"/>
      <path d="M156 46 C159 43 158 40 156 39 C154 38 154 42 156 46Z"/>

      {/* ── HEART (center, serves as O in AMORA) ── */}
      <path
        d="M100 100
           C94 91 80 88 80 78
           C80 71 85 67 91 67
           C95 67 98 70 100 73
           C102 70 105 67 109 67
           C115 67 120 71 120 78
           C120 88 106 91 100 100Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Trunk stub below heart */}
      <line x1="100" y1="100" x2="100" y2="115" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round"/>

      {/* ── Roots (below text) ── */}

      {/* Center root */}
      <path d="M100 115 L100 140" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <path d="M100 140 L100 158" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>

      {/* Center-left root */}
      <path d="M97 118 C88 126 76 132 62 140" stroke="currentColor" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
      <path d="M62 140 C54 145 47 150 40 156" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>

      {/* Center-right root */}
      <path d="M103 118 C112 126 124 132 138 140" stroke="currentColor" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
      <path d="M138 140 C146 145 153 150 160 156" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>

      {/* Outer-left root */}
      <path d="M95 121 C82 130 66 136 48 143" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <path d="M48 143 C38 148 30 153 22 158" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"/>

      {/* Outer-right root */}
      <path d="M105 121 C118 130 134 136 152 143" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <path d="M152 143 C162 148 170 153 178 158" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"/>

      {/* Far-left tendril */}
      <path d="M93 124 C78 133 60 139 40 146" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      <path d="M40 146 C32 150 24 154 16 159" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>

      {/* Far-right tendril */}
      <path d="M107 124 C122 133 140 139 160 146" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      <path d="M160 146 C168 150 176 154 184 159" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>

      {/* Dots */}
      <circle cx="14" cy="160" r="2.5"/>
      <circle cx="186" cy="160" r="2.5"/>

      {/* ── AMORA text letters (A M _ R A, heart is the O) ── */}
      <text
        x="100"
        y="97"
        textAnchor="middle"
        fontFamily="Serenity, Raleway, system-ui, sans-serif"
        fontSize="28"
        fontWeight="400"
        letterSpacing="18"
        fill="currentColor"
        dominantBaseline="middle"
      >AM   RA</text>
    </svg>
  );
}

/**
 * Default export: icon + "AM♡RA" text side by side (for nav use)
 */
export default function AmoraLogo({
  className = "",
  showText = true,
  iconClassName = "w-9 h-10",
}: {
  className?: string;
  showText?: boolean;
  iconClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <AmoraHeartIcon className={iconClassName} />
      {showText && (
        <span className="font-display font-medium tracking-[0.22em] text-xl leading-none">
          AM♡RA
        </span>
      )}
    </span>
  );
}
