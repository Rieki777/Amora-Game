/**
 * THE VARIABLES REGISTRY: the foundation every other system reads from.
 *
 * Every tunable number, toggle, threshold and address in the game lives here as
 * data, editable from Admin, so a village customizes its game without a
 * developer and without a deploy. This is the layer that makes the platform
 * genuinely re-usable: two land projects running the same code can play very
 * different games purely by editing these values.
 *
 * The rule going forward: if a rule of the game is expressed as a literal in
 * code, it belongs here instead. `shared/gameConfig.ts` keeps IDENTITY (names,
 * paths, stage ladder, images); this file keeps BEHAVIOUR (how much, how often,
 * which mode).
 *
 * Values are stored as strings and parsed by `type`, so one table holds numbers,
 * booleans, choices and contract addresses without a column per kind. Regen
 * civics' equivalent table is numeric-only (`decimal(20,6)`), which cannot
 * express "equal voice or mirror Hypha" or an ERC-20 address; this shape can.
 */

import { GAME_CONFIG } from "./gameConfig";
import { STAGE_UNLOCKS } from "./capabilities";

export type VariableType = "integer" | "decimal" | "percentage" | "boolean" | "choice" | "text";

/**
 * THE THREE RINGS (Game Mechanics initiative, decided 2026-07-31).
 *
 * Ring 0 — constitutional — is not in this file at all: conservation, the one
 * capability gate, fiat-in-only and their siblings live in code and are
 * PUBLISHED (shared/constitution.ts) but never tunable. This registry holds
 * the other two rings:
 *
 *   "open"    — Ring 2: community-governable dials. These appear as editable
 *               mechanics on the public Game Mechanics page and are the
 *               domain of the Hypha proposal loop. The platform's min/max
 *               BOUNDS stay Ring 0: governance moves a value within its
 *               bounds, never the bounds.
 *   "founder" — Ring 1: tunable, but by the founder/admin only — legal
 *               posture, infrastructure, privacy windows, abuse guards.
 *               Shown on the public page (everything is visible) but marked
 *               founder-held and never proposable.
 *
 * The ring on a def is the PLATFORM CEILING. A founder can close an "open"
 * variable to their community; nothing can open a "founder" one to it.
 */
export type VariableRing = "open" | "founder";

/**
 * When a governance-passed change takes effect. "instant" is the default;
 * "cycle-close" marks variables whose mid-cycle change corrupts a settlement
 * basis (budgets, pools, multipliers — the sticky-split lesson): a passed
 * proposal for one of these applies at the next cycle close, giving humans
 * the window between passage and effect the governance design calls for.
 */
export type VariableApplyTiming = "instant" | "cycle-close";

export interface VariableDef {
  key: string;
  category: string;
  label: string;
  /** Plain language, shown in Admin. Written for a founder, not a developer. */
  description: string;
  type: VariableType;
  default: string;
  min?: number;
  max?: number;
  /** For `choice`: the allowed values and how to label them. */
  choices?: Array<{ value: string; label: string; hint?: string }>;
  unit?: string;
  /** Ring override. Absent = derived by ringOf() from category/key rules. */
  ring?: VariableRing;
  /** Apply-timing override. Absent = derived by applyTimingOf(). */
  applyTiming?: VariableApplyTiming;
}

/**
 * Voice weighting is decision 5, and the distinction matters: this app is the
 * INFORMAL sense-making step, Hypha is where formal decisions bind. So the app
 * never computes binding vote weight. It only chooses how to DISPLAY and tally
 * informal sensing, and the village picks which feels true to them.
 */
export const VOICE_WEIGHTING_CHOICES = [
  {
    value: "equal",
    label: "One person, one voice",
    hint: "Everyone's sensing counts the same, regardless of what they hold. Simplest and most equal.",
  },
  {
    value: "hypha-mirror",
    label: "Mirror Hypha Voice holdings",
    hint: "Sensing is weighted by each member's Voice token balance, so the informal step previews how a formal Hypha decision would land.",
  },
] as const;

