/**
 * Which admin tabs exist, as data. Moved out of client/src/pages/Admin.tsx
 * unchanged.
 *
 * This is the file a module contributor has to edit to give their module an
 * admin tab, and until now that meant opening an 11,000-line page to add one
 * line to a list. It is the other half of the split client/src/lib/adminNav.ts
 * already describes: this is everything the panel CAN show, and
 * `filterNavByModules` there decides what this village DOES show. The two stay
 * separate on purpose, so keeping the pure filter testable without rendering
 * anything still costs nothing.
 *
 * One character changed in the move: an em dash in the Module Library comment
 * became a colon, because the house writing rules forbid em dashes in new
 * files and this is a new file. Nothing else differs.
 */
import type { LucideIcon } from "lucide-react";
import { Activity, BarChart3, Calendar, Circle, Coins, FileText, GraduationCap, Handshake, HardDrive, Heart, HelpCircle, Home, Inbox, KeyRound, LogOut, Mail, MessageSquare, Moon, Scale, Sparkles, ToggleLeft, TrendingUp, Users, Users2 } from "lucide-react";
import type { TabBadge } from "@/lib/adminNav";
import { CONTENT_SECTIONS } from "./contentSections";

/**
 * The admin nav, as data.
 *
 * It used to be ~11k characters of hand-copied <button> blocks, which is why
 * it could only ever be one width: every one of the thirty-odd items would
 * have had to learn about collapsing separately. One list renders once, and
 * the rail below decides how wide to draw it.
 *
 * `setup` moves: a front door while the village is still being set up, an
 * ordinary settings row once it is done.
 */
export type NavItem = { key: string; label: string; icon: LucideIcon; badge?: TabBadge };
export type NavGroup = { title: string; items: NavItem[] };

