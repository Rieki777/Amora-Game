import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import {
  CheckSquare,
  Square,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Copy,
  Check,
  FileSpreadsheet,
  FileText,
  Globe,
  BookOpen,
  Calendar,
  Rocket,
} from "lucide-react";

// ─── External Resource Links ─────────────────────────────────────────────────

const RESOURCES = [
  {
    label: "Live Site",
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

type DeliveryStatus = "done" | "amora" | "pending";

interface Deliverable {
  id: string;
  text: string;
  status: DeliveryStatus;
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
    goal: "Get the landing page live with the main journey flows in place. Set the tone, copy, and navigation before adding interactive elements.",
    deliverables: [
      { id: "w1-1", text: "Landing page — full copy and structure (welcome section, 5 journey paths)", status: "done" },
      { id: "w1-2", text: "Landing page — Attend, Experience, Co-Create, Integrate, Commit flow written and laid out", status: "done" },
      { id: "w1-3", text: "Investor Journey — Schedule a Call drop-down and CTA button wired up", status: "pending" },
      { id: "w1-4", text: "Roles section — role application workflow live", status: "pending" },
      { id: "w1-5", text: "Pages: Home, Love Letter, Co-Creators Guide, Good Neighbor — copy delivered (see page tabs)", status: "done" },
      { id: "w1-6", text: "AMORA: Provide brand kit assets (colors, fonts, logos)", status: "amora" },
    ],
  },
  {
    id: "w2",
    label: "Week 2 | Mar 24-30",
    goal: "Build the two most complex co-creator journeys with all linked pages and interactive elements working.",
    deliverables: [
      { id: "w2-1", text: "Village Steward Space — Rights and Responsibilities page linked and drafted", status: "pending" },
      { id: "w2-2", text: "Village Steward Journey — Community Connection Calls CTA live", status: "pending" },
      { id: "w2-3", text: "Village Steward Journey — Potluck, Events, Workshops, Village Weaving links live", status: "pending" },
      { id: "w2-4", text: "Village Steward Journey — Village Weaving Immersion description and CTA live", status: "pending" },
      { id: "w2-5", text: "Village Steward Journey — Love Letter membership page linked", status: "pending" },
      { id: "w2-6", text: "Village Steward Journey — Explore Quests section linked", status: "pending" },
      { id: "w2-7", text: "Village Steward Journey — Amora Game Guide linked (Roles, Co-Creator criteria)", status: "pending" },
      { id: "w2-8", text: "Village Steward Journey — Role Application for Upcoming Season CTA live", status: "pending" },
      { id: "w2-9", text: "Resident Space — Rights and Responsibilities page linked and drafted", status: "pending" },
      { id: "w2-10", text: "Resident Journey — Community Call and Discovery Call CTA live", status: "pending" },
      { id: "w2-11", text: "Resident Journey — Housing Options page linked", status: "pending" },
      { id: "w2-12", text: "Resident Journey — Love Letter membership page linked", status: "pending" },
      { id: "w2-13", text: "Resident Journey — Waitlist sign-up and $NNN/month fee placeholder live", status: "pending" },
      { id: "w2-14", text: "Resident Journey — Children's Play Day CTA live", status: "pending" },
      { id: "w2-15", text: "Resident Journey — Good Neighbor criteria linked", status: "pending" },
      { id: "w2-16", text: "Resident Journey — Land Share Agreement page linked", status: "pending" },
      { id: "w2-17", text: "Pages: Investor, Village Steward, Resident, How We Create, Quests — copy delivered (see page tabs)", status: "done" },
      { id: "w2-18", text: "Circles cards — all role titles, descriptions, and links accurate", status: "pending" },
      { id: "w2-19", text: "AMORA: Deliver Investor Pack content (terms, structure, documents)", status: "amora" },
    ],
  },
  {
    id: "w3",
    label: "Week 3 | Mar 31 – Apr 6",
    goal: "Complete the investor and prosperity creator journeys with all supporting content, interactive elements, and linked resources in place.",
    deliverables: [
      { id: "w3-1", text: "Investor Journey — full financial details and CTA flow complete", status: "pending" },
      { id: "w3-2", text: "Investor Journey — Request Investor Pack drop-down and CTA wired up", status: "pending" },
      { id: "w3-3", text: "Prosperity Journey — full ARI tier details and business paths documented", status: "pending" },
      { id: "w3-4", text: "Prosperity Journey — business proposal submission flow live", status: "pending" },
      { id: "w3-5", text: "Pages: Prosperity Journey — copy delivered (see page tab)", status: "done" },
      { id: "w3-6", text: "AMORA: Confirm ARI tiers and Voice allocations for Prosperity journey", status: "amora" },
      { id: "w3-7", text: "AMORA: Confirm Investor Pack structure and financial projections", status: "amora" },
    ],
  },
  {
    id: "w4",
    label: "Week 4 | Apr 7-13",
    goal: "Build the Roles and Circles infrastructure and publish the Amora Game Guide as a navigable resource. Wire all internal links.",
    deliverables: [
      { id: "w4-1", text: "Amora Game Guide — published as linked resource with Co-Creator criteria section", status: "pending" },
      { id: "w4-2", text: "Roles section — all initial roles documented (Community Engagement, Land Liaison, Marketing, Operations, Visionary, Financial Mgmt)", status: "pending" },
      { id: "w4-3", text: "Investor Journey — Request Investor Pack drop-down and Pack created", status: "pending" },
      { id: "w4-4", text: "Circles section — Explore Roles page complete", status: "pending" },
      { id: "w4-5", text: "Co-Creator Right of Passage — description and process documented and live", status: "pending" },
      { id: "w4-6", text: "Seasonal Festivals — description page live", status: "pending" },
      { id: "w4-7", text: "Guide and Sage progression — criteria and Voice gains documented", status: "pending" },
      { id: "w4-8", text: "Resident progression stages — documented with year thresholds", status: "pending" },
      { id: "w4-9", text: "Background check payment flow — wired up with tax-deductible placeholder note", status: "pending" },
      { id: "w4-10", text: "All internal hyperlinks audit — every bold link in all 4 journeys verified as working", status: "pending" },
      { id: "w4-11", text: "Pages: Governance Roles, Circles, Team — copy delivered (see page tabs)", status: "done" },
      { id: "w4-12", text: "AMORA: Finalize Role descriptions and Season structure for publication", status: "amora" },
    ],
  },
  {
    id: "w5",
    label: "Week 5 | Apr 14-20",
    goal: "Polish all pages, complete event CTAs. If the retainer is confirmed, begin scoping the backend and CRM integration. Final content review with the Amora team.",
    deliverables: [
      { id: "w5-1", text: "Events section — Potluck, Village Weaving, Land Tour, Children's Play Day CTAs live", status: "pending" },
      { id: "w5-2", text: "Webinar section — slide show, email flow, recording share process documented", status: "pending" },
      { id: "w5-3", text: "Email nurture flow — basic flow outlined and handed off or implemented in CRM", status: "pending" },
      { id: "w5-4", text: "Social media — post structure and follow-up structure documented", status: "pending" },
      { id: "w5-5", text: "Love Letter page — final design and membership dues confirmed", status: "pending" },
      { id: "w5-6", text: "Waitlist page — final design and fee structure confirmed", status: "pending" },
      { id: "w5-7", text: "Mobile responsiveness — full site tested on mobile", status: "pending" },
      { id: "w5-8", text: "Content audit — all placeholder values resolved by Amora", status: "pending" },
      { id: "w5-9", text: "Backend and CRM scoping — if retainer confirmed, spec document drafted", status: "pending" },
      { id: "w5-10", text: "Pages: Master Plan, Opportunities, Housing — copy delivered (see page tabs)", status: "done" },
      { id: "w5-11", text: "AMORA: Final content approval pass (all journeys, roles, game guide)", status: "amora" },
      { id: "w5-12", text: "AMORA: Confirm retainer decision for ongoing updates and CRM build", status: "amora" },
    ],
  },
  {
    id: "w6",
    label: "Week 6 | Apr 21-28",
    goal: "Complete final quality checks, fix any remaining issues, and deliver a fully functional site. If not on retainer, make sure Amora has full admin access before the engagement ends.",
    deliverables: [
      { id: "w6-1", text: "Full site QA — all pages, links, forms, and drop-downs tested", status: "pending" },
      { id: "w6-2", text: "Bug fixes — all outstanding visual and functional issues resolved", status: "pending" },
      { id: "w6-3", text: "Cross-browser test — Chrome, Safari, Firefox verified", status: "pending" },
      { id: "w6-4", text: "Amora admin access — site control transferred if not on retainer", status: "pending" },
      { id: "w6-5", text: "Handoff documentation — editing guide delivered to Amora team", status: "pending" },
      { id: "w6-6", text: "LAUNCH — site goes live for interested parties", status: "pending" },
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
    week: "Week 1 | Mar 17-23",
    placeholders: ["The full body text of the Love Letter needs to be written by the Amora team"],
    sections: [
      {
        heading: "Page Header",
        content: "Title: The Amora Love Letter",
      },
      {
        heading: "The Letter",
        content: `Salutation: Dear Future Amoracita,
Body: [PLACEHOLDER — Amora team to write the full letter body here]
Closing: With love and anticipation, The Amora Community`,
      },
      {
        heading: "Membership Commitments",
        content: `Heading: As a member of Amora 508(c)(1)(a), you commit to:
[LIST OF COMMITMENTS — Amora team to verify these are current and complete]`,
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
    title: "Co-Creators Guide",
    url: "/co-creators-guide",
    week: "Week 1 | Mar 17-23",
    placeholders: [],
    sections: [
      {
        heading: "Page Header",
        content: "Title: The Co-Creators Guide\nNav Tabs: R-Ikigai | Hearts Economy | Voice and Governance | The Four Spaces | Path of Growth | Good Neighbor | Quests | Circle Roles",
      },
      {
        heading: "R-Ikigai",
        content: `Heading: Your R-Ikigai
Venn Diagram: What You LOVE (Passion) | What You are GOOD AT (Skills) | What AMORA NEEDS (Regeneration) | What Earns HEARTS (Compensation)
Text: Roles, quests, and contributions that our community values and rewards.`,
      },
      {
        heading: "Hearts Economy",
        content: `Heading: The Hearts Economy
Earn Hearts: Complete quests, fulfill roles, or receive revenue shares from community and private businesses. (Land Stewardship Shifts, Business Revenue Share, Quests)
Hold Hearts: Hearts accumulate in your Village Profile and reflect your contribution history.
Use Hearts: Pay for HOA, utilities, services, cafe, shop, and more within the village.
Flow: Contribution > Hearts Earned > Community Spending > Regenerative Loop`,
      },
      {
        heading: "Voice and Governance",
        content: `Heading: How Proposals Work
1. Proposal — Anyone can raise a proposal. Presented clearly with context and goals.
2. Clarification — The circle asks clarifying questions. Not debate, just understanding.
3. Consent — No reasoned objections means we move forward.
Key Principles: Circles Hold Authority | Monthly All-Village Calls`,
      },
      {
        heading: "The Four Spaces",
        content: `Village Steward Space — Coordinates overall village success, open to all path members
Resident Space — Governs residential life and neighbor relations
Prosperity Space — Manages business interests and Hearts economy
Land Stewardship Space — Cares for land and ecosystem health`,
      },
      {
        heading: "Path of Growth",
        content: "Stages: Visitor | Guest | Immersant | Participant | Member/Amoracita | Contributor | Quest Seeker | Initiate | Co-Creator | Role Holder | Guide (7+ years) | Sage (21+ years)",
      },
      {
        heading: "Bottom CTAs",
        content: `The Love Letter — Read our community covenant and founding values
Find Your Quest — Discover opportunities that match your gifts
Join Community Call — Meet us live and ask your questions`,
      },
    ],
  },
  {
    id: "good-neighbor",
    emoji: "🤝",
    title: "Good Neighbor",
    url: "/good-neighbor",
    week: "Week 1 | Mar 17-23",
    placeholders: ["\"What Amora Commits to You\" section content needs team verification"],
    sections: [
      {
        heading: "Page Header",
        content: "Tag: Our Living Covenant\nTitle: Good Neighbor Criteria\nSubtitle: What Amora Values, and Why It Matters",
      },
      {
        heading: "The 8 Criteria",
        content: `1. Core Values Alignment — You Live the Vision
2. Communication and Conflict Resolution — You Practice Authentic Relating (NVC)
3. Financial Responsibility — You Can Meet Your Obligations
4. Contribution to Community Life — You Show Up and Participate
5. Respect for Land, Nature, and All Beings — You Are a Steward
6. Cultural Openness and Intergenerational Respect — You Value Diversity
7. Background Check Acknowledgment — Safety and Trust for Everyone
8. Children's Play Day Participation — For Families`,
      },
      {
        heading: "The 7-Step Process",
        content: `1. Initial Exploration — Learn about Amora through events, tours, and conversations.
2. Community Engagement — Attend potlucks, workshops, and gatherings.
3. Deep Conversation — Structured conversations with the Resident Circle about values, history, and commitment.
4. Background Check — Standard background and reference check.
5. Observation Period — A period of participation before full commitment.
6. Resident Consent — Current residents give consent with no reasoned objections.
7. Celebration — Welcome home.`,
      },
      {
        heading: "Core Values Pillars",
        content: `Regenerative Living: We do not just sustain, we heal. This community is built on the belief that humans can actively restore the land, water systems, and ecosystems we depend on.
Community Care: We practice radical responsibility alongside deep interdependence. You show up for yourself and for the whole.
Regenerative Purpose: Your life here has meaning. You are aligning your unique gifts with what Amora needs.`,
      },
      {
        heading: "What Amora Commits to You",
        content: "[PLACEHOLDER — Amora team to verify and fill in this section]\nCTAs: Sign the Membership Covenant | Attend a Community Call",
      },
    ],
  },
  {
    id: "investor",
    emoji: "💰",
    title: "Investor Journey",
    url: "/investor",
    week: "Week 2 | Mar 24-30",
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
Projected IRR: [PLACEHOLDER — team to confirm]
Target Raise: [PLACEHOLDER — Phase 1, Infrastructure and retreat center]`,
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
        content: `Curious: Discover Amora — Learn about our vision, values, and regenerative approach to community development.
Interested: Request Investor Pack — Receive comprehensive investor materials including feasibility study, proformas, and development timeline.
Exploring: Schedule Investment Call — Connect one-on-one with our team to discuss your investment goals.
Committed: Make Your Commitment — Choose your investment vehicle and formalize your contribution.`,
      },
      {
        heading: "Investor FAQs",
        content: `What is the legal structure? Horizontal Condominium under Costa Rican law, combined with a 508(c)(1)(a) community organization.
What are my exit options? Lot sale at appreciated value, business equity stake, or structured buy-back options.
How does debt vs equity work? We prefer debt financing to keep community ownership intact. Investors lend to the project and receive interest plus priority on lot purchases.
Can I build on my investment? Yes. Investors who become residents can build a home on their lot.
When is ROI expected? [PLACEHOLDER — answer to verify and add]`,
      },
    ],
  },
  {
    id: "steward",
    emoji: "🌿",
    title: "Village Steward",
    url: "/steward",
    week: "Week 2 | Mar 24-30",
    placeholders: ["Full page headline needs confirmation from Amora team"],
    sections: [
      {
        heading: "Page Header",
        content: "Tag: Village Steward Journey\nTitle: [Full headline to verify with Amora team]\nCTAs: Start with Community Call | Learn How We Create",
      },
      {
        heading: "Your Journey to Co-Creation (9 Stages)",
        content: `Visitor: Attend Community Call — Learn about the basics and ask questions about Amora.
Guest: Participate in Events — Join potlucks, events, workshops, and parties to experience the community.
Immersant: Village Weaving Immersion — Spend immersive time in the village learning how it operates and discovering where your gifts are most needed.
Participant: Community Training — Complete training in NVC, authentic relating, and other community practices.
Member: Become an Amoracita — Sign our Love Letter and formally become a member of Amora 508c1a.
Contributor: Participate in a Circle — Join a sociocratic circle to contribute to community decision-making.
Quest Seeker: Explore Quests — Take on quests to contribute meaningfully and demonstrate your commitment.
Initiate: Co-Creator Right of Passage — Complete the right of passage with a vote from the Co-Creators circle.
Co-Creator: Explore and Apply for Roles — Find a role that aligns with your gifts and apply for the upcoming season.`,
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
    id: "resident",
    emoji: "🏡",
    title: "Resident Journey",
    url: "/resident",
    week: "Week 2 | Mar 24-30",
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
Waitlist: Join the Waitlist — first right of refusal on land opportunities
Family Day: Children's Play Day
Initiate: Resident Right of Passage
Landowner: Purchase Land Share Agreement
Builder: Build Your Home
Resident: Move In Celebration!`,
      },
      {
        heading: "Village Dues",
        content: `Heading: Village Dues
[PLACEHOLDER — Amora team to confirm monthly dues amount ($NNN/month)]
Note: Dues cover utilities, maintenance, and community services. These can be covered through Hearts — contributions that track real value (1 Heart = $1 USD).`,
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
    id: "how-we-create",
    emoji: "⚙️",
    title: "How We Create",
    url: "/how-we-create",
    week: "Week 2 | Mar 24-30",
    placeholders: ["Hypha tools supporting text to verify with team"],
    sections: [
      {
        heading: "Four Pillars",
        content: `Sociocracy and Teal: We blend sociocratic governance with Teal organization principles. Self-management, wholeness, and evolutionary purpose guide our structure.
Adaptive Governance: Using Hypha tools, each circle designs its own governance strategy, from consent to consensus, tailored to its unique culture and mission.
Hearts Economy: Hearts track the value you contribute. 1 Heart = $1 USD in contributed value. As Amora matures, Hearts convert to cash or equity.
Seasonal Rhythm: Every 3 months, the community votes on what kind of season comes next. Not a fixed cycle.`,
      },
      {
        heading: "The Hearts Economy",
        content: `Earn Hearts: Complete quests, fulfill roles, or receive revenue shares from community and private businesses.
Track Value: 1 Heart = $1 USD in value contributed. Hearts are an honest record of the work everyone is pooling to make Amora real.
Future Conversion: As Amora matures, Hearts will convert to cash or equity.`,
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
    week: "Week 2 | Mar 24-30",
    placeholders: ["Circle assignments needed for: Circle Scribe, Retreat Center Host, Children's Play Day Facilitator, Tech and Platform Steward, Security and Night Watch"],
    sections: [
      {
        heading: "What Are Hearts?",
        content: `Earn: Complete quests, contribute to circles, steward the land, teach, build, host, create. Every meaningful act earns Hearts.
Hold: Hearts accumulate in your Village Profile and reflect your full contribution history.
Convert: As Amora grows financially, Hearts convert to cash or equity.`,
      },
      {
        heading: "14 Quest Cards",
        content: `Welcome Ambassador | Community Life | 50-100 Hearts
Food Forest Tender | Permaculture | 40-80 Hearts
Potluck and Celebration Organizer | Community Life | 100-200 Hearts
Trail Builder and Maintainer | Building and Village | 60-120 Hearts
Circle Scribe | [CIRCLE TO CONFIRM] | 40-80 Hearts
Retreat Center Host | [CIRCLE TO CONFIRM] | 80-150 Hearts
Village Photographer and Storyteller | Culture and Arts | 60-120 Hearts
Children's Play Day Facilitator | [CIRCLE TO CONFIRM] | 70-130 Hearts
Tech and Platform Steward | [CIRCLE TO CONFIRM] | 80-200 Hearts
Healing Arts Practitioner | Health and Healing | 50-150 Hearts
Infrastructure Builder | Building and Village | 80-160 Hearts
Arts and Mural Maker | Culture and Arts | 100-300 Hearts
Community Music Circle Host | Culture and Arts | 50-100 Hearts
Security and Night Watch | [CIRCLE TO CONFIRM] | 60-100 Hearts`,
      },
    ],
  },
  {
    id: "prosperity",
    emoji: "🌱",
    title: "Prosperity Journey",
    url: "/prosperity",
    week: "Week 3 | Mar 31–Apr 6",
    placeholders: ["ARI tier names and specific criteria/metrics for each tier", "Launch Checklist final contents"],
    sections: [
      {
        heading: "Page Header",
        content: "Tag: Prosperity Creator Journey\nTitle: Launch Your Regenerative Business\nCTAs: Download Prosperity Packet | Hearts Economy | Co-Ownership Model",
      },
      {
        heading: "Your Path to Prosperity (7 Stages)",
        content: `Researcher: Attend Community Call — Learn about business opportunities at Amora.
Dreamer: Explore the Prosperity Packet — Download and review the comprehensive guide.
Applicant: Submit Business Proposal — Present your vision and how it aligns with village needs.
Member: Sign Love Letter / 508 Membership — Become an official member.
Partner: Community Approval — Present your business to the Business and Finance Council.
Builder: Launch Your Business — Integrate with the Hearts contribution system and begin serving the community.
Prosperity Creator: Grow Your Impact — Advance through ARI tiers and scale your regenerative business.`,
      },
      {
        heading: "ARI Tiers",
        content: `Heading: ARI Tiers — Amora Regenerative Impact
Tier 1: Early stage, establishing presence
Tier 2: Growing, measurable contribution
Tier 3: Established, regional impact
Tier 4: Thriving, transformative impact
[PLACEHOLDER — ARI tier names and metrics to be defined by Amora team]`,
      },
    ],
  },
  {
    id: "roles",
    emoji: "📋",
    title: "Governance Roles",
    url: "/roles",
    week: "Week 4 | Apr 7-13",
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
[PLACEHOLDER — full details needed from Amora team]

2. Community Advisory Council
[PLACEHOLDER — full details needed from Amora team]
Note: Advisors receive First Right of Refusal on lot purchases, retreat discounts, and recognition as Founding Advisors.

3. Leadership Council
[PLACEHOLDER — full details needed from Amora team]

4. Core Team
[PLACEHOLDER — full details needed from Amora team]`,
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
    week: "Week 4 | Apr 7-13",
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
    week: "Week 4 | Apr 7-13",
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
        content: "Note: Advisors receive First Right of Refusal on lot purchases, retreat discounts, and recognition as Founding Advisors.\n[Advisor names and bios to verify — Amora team to provide]",
      },
      {
        heading: "Development Board of Directors",
        content: "Expertise: Legal and Regulatory | Real Estate Development | Financial and Investment\nMeetings: Monthly Meetings | Quarterly Sessions | Annual Retreat\n[Board member names and bios to verify — Amora team to provide]",
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
        content: `Total Acres: [PLACEHOLDER — verify]
Planned Homes: [PLACEHOLDER — verify]
Retreat Keys: [PLACEHOLDER — verify]
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
Phase 2: Show Homes [PLACEHOLDER — verify]
Phase 3: Retreat Center [PLACEHOLDER — verify]
Phase 4: Health Center [PLACEHOLDER — verify]
Phase 5: Residential Phase 1 [PLACEHOLDER — verify]`,
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

// ─── Component ────────────────────────────────────────────────────────────────

type ViewId = "timeline" | string; // string = page id

export default function JourneyToLaunch() {
  const [activeView, setActiveView] = useState<ViewId>("timeline");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load checked state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("amora-journey-checked");
      if (saved) setChecked(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, []);

  // Save checked state to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem("amora-journey-checked", JSON.stringify(checked));
    } catch {
      // ignore
    }
  }, [checked]);

  const toggleCheck = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback: select text
    }
  };

  const activePage = PAGES.find((p) => p.id === activeView);

  // Progress calculation
  const totalDeliverables = WEEKS.flatMap((w) => w.deliverables).filter((d) => d.status !== "amora").length;
  const checkedCount = Object.values(checked).filter(Boolean).length;
  const progressPct = Math.round((checkedCount / totalDeliverables) * 100);

  return (
    <Layout>
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="bg-teal-deep text-white py-8">
        <div className="container">
          <div className="flex items-center gap-3 mb-2">
            <Rocket className="w-6 h-6 text-amber" />
            <span className="text-amber font-medium text-sm tracking-widest uppercase">Internal Tool</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
            Journey to Launch
          </h1>
          <p className="text-white/70 text-sm max-w-2xl mb-6">
            The complete delivery roadmap for amora.regencivics.earth — Mar 17 to Apr 28, 2026.
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

          {/* Progress Bar */}
          <div className="flex items-center gap-3">
            <span className="text-white/60 text-xs">My delivery progress</span>
            <div className="flex-1 max-w-xs bg-white/20 rounded-full h-2">
              <div
                className="bg-amber h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-amber text-sm font-medium">{checkedCount} / {totalDeliverables}</span>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex min-h-screen bg-stone-50">

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside className="w-56 shrink-0 bg-white border-r border-stone-200 sticky top-0 h-screen overflow-y-auto">
          {/* Timeline nav */}
          <div className="p-3">
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
          </div>

          <div className="px-3 pb-1">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest px-1 mb-2">
              Page Copy
            </p>
          </div>

          {/* Week group labels + page tabs */}
          {[
            { label: "Wk 1 — Foundation", pages: ["home", "love-letter", "co-creators-guide", "good-neighbor"] },
            { label: "Wk 2 — Journeys", pages: ["investor", "steward", "resident", "how-we-create", "quests"] },
            { label: "Wk 3 — Prosperity", pages: ["prosperity"] },
            { label: "Wk 4 — Structure", pages: ["roles", "circles", "team"] },
            { label: "Wk 5 — Complete", pages: ["master-plan", "opportunities", "housing"] },
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

          {/* ── TIMELINE VIEW ─────────────────────────────────────────── */}
          {activeView === "timeline" && (
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center gap-4 text-xs text-stone-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-emerald-500" /> I Delivered
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-amber-400" /> Amora to Deliver
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-stone-300" /> Pending
                  </span>
                </div>
              </div>

              {WEEKS.map((week) => {
                const myItems = week.deliverables.filter((d) => d.status !== "amora");
                const amoraItems = week.deliverables.filter((d) => d.status === "amora");
                const doneCount = myItems.filter((d) => checked[d.id] || d.status === "done").length;
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
                          <span className="text-teal-deep font-bold text-sm">{doneCount}/{myItems.length}</span>
                          <p className="text-stone-400 text-xs">my items</p>
                        </div>
                      </div>
                    </div>

                    {/* Deliverables */}
                    <div className="divide-y divide-stone-100">
                      {week.deliverables.map((d) => {
                        const isAmora = d.status === "amora";
                        const isDone = isAmora ? false : (checked[d.id] || d.status === "done");
                        return (
                          <div
                            key={d.id}
                            className={`flex items-start gap-3 px-5 py-3 transition-colors ${
                              isAmora
                                ? "bg-amber/5"
                                : isDone
                                ? "bg-emerald-50/50"
                                : "hover:bg-stone-50"
                            }`}
                          >
                            {/* Checkbox or indicator */}
                            {isAmora ? (
                              <span className="mt-0.5 shrink-0 w-5 h-5 rounded border-2 border-amber-400 bg-amber-50 flex items-center justify-center">
                                <span className="w-2 h-2 rounded-sm bg-amber-400" />
                              </span>
                            ) : (
                              <button
                                onClick={() => !isAmora && d.status !== "done" && toggleCheck(d.id)}
                                className="mt-0.5 shrink-0"
                                disabled={d.status === "done"}
                              >
                                {isDone ? (
                                  <CheckSquare className="w-5 h-5 text-emerald-500" />
                                ) : (
                                  <Square className="w-5 h-5 text-stone-300 hover:text-teal-deep transition-colors" />
                                )}
                              </button>
                            )}

                            <span
                              className={`text-sm leading-relaxed ${
                                isAmora
                                  ? "text-amber-800 font-medium"
                                  : isDone
                                  ? "text-stone-400 line-through"
                                  : "text-stone-700"
                              }`}
                            >
                              {d.text}
                            </span>

                            {isAmora && (
                              <span className="ml-auto shrink-0 text-xs bg-amber text-teal-deep font-semibold px-2 py-0.5 rounded">
                                Amora
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Footer note */}
              <p className="text-stone-400 text-xs text-center mt-4">
                Created March 17, 2026. Move deliverables between weeks as priorities shift. Checkboxes save automatically.
              </p>
            </div>
          )}

          {/* ── PAGE COPY VIEW ────────────────────────────────────────── */}
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
                  Copy delivered — no placeholders on this page
                </div>
              )}

              {/* Sections */}
              {activePage.sections.map((section, idx) => {
                const sectionId = `${activePage.id}-${idx}`;
                const isCopied = copiedId === sectionId;
                return (
                  <div key={idx} className="bg-white border border-stone-200 rounded-xl mb-4 overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100 bg-stone-50">
                      <h3 className="font-semibold text-stone-800 text-sm">{section.heading}</h3>
                      <button
                        onClick={() => copyToClipboard(section.content, sectionId)}
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
                    </div>
                    <pre className="px-5 py-4 text-sm text-stone-700 whitespace-pre-wrap font-sans leading-relaxed">
                      {section.content}
                    </pre>
                  </div>
                );
              })}

              {/* Notes footer */}
              <div className="bg-stone-100 rounded-xl p-5 mt-6 border border-stone-200">
                <p className="text-stone-500 text-xs font-semibold uppercase tracking-wide mb-2">
                  Notes and Feedback
                </p>
                <p className="text-stone-400 text-sm">
                  Amora team: add copy feedback, corrections, and approvals in the{" "}
                  <a
                    href="https://docs.google.com/document/d/1HySZYDf-QDRg_Srp_hUbUyI6TKHNIlLc/edit"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal hover:underline"
                  >
                    Decision Log
                  </a>{" "}
                  or directly in the{" "}
                  <a
                    href="https://docs.google.com/spreadsheets/d/1TRbaOTqGSEc_sLWLb2mDSb00HWgLRgNe/edit"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal hover:underline"
                  >
                    Variables Sheet
                  </a>
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
        </main>
      </div>
    </Layout>
  );
}