export const VARIABLES: VariableDef[] = [
  // ── Gratitude: the in-site recognition economy ────────────────────────────
  {
    key: "gratitude.base_budget",
    category: "Gratitude",
    label: "Base sending budget per cycle",
    description:
      "How much Gratitude a member can give away each lunar cycle before their stage multiplier is applied. This is a budget to spend on others, not a balance they own.",
    type: "integer",
    default: "100",
    min: 0,
    max: 100000,
    unit: "Gratitude",
  },
  {
    key: "gratitude.pool_per_cycle",
    category: "Gratitude",
    label: "Value pool distributed at each cycle close",
    description:
      "How many tokens the village shares out when a lunar cycle closes. The pool is split among everyone in proportion to the recognition they received that cycle, so you decide how much there is and the community's appreciation decides where it goes. Set it to 0 to turn distribution off and let gratitude stay a signal on its own.",
    type: "integer",
    default: "1000",
    min: 0,
    max: 1000000,
    unit: "tokens",
  },
  {
    key: "gratitude.pool_token",
    category: "Gratitude",
    label: "Which token the pool pays",
    description:
      "The token the cycle pool pays out, for example your village's credits. The list holds the tokens this village issues itself, and it leaves out the recognition token on purpose: recognition is the signal, this is the value, and keeping them apart is what stops appreciation from becoming a price. Rename your tokens in the token registry and they change here too.",
    // Kept as text in the registry so validation stays permissive: the
    // fail-loud refusal at cycle close is the real guard, and it must keep
    // catching a value set by any other route. Admin decorates this key with
    // the deployment's own tokens (server/index.ts, GET /api/admin/variables),
    // so the ordinary path cannot reach the misconfiguration at all.
    type: "text",
    default: "credits",
  },
  {
    key: "ledger.admin_mint_cycle_cap",
    category: "Ledger",
    label: "Admin mint cap per lunar cycle",
    description:
      "The most any admins can mint by hand, in total, per token, per lunar cycle (S9's mint endpoint enforces it as an aggregate, not per call). A cap on manual issuance is what makes 'the numbers mean something' a property of the system instead of a promise from whoever holds admin. 0 disables manual minting entirely.",
    type: "integer",
    default: "10000",
    min: 0,
    max: 10000000,
    unit: "tokens",
  },
  {
    key: "gratitude.max_per_recipient_per_cycle",
    category: "Gratitude",
    label: "Maximum sends to the same person per cycle",
    description:
      "Stops one friendship from dominating recognition. Set to 1 so acknowledging someone is a considered act, once a month.",
    type: "integer",
    default: "1",
    min: 1,
    max: 100,
    unit: "sends",
  },
  {
    key: "gratitude.require_message",
    category: "Gratitude",
    label: "Require a message with every acknowledgment",
    description:
      "When on, Gratitude cannot be sent silently. The message is what makes recognition mean something to the person receiving it.",
    type: "boolean",
    default: "true",
  },
  {
    key: "gratitude.cycle_mode",
    category: "Gratitude",
    label: "Cycle rhythm",
    description:
      "Lunar cycles reset budgets at each new moon, matching ReGen Civics. Calendar months reset on the 1st. Lunar is the default because it gives the village a natural rhythm that is not the accounting calendar.",
    type: "choice",
    default: "lunar",
    choices: [
      { value: "lunar", label: "Lunar (new moon to new moon)", hint: "About 29.5 days. Matches ReGen Civics." },
      { value: "month", label: "Calendar month", hint: "Resets on the 1st of each month." },
    ],
  },

  // ── The org chart and its seasons ─────────────────────────────────────────
  {
    key: "org.reassignment_cadence",
    category: "Progression",
    label: "How often every seat reopens",
    description:
      "A season can end with every seat vacated and offered again. Reopening on a rhythm is how a village keeps seats from calcifying, because correcting a bad fit stops needing a confrontation and becomes a date everyone already knew about. A seat can opt out on its own card, and a term can always end sooner.",
    type: "choice",
    default: "season_turn",
    choices: [
      {
        value: "season_turn",
        label: "Every season turn",
        hint: "Recommended while a village is young: three months is short enough to learn fast and change what is not working.",
      },
      {
        value: "pattern_change",
        label: "When the season's shape changes",
        hint: "A founding season can run across several turns without reopening every seat each time.",
      },
      { value: "annual", label: "Once a year", hint: "One reopening a year, whatever the seasons did." },
      { value: "never", label: "Never", hint: "Seats end only on their own term date, or when somebody steps down." },
    ],
  },

  // ── Quests: how work becomes recognition ──────────────────────────────────
  {
    key: "quest.consent_cap_mode",
    category: "Quests",
    label: "How much can be released at consent",
    description:
      "Controls what an admin may award when consenting to finished work. Capping it at the posted amount keeps the quest board honest: what a quest advertises is what it pays.",
    type: "choice",
    default: "posted",
    choices: [
      { value: "posted", label: "Exactly the posted amount", hint: "Safest. The board is the contract." },
      { value: "capped", label: "Up to a multiple of the posted amount", hint: "Allows a bonus for exceptional work, within a ceiling." },
      { value: "unlimited", label: "Any amount", hint: "No ceiling. Only sensible with a very small, very trusted admin group." },
    ],
  },
  {
    key: "quest.consent_cap_multiplier",
    category: "Quests",
    label: "Bonus ceiling multiplier",
    description:
      "When the cap mode is 'up to a multiple', this is the most that can be awarded as a multiple of the posted amount. 2 means a quest posted at 100 can pay at most 200.",
    type: "decimal",
    default: "2",
    min: 1,
    max: 100,
    unit: "x posted",
  },
  {
    key: "quest.require_submission_before_consent",
    category: "Quests",
    label: "Require submitted work before consent",
    description:
      "When on, value can only be released for work that was actually filed. Turning this off lets an admin credit a quest nobody submitted, which breaks the promise that credit follows shown work.",
    type: "boolean",
    default: "true",
  },
  {
    key: "quest.allow_zero_consent",
    category: "Quests",
    label: "Allow consenting at zero",
    description:
      "When on, a claim can be consented with an amount of 0, meaning 'acknowledged, no recognition'. The claim completes and any stay-credit reward still releases, but no recognition moves. When off, consent must release at least 1.",
    type: "boolean",
    default: "false",
  },
  {
    key: "quest.self_consent_until_members",
    category: "Quests",
    label: "Founder may self-consent below this many members",
    description:
      "Consent normally needs a second person to witness the work: nobody may consent to their own claim. A founder building alone has nobody to ask, so while the village has FEWER than this many members, an admin or founder may consent to their own claims. Once the village reaches this size, the witness rule applies to everyone, admins included. 0 means self-consent is never allowed, even for a founder alone.",
    type: "integer",
    default: "6",
    min: 0,
    max: 1000,
    unit: "members",
  },

  // ── Governance: the informal step before Hypha ────────────────────────────
  {
    key: "governance.voice_weighting",
    category: "Governance",
    label: "How sensing is weighted",
    description:
      "This app is the informal, sense-making step. Formal decisions bind on Hypha, where Voice does the weighting. Choose whether the informal step gives everyone an equal voice, or previews the Hypha outcome by mirroring Voice holdings.",
    type: "choice",
    default: "equal",
    choices: VOICE_WEIGHTING_CHOICES.map((c) => ({ ...c })),
  },
  {
    key: "governance.hypha_threshold",
    category: "Governance",
    label: "Earned recognition to qualify as a proposer",
    description:
      "Earned recognition a member needs before they can OPEN mechanics proposals and sponsor others' drafts (below it, they can still draft; a qualified member's sponsorship opens a draft). The base posture is 0: any member may propose. Raise it to ask for earned standing first. Admins and founders always qualify.",
    type: "integer",
    default: "0",
    min: 0,
    max: 10000000,
    unit: "Gratitude",
  },
  {
    key: "governance.sensing_days",
    category: "Governance",
    label: "How long a topic stays open for sensing",
    description:
      "Days a proposal collects perspectives before it can move to a decision. Long enough that quiet people get heard, short enough that momentum survives.",
    type: "integer",
    default: "7",
    min: 1,
    max: 90,
    unit: "days",
  },
  {
    key: "governance.proposals_per_member_per_cycle",
    category: "Governance",
    label: "Mechanics proposals per member per cycle",
    description:
      "How many game-rule change proposals one member may open per cycle. A ceiling on flooding, not on participation: supporting and sponsoring other proposals is never limited.",
    type: "integer",
    default: "5",
    min: 1,
    max: 100,
    unit: "per cycle",
  },
  {
    key: "governance.proposal_support_threshold",
    category: "Governance",
    label: "Supporters before a proposal can go to Hypha",
    description:
      "How many members must support a mechanics proposal in-game before it can be taken to Hypha for the binding vote. The sensing step: proposals gather perspectives here first, and only what the village actually wants reaches the chain. 0 turns the gate off: any open proposal can go straight to Hypha.",
    type: "integer",
    default: "0",
    min: 0,
    max: 10000,
    unit: "supporters",
  },
  {
    key: "governance.hub_url",
    category: "Governance",
    label: "ReGen governance hub URL",
    description:
      "Base URL of the ReGen hub that listens to the chain for this village. When a proposal's Hypha URL is pasted in, the platform registers the on-chain proposal id with this hub (signed with the shared governance secret) so the verified outcome can find its way home. Leave as the platform default unless you run your own hub.",
    type: "text",
    // The ReGen hub is a platform SERVICE this village talks to, and a fork
    // points it at its own hub or leaves it, the same way it leaves the
    // Stripe endpoint alone. The waiver rides the line itself, because the
    // guard reads the line carrying the hit and nothing above it.
    default: "https://regencivics.earth", // brand-ok: platform service, not a village's name
    ring: "founder",
  },
  {
    key: "governance.auto_apply_enabled",
    category: "Governance",
    label: "Apply verified proposals automatically",
    description:
      "When on, a proposal verified as passed on-chain applies itself: instantly for instant dials, at the next cycle close when the set touches any cycle-timed dial (the whole set waits together; a set applies atomically or not at all). Turning this OFF is the founder's emergency brake: verified proposals hold, stewards are notified, and applying becomes a human act until it is turned back on. Founder-held on purpose.",
    type: "boolean",
    default: "true",
    ring: "founder",
  },
  {
    key: "governance.change_cooldown_days",
    category: "Governance",
    label: "Cooldown after a governed rule change",
    description:
      "After a dial is changed by a passed proposal, this many days must pass before a new proposal may move that same dial again. Prevents rule-thrash and vote fatigue. 0 turns the cooldown off.",
    type: "integer",
    default: "0",
    min: 0,
    max: 365,
    unit: "days",
  },

  // ── Tokens: read from Base, governed on Hypha ──────────────────────────────
  {
    key: "tokens.equity_address",
    category: "Tokens",
    label: "Equity token contract address on Base",
    description:
      "The ERC-20 address for the project's equity token. The platform only ever READS this balance to display it: minting, pricing and governance all happen on Hypha. Leave blank until the token is deployed and nothing is shown.",
    type: "text",
    default: "",
  },
  {
    key: "tokens.voice_address",
    category: "Tokens",
    label: "Governance token contract address on Base",
    description:
      "The ERC-20 address for the governance-weight token. Read-only here, exactly like the equity token.",
    type: "text",
    default: "",
  },
  {
    key: "tokens.show_economics_section",
    category: "Tokens",
    label: "Show the economics section",
    description:
      "Displays token balances and Gratitude flows on member profiles. Turn off while the tokens are still being designed so members are not shown empty charts.",
    type: "boolean",
    default: "false",
  },
  {
    key: "tokens.base_rpc_url",
    category: "Tokens",
    label: "Base RPC endpoint",
    description:
      "Where balances are read from. A public endpoint is fine to start; a dedicated one is more reliable under load. If this fails, the platform shows nothing, never a wrong number.",
    type: "text",
    default: "https://mainnet.base.org",
  },

  // ── Hypha (S13): the SINGLE home for the DHO URL. Everything share-like —
  //    governance, voting, equity — happens on Hypha; the platform deep-links
  //    and never rebuilds it. Blank = every Hypha surface hides. ─────────────
  {
    key: "hypha.org_url",
    category: "Hypha",
    label: "Your Hypha DHO address",
    description:
      "The one place this platform sends people for governance, proposals, treasury and membership on Hypha. Every module derives its deep links from this single value; leaving it blank hides every Hypha button, so nobody meets a dead link.",
    type: "text",
    default: "",
  },
  {
    key: "hypha.space_id",
    category: "Hypha",
    label: "Hypha space id (on-chain)",
    description:
      "The numeric id of your DAO's space on Hypha's Base contracts. Every on-chain proposal your DAO creates is stamped with it. Found in your Hypha space's URL or from any of its proposals on Basescan. Used to verify that on-chain outcomes claiming to be yours really came from your space.",
    type: "text",
    default: "",
    ring: "founder",
  },
  {
    key: "hypha.founder_base_address",
    category: "Hypha",
    label: "Founder Base account address",
    description:
      "The 0x address that created your DAO and issued its first tokens on Base. Used by Integrate DAO to discover your token contracts automatically: issue yourself even a tiny amount of each token, and the lookup finds the contract by the token's exact name in this account's transfer history.",
    type: "text",
    default: "",
    ring: "founder",
  },
  {
    key: "hypha.link_governance",
    category: "Hypha",
    label: "Override: governance link",
    description: "Only if your DHO's governance page is not at the org root. Blank derives from the DHO address.",
    type: "text",
    default: "",
  },
  {
    key: "hypha.link_proposals",
    category: "Hypha",
    label: "Override: proposals link",
    description: "Only if your DHO's proposals page is not at /agreements. Blank derives from the DHO address.",
    type: "text",
    default: "",
  },
  {
    key: "hypha.link_treasury",
    category: "Hypha",
    label: "Override: treasury link",
    description: "Only if your DHO's treasury page is not at /treasury. Blank derives from the DHO address.",
    type: "text",
    default: "",
  },
  {
    key: "hypha.link_members",
    category: "Hypha",
    label: "Override: members link",
    description: "Only if your DHO's members page is not at /members. Blank derives from the DHO address.",
    type: "text",
    default: "",
  },

  // ── Tools hub (S15; visible in Admin only while the module is non-off) ────
  {
    key: "tools.click_tracking",
    category: "Tools",
    label: "Count tool opens",
    description:
      "When on, opening a tool records an anonymous-friendly click row (member id attached only for signed-in members) so admins can see which tools the village actually uses. Turning it off records nothing, a village-level privacy choice.",
    type: "boolean",
    default: "true",
  },
  {
    key: "tools.link_check_days",
    category: "Tools",
    label: "Days between automatic link checks",
    description:
      "0 means manual-only: admins run 'Check links now' from the Tools tab. A cadence takes effect once the platform scheduler ships (v3 S16); setting it earlier is harmless and remembered.",
    type: "integer",
    default: "0",
    min: 0,
    max: 90,
    unit: "days",
  },

  // ── Data lifecycle (S18). Every fork inherits this posture — Gate F's
  //    legal scope includes data protection (Costa Rica Law 8968). ──────────
  // ── Sessions & email delivery ─────────────────────────────────────────────
  {
    key: "auth.session_days",
    category: "Accounts & sessions",
    label: "Signed-in session length",
    description:
      "How long a sign-in lasts before the member has to sign in again. Applies to sessions started AFTER a change: existing sessions keep the length they were minted with. Shorter is safer on shared devices; longer is kinder on personal phones.",
    type: "integer",
    default: "30",
    min: 1,
    max: 365,
    unit: "days",
  },
  {
    key: "notify.daily_email_cap",
    category: "Accounts & sessions",
    label: "Most emails one member receives per day",
    description:
      "Over this many notification emails in a rolling 24 hours, further ones stay in-app only (the notification itself is never lost; only the email is skipped). A ceiling on noisy days, not a quota: raise it for a large, busy village.",
    type: "integer",
    default: "20",
    min: 1,
    max: 200,
    unit: "per day",
  },

  // ── Abuse guards: throttles on the public writers ─────────────────────────
  // Per-IP unless stated. These are ceilings on ABUSE, not on members: keep
  // them generous — a whole village behind one NAT shares each IP bucket.
  {
    key: "abuse.register_per_ip_hourly",
    category: "Abuse guards",
    label: "Registrations per IP per hour",
    description:
      "How many account registrations one IP address may attempt per hour. Also bounds how fast an outsider can probe which email addresses belong to members. An onboarding gathering behind one shared connection counts as one IP, so keep this comfortably above the size of a signup circle.",
    type: "integer",
    default: "30",
    min: 1,
    max: 1000,
    unit: "per hour",
  },
  {
    key: "abuse.login_ip_per_quarter_hour",
    category: "Abuse guards",
    label: "Failed logins per IP per 15 minutes",
    description:
      "How many FAILED sign-in attempts one IP address may make per 15 minutes. Successful sign-ins never count. The per-account limit below is the real brute-force bound; this one only caps bulk abuse from a single address, so it can stay loose.",
    type: "integer",
    default: "30",
    min: 1,
    max: 1000,
    unit: "per 15 min",
  },
  {
    key: "abuse.login_account_per_quarter_hour",
    category: "Abuse guards",
    label: "Failed logins per account per 15 minutes",
    description:
      "How many FAILED sign-in attempts any one account may receive per 15 minutes, from all addresses combined: the bound an attacker with many IPs cannot dodge. Successful sign-ins never count. Anyone who knows an address can briefly lock that account out by failing on purpose, so do not set this too low.",
    type: "integer",
    default: "10",
    min: 1,
    max: 100,
    unit: "per 15 min",
  },
  {
    key: "abuse.password_reset_per_ip_hourly",
    category: "Abuse guards",
    label: "Password-reset requests per IP per hour",
    description:
      "How many 'forgot password' requests one IP address may make per hour. Each one can send an email, so this bounds using the village as a mail cannon. A separate per-address limit always applies as well, so one member cannot be mail-bombed from many addresses.",
    type: "integer",
    default: "10",
    min: 1,
    max: 200,
    unit: "per hour",
  },
  {
    key: "abuse.investor_docs_per_ip_hourly",
    category: "Abuse guards",
    label: "Investor-packet requests per IP per hour",
    description:
      "How many investor document requests one IP address may make per hour. Each request stores a lead and emails the packet to the address given, so unthrottled it doubles as a spam cannon. Several genuine investors behind one corporate network share a bucket, so keep this above 1.",
    type: "integer",
    default: "3",
    min: 1,
    max: 100,
    unit: "per hour",
  },

  {
    key: "retention.submissions_days",
    category: "Data lifecycle",
    label: "Keep handled form submissions for",
    description:
      "Form submissions carry personal details (names, emails, phone numbers). Once a submission has been handled (any status other than new), it is deleted this many days after it arrived. Unhandled submissions are never swept: an unread message is a commitment, not clutter. 0 keeps everything forever.",
    type: "integer",
    default: "365",
    min: 0,
    max: 3650,
    unit: "days",
  },
  {
    key: "retention.notifications_days",
    category: "Data lifecycle",
    label: "Keep read notifications for",
    description:
      "Read notifications older than this are deleted by the daily sweep. Unread ones stay: they have not done their job yet. 0 keeps everything forever.",
    type: "integer",
    default: "90",
    min: 0,
    max: 3650,
    unit: "days",
  },

  // ── Village map (S19-S23; visible in Admin only while the module is non-off) ──
  {
    key: "map.public_structure",
    category: "Village map",
    label: "Show the map's structure to visitors",
    description:
      "When the map module is public, anonymous visitors see circles, role titles and seat counts, never names or faces. Off hides the map from visitors entirely, even at public lifecycle.",
    type: "boolean",
    default: "true",
  },
  {
    key: "map.concierge_enabled",
    category: "Village map",
    label: "Show the coordination concierge",
    description:
      "The 'what do you want to do?' bar that routes a member to the right circle, role or quest. Deterministic matching always runs first; the assistant is only consulted for ambiguous asks, and only when an API key is configured.",
    type: "boolean",
    default: "true",
  },
  {
    key: "map.contact_daily_cap",
    category: "Village map",
    label: "Contact requests a member may send per day",
    description: "The relay's outbound brake. 0 disables the contact relay entirely.",
    type: "integer",
    default: "5",
    min: 0,
    max: 50,
    unit: "messages",
  },
  {
    key: "map.contact_recipient_daily_cap",
    category: "Village map",
    label: "Contact requests one person receives per day",
    description:
      "Protects busy role holders. Once someone's day is full, would-be senders are pointed at the circle's open quests instead.",
    type: "integer",
    default: "3",
    min: 1,
    max: 20,
    unit: "messages",
  },
  {
    key: "map.show_quests",
    category: "Village map",
    label: "Show open quests on the map",
    description: "Open quests orbit their circle as small satellites, capped for legibility.",
    type: "boolean",
    default: "true",
  },
  {
    key: "map.vacant_highlight",
    category: "Village map",
    label: "Highlight vacant seats",
    description: "Vacant roles pulse gently as an open call. Off renders them as plain grey rings.",
    type: "boolean",
    default: "true",
  },
  {
    key: "map.contact_retention_days",
    category: "Village map",
    label: "Keep contact message bodies for",
    description:
      "Relay message bodies are personal correspondence: the daily sweep clears bodies older than this while keeping the contact event itself (who reached whom, when). 0 keeps bodies forever.",
    type: "integer",
    default: "180",
    min: 0,
    max: 3650,
    unit: "days",
  },

  // ── Events (0059; visible in Admin only while the module is non-off) ─────
  //
  // Three knobs, and all three are READ. A registered variable nothing reads
  // is a lie with a save button: an admin changes it, believes the village
  // behaves differently, and says so out loud. rsvp_enabled gates the RSVP
  // route, and the two windows bound the list query.
  {
    key: "events.rsvp_enabled",
    category: "Events",
    label: "Let members RSVP",
    description:
      "Members can say they are coming, and a gathering with a capacity counts them against it. Off leaves the calendar readable and takes no answers, which suits a village that handles attendance elsewhere.",
    type: "boolean",
    default: "true",
  },
  {
    key: "events.upcoming_days",
    category: "Events",
    label: "Show gatherings this far ahead",
    description:
      "How far into the future the calendar looks. Anything starting beyond this is stored and stays hidden until it comes into range.",
    type: "integer",
    default: "90",
    min: 1,
    max: 730,
    unit: "days",
  },
  {
    key: "events.past_visible_days",
    category: "Events",
    label: "Keep finished gatherings listed for",
    description:
      "A gathering that has ended stays on the calendar this long. Dropping one the moment it starts tells somebody standing at the door that nothing is happening.",
    type: "integer",
    default: "30",
    min: 0,
    max: 365,
    unit: "days",
  },

  // ── Forum (S24-S26; visible in Admin only while the module is non-off) ────
  {
    key: "forum.report_hide_threshold",
    category: "Forum",
    label: "Soft reports that auto-hide a post",
    description:
      "When this many DIFFERENT members soft-report the same thread or reply, it hides automatically pending moderation, so the community can act before a moderator wakes up. Hard reports always go straight to the queue without hiding.",
    type: "integer",
    default: "3",
    min: 2,
    max: 10,
    unit: "reports",
  },

  // ── Gratitude feed (S27-S29; visible while the feed module is non-off) ────
  {
    key: "feed.category_slug",
    category: "Feed",
    label: "Which forum category the feed shows",
    description:
      "The feed is a LENS over one forum category plus the village's system events. It is not a second content store. Point it at the category where everyday village life gets posted.",
    type: "text",
    default: "village-life",
  },
  {
    key: "feed.show_system_events",
    category: "Feed",
    label: "Weave the village's own milestones into the feed",
    description:
      "On, the feed mixes what the village DID (quests consented, seasons turning, people arriving) " +
      "in among what people wrote. Off, it is only posts. A young village usually wants this on, because " +
      "a feed with three posts and no events reads as abandoned.",
    type: "boolean",
    default: "true",
  },
  {
    key: "feed.max_post_length",
    category: "Feed",
    label: "How much of a long post the feed shows",
    description:
      "Posts longer than this are cut off in the feed with the rest behind the post itself. Nothing is " +
      "deleted; this only decides how much of a long piece takes over the page.",
    type: "integer",
    default: "600",
    min: 120,
    max: 4000,
    unit: "characters",
  },
  {
    key: "feed.heart_amount",
    category: "Feed",
    label: "Recognition each heart sends",
    description:
      "A heart is a REAL send from the tapper's cycle budget, small on purpose. Bounded 1-5 (economy critique): hearts are a tap, not a transfer instrument.",
    type: "integer",
    default: "1",
    min: 1,
    max: 5,
    unit: "recognition",
  },
  {
    key: "feed.max_hearts_per_recipient_per_cycle",
    category: "Feed",
    label: "Hearts one person may send another per cycle",
    description:
      "The heart channel's own per-recipient ceiling, separate from written acknowledgments. Both draw from the same cycle budget.",
    type: "integer",
    default: "5",
    min: 1,
    max: 20,
    unit: "hearts",
  },

  // ── Stays: accommodation on stay credits (funds-bearing module) ───────────
  {
    key: "stay.guest_booking_enabled",
    category: "Stays",
    label: "Guests can request stays",
    description:
      "When off, only members can request a stay; visitors see the catalog but must join (or write in) first.",
    type: "boolean",
    default: "true",
  },
  {
    key: "stay.autopay_default",
    category: "Stays",
    label: "New stays autopay by default",
    description:
      "Whether a newly activated stay burns one credit per night automatically. A guest can have autopay turned off per-stay by an admin (e.g. billing disputes).",
    type: "boolean",
    default: "true",
  },
  {
    key: "stay.autopay_post_hour",
    category: "Stays",
    label: "Hour nightly credits post (UTC)",
    description:
      "The scheduler posts each active stay's nightly credit once per day at (or after) this hour, UTC. Catch-up is automatic and idempotent if the server slept through a night.",
    type: "integer",
    default: "10",
    min: 0,
    max: 23,
    unit: "h UTC",
  },
  {
    key: "stay.low_balance_warn_nights",
    category: "Stays",
    label: "Low-balance warning threshold",
    description:
      "Notify a guest when their remaining credits cover this many nights or fewer at their current rate.",
    type: "integer",
    default: "2",
    min: 0,
    max: 30,
    unit: "nights",
  },
  {
    key: "stay.grace_nights",
    category: "Stays",
    label: "Grace nights below zero",
    description:
      "How many nights a stay may keep posting after the balance hits zero before autopay refuses and admins are alerted. The debt is real and visible: a negative balance, not a hidden tab.",
    type: "integer",
    default: "2",
    min: 0,
    max: 14,
    unit: "nights",
  },
  {
    key: "stay.max_purchase_nights",
    category: "Stays",
    label: "Most nights purchasable at once",
    description: "Ceiling on a single credit purchase, counted in nights at the room's posted rate.",
    type: "integer",
    default: "60",
    min: 1,
    max: 365,
    unit: "nights",
  },
  {
    key: "stay.credit_expiry_days",
    category: "Stays",
    label: "Credit expiry (0 = never)",
    description:
      "Days until unspent stay credits expire. 0 means they never expire. Expiry is a policy contract shipped ahead of enforcement: v1 does not yet sweep expired credits.",
    type: "integer",
    default: "0",
    min: 0,
    max: 3650,
    unit: "days",
  },
  {
    key: "stay.credits_transferable",
    category: "Stays",
    label: "Members can gift credits to each other",
    description:
      "Off by default: credits are personal. Turning this on lets a member transfer credits to another member (a future surface; the token stays non-transferable until then).",
    type: "boolean",
    default: "false",
  },
  {
    key: "stay.work_exchange_tag",
    category: "Stays",
    label: "Work-exchange quest tag",
    description:
      "Quests carrying this tag appear on the Stay page as ways to EARN credits. The reward itself lives on each quest (stay-credit reward field).",
    type: "text",
    default: "work-exchange",
  },

  // ── Exchange: the buy-only token market ──────────────────────────────────
  {
    key: "exchange.price_change_max_pct",
    category: "Exchange",
    label: "Largest single price change",
    description:
      "How far one posted price may move from the previous one, in percent. Big moves happen in bounded steps, each with its own note, so the price history stays a story, not a cliff. 0 removes the bound.",
    type: "integer",
    default: "20",
    min: 0,
    max: 1000,
    unit: "%",
  },

  // ── Library: the material library's credit economy ───────────────────────
  {
    key: "library.intake_award_pct",
    category: "Library",
    label: "Intake award, % of appraisal",
    description:
      "What a donor earns, as a share of the item's appraised replacement value. Never above 100: the mint's front door pays at most what the shelf gained.",
    type: "integer",
    default: "75",
    min: 0,
    max: 100,
    unit: "%",
  },
  {
    key: "library.intake_member_cycle_cap",
    category: "Library",
    label: "Intake credits per member per cycle",
    description:
      "The most one member can earn from donations in one lunation. Intake is a mint; this is its per-person throttle. 0 disables the cap.",
    type: "integer",
    default: "500",
    min: 0,
    max: 100000,
    unit: "credits",
  },
  {
    key: "library.intake_dual_signoff_over",
    category: "Library",
    label: "Dual sign-off above (appraisal)",
    description:
      "An item appraised above this needs a SECOND steward's approval before any credits mint. 0 turns the second signature off.",
    type: "integer",
    default: "200",
    min: 0,
    max: 100000,
    unit: "credits",
  },
  {
    key: "library.escrow_pct",
    category: "Library",
    label: "Borrowing escrow, % of value",
    description:
      "The deposit locked while an item is out, as a share of its appraised value. Returned at settle, minus wear and damage.",
    type: "integer",
    default: "25",
    min: 0,
    max: 200,
    unit: "%",
  },
  {
    key: "library.usage_fee_pct",
    category: "Library",
    label: "Usage fee per loan, % of value",
    description:
      "The default wear fee a normal return pays into the library pool, and what a dispute resolves to after its deadline (computed wear, zero damage).",
    type: "integer",
    default: "5",
    min: 0,
    max: 100,
    unit: "%",
  },
  {
    key: "library.loan_days_default",
    category: "Library",
    label: "Loan length",
    description: "Days from pickup to due date.",
    type: "integer",
    default: "14",
    min: 1,
    max: 365,
    unit: "days",
  },
  {
    key: "library.dispute_deadline_days",
    category: "Library",
    label: "Dispute deadline",
    description:
      "How long a disputed return may sit before stewards settle it with the default outcome (computed wear, zero damage). A policy contract surfaced in the admin panel; v1 does not auto-settle.",
    type: "integer",
    default: "14",
    min: 1,
    max: 90,
    unit: "days",
  },

  {
    key: "exchange.swap_spread_bps",
    category: "Exchange",
    label: "The village's share of each swap",
    description:
      "In basis points, so half a percent is expressible (50 = 0.50%). This is a POLICY dial, not the safety mechanism: a swap can never profit the member even at 0, because the amount they hand over always rounds up. At 0 the confirm card reads 'the village keeps nothing on this swap'.",
    type: "integer",
    default: "0",
    min: 0,
    max: 2000,
    unit: "bps",
  },
  {
    key: "exchange.order_expiry_hours",
    category: "Exchange",
    label: "Abandoned card checkouts are released after",
    description:
      "A card purchase reserves an order the moment checkout opens, before the member has paid. If they close the tab, that order stays pending forever, and a pending order blocks BOTH turning the exchange off and letting that member leave the village. This is how long to wait before releasing one. Keep it comfortably above 24 hours: a Stripe checkout session stays payable that long, and releasing an order someone is still paying for would strand their money. 0 disables the release.",
    type: "integer",
    default: "48",
    min: 0,
    max: 720,
    unit: "hours",
  },
  {
    key: "exchange.swap_fiat_hold_days",
    category: "Exchange",
    label: "Card-bought tokens settle before they can be swapped",
    description:
      "Tokens bought with a card are frozen from swapping for this many days, long enough that a chargeback still finds them in the wallet instead of already converted. 0 disables the hold.",
    type: "integer",
    default: "45",
    min: 0,
    max: 180,
    unit: "days",
  },
  {
    key: "exchange.swap_max_receive_per_order",
    category: "Exchange",
    label: "Most a member can receive in one swap",
    description: "A ceiling on any single swap, whatever the caps allow across the cycle.",
    type: "integer",
    default: "500",
    min: 1,
    max: 1000000,
    unit: "tokens",
  },

  // ── Payments: platform-wide fiat guardrails (all fiat modules share) ──────
  {
    key: "payments.purchase_limit_per_order_usd",
    category: "Payments",
    label: "Largest single purchase (USD)",
    description:
      "Per-order ceiling across ALL fiat modules: stays, exchange, and anything after them. 0 disables the check.",
    type: "integer",
    default: "1000",
    min: 0,
    max: 100000,
    unit: "USD",
  },
  {
    key: "payments.purchase_limit_30d_usd",
    category: "Payments",
    label: "30-day purchase limit per member (USD)",
    description:
      "Rolling 30-day ceiling on one member's total fiat purchases, summed across every module. 0 disables the check.",
    type: "integer",
    default: "3000",
    min: 0,
    max: 1000000,
    unit: "USD",
  },
  {
    key: "payments.purchase_limit_annual_usd",
    category: "Payments",
    label: "Annual purchase limit per member (USD)",
    description:
      "Rolling 365-day ceiling on one member's total fiat purchases, summed across every module. 0 disables the check.",
    type: "integer",
    default: "10000",
    min: 0,
    max: 10000000,
    unit: "USD",
  },

  // ── Village rhythm ────────────────────────────────────────────────────────
  {
    key: "village.pulse_max_entries",
    category: "Village",
    label: "Village Pulse length",
    description:
      "How many recent happenings the public activity feed shows. Nothing is deleted; this is " +
      "how far back the page reaches, not how much the village keeps.",
    type: "integer",
    // Was 500, described as a retention limit, and read by nothing: the route
    // served a hard-coded 30 however the knob was set. Now the route reads it,
    // so the default is the number that was actually being served — turning a
    // dead setting on must not silently change what every village sees.
    default: "30",
    min: 10,
    max: 200,
    unit: "entries",
  },

  // ── Health (H7) ───────────────────────────────────────────────────────────
  {
    key: "health.alert_change_pct",
    category: "Health",
    label: "Alert when a metric moves this much",
    description:
      "After a lunation closes, any tracked metric that moved more than this against the previous lunation is flagged to the stewards, in either direction, without judging which is good. 0 turns alerts off.",
    type: "integer",
    default: "40",
    min: 0,
    max: 500,
    unit: "%",
  },

  // ── Library (L19) ─────────────────────────────────────────────────────────
  {
    key: "library.intake_stall_days",
    category: "Library",
    label: "Intake stall alarm",
    description:
      "An item awaiting its second sign-off longer than this many days appears in the stewards' daily digest: the donor already handed it over and is owed credits.",
    type: "integer",
    default: "7",
    min: 1,
    max: 60,
    unit: "days",
  },

  // ── Badges (B10) ──────────────────────────────────────────────────────────
  {
    key: "badges.max_featured",
    category: "Badges",
    label: "Featured badges per member",
    description:
      "How many badges a member may pin to their byline (forum posts, map chips). 0 turns featured chips off everywhere.",
    type: "integer",
    default: "3",
    min: 0,
    max: 10,
    unit: "badges",
  },

  // ── Platform feedback (S66) ───────────────────────────────────────────────
  {
    key: "platform.feedback_relay",
    category: "Platform",
    label: "Share bug reports and ideas with the platform team",
    description:
      "ON: a copy of each bug/idea submitted here also reaches the ReGen Civics platform team, so fixes and features can ship to every village. Content only, never who said it. OFF: feedback stays entirely local; your admins still see all of it in Admin → Feedback. Disclosed on the submission form either way.",
    type: "integer",
    default: "1",
    min: 0,
    max: 1,
    unit: "on/off",
  },

  // ── Recognition issuance that used to hide in a content document ──────────
  {
    key: "gratitude.proposal_accept_award",
    category: "Gratitude",
    label: "Recognition for an accepted Work With Us proposal",
    description:
      "How much recognition is minted for a member whose Work With Us proposal is accepted. This used to live inside the Work With Us content settings with no bounds; it is issuance, so it belongs here with the other Gratitude dials.",
    type: "integer",
    default: "100",
    min: 0,
    max: 100000,
    unit: "Gratitude",
  },

  // ── Per-member daily activity caps that were hardcoded ────────────────────
  {
    key: "stay.request_daily_cap",
    category: "Stays",
    label: "Stay requests per member per day",
    description:
      "How many stay requests one member may open in 24 hours. A cap on requests, not on stays: stewards still decide every activation.",
    type: "integer",
    default: "5",
    min: 1,
    max: 100,
    unit: "per day",
  },
  {
    key: "library.reserve_daily_cap",
    category: "Library",
    label: "Library reservations per member per day",
    description:
      "How many items one member may reserve in 24 hours. Bounds how fast one person can lock shelf items and escrow credits.",
    type: "integer",
    default: "10",
    min: 1,
    max: 100,
    unit: "per day",
  },
  {
    key: "payments.donation_max_usd",
    category: "Payments",
    label: "Largest checkout donation",
    description:
      "The ceiling on a single choose-your-amount donation checkout. Anything above it gets a personal conversation instead of a card form.",
    type: "integer",
    default: "50000",
    min: 1,
    max: 1000000,
    unit: "USD",
  },
];