export function navGroups(setupComplete: boolean): NavGroup[] {
  return [
    ...(setupComplete ? [] : [{
      title: "Start here",
      items: [{ key: "setup", label: "Make This Yours", icon: Sparkles }],
    }]),
    {
      title: "Submissions",
      items: [
        { key: "submissions", label: "All Forms", icon: Inbox },
        { key: "feedback", label: "Feedback", icon: HelpCircle },
        { key: "forum-moderation", label: "Moderation", icon: Users2 },
        // Beside the forum queue on purpose: the same job, the same card, and
        // the two are the only places a flag from a member ever lands.
        { key: "message-reports", label: "Message Reports", icon: MessageSquare },
        { key: "products", label: "Payments", icon: Handshake },
      ],
    },
    { title: "Content", items: CONTENT_SECTIONS.map(s => ({ ...s })) },
    {
      title: "Notifications",
      items: [
        { key: "email-settings", label: "Email Settings", icon: Mail },
        { key: "integrations", label: "Integrations", icon: KeyRound },
      ],
    },
    {
      // The guide's own two surfaces. What she knows, and what she has asked
      // for. Both are hers to propose and yours to decide, so they sit
      // together and away from the tabs that take effect the moment you save.
      title: "The Guide",
      items: [
        { key: "brain", label: "Village Brain", icon: FileText },
        { key: "drafts", label: "Her Drafts", icon: Inbox },
      ],
    },
    {
      // Beside the vault on purpose: the vault is the door that filled the
      // volume with files nothing pointed at, and this is where a founder sees
      // what is on it.
      title: "Documents",
      items: [
        { key: "investor-vault", label: "Investor Vault", icon: FileText },
        { key: "uploaded-files", label: "Uploaded Files", icon: HardDrive },
      ],
    },
    { title: "Training", items: [{ key: "training-modules", label: "Training Modules", icon: GraduationCap }] },
    {
      title: "The Game",
      items: [
        // First in the group on purpose: this is the master switch for what
        // the village runs, and it used to hide mid-list under the same
        // label as the training-content tab above: nobody could find it.
        // "Module Library" now (L1): the same page a founder browses at
        // /modules, with the lifecycle controls only admins get. The key
        // stays `modules` so every deep link survives.
        { key: "modules", label: "Module Library", icon: ToggleLeft },
        // Second in the group, and directly under the master switch, because
        // it is the answer the rest of the group is FOR (R1, lane N2): which
        // needs this village is taking on, how far it means to get on each,
        // and what does the meeting. It is also step 2 of the Setup Wizard, so
        // this row is where a founder comes back to it once setup is done.
        { key: "needs-admin", label: "What This Village Is For", icon: Heart },
        { key: "quests-admin", label: "Quests", icon: Sparkles },
        { key: "quest-claims", label: "Quest Claims", icon: Sparkles },
        { key: "players", label: "Players", icon: Users },
        { key: "game-roles", label: "Game Roles", icon: Users2 },
        // 0098. What the village looks after, and the two steps that move a
        // power onto a role. Beside Game Roles because the first of those
        // two steps is a role edit, and a founder who opens one wants the
        // other in the same breath.
        { key: "handover", label: "The Handover", icon: KeyRound },
        // The sociocratic org chart. Distinct from "Game Roles" above, which
        // edits permission groups; this is the seats people actually hold.
        { key: "org-chart", label: "Org Chart", icon: Users2 },
        // The allocation table `governance.weight_mode` promises by name: its
        // Custom option says weight comes from "the allocation table you keep
        // under Voting weights", and until this tab the table's only writers
        // were two routes nothing in the browser called. It rides
        // TAB_MODULE's governance mapping, so a village with the engine off
        // never sees it.
        { key: "governance-weights", label: "Voting Weights", icon: Scale },
        // Season patterns and the retrospective. Separate from the Season
        // tab's dates: this is what a season CARRIES, not when it runs.
        { key: "seasons-patterns", label: "Season Shapes", icon: Calendar },
        { key: "circles-map", label: "Circles & Map", icon: Circle },
        // Beside the map on purpose: a hamlet's homes are keyed by the same
        // structure key the map mints, and builder mode edits the same rows.
        { key: "housing", label: "Housing & Reservations", icon: Home },
        // Next to the map on purpose: a gathering's structure keys are what
        // light the map's buildings, so the two are edited in the same visit.
        { key: "events-admin", label: "Calendar", icon: Calendar },
        { key: "tools-admin", label: "Tools", icon: Handshake },
        // The crowdpool shipped with campaign linking in module config and no
        // door to it, so a founder could enable the module and never link a
        // raising. This is that door.
        { key: "crowdpool-admin", label: "Crowdpool", icon: Coins },
        { key: "stays-admin", label: "Stays & Payments", icon: Home },
        { key: "exchange-admin", label: "Exchange", icon: TrendingUp },
        { key: "badges-admin", label: "Badges", icon: GraduationCap },
        { key: "library-admin", label: "Library", icon: Inbox },
        { key: "health-admin", label: "Village Health", icon: Activity },
        { key: "resources-admin", label: "How Resources Flow", icon: Coins },
        { key: "exits-admin", label: "Departures", icon: LogOut },
        { key: "calls-admin", label: "Calls", icon: Calendar },
        { key: "intents-admin", label: "Introductions", icon: Handshake },
        { key: "tokens", label: "Tokens", icon: Coins },
        { key: "ledger", label: "Ledger", icon: BarChart3 },
        // With the other economy desks, and after the Ledger on purpose: this
        // is the one admin act that releases value, so it sits where a founder
        // has just been reading what the ledger holds.
        { key: "cycles", label: "Cycle Close", icon: Moon },
        { key: "variables", label: "Game Mechanics", icon: Activity },
        { key: "season", label: "Season", icon: Circle },
      ],
    },
    {
      title: "Site Content",
      items: [
        { key: "settings", label: "Settings", icon: Coins },
        { key: "work-with-us", label: "Work With Us", icon: Handshake },
        { key: "faqs", label: "FAQs", icon: HelpCircle },
        { key: "milestones", label: "Build Progress", icon: Activity },
        { key: "visit-config", label: "Visit Program", icon: Calendar },
        { key: "investor-summary", label: "Investor Summary", icon: BarChart3 },
      ],
    },
    ...(setupComplete ? [{
      title: "Settings",
      items: [{ key: "setup", label: "Project Settings", icon: Sparkles }],
    }] : []),
  ];
}
