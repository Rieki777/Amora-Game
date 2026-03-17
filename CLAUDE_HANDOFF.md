# Amora Game Site — Claude Handoff Guide

**Site:** game.amora.cr (subdomain of amora.cr)
**Built by:** Rieki Cordon / ReGen Civics
**Delivered:** March 2026
**Stack:** React 19 + Vite 7 + TypeScript + Tailwind v4 + Express

---

## Context: Two Separate Sites

Amora already has a primary site at **amora.cr** — that's a separate site you manage separately.

This project is **game.amora.cr** — a journey flow site that guides four participant types (Investors, Village Stewards, Residents, Prosperity Creators) through their path to joining the community. It lives on its own hosting environment with its own domain, database, and deployment.

Claude can help you with everything: making edits to pages, setting up hosting, configuring your domain, understanding the database, and deploying. Just describe what you want to change and Claude will walk you through it.

---

## Project Structure

```
game-amora/
├── client/
│   ├── public/
│   │   └── assets/
│   │       └── images/      # All images local — no CDN
│   └── src/
│       ├── pages/           # 16 route pages + Admin
│       ├── components/      # Layout, shared UI
│       └── main.tsx
├── server/
│   └── index.ts             # Express — serves frontend + API
├── data/
│   ├── content.json         # Editable site content (roles, circles, journeys)
│   ├── content-seed.json    # Original defaults — restore from here if needed
│   └── submissions.json     # All form submissions
├── shared/
│   └── const.ts
├── package.json
├── vite.config.ts
├── railway.toml
└── CLAUDE_HANDOFF.md        # This file
```

---

## Tech Stack

| Tool | Notes |
|------|-------|
| React 19 + Vite 7 | Clean build — no platform-specific plugins |
| TypeScript | Strict mode |
| Tailwind v4 | CSS custom property design tokens |
| Wouter | Client-side routing (not React Router) |
| Framer Motion | Page/section animations |
| Radix UI | Accessible component primitives |
| Express | Serves frontend + handles API routes |
| pnpm | Package manager — always use pnpm, not npm |

---

## Design System

Tokens are CSS custom properties in `client/src/index.css`.

| Token | Value | Use |
|-------|-------|-----|
| `--color-teal-deep` | `#2D5A5A` | Primary — buttons, headers, admin chrome |
| `--color-amber` | `#ECB163` | Accent — highlights, CTAs |
| Cormorant Garamond | Display font | All headings (`font-display` class) |
| Montserrat | Body font | All body text |
| Kalam | Accent font | Handwritten pull quotes |

Brand voice: heart-centered, regenerative, feminine, Costa Rican village energy. No corporate language. No AI-isms.

---

## Running Locally

```bash
pnpm install
pnpm dev        # Frontend dev server: http://localhost:3000
pnpm build      # Build for production
pnpm start      # Start production server
```

---

## Admin Panel

The admin panel lives at `/admin` on the live site (e.g. game.amora.cr/admin).

**Password:** `1love`

What you can do from admin:
- **View all form submissions** — every form filled out on the site, filterable by type (investor, steward, resident, prosperity, contact), newest first. Delete individual entries.
- **Edit journey page content** — change step titles, descriptions, and checklist items for all four journey paths without redeploying
- **Edit circles** — update circle names, descriptions, domains, focus areas
- **Edit roles** — update role names, purposes, responsibilities, members, compensation

Changes in admin save to `data/content.json` on the server and go live immediately.

---

## Form Submissions API

Forms on the site POST to `/api/forms/submit`:

```json
{ "type": "investor", "data": { "name": "Jane", "email": "jane@example.com", ... } }
```

Submissions are stored in `data/submissions.json`. No database needed for MVP.

---

## Pages (Wouter Routes)

| Route | File | Purpose |
|-------|------|---------|
| `/` | `Home.tsx` | Landing — 4 journey path selector |
| `/investor` | `InvestorJourney.tsx` | Investor path + form |
| `/steward` | `StewardJourney.tsx` | Village Steward path |
| `/resident` | `ResidentJourney.tsx` | Resident path |
| `/prosperity` | `ProsperityJourney.tsx` | Prosperity Creator path |
| `/circles` | `Circles.tsx` | Community circles |
| `/roles` | `Roles.tsx` | Governance roles |
| `/master-plan` | `MasterPlan.tsx` | Land vision |
| `/quests` | `Quests.tsx` | Community quest board |
| `/housing` | `Housing.tsx` | Housing options |
| `/opportunities` | `Opportunities.tsx` | Business opportunities |
| `/how-we-create` | `HowWeCreate.tsx` | Governance model |
| `/game-guide` | `GameGuide.tsx` | The Amora Game guide |
| `/love-letter` | `LoveLetter.tsx` | Founder love letter |
| `/team` | `Team.tsx` | Team page |
| `/co-creators-guide` | `CoCreatorsGuide.tsx` | Co-creators guide |
| `/admin` | `Admin.tsx` | Password-protected admin |

---

## Hosting (Recommended: Railway)

Claude can walk you through this step by step. Here's the overview:

1. Push the `game-amora/` folder to a GitHub repository
2. Go to railway.app, create a new project, connect your repo
3. Railway reads `railway.toml` automatically — build and start commands are already configured
4. Add environment variables in Railway dashboard:
   ```
   NODE_ENV=production
   PORT=3000
   ```
5. Add your custom domain `game.amora.cr` in Railway Settings > Domains
6. In your DNS (wherever amora.cr is managed), add a CNAME record pointing `game` to the Railway-provided hostname

Claude can walk through each of these steps with you interactively.

---

## Environment Variables

```env
NODE_ENV=production
PORT=3000

# Optional — Umami analytics (site works without these)
VITE_ANALYTICS_ENDPOINT=https://your-umami-instance.com
VITE_ANALYTICS_WEBSITE_ID=your-website-id
```

---

## Key Files for Content Edits

| What to change | Where |
|----------------|-------|
| Homepage hero text | `client/src/pages/Home.tsx` |
| Journey step titles/descriptions | Admin panel at /admin (no code needed) |
| Navigation links | `client/src/components/Layout.tsx` |
| Site title / meta / OG tags | `client/index.html` |
| Colors / fonts | `client/src/index.css` |
| Admin password | `server/index.ts` line with `ADMIN_PASSWORD` |

---

## Working With Claude on This Site

1. Tell Claude which page or feature you want to change. Be specific: "Update the hero headline on the home page" or "Add a new step to the Investor journey."
2. For visual changes, mention the design system: deep teal `#2D5A5A`, amber `#ECB163`, Cormorant Garamond for headings.
3. For content changes (journey steps, circles, roles) you can use the Admin panel without involving Claude at all.
4. For hosting setup, deployment, DNS, or database questions — just ask Claude. Describe where you're stuck and it will guide you.
5. After Claude edits files: commit with git, push to your repo, Railway auto-redeploys.

---

## Contact

Built by Rieki Cordon — rieki.cordon@gmail.com
ReGen Civics — regencivics.earth

For major structural changes, reach out to Rieki.

---

*Last updated: March 2026. Update this file when major structural changes are made.*