// ── Progression: the ladder's economics and thresholds, GENERATED per stage ──
//
// These defs are derived from GAME_CONFIG.stages at module load, so a fork
// that edits its ladder (the identity plane) automatically gets matching,
// correctly-defaulted variables — the registry stays the single source of
// truth for BEHAVIOUR while the ladder's SHAPE stays identity. Defaults come
// from the config values that were previously hardcoded, so registering these
// changes nothing until a village edits them (the wire-a-knob-at-birth rule).

const STAGE_CHOICES = GAME_CONFIG.stages.map((s) => ({ value: s.id, label: s.name }));

const STAGE_MULTIPLIER_DEFS: VariableDef[] = GAME_CONFIG.stages.map((s) => ({
  key: `progression.multiplier.${s.id}`,
  category: "Progression",
  label: `Sending-budget multiplier: ${s.name}`,
  description: `Multiplies the base Gratitude sending budget for members at the ${s.name} stage. 0 means members at this stage cannot send yet.`,
  type: "decimal",
  default: String(s.gratitudeMultiplier),
  min: 0,
  max: 100,
  unit: "x base budget",
  applyTiming: "cycle-close",
}));

const STAGE_QUEST_DEFS: VariableDef[] = GAME_CONFIG.stages
  .filter((s) => s.rule.type === "quests")
  .map((s) => ({
    key: `progression.quests_for.${s.id}`,
    category: "Progression",
    label: `Consented quests to reach ${s.name}`,
    description: `How many consented quests advance a member to the ${s.name} stage. Raising it never demotes anyone retroactively on its own: stages are recomputed from live counts.`,
    type: "integer",
    default: String((s.rule as { type: "quests"; min: number }).min),
    min: 1,
    max: 1000,
    unit: "consented quests",
  }));

