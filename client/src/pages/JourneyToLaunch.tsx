import { useState, useEffect, FormEvent } from "react";
import Layout from "@/components/Layout";
import {
  CheckSquare,
  XSquare,
  Square,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  FileSpreadsheet,
  FileText,
  Globe,
  BookOpen,
  Calendar,
  TreePine,
  Lock,
  Edit2,
  Save,
  LayoutGrid,
  Link as LinkIcon,
  StickyNote,
  FileCheck,
  ClipboardList,
} from "lucide-react";

// ─── External Resource Links ─────────────────────────────────────────────────

const RESOURCES = [
  {
    label: "Dev Site",
    href: "https://amora.regencivics.earth",
    icon: Globe,
    color: "bg-teal text-white",
  },
  {
    label: "Variables Sheet",
    href: "https://docs.google.com/spreadsheets/d/1TRbaOTqGSEc_sLWLb2mDSb00HWgLRgNe/edit",
    icon: FileSpreadsheet,
    color: "bg-emerald-600 text-white",
  },
  {
    label: "Decision Log",
    href: "https://docs.google.com/document/d/1HySZYDf-QDRg_Srp_hUbUyI6TKHNIlLc/edit",
    icon: FileText,
    color: "bg-blue-600 text-white",
  },
  {
    label: "Game.Amora Doc",
    href: "https://docs.google.com/document/d/1uETHRx4UD8YAk3kr0ojOr0MTsm5EkF3ycG0j7STdoJU/edit?tab=t.0",
    icon: BookOpen,
    color: "bg-purple-600 text-white",
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

// "collab" = ReGen + Amora working on it together; "amora" = Amora-only action required
type DeliveryStatus = "done" | "amora" | "collab" | "pending";

interface Deliverable {
  id: string;
  text: string;
  status: DeliveryStatus;
  pageLink?: string; // page id to jump to in Page Copy view
}

interface Week {
  id: string;
  label: string;
  goal: string;
  deliverables: Deliverable[];
}

interface PageSection {
  heading: string;
  content: string;
}

interface PageTab {
  id: string;
  emoji: string;
  title: string;
  url: string;
  week: string;
  placeholders: string[];
  sections: PageSection[];
}

// ─── Timeline Data ────────────────────────────────────────────────────────────

const WEEKS: Week[] = [
  {
    id: "w1",
    label: "Week 1 | Mar 17-23",
    goal: "Build the Village Steward and Resident co-creator journeys from end to end. Get all linked pages, CTAs, and interactive elements working.",
    deliverables: [
      { id: "w1-1", text: "Landing page - full copy and structure (welcome section, 5 journey paths)", status: "done" },
      { id: "w1-2", text: "Landing page - Attend, Experience, Co-Create, Integrate, Commit flow written and laid out", status: "done" },
      { id: "w2-17", text: "Pages: Investor, Village Steward, Resident, How We Create, Quests - copy delivered (see page tabs)", status: "done", pageLink: "steward" },
      { id: "w2-1", text: "Village Steward Space - Rights and Responsibilities page linked and drafted", status: "done", pageLink: "steward-rights" },
      { id: "w2-2", text: "Village Steward Journey - Community Connection Calls CTA live", status: "pending" },
      { id: "w2-3", text: "Village Steward Journey - Potluck, Events, Workshops, Village Weaving links live", status: "pending" },
      { id: "w2-6", text: "Village Steward Journey - Explore Quests section linked", status: "pending", pageLink: "quests" },
      { id: "w2-7", text: "Village Steward Journey - Amora Game Guide linked (Roles, Co-Creator criteria)", status: "pending", pageLink: "roles" },
      { id: "w2-8", text: "Village Steward Journey - Role Application for Upcoming Season CTA live", status: "pending" },
      { id: "w2-9", text: "Resident Space - Rights and Responsibilities page linked and drafted", status: "done", pageLink: "resident-rights" },
      { id: "w2-10", text: "Resident Journey - Community Call and Discovery Call CTA live", status: "pending" },
      { id: "wt-1", text: "Decision needed - name the community contribution token (currently 'Gratitude'): tracks contributions to be resolved as debt, equity, or community currency, with a percentage split for early contributors", status: "amora" },
      { id: "w1-6", text: "AMORA: Provide brand kit assets (colors, fonts, logos)", status: "amora" },
    ],
  },
  {
    id: "w2",
    label: "Week 2 | Mar 24-30",
    goal: "Build the Roles and Circles infrastructure. Publish the Amora Game Guide as a navigable resource. Wire all governance links and role application flows.",
    deliverables: [
      { id: "w4-11", text: "Pages: Governance Roles, Circles, Team - copy delivered (see page tabs)", status: "done", pageLink: "roles" },
      { id: "w4-1", text: "Amora Game Guide - published as linked resource with Co-Creator criteria section", status: "pending" },
      { id: "w4-2", text: "Roles section - all initial roles documented (Community Engagement, Land Liaison, Marketing, Operations, Visionary, Financial Mgmt)", status: "pending", pageLink: "roles" },
      { id: "w4-3", text: "Investor Journey - Request Investor Pack drop-down and Pack created", status: "pending", pageLink: "investor" },
      { id: "w4-4", text: "Circles section - Explore Roles page complete", status: "pending", pageLink: "circles" },
      { id: "w2-18", text: "Circles cards - all role titles, descriptions, and links accurate", status: "pending", pageLink: "circles" },
      { id: "w4-5", text: "Co-Creator Right of Passage - description and process documented and live", status: "pending", pageLink: "co-creators-guide" },
      { id: "w4-6", text: "Seasonal Festivals - description page live", status: "pending", pageLink: "seasonal-festivals" },
      { id: "w4-7", text: "Guide and Sage progression - criteria and Voice gains documented", status: "pending", pageLink: "co-creators-guide" },
      { id: "w4-8", text: "Resident progression stages - documented with year thresholds", status: "pending", pageLink: "resident" },
      { id: "w4-10", text: "All internal hyperlinks audit - every bold link in all 4 journeys verified as working", status: "pending" },
      { id: "w1-4", text: "Roles section - role application workflow live", status: "pending", pageLink: "roles" },
      { id: "am-7", text: "Add Hypha page link to How We Create and Co-Creators Guide", status: "pending", pageLink: "how-we-create" },
      { id: "am-8", text: "Launch all Hypha tools - governance platform live and linked from site", status: "pending" },
      { id: "w4-12", text: "Finalize Role descriptions and Season structure for publication", status: "collab" },
      { id: "am-2", text: "Complete the investor memo for Lawrence - terms, vision, and deal structure written and ready to share", status: "collab" },
      { id: "am-3", text: "Establish the ministry - 508(c)(1)(a) structure formalised and membership framework confirmed", status: "collab" },
    ],
  },
  {
    id: "w3",
    label: "Week 3 | Mar 31 – Apr 6",
    goal: "Deliver and wire the community identity pages - Love Letter, Co-Creators Guide, Good Neighbor, and Seasonal Festivals. Get all membership flows and CTAs live.",
    deliverables: [
      { id: "w1-5", text: "Pages: Home, Love Letter, Co-Creators Guide, Good Neighbor - copy delivered (see page tabs)", status: "done", pageLink: "love-letter" },
      { id: "w1-3", text: "Investor Journey - Schedule a Call drop-down and CTA button wired up", status: "pending", pageLink: "investor" },
      { id: "w2-4", text: "Village Steward Journey - Village Weaving Immersion description and CTA live", status: "pending" },
      { id: "w2-12", text: "Love Letter membership page linked (Steward and Resident journeys)", status: "pending", pageLink: "love-letter" },
      { id: "w2-15", text: "Resident Journey - Good Neighbor criteria linked", status: "pending", pageLink: "good-neighbor" },
    ],
  },
  {
    id: "w4",
    label: "Week 4 | Apr 7-13",
    goal: "Complete the Investor and Prosperity Creator journeys with all supporting content, interactive elements, and linked resources in place.",
    deliverables: [
      { id: "w3-5", text: "Pages: Prosperity Journey - copy delivered (see page tab)", status: "done", pageLink: "prosperity" },
      { id: "w3-1", text: "Investor Journey - full financial details and CTA flow complete", status: "pending", pageLink: "investor" },
      { id: "w3-2", text: "Investor Journey - Request Investor Pack drop-down and CTA wired up", status: "pending", pageLink: "investor" },
      { id: "w3-3", text: "Prosperity Journey - full ARI tier details and business paths documented", status: "pending", pageLink: "prosperity" },
      { id: "w3-4", text: "Prosperity Journey - business proposal submission flow live", status: "pending", pageLink: "prosperity" },
      { id: "w3-6", text: "Confirm ARI tiers and Voice allocations for Prosperity journey", status: "collab" },
      { id: "w3-7", text: "Confirm Investor Pack structure and financial projections", status: "collab" },
      { id: "am-1", text: "Complete token design - name, function, and economic rules for the community contribution token (currently 'Gratitude') finalised", status: "collab" },
      { id: "am-4", text: "Secure the land + clear agreement with Lawrence - ownership or access terms signed and confirmed", status: "collab" },
      { id: "am-5", text: "Regen Development Fund path clear - funding vehicle, terms, and first close strategy confirmed", status: "collab" },
      { id: "am-6", text: "Business plan clear and complete - full plan covering operations, revenue model, and development phases ready to share", status: "collab" },
      { id: "w2-19", text: "Deliver Investor Pack content (terms, structure, documents)", status: "collab" },
    ],
  },
  {
    id: "w5",
    label: "Week 5 | Apr 14-20",
    goal: "Polish all pages, complete event CTAs. If the retainer is confirmed, begin scoping the backend and CRM integration. Final content review with the Amora team.",
    deliverables: [
      { id: "w5-10", text: "Pages: Master Plan, Opportunities, Housing - copy delivered (see page tabs)", status: "done", pageLink: "master-plan" },
      { id: "w2-11", text: "Resident Journey - Housing Options page linked", status: "pending", pageLink: "housing" },
      { id: "w2-13", text: "Resident Journey - Waitlist sign-up and $NNN/month fee placeholder live", status: "pending", pageLink: "resident" },
      { id: "w2-14", text: "Resident Journey - Children's Play Day CTA live", status: "pending" },
      { id: "w2-16", text: "Resident Journey - Land Share Agreement page linked", status: "pending", pageLink: "resident" },
      { id: "w5-1", text: "Events section - Potluck, Village Weaving, Land Tour, Children's Play Day CTAs live", status: "pending" },
      { id: "w5-2", text: "Webinar section - slide show, email flow, recording share process documented", status: "pending" },
      { id: "w5-3", text: "Email nurture flow - basic flow outlined and handed off or implemented in CRM", status: "pending" },
      { id: "w5-4", text: "Social media - post structure and follow-up structure documented", status: "pending" },
      { id: "w5-5", text: "Love Letter page - final design and membership dues confirmed", status: "pending", pageLink: "love-letter" },
      { id: "w5-6", text: "Waitlist page - final design and fee structure confirmed", status: "pending" },
      { id: "w5-7", text: "Mobile responsiveness - full site tested on mobile", status: "pending" },
      { id: "w5-8", text: "Content audit - all placeholder values resolved by Amora", status: "pending" },
      { id: "w5-9", text: "Backend and CRM scoping - if retainer confirmed, spec document drafted", status: "pending" },
      { id: "w5-11", text: "AMORA: Final content approval pass (all journeys, roles, game guide)", status: "amora" },
      { id: "w5-12", text: "AMORA: Confirm retainer decision for ongoing updates and CRM build", status: "amora" },
    ],
  },
  {
    id: "w6",
    label: "Week 6 | Apr 21-28",
    goal: "Complete final quality checks, fix any remaining issues, and deliver a fully functional site. If not on retainer, make sure Amora has full admin access before the engagement ends.",
    deliverables: [
      { id: "w6-1", text: "Full site QA - all pages, links, forms, and drop-downs tested", status: "pending" },
      { id: "w6-2", text: "Bug fixes - all outstanding visual and functional issues resolved", status: "pending" },
      { id: "w6-3", text: "Cross-browser test - Chrome, Safari, Firefox verified", status: "pending" },
      { id: "w6-4", text: "Amora admin access - site control transferred if not on retainer", status: "pending" },
      { id: "w6-5", text: "Handoff documentation - editing guide delivered to Amora team", status: "pending" },
      { id: "w6-6", text: "LAUNCH - site goes live for interested parties", status: "pending" },
      { id: "w6-7", text: "Post-launch check-in call scheduled", status: "pending" },
      { id: "w6-8", text: "Retainer and next-phase agreement signed (if continuing)", status: "pending" },
    ],
  },
];

// ─── Page Copy Data ───────────────────────────────────────────────────────────

const PAGES: PageTab[] = [
  {
    id: "home",
    emoji: "🏠",
    title: "Home",
    url: "/",
    week: "Week 1 | Mar 17-23",
    placeholders: [],
    sections: [
      {
        heading: "Hero",
        content: `Tag: Come co-create paradise
Headline: Co-Become the Most Beautiful Village
Subheadline: A regenerative village in Costa Rica where all beings belong and thrive. Find your path to participation.
CTAs: Find Your Path | Read the Co-Creators Guide`,
      },
      {
        heading: "Journey Stages Bar",
        content: `Title: Our Journey Together
Text: Each stage is designed to filter for cultural fit while providing opportunities for mutual assessment.
Stages: Align | Experience | Co-Create | Integrate | Home`,
      },
      {
        heading: "Choose Your Path",
        content: `Tag: What brought you here?
Title: Choose Your Path
Text: Four unique journeys to participate in the Amora community. Each path leads to belonging.

Investor | Capital Contributor | Support regenerative development through financial resources, credit lines, or material contributions. Join a community that prioritizes debt over equity.
Village Steward | Co-Creator | Coordinate and execute for the success of the whole village. Join circles, take on roles, and help shape our regenerative community.
Resident | Co-Creator | Make Amora your home. Explore housing options, join the waitlist, and become part of a loving village where all beings belong.
Prosperity Creator | Business Builder | Launch or grow your business within our thriving village economy. Align your enterprise with community values and share in collective prosperity.`,
      },
      {
        heading: "Who Comes to Amora",
        content: `Tag: People like you
Title: Who Comes to Amora?
Text: See yourself here? There is a path with your name on it.

Digital Nomad Couple: Location-independent professionals ready to stop bouncing between Airbnbs and plant themselves somewhere with depth, community, and a reason to stay.
Worldschooling Family: Families who want their children raised by a community, surrounded by nature, multi-generational wisdom, and real-world learning instead of a system.
Retiree and Snowbird: Post-career dreamers who want warmth, beauty, belonging, and a role that still matters.
Longevity Seeker: Health-conscious individuals chasing clean air, organic food, movement, community, and purpose as medicine.
Remote Exec and Founder: High-achievers who want their next chapter to matter, contributing capital, skills, or leadership to something regenerative and lasting.
Costa Rican and LatAm Professional: Local and regional changemakers who see Amora as the proving ground for the regenerative future of Central America.`,
      },
      {
        heading: "Bottom CTA",
        content: `Headline: Ready to Begin Your Journey?
CTAs: Join Community Call | View All Events`,
      },
    ],
  },
  {
    id: "love-letter",
    emoji: "💌",
    title: "Love Letter",
    url: "/love-letter",
    week: "Week 3 | Mar 31 – Apr 6",
    placeholders: ["The full body text of the Love Letter needs to be written by the Amora team"],
    sections: [
      {
        heading: "Page Header",
        content: "Title: The Amora Love Letter",
      },
      {
        heading: "The Letter",
        content: `Salutation: Dear Future Amoracita,
Body: [PLACEHOLDER - Amora team to write the full letter body here]
Closing: With love and anticipation, The Amora Community`,
      },
      {
        heading: "Membership Commitments",
        content: `Heading: As a member of Amora 508(c)(1)(a), you commit to:
[LIST OF COMMITMENTS - Amora team to verify these are current and complete]`,
      },
      {
        heading: "Sign Your Membership Form",
        content: `Heading: Sign Your Membership
Text: Fill in your details below to officially become an Amoracita.
Fields: Full Name | Email | Phone/WhatsApp (optional) | Which path(s) are you on? | Monthly Membership Contribution ($33/$55/$88/$108/custom) | What called you to Amora?
Checkbox: I have read the Love Letter and commit to the values of the Amora community.
CTA: Sign the Love Letter and Become an Amoracita`,
      },
      {
        heading: "Post-Submission",
        content: `Heading: Welcome, Amoracita
Message: Your membership form has been received. You are now part of the Amora 508(c)(1)(a) community.
Next steps: 1) Welcome email within 48 hours. 2) Personal welcome call scheduled. 3) Invited to first Community Circle.
CTA: Return Home`,
      },
    ],
  },
  {
    id: "co-creators-guide",
    emoji: "📖",
    title: "Amora Game Guide",
    url: "/co-creators-guide",
    week: "Week 3 | Mar 31 – Apr 6",
    placeholders: [
      "Your Hypha DHO URL (e.g. app.hypha.earth/en/dho/amora-village) - paste the full URL to your Amora Hypha space so the platform links on the Game Guide page can go live",
      "Page title - currently 'Amora Game Guide', confirm with the team (alternatives: 'The Co-Creators Guide', 'The Amora Playbook', or your own name)",
      "Community currency name - currently 'Gratitude', will be replaced sitewide once finalised. Share the chosen name so we can update all pages at once.",
      "Community currency value - currently shown as '1 Gratitude = $1 USD'. Confirm the conversion rate or change this to aspirational language if the rate isn't locked in yet.",
    ],
    sections: [
      {
        heading: "Page Header",
        content: "Title: The Amora Game Guide (also: The Co-Creators Guide)\nNav Tabs: R-Ikigai | Gratitude Economy | Voice and Governance | Hypha Platform | The Four Spaces | Path of Growth | Good Neighbor",
      },
      {
        heading: "R-Ikigai",
        content: `Heading: Your R-Ikigai
Venn Diagram: What You LOVE (Passion) | What You are GOOD AT (Skills) | What AMORA NEEDS (Regeneration) | What Earns GRATITUDE (Compensation)
Text: Roles, quests, and contributions that our community values and rewards.`,
      },
      {
        heading: "Gratitude Economy",
        content: `Heading: The Gratitude Economy
Earn Gratitude: Complete quests, fulfill roles, or receive revenue shares from community and private businesses. (Land Stewardship Shifts, Business Revenue Share, Quests)
Hold Gratitude: Gratitude accumulates in your Village Profile and reflect your contribution history.
Use Gratitude: Pay for HOA, utilities, services, cafe, shop, and more within the village.
Flow: Contribution > Gratitude Earned > Community Spending > Regenerative Loop`,
      },
      {
        heading: "Voice and Governance",
        content: `Heading: How Proposals Work
1. Proposal - Anyone can raise a proposal. Presented clearly with context and goals.
2. Clarification - The circle asks clarifying questions. Not debate, just understanding.
3. Consent - No reasoned objections means we move forward.
Key Principles: Circles Hold Authority | Monthly All-Village Calls`,
      },
      {
        heading: "Hypha Platform",
        content: `Heading: Hypha - Our Governance Platform
Intro: Where governance happens in practice. Open-source, transparent, owned by its contributors. Value In = Value Out.
[PLACEHOLDER - Amora: add your DHO link to CoCreatorsGuide.tsx when Hypha space is live]

4 Action Cards:
1. Start with an Agreement - Propose a new role, quest, or contribution type. Create Agreement link.
2. Claim Your Gratitude - After completing a task, pay period, or season, propose a Contribution. Claim link.
3. Propose Expenses - Cover costs that benefit the community. Pay for Expenses link.
4. Delegate Your Voice - Trust another member to vote on your behalf. Members page link.

Sense > Propose > Create cycle displayed at bottom.`,
      },
      {
        heading: "The Four Spaces",
        content: `Village Steward Space - Coordinates overall village success, open to all path members
Resident Space - Governs residential life and neighbor relations
Prosperity Space - Manages business interests and Gratitude economy
Land Stewardship Space - Cares for land and ecosystem health`,
      },
      {
        heading: "Path of Growth",
        content: "Stages: Visitor | Guest | Immersant | Participant | Member/Amoracita | Contributor | Quest Seeker | Initiate | Co-Creator | Role Holder | Guide (7+ years) | Sage (21+ years)",
      },
      {
        heading: "Bottom CTAs",
        content: `The Love Letter - Read our community covenant and founding values
Find Your Quest - Discover opportunities that match your gifts
Join Community Call - Meet us live and ask your questions`,
      },
    ],
  },
  {
    id: "good-neighbor",
    emoji: "🤝",
    title: "Good Neighbor",
    url: "/good-neighbor",
    week: "Week 3 | Mar 31 – Apr 6",
    placeholders: ["\"What Amora Commits to You\" section content needs team verification"],
    sections: [
      {
        heading: "Page Header",
        content: "Tag: Our Living Covenant\nTitle: Good Neighbor Criteria\nSubtitle: What Amora Values, and Why It Matters",
      },
      {
        heading: "The 8 Criteria",
        content: `1. Core Values Alignment - You Live the Vision
2. Communication and Conflict Resolution - You Practice Authentic Relating (NVC)
3. Financial Responsibility - You Can Meet Your Obligations
4. Contribution to Community Life - You Show Up and Participate
5. Respect for Land, Nature, and All Beings - You Are a Steward
6. Cultural Openness and Intergenerational Respect - You Value Diversity
7. Background Check Acknowledgment - Safety and Trust for Everyone
8. Children's Play Day Participation - For Families`,
      },
      {
        heading: "The 7-Step Process",
        content: `1. Initial Exploration - Learn about Amora through events, tours, and conversations.
2. Community Engagement - Attend potlucks, workshops, and gatherings.
3. Deep Conversation - Structured conversations with the Resident Circle about values, history, and commitment.
4. Background Check - Standard background and reference check.
5. Observation Period - A period of participation before full commitment.
6. Resident Consent - Current residents give consent with no reasoned objections.
7. Celebration - Welcome home.`,
      },
      {
        heading: "Core Values Pillars",
        content: `Regenerative Living: We do not just sustain, we heal. This community is built on the belief that humans can actively restore the land, water systems, and ecosystems we depend on.
Community Care: We practice radical responsibility alongside deep interdependence. You show up for yourself and for the whole.
Regenerative Purpose: Your life here has meaning. You are aligning your unique gifts with what Amora needs.`,
      },
      {
        heading: "What Amora Commits to You",
        content: "[PLACEHOLDER - Amora team to verify and fill in this section]\nCTAs: Sign the Membership Covenant | Attend a Community Call",
      },
    ],
  },
  {
    id: "investor",
    emoji: "💰",
    title: "Investor Journey",
    url: "/investor",
    week: "Week 4 | Apr 7-13",
    placeholders: ["Projected IRR %", "Target Raise amount for Phase 1", "ROI timeline answer"],
    sections: [
      {
        heading: "Page Header",
        content: "Tag: Capital Contributor Journey\nTitle: Invest in Regeneration\nCTA: Join Community Call",
      },
      {
        heading: "Key Numbers",
        content: `Land Value: $16M+ (appraised January 2026)
Property: 266 acres in Dominicalito, Costa Rica
Projected IRR: [PLACEHOLDER - team to confirm]
Target Raise: [PLACEHOLDER - Phase 1, Infrastructure and retreat center]`,
      },
      {
        heading: "Investment Philosophy",
        content: `Debt Over Equity: We prioritize debt financing to ensure the community maintains ownership. Investors who want to live at Amora are given priority.
$16M+ Appraisal: A January 2026 appraisal values the property at over $16 million, with additional commons land appraisal pending.
1% Regenerative Loan: We are exploring a low-interest regenerative development loan that would accelerate multiple development phases.
Community Ownership: Our goal is for all Amora homes, structures, and businesses to be owned by residents and co-creators.`,
      },
      {
        heading: "Your Investment Journey",
        content: `Curious: Discover Amora - Learn about our vision, values, and regenerative approach to community development.
Interested: Request Investor Pack - Receive comprehensive investor materials including feasibility study, proformas, and development timeline.
Exploring: Schedule Investment Call - Connect one-on-one with our team to discuss your investment goals.
Committed: Make Your Commitment - Choose your investment vehicle and formalize your contribution.`,
      },
      {
        heading: "Investor FAQs",
        content: `What is the legal structure? Horizontal Condominium under Costa Rican law, combined with a 508(c)(1)(a) community organization.
What are my exit options? Lot sale at appreciated value, business equity stake, or structured buy-back options.
How does debt vs equity work? We prefer debt financing to keep community ownership intact. Investors lend to the project and receive interest plus priority on lot purchases.
Can I build on my investment? Yes. Investors who become residents can build a home on their lot.
When is ROI expected? [PLACEHOLDER - answer to verify and add]`,
      },
    ],
  },
  {
    id: "steward",
    emoji: "🌿",
    title: "Village Steward",
    url: "/steward",
    week: "Week 1 | Mar 17-23",
    placeholders: ["Full page headline needs confirmation from Amora team"],
    sections: [
      {
        heading: "Page Header",
        content: "Tag: Village Steward Journey\nTitle: [Full headline to verify with Amora team]\nCTAs: Start with Community Call | Learn How We Create",
      },
      {
        heading: "Your Journey to Co-Creation (9 Stages)",
        content: `Visitor: Attend Community Call - Learn about the basics and ask questions about Amora.
Guest: Participate in Events - Join potlucks, events, workshops, and parties to experience the community.
Immersant: Village Weaving Immersion - Spend immersive time in the village learning how it operates and discovering where your gifts are most needed.
Participant: Community Training - Complete training in NVC, authentic relating, and other community practices.
Member: Become an Amoracita - Sign our Love Letter and formally become a member of Amora 508c1a.
Contributor: Participate in a Circle - Join a sociocratic circle to contribute to community decision-making.
Quest Seeker: Explore Quests - Take on quests to contribute meaningfully and demonstrate your commitment.
Initiate: Co-Creator Right of Passage - Complete the right of passage with a vote from the Co-Creators circle.
Co-Creator: Explore and Apply for Roles - Find a role that aligns with your gifts and apply for the upcoming season.`,
      },
      {
        heading: "Seasonal Rhythm",
        content: `Every 3 months the community votes on what kind of season comes next. Not a fixed cycle.

Spring: Breaking ground. Starting new builds, projects, and initiatives.
Summer: Full energy. Festivals, events, gatherings, and high community activity.
Fall: Harvest time. Reflection, lessons learned, appreciating the abundance.
Winter: Deep design. Systems redesign, governance evolution, economic modelling, financial preparation, and investor relations.

CTA: Learn About Our Seasons`,
      },
      {
        heading: "Your Next Step Form",
        content: `Heading: Your Next Step
Fields: Your name | Email | What gifts do you bring? | What called you to stewardship?
CTA: Begin My Stewardship Journey`,
      },
    ],
  },
  {
    id: "steward-rights",
    emoji: "⚖️",
    title: "Steward Rights & Responsibilities",
    url: "/steward-rights",
    week: "Week 1 | Mar 17-23",
    placeholders: [],
    sections: [
      {
        heading: "Page Header",
        content: `Tag: Village Steward Space
Title: Your Rights and Responsibilities
Subtitle: This is not a legal document. It's a covenant between co-owners. Every Village Steward holds both — the rights that come from real ownership of this place, and the responsibilities that make those rights worth something.`,
      },
      {
        heading: "Co-Ownership Framing",
        content: `Heading: You Are a Co-Owner of This Village
Text: Not in a passive sense. Not in a "you paid for something" sense. In the deepest sense — the land, the buildings, the culture, the economy, the future of this place are in your hands as much as anyone else's. Act from that space. Steward it as if you built it, because you are building it, right now.`,
      },
      {
        heading: "Your Rights (6 Cards)",
        content: `1. Voice in Governance - Participate in Circle consent rounds, vote on decisions in your domain, elect representatives to the Leadership Council.
2. Earn Gratitude for Your Contribution - Every role, quest, and meaningful act earns Gratitude (1 Gratitude = $1 USD). Converts to cash or equity as Amora grows.
3. Apply for Seasonal Roles - Once you pass your Co-Creator Right of Passage, propose yourself for any seasonal role that fits your gifts.
4. Advance Along the Path - Progress from Co-Creator to Guide (after multiple seasons) to Sage (after seasons as Guide). Each level deepens your voice and compensation.
5. Access to Shared Land and Commons - All trails, food forests, gathering spaces, and natural features of the 266 acres are yours to steward and enjoy.
6. Retreat and Wellness Access - Access Amora's wellness offerings at community rates as a contributing steward.`,
      },
      {
        heading: "Your Responsibilities (6 Cards)",
        content: `1. Show Up for Your Circle - Attend meetings consistently, participate in consent rounds, communicate if you can't make it.
2. Act as a Co-Owner - Approach every decision, every piece of land, every shared resource as if it belongs to you and to everyone here — because it does.
3. Take On Quests - Actively complete quests that stretch your contribution. Your engagement keeps the community alive.
4. Practice the Community Ways - NVC, authentic relating, consent-based decision-making. Not just knowing them — practicing them.
5. Contribute to the Seasonal Rhythm - Attend seasonal transitions, participate in votes, help decide collectively what Amora focuses on next.
6. Lift Others as You Rise - As you advance, carry responsibility for welcoming newcomers and mentoring those coming behind you.`,
      },
      {
        heading: "Progression Path",
        content: `Co-Creator: Full governance voice, seasonal role eligibility, Gratitude economy access.
Guide (after multiple seasons): Mentorship responsibilities, increased Gratitude, voice in cross-circle decisions.
Sage (after seasons as Guide): Highest governance voice, wisdom keeper, long-term strategic guidance for the village.`,
      },
    ],
  },
  {
    id: "resident",
    emoji: "🏡",
    title: "Resident Journey",
    url: "/resident",
    week: "Week 1 | Mar 17-23",
    placeholders: ["Village dues monthly amount ($NNN/month)", "Full page headline"],
    sections: [
      {
        heading: "Page Header",
        content: "Tag: Resident Co-Creator Journey\nTitle: [Full headline to verify with Amora team]\nCTAs: Start with Community Call | Explore Housing",
      },
      {
        heading: "Your Path to Residency (12 Stages)",
        content: `Visitor: Attend Community Call
Guest: Attend Community Events
Participant: Community Training
Member: Sign the Love Letter / 508 Membership
Explorer: Explore Housing Options
Applicant: Background Check
Waitlist: Join the Waitlist - first right of refusal on land opportunities
Family Day: Children's Play Day
Initiate: Resident Right of Passage
Landowner: Purchase Land Share Agreement
Builder: Build Your Home
Resident: Move In Celebration!`,
      },
      {
        heading: "Village Dues",
        content: `Heading: Village Dues
[PLACEHOLDER - Amora team to confirm monthly dues amount ($NNN/month)]
Note: Dues cover utilities, maintenance, and community services. These can be covered through Gratitude - contributions that track real value (1 Gratitude = $1 USD).`,
      },
      {
        heading: "Land Share Agreements",
        content: `Renewable: Your agreement can be renewed, providing long-term security for your family.
Transferable: Pass your land share to your children tax-free.
Community Owned: The land remains in community ownership, ensuring our values are preserved.`,
      },
    ],
  },
  {
    id: "resident-rights",
    emoji: "🛡️",
    title: "Resident Rights & Responsibilities",
    url: "/resident-rights",
    week: "Week 1 | Mar 17-23",
    placeholders: ["Monthly village dues amount ($NNN/month)", "Exact year thresholds for governance milestone progression"],
    sections: [
      {
        heading: "Page Header",
        content: `Tag: Resident Space
Title: Your Rights and Responsibilities
Subtitle: Living at Amora means you are not a tenant. You are a co-owner of the whole village. These are the rights that protect you and the responsibilities that make this place worth protecting.`,
      },
      {
        heading: "Co-Ownership Framing",
        content: `Heading: You Live Here. This Is Yours.
Text: The land at Amora is held collectively. Every resident is a steward of the whole 266 acres. Your home is your private space. The rest belongs to all of you. Approach every interaction with the land and the community from that place: this is mine, and it's also all of ours.`,
      },
      {
        heading: "Your Rights (6 Cards)",
        content: `1. Your Land Share is Yours - Long-term Land Share Agreement: renewable, transferable to your children tax-free, protected by collective ownership.
2. Security Through Community Ownership - No single person can sell the land away. It's held in trust for the whole community, including your family and those that come after.
3. Voice in Community Life - Full voice in Circles governing daily life. Governance rights deepen as you reach milestones and put down roots.
4. Access to All Commons - Trails, food forests, gathering spaces, streams, ponds, seasonal festivals, events — all of it is yours.
5. Community Services and Care - Access to wellness programs, education, healing arts, and services Amora develops together. Community businesses serve residents first.
6. Dues Offset Through Gratitude - Dues can be covered through Gratitude (1 Gratitude = $1 USD of contribution). The vision: shared business profits make life here net-positive.`,
      },
      {
        heading: "Your Responsibilities (7 Cards)",
        content: `1. Care for Your Home and Its Surroundings - Maintain your home and immediate space to a standard that honors the land and the community around it.
2. Act as a Co-Owner - You live here. Pick up what needs picking up. Notice what others miss. Bring a co-owner's eye to every interaction with the land and the community.
3. Contribute to Maintenance - Every resident contributes time to shared spaces, infrastructure, and community assets. Details agreed during residency onboarding.
4. Village Dues - [PLACEHOLDER - $NNN/month] - Covers utilities, shared infrastructure, and community services. Offset through Gratitude; vision is full coverage through shared business profits.
5. Participate in Community Processes - Show up to Circle meetings affecting your domain, conflict resolution processes, seasonal votes, and community governance.
6. Honor the Good Neighbor Principles - Commit to and practice the Good Neighbor principles covering noise, shared resources, boundaries, children, and conflict.
7. Raise the Next Generation Together - Children here are raised by the whole village. Contribute to a child-safe, child-enriching environment.`,
      },
      {
        heading: "Maintenance and Fees Vision",
        content: `Village dues exist to keep infrastructure running. The longer-term vision: as Amora's shared businesses mature — retreat center, cafe, wellness center, artisan market, education programs — revenue flows back into the community.

The goal is a life here that is economically net-positive. Where Gratitude earnings, business participation, or role contributions cover not just your dues, but give you back more than you put in.

This is what "Wealth Through Contribution" actually means. Not a promise. A design intention we're building toward together.`,
      },
      {
        heading: "Progression Over Time",
        content: `Resident (Year 1+): Full commons access, housing rights, community participation.
Established Resident (Year 3+): Deeper governance voice, eligible for Circle Representative roles. [PLACEHOLDER - confirm threshold]
Long-Term Resident (Year 7+): Senior voice in community decisions, Sage eligibility, rights of nature representation. [PLACEHOLDER - confirm threshold]`,
      },
    ],
  },
  {
    id: "how-we-create",
    emoji: "⚙️",
    title: "How We Create",
    url: "/how-we-create",
    week: "Week 1 | Mar 17-23",
    placeholders: ["Hypha tools supporting text to verify with team"],
    sections: [
      {
        heading: "Four Pillars",
        content: `Sociocracy and Teal: We blend sociocratic governance with Teal organization principles. Self-management, wholeness, and evolutionary purpose guide our structure.
Adaptive Governance: Using Hypha tools, each circle designs its own governance strategy, from consent to consensus, tailored to its unique culture and mission.
Gratitude Economy: Gratitude tracks the value you contribute. 1 Gratitude = $1 USD in contributed value. As Amora matures, Gratitude converts to cash or equity.
Seasonal Rhythm: Every 3 months, the community votes on what kind of season comes next. Not a fixed cycle.`,
      },
      {
        heading: "The Gratitude Economy",
        content: `Earn Gratitude: Complete quests, fulfill roles, or receive revenue shares from community and private businesses.
Track Value: 1 Gratitude = $1 USD in value contributed. Gratitude is an honest record of the work everyone is pooling to make Amora real.
Future Conversion: As Amora matures, Gratitude will convert to cash or equity.`,
      },
      {
        heading: "Seasonal Rhythm",
        content: `Spring: Breaking ground. Starting new buildings, projects, and initiatives.
Summer: Full momentum. Festivals, events, gatherings, and high community activity.
Fall: Harvest time. Reflection, lessons learned, and appreciating the abundance.
Winter: Deep design. Systems redesign, governance evolution, economic modelling, financial preparation, and investor relations.
Note: No fixed cycle. The community votes every 3 months on what season comes next.`,
      },
    ],
  },
  {
    id: "quests",
    emoji: "⚔️",
    title: "Community Quests",
    url: "/quests",
    week: "Week 1 | Mar 17-23",
    placeholders: ["Circle assignments needed for: Circle Scribe, Retreat Center Host, Children's Play Day Facilitator, Tech and Platform Steward, Security and Night Watch"],
    sections: [
      {
        heading: "What Is Gratitude?",
        content: `Earn: Complete quests, contribute to circles, steward the land, teach, build, host, create. Every meaningful act earns Gratitude.
Hold: Gratitude accumulates in your Village Profile and reflect your full contribution history.
Convert: As Amora grows financially, Gratitude converts to cash or equity.`,
      },
      {
        heading: "How to Claim Gratitude",
        content: `1. Connect with a member of the core team and let them know you're interested in a quest.
2. Put up a proposal to the Amora Hypha page with your proposal to complete this quest.
3. If your proposal passes, do the quest. When you're done, gather evidence of your completion and prepare any lessons learned, ideas to share, etc.
4. Make another proposal claiming tokens for your completed quest.
5. Celebrate and get started on your next quest!`,
      },
      {
        heading: "14 Quest Cards",
        content: `Welcome Ambassador | Community Life | 50-100 Gratitude
Food Forest Tender | Permaculture | 40-80 Gratitude
Potluck and Celebration Organizer | Community Life | 100-200 Gratitude
Trail Builder and Maintainer | Building and Village | 60-120 Gratitude
Circle Scribe | [CIRCLE TO CONFIRM] | 40-80 Gratitude
Retreat Center Host | [CIRCLE TO CONFIRM] | 80-150 Gratitude
Village Photographer and Storyteller | Culture and Arts | 60-120 Gratitude
Children's Play Day Facilitator | [CIRCLE TO CONFIRM] | 70-130 Gratitude
Tech and Platform Steward | [CIRCLE TO CONFIRM] | 80-200 Gratitude
Healing Arts Practitioner | Health and Healing | 50-150 Gratitude
Infrastructure Builder | Building and Village | 80-160 Gratitude
Arts and Mural Maker | Culture and Arts | 100-300 Gratitude
Community Music Circle Host | Culture and Arts | 50-100 Gratitude
Security and Night Watch | [CIRCLE TO CONFIRM] | 60-100 Gratitude`,
      },
    ],
  },
  {
    id: "seasonal-festivals",
    emoji: "🎉",
    title: "Seasonal Festivals",
    url: "/seasonal-festivals",
    week: "Week 3 | Mar 31 – Apr 6",
    placeholders: ["Specific festival dates and themes to confirm with the Amora team", "Festival participation costs or contributions (if any)", "Registration or RSVP process for each festival"],
    sections: [
      {
        heading: "Page Header",
        content: `Tag: Community Celebrations
Title: Seasonal Festivals at Amora
Subtitle: We mark the rhythm of the year together - gathering to celebrate, reflect, and renew our commitment to this land and each other.`,
      },
      {
        heading: "The Four Festivals",
        content: `Spring Renewal (March/April): The land wakes up. We plant seeds - literally and metaphorically. Workshops on permaculture, ceremony for new beginnings, and a village potluck feast.

Summer Solstice (June): Full energy. Music, art, dance, and celebration. The longest day of the year marks our season of abundance and community activity.

Harvest Gathering (September/October): We harvest what we planted. Gratitude feast, reflection circle, and sharing the abundance of the season's work.

Winter Solstice (December): The quieter turn. Storytelling, fire ceremony, and intentions for the year ahead. A time for rest, reflection, and renewal.`,
      },
      {
        heading: "Who Can Attend",
        content: `Members: All Amoracitas are welcome at every festival. Festivals are a key part of community life.

Visitors and Guests: Friends, family, and prospective community members are welcome to join - festivals are one of the best ways to experience Amora.

Quest Opportunity: Festivals are a rich source of quest opportunities. Co-creating, organizing, and hosting festival elements earns Gratitude.`,
      },
      {
        heading: "Festival Contributions",
        content: `Every festival is co-created by the community. Ways to contribute:
- Bring food to share at the community feast
- Offer a workshop, performance, or skill
- Help with setup, decoration, or hosting
- Take on a festival quest (Gratitude awarded for organizing roles)

[PLACEHOLDER - Amora team to confirm any participation costs or contribution guidelines]`,
      },
      {
        heading: "Registration and Logistics",
        content: `[PLACEHOLDER - Amora team to add RSVP process, location details, and any logistics notes for each festival]

For upcoming dates and to register for events, visit the Events page on amora.cr.`,
      },
    ],
  },
  {
    id: "prosperity",
    emoji: "🌱",
    title: "Prosperity Journey",
    url: "/prosperity",
    week: "Week 4 | Apr 7-13",
    placeholders: ["ARI tier names and specific criteria/metrics for each tier", "Launch Checklist final contents"],
    sections: [
      {
        heading: "Page Header",
        content: "Tag: Prosperity Creator Journey\nTitle: Launch Your Regenerative Business\nCTAs: Download Prosperity Packet | Gratitude Economy | Co-Ownership Model",
      },
      {
        heading: "Your Path to Prosperity (7 Stages)",
        content: `Researcher: Attend Community Call - Learn about business opportunities at Amora.
Dreamer: Explore the Prosperity Packet - Download and review the comprehensive guide.
Applicant: Submit Business Proposal - Present your vision and how it aligns with village needs.
Member: Sign Love Letter / 508 Membership - Become an official member.
Partner: Community Approval - Present your business to the Business and Finance Council.
Builder: Launch Your Business - Integrate with the Gratitude contribution system and begin serving the community.
Prosperity Creator: Grow Your Impact - Advance through ARI tiers and scale your regenerative business.`,
      },
      {
        heading: "ARI Tiers",
        content: `Heading: ARI Tiers - Amora Regenerative Impact
Tier 1: Early stage, establishing presence
Tier 2: Growing, measurable contribution
Tier 3: Established, regional impact
Tier 4: Thriving, transformative impact
[PLACEHOLDER - ARI tier names and metrics to be defined by Amora team]`,
      },
    ],
  },
  {
    id: "roles",
    emoji: "📋",
    title: "Governance Roles",
    url: "/roles",
    week: "Week 2 | Mar 24-30",
    placeholders: [
      "Full details for each role: Purpose, Members, Key Responsibilities, Time Commitment, Terms, Compensation",
      "Specialist Role descriptions (Architect, Civil Engineer, Permaculture Designer, Community Organizer)",
    ],
    sections: [
      {
        heading: "Page Header",
        content: "Title: Governance Roles and Structures\nText: Multi-tiered governance balancing development expertise with community wisdom, evolving from development-focused leadership to community-driven self-governance.",
      },
      {
        heading: "Role Cards (4 Cards)",
        content: `1. Development Board of Directors
[PLACEHOLDER - full details needed from Amora team]

2. Community Advisory Council
[PLACEHOLDER - full details needed from Amora team]
Note: Advisors receive First Right of Refusal on lot purchases, retreat discounts, and recognition as Founding Advisors.

3. Leadership Council
[PLACEHOLDER - full details needed from Amora team]

4. Core Team
[PLACEHOLDER - full details needed from Amora team]`,
      },
      {
        heading: "How These Structures Work Together",
        content: `The Development Board provides expert oversight during the complex development phase, ensuring financial viability and regulatory compliance.
The Community Advisory Council brings wisdom from practitioners and local leaders to shape culture and partnerships.
The Core Team serves as the bridge, implementing Board decisions and supporting Circle initiatives.
As residents arrive, the Sociocratic Circles gradually take on more governance responsibility.
CTA: Explore Our Circles`,
      },
    ],
  },
  {
    id: "circles",
    emoji: "🔵",
    title: "Circles",
    url: "/circles",
    week: "Week 2 | Mar 24-30",
    placeholders: ["\"Who Participates\" and \"Key Focus Areas\" for each circle card need confirmation"],
    sections: [
      {
        heading: "Page Header",
        content: "Title: Our Sociocratic Circles\nText: Eight domain-specific circles provide self-governance while staying connected through elected representatives and consent-based decision-making.\nCTA: View Roles and Leadership Structure",
      },
      {
        heading: "The 8 Circles",
        content: `Permaculture Council | Land Stewardship and Food Systems | Cares for the land through regenerative agriculture, landscaping, and ecological restoration.
Education Council | Learning and Development | Supports children's education, adult learning, and knowledge sharing across the community.
Culture and Arts Council | Creative Expression | Cultivates artistic expression, musical events, and cultural programming.
Health and Healing Council | Wellness and Care | Coordinates wellness services, healing modalities, and community health initiatives.
Building and Village Council | Infrastructure and Maintenance | Oversees construction, maintenance, infrastructure development, and architectural decisions.
Business and Finance Council | Economic Sustainability | Governs community financial decisions, business enterprises, and economic sustainability.
Community Life Council | Social Connection | Coordinates social events, conflict resolution, and community celebrations.
Intergenerational Wisdom Council | Wisdom and Rights of Nature | Bridges generations through elder care, children's advocacy, and rights of nature.`,
      },
    ],
  },
  {
    id: "team",
    emoji: "👥",
    title: "Team",
    url: "/team",
    week: "Week 2 | Mar 24-30",
    placeholders: [
      "Individual bios for all Core Team members",
      "Advisory Council member names and bios",
      "Board member names and bios",
      "Adriana's last name",
    ],
    sections: [
      {
        heading: "Core Team",
        content: `This land called for women to lead the creation of a multigenerational, family-centered village.

Jessica Filkins | CEO and Founder | [bio to verify]
Kyleen Keenan | Finance Manager | [bio to verify]
Nikita Timmermans | Community and Culture | [bio to verify]
Victoria Leyden | Village Development | [bio to verify]
Maria Kusk | Regenerative Design | [bio to verify]
Adriana [last name missing] | Operations and Systems | [bio to verify]`,
      },
      {
        heading: "Community Advisory Council",
        content: "Note: Advisors receive First Right of Refusal on lot purchases, retreat discounts, and recognition as Founding Advisors.\n[Advisor names and bios to verify - Amora team to provide]",
      },
      {
        heading: "Development Board of Directors",
        content: "Expertise: Legal and Regulatory | Real Estate Development | Financial and Investment\nMeetings: Monthly Meetings | Quarterly Sessions | Annual Retreat\n[Board member names and bios to verify - Amora team to provide]",
      },
    ],
  },
  {
    id: "master-plan",
    emoji: "🗺️",
    title: "Master Plan",
    url: "/master-plan",
    week: "Week 5 | Apr 14-20",
    placeholders: ["Total Acres", "Planned Homes count", "Retreat Keys count", "Development phase descriptions beyond Phase 1", "Full Master Plan PDF link"],
    sections: [
      {
        heading: "Key Stats",
        content: `Total Acres: [PLACEHOLDER - verify]
Planned Homes: [PLACEHOLDER - verify]
Retreat Keys: [PLACEHOLDER - verify]
Appraised Value: $16M+`,
      },
      {
        heading: "Zone Descriptions",
        content: `Village Center: The heart of Amora featuring the community center, cafe, market, and gathering spaces.
Residential Neighborhoods: Clustered housing areas designed for community connection while maintaining privacy.
Retreat and Wellness: The retreat center and health facilities serving guests and residents.
Agricultural Land: Regenerative farms and food forests providing sustenance for the community.
Commons and Conservation: Protected natural areas, trails, and shared spaces for all to enjoy.`,
      },
      {
        heading: "Development Phases",
        content: `Phase 1: Infrastructure and Community Center
Phase 2: Show Homes [PLACEHOLDER - verify]
Phase 3: Retreat Center [PLACEHOLDER - verify]
Phase 4: Health Center [PLACEHOLDER - verify]
Phase 5: Residential Phase 1 [PLACEHOLDER - verify]`,
      },
    ],
  },
  {
    id: "opportunities",
    emoji: "💼",
    title: "Opportunities",
    url: "/opportunities",
    week: "Week 5 | Apr 14-20",
    placeholders: ["Investment ranges for all 8 business types"],
    sections: [
      {
        heading: "Opportunity Cards (8 Businesses)",
        content: `Retreat Center | [investment range to verify] | A 120-150 key wellness retreat facility offering transformational experiences, workshops, and healing programs.
Health and Wellness Center | [investment range to verify] | Integrative health services combining traditional and alternative medicine for residents and visitors.
Cafe and Restaurant | [investment range to verify] | Farm-to-table dining experience showcasing local and organic produce from our regenerative farms.
Artisan Market | [investment range to verify] | A marketplace for local crafts, produce, and goods created by community members and regional artisans.
Learning Center | [investment range to verify] | Educational programs including a forest school and skill-sharing workshops.
Fitness and Recreation | [investment range to verify] | Fitness facilities and outdoor recreation programs for residents and retreat guests.
Art and Culture Hub | [investment range to verify] | A creative space for artists, musicians, and cultural programs that enrich community life.
Regenerative Agriculture | [investment range to verify] | Farming operations that produce food for the community while regenerating the land.`,
      },
    ],
  },
  {
    id: "housing",
    emoji: "🏘️",
    title: "Housing",
    url: "/housing",
    week: "Week 5 | Apr 14-20",
    placeholders: ["Square footage and pricing for: Tiny Home, Casita, Family Home, Luxury Villa"],
    sections: [
      {
        heading: "Housing Options",
        content: `Tiny Home | Efficient, sustainable living spaces for individuals or couples. | [sq ft / price to verify]
Casita | Cozy homes with room to breathe, ideal for small families. | [sq ft / price to verify]
Family Home | Spacious homes for families with multiple bedrooms and living areas. | [sq ft / price to verify]
Luxury Villa | Premium homes with exceptional finishes, views, and amenities. | [sq ft / price to verify]`,
      },
      {
        heading: "Lot Features",
        content: `Mountain Views: Many lots offer stunning views of the surrounding mountains and valleys.
Water Access: Natural springs and streams throughout the property provide clean water.
Mature Forest: Existing forest provides shade, privacy, and connection to nature.
Solar Exposure: Lots are positioned for optimal solar energy and natural lighting.`,
      },
      {
        heading: "Land Share Agreements",
        content: `Renewable: Your agreement can be renewed, providing long-term security for your family.
Transferable: Pass your land share to your children tax-free.
Community Owned: The land remains in community ownership, ensuring our values are preserved.`,
      },
    ],
  },
];

// ─── Decision Log Data ────────────────────────────────────────────────────────

const DECISIONS: DecisionDef[] = [
  {
    id: "dec-token-name",
    title: "Name the community contribution token",
    description: "The token currently called 'Gratitude' needs a final name. It tracks contributions that will later be resolved as debt, equity, or community currency, with a percentage split for early contributors.",
    linkedItem: "wt-1",
    suggestedOptions: ["Gratitude", "Seeds", "Roots", "Sparks", "Threads", "Commons"],
  },
  {
    id: "dec-token-design",
    title: "Token economic design",
    description: "Define the full economic rules: percentage splits for debt vs equity vs community currency, conversion ratios, and how tokens will be distributed to early contributors.",
    linkedItem: "am-1",
  },
  {
    id: "dec-ministry",
    title: "Ministry structure and membership framework",
    description: "Confirm the 508(c)(1)(a) structure details, membership tiers, and how the ministry framework integrates with village governance and the legal entity.",
    linkedItem: "am-3",
  },
  {
    id: "dec-investor-memo",
    title: "Investor memo structure and terms",
    description: "Finalize the investor memo for Lawrence: investment structure, debt vs equity ratios, interest rates, IRR projections, and Phase 1 raise target.",
    linkedItem: "am-2",
  },
  {
    id: "dec-lawrence",
    title: "Lawrence land agreement",
    description: "Confirm the ownership or access terms with Lawrence, including conditions, timelines, and contingencies that affect the development plan.",
    linkedItem: "am-4",
  },
  {
    id: "dec-regen-fund",
    title: "Regen Development Fund vehicle",
    description: "Confirm the legal vehicle, contribution terms, and first close strategy for the Regen Development Fund.",
    linkedItem: "am-5",
  },
  {
    id: "dec-ari-tiers",
    title: "ARI tier names and criteria",
    description: "Define the Amora Regenerative Impact tier system: names, specific metrics, Voice allocations, and how businesses progress through tiers.",
    linkedItem: "w3-6",
  },
  {
    id: "dec-roles",
    title: "Role descriptions and Season structure",
    description: "Finalize all initial role descriptions (Community Engagement, Land Liaison, Marketing, Operations, Visionary, Financial Management) and the Season structure.",
    linkedItem: "w4-12",
  },
  {
    id: "dec-resident-dues",
    title: "Monthly resident dues amount",
    description: "Confirm the monthly dues amount that covers HOA, utilities, maintenance, and community services (currently shown as $NNN/month on site).",
    linkedItem: "w2-13",
  },
  {
    id: "dec-retainer",
    title: "Retainer and next-phase agreement",
    description: "Decide whether to continue on retainer for ongoing updates and CRM build after the initial 6-week engagement.",
    linkedItem: "w5-12",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

type KanbanColumn = "assigned" | "actioning" | "needs-support" | "completed";

interface KanbanEntry {
  column: KanbanColumn;
  assignee: string;
}

interface DecisionEntry {
  status: "open" | "decided";
  chosen: string;
  notes: string;
}

interface DecisionDef {
  id: string;
  title: string;
  description: string;
  linkedItem?: string; // timeline deliverable id
  suggestedOptions?: string[];
}

type ViewId = "timeline" | "kanban" | "decisions" | "variables" | string;

const API_BASE = "";

interface JourneyState {
  checkboxes: Record<string, 0 | 1 | 2>;
  copy: Record<string, string>;
  kanban: Record<string, KanbanEntry>;
  decisions: Record<string, DecisionEntry>;
}

function getDefaultCheckboxState(d: Deliverable): 0 | 1 | 2 {
  return d.status === "done" ? 1 : 0;
}

function getEffectiveState(
  id: string,
  d: Deliverable,
  serverCheckboxes: Record<string, 0 | 1 | 2>
): 0 | 1 | 2 {
  return id in serverCheckboxes ? serverCheckboxes[id] : getDefaultCheckboxState(d);
}

// ─── Password Gate ────────────────────────────────────────────────────────────

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input === "1love") {
      localStorage.setItem("amora-journey-auth", "1love");
      onUnlock();
    } else {
      setError(true);
      setInput("");
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-teal-deep flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4">
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-teal-deep/10 rounded-full flex items-center justify-center">
            <Lock className="w-6 h-6 text-teal-deep" />
          </div>
          <div className="text-center">
            <h2 className="font-display text-xl font-bold text-teal-deep">Journey to Launch</h2>
            <p className="text-stone-500 text-sm mt-1">Internal use only - enter password to continue</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Password"
            autoFocus
            className={`w-full px-4 py-3 border-2 rounded-xl text-sm outline-none transition-colors ${
              error ? "border-red-400 bg-red-50" : "border-stone-200 focus:border-teal-deep"
            }`}
          />
          {error && <p className="text-red-500 text-xs text-center">Incorrect password</p>}
          <button
            type="submit"
            className="w-full bg-teal-deep text-white py-3 rounded-xl font-semibold text-sm hover:bg-teal transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function JourneyToLaunch() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>("timeline");
  const [serverState, setServerState] = useState<JourneyState>({ checkboxes: {}, copy: {}, kanban: {}, decisions: {} });
  const [loadingState, setLoadingState] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingDecision, setEditingDecision] = useState<string | null>(null);
  const [decisionDraft, setDecisionDraft] = useState<{ chosen: string; notes: string }>({ chosen: "", notes: "" });

  // Check auth on mount
  useEffect(() => {
    const saved = localStorage.getItem("amora-journey-auth");
    if (saved === "1love") setAuthenticated(true);
  }, []);

  // Load server state on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/journey/state`)
      .then((r) => r.json())
      .then((data: Partial<JourneyState>) => {
        setServerState({
          checkboxes: data.checkboxes ?? {},
          copy: data.copy ?? {},
          kanban: data.kanban ?? {},
          decisions: data.decisions ?? {},
        });
        setLoadingState(false);
      })
      .catch(() => setLoadingState(false));
  }, []);

  const cycleCheckbox = async (d: Deliverable) => {
    const current = getEffectiveState(d.id, d, serverState.checkboxes);
    const next: 0 | 1 | 2 = current === 0 ? 1 : current === 1 ? 2 : 0;
    // Optimistic update
    setServerState((prev) => ({
      ...prev,
      checkboxes: { ...prev.checkboxes, [d.id]: next },
    }));
    try {
      await fetch(`${API_BASE}/api/journey/checkbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "1love", id: d.id, state: next }),
      });
    } catch {
      // Rollback on failure
      setServerState((prev) => ({
        ...prev,
        checkboxes: { ...prev.checkboxes, [d.id]: current },
      }));
    }
  };

  const startEdit = (sectionId: string, currentContent: string) => {
    setEditingSection(sectionId);
    setEditDraft(currentContent);
  };

  const cancelEdit = () => {
    setEditingSection(null);
    setEditDraft("");
  };

  const saveEdit = async (sectionId: string) => {
    setSavingSection(sectionId);
    const draft = editDraft;
    // Optimistic update
    setServerState((prev) => ({
      ...prev,
      copy: { ...prev.copy, [sectionId]: draft },
    }));
    setEditingSection(null);
    try {
      await fetch(`${API_BASE}/api/journey/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "1love", sectionId, content: draft }),
      });
    } catch {
      // Best effort - optimistic update stays
    } finally {
      setSavingSection(null);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEditNote = (id: string) => {
    setNoteDraft(serverState.copy[`note-${id}`] ?? "");
    setEditingNote(id);
  };

  const saveNote = async (deliverableId: string) => {
    const sectionId = `note-${deliverableId}`;
    const draft = noteDraft;
    setServerState((prev) => ({
      ...prev,
      copy: { ...prev.copy, [sectionId]: draft },
    }));
    setEditingNote(null);
    try {
      await fetch(`${API_BASE}/api/journey/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "1love", sectionId, content: draft }),
      });
    } catch {
      // best effort
    }
  };

  const updateKanban = async (id: string, column: KanbanColumn, assignee: string) => {
    // Optimistic update
    setServerState((prev) => ({
      ...prev,
      kanban: { ...prev.kanban, [id]: { column, assignee } },
    }));
    // If moved to completed, also mark checkbox as state 2
    if (column === "completed") {
      const d = WEEKS.flatMap((w) => w.deliverables).find((x) => x.id === id);
      if (d) {
        setServerState((prev) => ({
          ...prev,
          checkboxes: { ...prev.checkboxes, [id]: 2 },
        }));
        fetch(`${API_BASE}/api/journey/checkbox`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "1love", id, state: 2 }),
        }).catch(() => {});
      }
    }
    try {
      await fetch(`${API_BASE}/api/journey/kanban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "1love", id, column, assignee }),
      });
    } catch {
      // best effort
    }
  };

  const updateDecision = async (id: string, status: "open" | "decided", chosen: string, notes: string) => {
    setServerState((prev) => ({
      ...prev,
      decisions: { ...prev.decisions, [id]: { status, chosen, notes } },
    }));
    // If decided and has a linked timeline item, mark it as state 1 (delivered)
    const def = DECISIONS.find((decDef) => decDef.id === id);
    if (status === "decided" && def?.linkedItem) {
      const linkedD = WEEKS.flatMap((w) => w.deliverables).find((x) => x.id === def.linkedItem);
      if (linkedD) {
        const current = getEffectiveState(linkedD.id, linkedD, serverState.checkboxes);
        if (current === 0) {
          setServerState((prev) => ({
            ...prev,
            checkboxes: { ...prev.checkboxes, [def.linkedItem!]: 1 },
          }));
          fetch(`${API_BASE}/api/journey/checkbox`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: "1love", id: def.linkedItem, state: 1 }),
          }).catch(() => {});
        }
      }
    }
    try {
      await fetch(`${API_BASE}/api/journey/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "1love", id, status, chosen, notes }),
      });
    } catch {
      // best effort
    }
    setEditingDecision(null);
  };

  // Known assignees for auto-suggest
  const knownAssignees = Array.from(
    new Set(
      Object.values(serverState.kanban)
        .map((e) => e.assignee)
        .filter(Boolean)
    )
  );

  const activePage = PAGES.find((p) => p.id === activeView);

  // Progress: weighted - ReGen Delivered (state 1) = 50%, Amora Confirmed (state 2) = 100%
  const allDeliverables = WEEKS.flatMap((w) => w.deliverables);
  const deliveryScore = allDeliverables.reduce((acc, d) => {
    const state = getEffectiveState(d.id, d, serverState.checkboxes);
    return acc + (state === 1 ? 0.5 : state === 2 ? 1 : 0);
  }, 0);
  const progressPct = Math.round((deliveryScore / allDeliverables.length) * 100);
  const confirmedCount = allDeliverables.filter(
    (d) => getEffectiveState(d.id, d, serverState.checkboxes) === 2
  ).length;
  const deliveredCount = allDeliverables.filter(
    (d) => getEffectiveState(d.id, d, serverState.checkboxes) === 1
  ).length;

  if (!authenticated) {
    return <PasswordGate onUnlock={() => setAuthenticated(true)} />;
  }

  return (
    <Layout>
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="bg-teal-deep text-white py-8">
        <div className="container">
          <div className="flex items-center gap-3 mb-2">
            <TreePine className="w-6 h-6 text-amber" />
            <span className="text-amber font-medium text-sm tracking-widest uppercase">Internal Tool</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
            Journey to Launch
          </h1>
          <p className="text-white/70 text-sm max-w-2xl mb-6">
            The complete delivery roadmap for amora.regencivics.earth - Mar 17 to Apr 28, 2026.
            Use this page to track what I have delivered, what the Amora team needs to complete, and what copy goes on each page.
          </p>

          {/* Resource Links */}
          <div className="flex flex-wrap gap-3 mb-6">
            {RESOURCES.map((r) => (
              <a
                key={r.label}
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${r.color} hover:opacity-90 transition-opacity`}
              >
                <r.icon className="w-4 h-4" />
                {r.label}
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>
            ))}
          </div>

          {/* Progress Bar - weighted: delivered=50%, confirmed=100% */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-white/60 text-xs">Launch progress</span>
            <div className="flex-1 max-w-xs bg-white/20 rounded-full h-2 min-w-24">
              <div
                className="bg-amber h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-amber text-sm font-semibold">{progressPct}%</span>
            <span className="text-white/50 text-xs">
              {deliveredCount} with Amora · {confirmedCount} confirmed
            </span>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex min-h-screen bg-stone-50">

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside className="w-56 shrink-0 bg-white border-r border-stone-200 sticky top-0 h-screen overflow-y-auto">
          {/* Timeline nav */}
          <div className="p-3 space-y-1">
            <button
              onClick={() => setActiveView("timeline")}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                activeView === "timeline"
                  ? "bg-teal-deep text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Timeline</span>
              {activeView === "timeline" && <ChevronRight className="w-3 h-3 ml-auto" />}
            </button>
            <button
              onClick={() => setActiveView("kanban")}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                activeView === "kanban"
                  ? "bg-teal-deep text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              <span>Kanban</span>
              {activeView === "kanban" && <ChevronRight className="w-3 h-3 ml-auto" />}
            </button>
            <button
              onClick={() => setActiveView("decisions")}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                activeView === "decisions"
                  ? "bg-teal-deep text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span>Decisions</span>
              {activeView === "decisions" ? (
                <ChevronRight className="w-3 h-3 ml-auto" />
              ) : (
                (() => {
                  const openCount = DECISIONS.filter(
                    (dec) => !serverState.decisions[dec.id] || serverState.decisions[dec.id]?.status === "open"
                  ).length;
                  return openCount > 0 ? (
                    <span className="ml-auto text-xs bg-amber-400 text-white font-bold px-1.5 py-0.5 rounded-full">
                      {openCount}
                    </span>
                  ) : null;
                })()
              )}
            </button>
            <button
              onClick={() => setActiveView("variables")}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                activeView === "variables"
                  ? "bg-teal-deep text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              <FileCheck className="w-4 h-4 shrink-0" />
              <span>Variables</span>
              {activeView === "variables" ? (
                <ChevronRight className="w-3 h-3 ml-auto" />
              ) : (
                (() => {
                  const allVars = PAGES.flatMap((p) => p.placeholders.map((_, i) => ({ pageId: p.id, i })));
                  const pendingCount = allVars.filter(
                    ({ pageId, i }) => !serverState.copy[`var-${pageId}-${i}`]?.trim()
                  ).length;
                  return pendingCount > 0 ? (
                    <span className="ml-auto text-xs bg-orange-400 text-white font-bold px-1.5 py-0.5 rounded-full">
                      {pendingCount}
                    </span>
                  ) : null;
                })()
              )}
            </button>
          </div>

          <div className="px-3 pb-1">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest px-1 mb-2">
              Page Copy
            </p>
          </div>

          {/* Week group labels + page tabs */}
          {[
            { label: "Wk 1 - Journeys", pages: ["home", "steward", "resident", "how-we-create", "quests"] },
            { label: "Wk 2 - Structure", pages: ["roles", "circles", "team"] },
            { label: "Wk 3 - Community", pages: ["love-letter", "co-creators-guide", "good-neighbor", "seasonal-festivals"] },
            { label: "Wk 4 - Prosperity", pages: ["investor", "prosperity"] },
            { label: "Wk 5 - Complete", pages: ["master-plan", "opportunities", "housing"] },
          ].map((group) => (
            <div key={group.label} className="px-3 mb-3">
              <p className="text-xs text-stone-400 px-1 mb-1 font-medium">{group.label}</p>
              {group.pages.map((pid) => {
                const page = PAGES.find((p) => p.id === pid)!;
                const hasPlaceholders = page.placeholders.length > 0;
                return (
                  <button
                    key={pid}
                    onClick={() => setActiveView(pid)}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs transition-colors ${
                      activeView === pid
                        ? "bg-teal-deep text-white"
                        : "text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    <span>{page.emoji}</span>
                    <span className="text-left leading-tight">{page.title}</span>
                    {hasPlaceholders && (
                      <span className={`ml-auto shrink-0 w-2 h-2 rounded-full ${activeView === pid ? "bg-amber" : "bg-orange-400"}`} />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        {/* ── Main Content ──────────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto p-6 md:p-8">
          {loadingState ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-stone-400 text-sm">Loading...</div>
            </div>
          ) : (
            <>
              {/* ── TIMELINE VIEW ───────────────────────────────────────── */}
              {activeView === "timeline" && (
                <div className="max-w-4xl mx-auto">
                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500 mb-6">
                    <span className="flex items-center gap-1.5">
                      <Square className="w-4 h-4 text-stone-300" /> Pending
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4 text-teal" /> ReGen Done (Amora's Turn)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <XSquare className="w-4 h-4 text-emerald-600" /> Amora Confirmed
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded bg-amber-400" /> Amora's Item
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded bg-violet-400" /> Collab Item
                    </span>
                  </div>

                  {WEEKS.map((week) => {
                    const allWeekItems = week.deliverables;
                    const myItems = allWeekItems.filter((d) => d.status !== "amora");
                    const confirmedWeekCount = myItems.filter(
                      (d) => getEffectiveState(d.id, d, serverState.checkboxes) === 2
                    ).length;
                    const deliveredWeekCount = myItems.filter(
                      (d) => getEffectiveState(d.id, d, serverState.checkboxes) === 1
                    ).length;
                    return (
                      <div key={week.id} className="mb-8 bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm">
                        {/* Week header */}
                        <div className="bg-teal-deep/5 border-b border-stone-200 px-5 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h2 className="font-display font-bold text-teal-deep text-lg">{week.label}</h2>
                              <p className="text-stone-500 text-sm mt-0.5">{week.goal}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="text-teal-deep font-bold text-sm">{confirmedWeekCount}/{myItems.length}</span>
                              <p className="text-stone-400 text-xs">confirmed</p>
                              {deliveredWeekCount > 0 && (
                                <p className="text-amber text-xs">{deliveredWeekCount} with Amora</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Deliverables */}
                        <div className="divide-y divide-stone-100">
                          {week.deliverables.map((d) => {
                            const isAmora = d.status === "amora";
                            const isCollab = d.status === "collab";
                            const state = getEffectiveState(d.id, d, serverState.checkboxes);
                            const isExpanded = expandedItems.has(d.id);
                            const isEditingThisNote = editingNote === d.id;
                            const noteContent = serverState.copy[`note-${d.id}`];
                            const assigneeName = serverState.kanban[d.id]?.assignee;
                            return (
                              <div key={d.id}>
                                {/* Main row */}
                                <div
                                  className={`flex items-start gap-3 px-5 py-3 transition-colors ${
                                    isAmora
                                      ? "bg-amber/5"
                                      : isCollab
                                      ? "bg-violet-50/30"
                                      : state === 2
                                      ? "bg-emerald-50/50"
                                      : state === 1
                                      ? "bg-teal-deep/5"
                                      : "hover:bg-stone-50"
                                  }`}
                                >
                                  {/* 3-state checkbox */}
                                  <button
                                    onClick={() => cycleCheckbox(d)}
                                    className="mt-0.5 shrink-0"
                                    title={
                                      state === 0
                                        ? "Click to mark ReGen done (Amora's turn)"
                                        : state === 1
                                        ? "Click to mark Amora Confirmed"
                                        : "Click to reset to Pending"
                                    }
                                  >
                                    {state === 2 ? (
                                      <XSquare className="w-5 h-5 text-emerald-600" />
                                    ) : state === 1 ? (
                                      <CheckSquare className="w-5 h-5 text-teal" />
                                    ) : (
                                      <Square className="w-5 h-5 text-stone-300 hover:text-teal transition-colors" />
                                    )}
                                  </button>

                                  <span
                                    className={`flex-1 text-sm leading-relaxed ${
                                      isAmora
                                        ? "text-amber-800 font-medium"
                                        : isCollab
                                        ? "text-violet-800 font-medium"
                                        : state === 2
                                        ? "text-stone-400 line-through"
                                        : state === 1
                                        ? "text-stone-600"
                                        : "text-stone-700"
                                    }`}
                                  >
                                    {d.text}
                                  </span>

                                  {isAmora && (
                                    <span className="shrink-0 text-xs bg-amber text-teal-deep font-semibold px-2 py-0.5 rounded">
                                      Amora
                                    </span>
                                  )}
                                  {isCollab && (
                                    <span className="shrink-0 text-xs bg-violet-100 text-violet-700 font-semibold px-2 py-0.5 rounded">
                                      Collab
                                    </span>
                                  )}
                                  {!isAmora && !isCollab && state === 1 && (
                                    <span className="shrink-0 text-xs bg-amber text-teal-deep font-semibold px-2 py-0.5 rounded">
                                      Amora
                                    </span>
                                  )}
                                  {!isAmora && !isCollab && state === 2 && (
                                    <span className="shrink-0 text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded">
                                      Confirmed
                                    </span>
                                  )}
                                  {assigneeName && (
                                    <span className="shrink-0 text-xs bg-stone-100 text-stone-600 font-medium px-2 py-0.5 rounded-full border border-stone-200">
                                      {assigneeName}
                                    </span>
                                  )}

                                  {/* Expand toggle */}
                                  <button
                                    onClick={() => toggleExpanded(d.id)}
                                    className="shrink-0 text-stone-300 hover:text-stone-500 transition-colors ml-1"
                                    title={isExpanded ? "Collapse" : "Expand notes"}
                                  >
                                    <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`} />
                                  </button>
                                </div>

                                {/* Expandable notes panel */}
                                {isExpanded && (
                                  <div className="px-5 py-3 bg-stone-50 border-t border-stone-100">
                                    <div className="flex items-center gap-2 mb-2">
                                      <StickyNote className="w-3.5 h-3.5 text-stone-400" />
                                      <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Notes</span>
                                      {d.pageLink && (
                                        <button
                                          onClick={() => setActiveView(d.pageLink!)}
                                          className="ml-auto flex items-center gap-1 text-xs text-teal hover:text-teal-deep transition-colors"
                                        >
                                          <LinkIcon className="w-3 h-3" />
                                          View page copy
                                        </button>
                                      )}
                                    </div>

                                    {isEditingThisNote ? (
                                      <div className="space-y-2">
                                        <textarea
                                          value={noteDraft}
                                          onChange={(e) => setNoteDraft(e.target.value)}
                                          autoFocus
                                          placeholder="Add notes, decisions, or context here..."
                                          className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg outline-none resize-y min-h-20 focus:border-teal-deep font-sans"
                                        />
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => saveNote(d.id)}
                                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-teal-deep text-white hover:bg-teal transition-colors"
                                          >
                                            <Save className="w-3 h-3" />
                                            Save
                                          </button>
                                          <button
                                            onClick={() => setEditingNote(null)}
                                            className="text-xs px-3 py-1.5 rounded-lg bg-stone-200 text-stone-600 hover:bg-stone-300 transition-colors"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        <p className="text-sm text-stone-500 whitespace-pre-wrap leading-relaxed min-h-8">
                                          {noteContent || <span className="italic text-stone-300">No notes yet.</span>}
                                        </p>
                                        <button
                                          onClick={() => startEditNote(d.id)}
                                          className="flex items-center gap-1.5 text-xs mt-2 px-2.5 py-1 rounded-md bg-stone-200 text-stone-600 hover:bg-stone-300 transition-colors"
                                        >
                                          <Edit2 className="w-3 h-3" />
                                          {noteContent ? "Edit notes" : "Add notes"}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  <p className="text-stone-400 text-xs text-center mt-4">
                    Checkboxes cycle: Pending → ReGen Delivered → Amora Confirmed → Pending. State is shared and synced to server.
                  </p>
                </div>
              )}

              {/* ── KANBAN VIEW ─────────────────────────────────────────── */}
              {activeView === "kanban" && (() => {
                const kanbanCols: { id: KanbanColumn; label: string; color: string; headerColor: string }[] = [
                  { id: "assigned", label: "Assigned", color: "bg-stone-50", headerColor: "bg-stone-200 text-stone-700" },
                  { id: "actioning", label: "Actioning", color: "bg-blue-50", headerColor: "bg-blue-200 text-blue-800" },
                  { id: "needs-support", label: "Needs Support", color: "bg-red-50", headerColor: "bg-red-200 text-red-800" },
                  { id: "completed", label: "Completed", color: "bg-emerald-50", headerColor: "bg-emerald-200 text-emerald-800" },
                ];
                return (
                  <div className="max-w-full">
                    <div className="mb-6">
                      <h2 className="font-display text-2xl font-bold text-teal-deep">Kanban Board</h2>
                      <p className="text-stone-500 text-sm mt-1">
                        Assign tasks to team members and track progress. Moving a card to Completed auto-marks the timeline item as confirmed.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                      {kanbanCols.map((col) => {
                        const colCards = WEEKS.flatMap((w) =>
                          w.deliverables.map((d) => ({ ...d, weekLabel: w.label }))
                        ).filter((d) => {
                          const entry = serverState.kanban[d.id];
                          return entry ? entry.column === col.id : col.id === "assigned";
                        });
                        return (
                          <div key={col.id} className={`rounded-xl border border-stone-200 ${col.color} flex flex-col`}>
                            <div className={`flex items-center justify-between px-4 py-2.5 rounded-t-xl ${col.headerColor}`}>
                              <span className="font-semibold text-sm">{col.label}</span>
                              <span className="text-xs font-normal opacity-70">{colCards.length}</span>
                            </div>
                            <div className="p-3 space-y-2 flex-1 overflow-y-auto max-h-screen">
                              {colCards.length === 0 && (
                                <p className="text-center text-xs text-stone-400 py-4 italic">No tasks here</p>
                              )}
                              {colCards.map((d) => {
                                const entry = serverState.kanban[d.id];
                                const isAmora = d.status === "amora";
                                const isCollab = d.status === "collab";
                                return (
                                  <div
                                    key={d.id}
                                    className={`bg-white rounded-lg border shadow-sm p-3 ${
                                      isAmora
                                        ? "border-l-4 border-l-amber border-r border-t border-b border-stone-200"
                                        : isCollab
                                        ? "border-l-4 border-l-violet-400 border-r border-t border-b border-stone-200"
                                        : "border-stone-200"
                                    }`}
                                  >
                                    <p className="text-xs text-stone-700 leading-relaxed mb-2">{d.text}</p>
                                    <div className="text-xs text-stone-400 mb-2">{d.weekLabel}</div>
                                    {isAmora && (
                                      <span className="inline-block text-xs bg-amber text-teal-deep font-semibold px-1.5 py-0.5 rounded mb-2">
                                        Amora
                                      </span>
                                    )}
                                    {isCollab && (
                                      <span className="inline-block text-xs bg-violet-100 text-violet-700 font-semibold px-1.5 py-0.5 rounded mb-2">
                                        Collab
                                      </span>
                                    )}
                                    <div className="flex flex-col gap-1.5 mt-1">
                                      <input
                                        type="text"
                                        list="assignee-suggestions"
                                        placeholder="Assignee name"
                                        value={entry?.assignee ?? ""}
                                        onChange={(e) =>
                                          updateKanban(d.id, entry?.column ?? "assigned", e.target.value)
                                        }
                                        className="text-xs px-2 py-1 border border-stone-200 rounded-md w-full outline-none focus:border-teal-deep"
                                      />
                                      <select
                                        value={entry?.column ?? "assigned"}
                                        onChange={(e) =>
                                          updateKanban(d.id, e.target.value as KanbanColumn, entry?.assignee ?? "")
                                        }
                                        className="text-xs px-2 py-1 border border-stone-200 rounded-md w-full outline-none focus:border-teal-deep bg-white"
                                      >
                                        <option value="assigned">Assigned</option>
                                        <option value="actioning">Actioning</option>
                                        <option value="needs-support">Needs Support</option>
                                        <option value="completed">Completed</option>
                                      </select>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Datalist for assignee auto-suggest */}
                    <datalist id="assignee-suggestions">
                      {knownAssignees.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </div>
                );
              })()}

              {/* ── DECISIONS VIEW ──────────────────────────────────────── */}
              {activeView === "decisions" && (
                <div className="max-w-3xl mx-auto">
                  <div className="mb-6">
                    <h2 className="font-display text-2xl font-bold text-teal-deep">Decision Log</h2>
                    <p className="text-stone-500 text-sm mt-1">
                      Track key decisions for the Amora launch. Marking a decision as decided will reflect on the timeline.
                    </p>
                  </div>

                  {/* Summary stats */}
                  <div className="flex gap-4 mb-6">
                    <div className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex-1 text-center shadow-sm">
                      <p className="text-2xl font-bold text-teal-deep">
                        {DECISIONS.filter((dec) => serverState.decisions[dec.id]?.status === "decided").length}
                      </p>
                      <p className="text-stone-400 text-xs mt-0.5">Decided</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex-1 text-center shadow-sm">
                      <p className="text-2xl font-bold text-amber-600">
                        {DECISIONS.filter((dec) => !serverState.decisions[dec.id] || serverState.decisions[dec.id]?.status === "open").length}
                      </p>
                      <p className="text-stone-400 text-xs mt-0.5">Open</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex-1 text-center shadow-sm">
                      <p className="text-2xl font-bold text-stone-400">{DECISIONS.length}</p>
                      <p className="text-stone-400 text-xs mt-0.5">Total</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {DECISIONS.map((dec) => {
                      const entry = serverState.decisions[dec.id];
                      const isDecided = entry?.status === "decided";
                      const isEditing = editingDecision === dec.id;
                      const linkedDeliverable = dec.linkedItem
                        ? WEEKS.flatMap((w) => w.deliverables).find((x) => x.id === dec.linkedItem)
                        : null;
                      const linkedState = linkedDeliverable
                        ? getEffectiveState(linkedDeliverable.id, linkedDeliverable, serverState.checkboxes)
                        : null;

                      return (
                        <div
                          key={dec.id}
                          className={`bg-white border rounded-xl overflow-hidden shadow-sm ${
                            isDecided ? "border-emerald-200" : "border-stone-200"
                          }`}
                        >
                          <div className={`px-5 py-4 border-b ${isDecided ? "border-emerald-100 bg-emerald-50/50" : "border-stone-100 bg-stone-50"}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                    isDecided
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-amber-100 text-amber-700"
                                  }`}>
                                    {isDecided ? "Decided" : "Open"}
                                  </span>
                                  {linkedDeliverable && (
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                      linkedState === 2
                                        ? "bg-emerald-100 text-emerald-600"
                                        : linkedState === 1
                                        ? "bg-teal-deep/10 text-teal-deep"
                                        : "bg-stone-100 text-stone-500"
                                    }`}>
                                      Timeline: {linkedDeliverable.text.slice(0, 40)}{linkedDeliverable.text.length > 40 ? "..." : ""}
                                    </span>
                                  )}
                                </div>
                                <h3 className="font-semibold text-stone-800 text-sm">{dec.title}</h3>
                              </div>
                              <button
                                onClick={() => {
                                  if (isEditing) {
                                    setEditingDecision(null);
                                  } else {
                                    setEditingDecision(dec.id);
                                    setDecisionDraft({
                                      chosen: entry?.chosen ?? "",
                                      notes: entry?.notes ?? "",
                                    });
                                  }
                                }}
                                className={`shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                                  isEditing
                                    ? "bg-stone-200 text-stone-600 hover:bg-stone-300"
                                    : "bg-teal-deep text-white hover:bg-teal"
                                }`}
                              >
                                {isEditing ? "Cancel" : isDecided ? "Edit" : "Resolve"}
                              </button>
                            </div>
                          </div>

                          <div className="px-5 py-4">
                            <p className="text-stone-500 text-sm mb-3">{dec.description}</p>

                            {dec.suggestedOptions && dec.suggestedOptions.length > 0 && (
                              <div className="mb-3">
                                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1.5">Suggested options</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {dec.suggestedOptions.map((opt) => (
                                    <button
                                      key={opt}
                                      onClick={() => {
                                        if (!isEditing) {
                                          setEditingDecision(dec.id);
                                          setDecisionDraft({
                                            chosen: opt,
                                            notes: entry?.notes ?? "",
                                          });
                                        } else {
                                          setDecisionDraft((prev) => ({ ...prev, chosen: opt }));
                                        }
                                      }}
                                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                        (isEditing ? decisionDraft.chosen : entry?.chosen) === opt
                                          ? "bg-teal-deep text-white border-teal-deep"
                                          : "border-stone-200 text-stone-600 hover:border-teal hover:text-teal"
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {isEditing ? (
                              <div className="space-y-3">
                                <div>
                                  <label className="text-xs font-semibold text-stone-500 block mb-1">Decision chosen</label>
                                  <input
                                    type="text"
                                    value={decisionDraft.chosen}
                                    onChange={(e) => setDecisionDraft((prev) => ({ ...prev, chosen: e.target.value }))}
                                    placeholder="What was decided?"
                                    autoFocus
                                    className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg outline-none focus:border-teal-deep"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-semibold text-stone-500 block mb-1">Notes / rationale</label>
                                  <textarea
                                    value={decisionDraft.notes}
                                    onChange={(e) => setDecisionDraft((prev) => ({ ...prev, notes: e.target.value }))}
                                    placeholder="Context, rationale, or next steps..."
                                    className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg outline-none resize-y min-h-20 focus:border-teal-deep font-sans"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => updateDecision(dec.id, "decided", decisionDraft.chosen, decisionDraft.notes)}
                                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    Mark as Decided
                                  </button>
                                  <button
                                    onClick={() => updateDecision(dec.id, "open", decisionDraft.chosen, decisionDraft.notes)}
                                    className="text-xs px-3 py-1.5 rounded-lg bg-stone-200 text-stone-600 hover:bg-stone-300 transition-colors"
                                  >
                                    Save as Open
                                  </button>
                                </div>
                              </div>
                            ) : isDecided ? (
                              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                                <p className="text-xs font-semibold text-emerald-700 mb-0.5">Decision</p>
                                <p className="text-sm text-emerald-800 font-medium">{entry.chosen || "No decision text recorded"}</p>
                                {entry.notes && (
                                  <p className="text-xs text-emerald-600 mt-1.5 whitespace-pre-wrap">{entry.notes}</p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── VARIABLES VIEW ──────────────────────────────────────── */}
              {activeView === "variables" && (
                <div className="max-w-3xl mx-auto">
                  <div className="mb-6">
                    <h2 className="font-display text-2xl font-bold text-teal-deep">Variables Sheet</h2>
                    <p className="text-stone-500 text-sm mt-1">
                      Fill in the values that need to be inserted into pages before launch. Resolved values are visible to the team.
                    </p>
                  </div>

                  {/* Summary stats */}
                  {(() => {
                    const allVars = PAGES.flatMap((p) => p.placeholders.map((ph, i) => ({ pageId: p.id, ph, i })));
                    const resolvedCount = allVars.filter(({ pageId, i }) => serverState.copy[`var-${pageId}-${i}`]?.trim()).length;
                    return (
                      <div className="flex gap-4 mb-6">
                        <div className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex-1 text-center shadow-sm">
                          <p className="text-2xl font-bold text-emerald-600">{resolvedCount}</p>
                          <p className="text-stone-400 text-xs mt-0.5">Resolved</p>
                        </div>
                        <div className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex-1 text-center shadow-sm">
                          <p className="text-2xl font-bold text-amber-600">{allVars.length - resolvedCount}</p>
                          <p className="text-stone-400 text-xs mt-0.5">Pending</p>
                        </div>
                        <div className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex-1 text-center shadow-sm">
                          <p className="text-2xl font-bold text-stone-400">{allVars.length}</p>
                          <p className="text-stone-400 text-xs mt-0.5">Total</p>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-4">
                    {PAGES.filter((p) => p.placeholders.length > 0).map((p) => {
                      const allResolved = p.placeholders.every((_, i) => serverState.copy[`var-${p.id}-${i}`]?.trim());
                      return (
                        <div key={p.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
                          <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100 bg-stone-50">
                            <div className="flex items-center gap-2">
                              <span>{p.emoji}</span>
                              <h3 className="font-semibold text-stone-800 text-sm">{p.title}</h3>
                              <button
                                onClick={() => setActiveView(p.id)}
                                className="text-xs text-teal hover:text-teal-deep transition-colors flex items-center gap-0.5"
                              >
                                <LinkIcon className="w-3 h-3" />
                                view copy
                              </button>
                            </div>
                            {allResolved ? (
                              <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded">
                                All resolved
                              </span>
                            ) : (
                              <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded">
                                {p.placeholders.filter((_, i) => serverState.copy[`var-${p.id}-${i}`]?.trim()).length}/{p.placeholders.length} resolved
                              </span>
                            )}
                          </div>
                          <div className="divide-y divide-stone-100">
                            {p.placeholders.map((ph, i) => {
                              const varKey = `var-${p.id}-${i}`;
                              const value = serverState.copy[varKey] ?? "";
                              const isResolved = value.trim().length > 0;
                              const isEditingVar = editingSection === varKey;
                              return (
                                <div key={i} className={`flex items-start gap-4 px-5 py-3.5 ${isResolved ? "bg-emerald-50/30" : ""}`}>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-stone-500 mb-1.5">{ph}</p>
                                    {isEditingVar ? (
                                      <div className="flex gap-2 items-center">
                                        <input
                                          type="text"
                                          value={editDraft}
                                          onChange={(e) => setEditDraft(e.target.value)}
                                          autoFocus
                                          placeholder="Enter the value..."
                                          className="flex-1 text-sm px-3 py-1.5 border border-stone-200 rounded-lg outline-none focus:border-teal-deep"
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") saveEdit(varKey);
                                            if (e.key === "Escape") cancelEdit();
                                          }}
                                        />
                                        <button
                                          onClick={() => saveEdit(varKey)}
                                          className="shrink-0 text-xs px-2.5 py-1.5 bg-teal-deep text-white rounded-lg hover:bg-teal transition-colors"
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={cancelEdit}
                                          className="shrink-0 text-xs px-2.5 py-1.5 bg-stone-200 text-stone-600 rounded-lg hover:bg-stone-300 transition-colors"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        {isResolved ? (
                                          <span className="text-sm text-stone-700 font-medium">{value}</span>
                                        ) : (
                                          <span className="text-sm text-stone-300 italic">Not set yet</span>
                                        )}
                                        <button
                                          onClick={() => startEdit(varKey, value)}
                                          className="text-xs text-stone-400 hover:text-teal-deep transition-colors flex items-center gap-0.5"
                                        >
                                          <Edit2 className="w-3 h-3" />
                                          {isResolved ? "Edit" : "Set value"}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="shrink-0 mt-1">
                                    {isResolved ? (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── PAGE COPY VIEW ──────────────────────────────────────── */}
              {activePage && (
                <div className="max-w-3xl mx-auto">
                  {/* Page header */}
                  <div className="mb-6">
                    <div className="flex items-center gap-2 text-stone-400 text-sm mb-2">
                      <span>{activePage.week}</span>
                      <span>·</span>
                      <a
                        href={`https://amora.regencivics.earth${activePage.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal hover:underline flex items-center gap-1"
                      >
                        amora.regencivics.earth{activePage.url}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <h2 className="font-display text-2xl font-bold text-teal-deep">
                      {activePage.emoji} {activePage.title}
                    </h2>
                  </div>

                  {/* Placeholder warnings */}
                  {activePage.placeholders.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                        <span className="text-orange-800 font-semibold text-sm">
                          ACTION NEEDED before launch
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {activePage.placeholders.map((ph, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-orange-700">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                            {ph}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* No placeholders badge */}
                  {activePage.placeholders.length === 0 && (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 mb-6 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      Copy delivered - no placeholders on this page
                    </div>
                  )}

                  {/* Sections */}
                  {activePage.sections.map((section, idx) => {
                    const sectionId = `${activePage.id}-${idx}`;
                    const isCopied = copiedId === sectionId;
                    const isEditing = editingSection === sectionId;
                    const isSaving = savingSection === sectionId;
                    const currentContent = serverState.copy[sectionId] ?? section.content;
                    const wasEdited = sectionId in serverState.copy;
                    return (
                      <div key={idx} className="bg-white border border-stone-200 rounded-xl mb-4 overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100 bg-stone-50">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-stone-800 text-sm">{section.heading}</h3>
                            {wasEdited && (
                              <span className="text-xs text-teal-deep/60 italic">edited</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={cancelEdit}
                                  className="text-xs px-2.5 py-1 rounded-md bg-stone-200 text-stone-600 hover:bg-stone-300 transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => saveEdit(sectionId)}
                                  disabled={isSaving}
                                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-teal-deep text-white hover:bg-teal transition-colors disabled:opacity-60"
                                >
                                  <Save className="w-3 h-3" />
                                  {isSaving ? "Saving..." : "Save"}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(sectionId, currentContent)}
                                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-stone-200 text-stone-600 hover:bg-stone-300 transition-colors"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => copyToClipboard(currentContent, sectionId)}
                                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors ${
                                    isCopied
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-stone-200 text-stone-600 hover:bg-stone-300"
                                  }`}
                                >
                                  {isCopied ? (
                                    <>
                                      <Check className="w-3 h-3" />
                                      Copied
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      Copy
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {isEditing ? (
                          <textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            autoFocus
                            className="w-full px-5 py-4 text-sm text-stone-700 font-sans leading-relaxed outline-none resize-y min-h-32 bg-amber-50/40 border-none"
                          />
                        ) : (
                          <pre className="px-5 py-4 text-sm text-stone-700 whitespace-pre-wrap font-sans leading-relaxed">
                            {currentContent}
                          </pre>
                        )}
                      </div>
                    );
                  })}

                  {/* Notes footer */}
                  <div className="bg-stone-100 rounded-xl p-5 mt-6 border border-stone-200">
                    <p className="text-stone-500 text-xs font-semibold uppercase tracking-wide mb-2">
                      Notes and Feedback
                    </p>
                    <p className="text-stone-400 text-sm">
                      Click <strong>Edit</strong> on any section to update copy - edits are saved to the server and visible to everyone.
                      For major decisions, use the{" "}
                      <button
                        onClick={() => setActiveView("decisions")}
                        className="text-teal hover:underline"
                      >
                        Decision Log
                      </button>
                      {" "}in the sidebar. To fill in missing values, visit the{" "}
                      <button
                        onClick={() => setActiveView("variables")}
                        className="text-teal hover:underline"
                      >
                        Variables Sheet
                      </button>
                      .
                    </p>
                  </div>

                  {/* Prev / Next nav */}
                  <div className="flex items-center justify-between mt-8 pt-6 border-t border-stone-200">
                    {(() => {
                      const idx = PAGES.findIndex((p) => p.id === activeView);
                      const prev = PAGES[idx - 1];
                      const next = PAGES[idx + 1];
                      return (
                        <>
                          {prev ? (
                            <button
                              onClick={() => setActiveView(prev.id)}
                              className="flex items-center gap-2 text-sm text-stone-500 hover:text-teal-deep transition-colors"
                            >
                              <ChevronRight className="w-4 h-4 rotate-180" />
                              <span>{prev.emoji} {prev.title}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => setActiveView("timeline")}
                              className="flex items-center gap-2 text-sm text-stone-500 hover:text-teal-deep transition-colors"
                            >
                              <ChevronRight className="w-4 h-4 rotate-180" />
                              Timeline
                            </button>
                          )}
                          {next ? (
                            <button
                              onClick={() => setActiveView(next.id)}
                              className="flex items-center gap-2 text-sm text-stone-500 hover:text-teal-deep transition-colors"
                            >
                              <span>{next.emoji} {next.title}</span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          ) : (
                            <span />
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </Layout>
  );
}