const UNLOCK_DEFS: VariableDef[] = (Object.entries(STAGE_UNLOCKS) as Array<[string, string]>).map(
  ([cap, stage]) => ({
    key: `progression.unlock.${cap}`,
    category: "Progression",
    label: `Stage that unlocks: ${cap}`,
    description: `Which rung of the ladder grants "${cap}" by progression alone. Roles and badges can still grant it at any stage; "never by stage" makes it role/badge-only. This is the constitution's parameter table, so move rungs deliberately.`,
    type: "choice",
    default: stage,
    choices: [
      ...STAGE_CHOICES,
      { value: "none", label: "Never by stage (role or badge only)" },
    ],
  }),
);

VARIABLES.push(...STAGE_MULTIPLIER_DEFS, ...STAGE_QUEST_DEFS, ...UNLOCK_DEFS);

/** Lookup by key, for validation and defaults. */
export const VARIABLES_BY_KEY: Record<string, VariableDef> = Object.fromEntries(
  VARIABLES.map((v) => [v.key, v]),
);

// A duplicated key would make VARIABLES_BY_KEY silently keep the last def and
// the admin list show two rows editing one value. With generated defs in the
// registry this is now reachable by a careless fork edit, so it fails LOUD at
// import — on the server at boot, in the client at bundle evaluation.
if (Object.keys(VARIABLES_BY_KEY).length !== VARIABLES.length) {
  const seen = new Set<string>();
  const dupes = VARIABLES.filter((v) => (seen.has(v.key) ? true : (seen.add(v.key), false)));
  throw new Error(`Duplicate game variable key(s): ${dupes.map((d) => d.key).join(", ")}`);
}

// ── Ring + apply-timing resolution ───────────────────────────────────────────

/** Categories whose variables default to founder-held (Ring 1). */
const FOUNDER_CATEGORIES = new Set(["Abuse guards", "Accounts & sessions", "Data lifecycle", "Platform"]);

/** Individual founder-held keys outside those categories: infrastructure,
 *  contract wiring, and privacy windows — not game rules. */
const FOUNDER_KEYS = new Set([
  "tokens.base_rpc_url",
  "tokens.equity_address",
  "tokens.voice_address",
  "governance.hub_url",
  "hypha.org_url",
  "hypha.link_governance",
  "hypha.link_proposals",
  "hypha.link_treasury",
  "hypha.link_members",
  "map.contact_retention_days",
]);

/** The platform ceiling for who may govern this dial. */
export function ringOf(def: VariableDef): VariableRing {
  if (def.ring) return def.ring;
  if (FOUNDER_KEYS.has(def.key)) return "founder";
  if (FOUNDER_CATEGORIES.has(def.category)) return "founder";
  return "open";
}

/** Keys whose mid-cycle change would corrupt a settlement basis. */
const CYCLE_APPLY_KEYS = new Set([
  "gratitude.base_budget",
  "gratitude.pool_per_cycle",
  "gratitude.pool_token",
  "gratitude.cycle_mode",
  "gratitude.max_per_recipient_per_cycle",
  "feed.heart_amount",
  "feed.max_hearts_per_recipient_per_cycle",
  "ledger.admin_mint_cycle_cap",
]);

export function applyTimingOf(def: VariableDef): VariableApplyTiming {
  if (def.applyTiming) return def.applyTiming;
  return CYCLE_APPLY_KEYS.has(def.key) ? "cycle-close" : "instant";
}

/** Parse a stored string into the type the caller expects. */
export function parseVariable(def: VariableDef, raw: string | undefined | null): number | boolean | string {
  const value = raw ?? def.default;
  switch (def.type) {
    case "boolean":
      return value === "true" || value === "1";
    case "integer":
      return Math.trunc(Number(value) || 0);
    case "decimal":
    case "percentage":
      return Number(value) || 0;
    default:
      return String(value);
  }
}

/**
 * Validate a proposed value. Returns an error message, or null when acceptable.
 * Runs on the server before any write, and is exported so Admin can show the
 * same message without a round trip.
 */
export function validateVariable(def: VariableDef, raw: string): string | null {
  if (def.type === "boolean") {
    return ["true", "false", "1", "0"].includes(raw) ? null : "Must be true or false.";
  }
  if (def.type === "choice") {
    const allowed = (def.choices ?? []).map((c) => c.value);
    return allowed.includes(raw) ? null : `Must be one of: ${allowed.join(", ")}.`;
  }
  if (def.type === "text") {
    if (raw.length > 255) return "Too long (255 characters maximum).";
    // Contract addresses must look like addresses, or a typo silently reads a
    // balance from nowhere and the member sees zero holdings.
    if (def.key.endsWith("_address") && raw !== "" && !/^0x[a-fA-F0-9]{40}$/.test(raw)) {
      return "Must be a valid contract address (0x followed by 40 hex characters), or blank.";
    }
    if (def.key.endsWith("_url") && raw !== "" && !/^https:\/\/\S+$/.test(raw)) {
      // Loopback is exempt: a local RPC node (anvil, hardhat, a test stub)
      // is http by nature and never crosses a network boundary.
      if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/\S*)?$/.test(raw)) {
        return "Must be an https URL (plain http is allowed only for 127.0.0.1/localhost).";
      }
    }
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Must be a number.";
  if (def.type === "integer" && !Number.isInteger(n)) return "Must be a whole number.";
  if (def.min !== undefined && n < def.min) return `Must be at least ${def.min}.`;
  if (def.max !== undefined && n > def.max) return `Must be at most ${def.max}.`;
  return null;
}
