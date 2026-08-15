# How the good marketplaces actually run

Lane M, phase 1. Researched 2026-08-14 against primary sources where they exist.

This is a developer document, so it is exempt from `check-voice` and from the brand ratchet. It is
still written to be read by somebody deciding something.

**How to read the confidence marks.** **[P]** is a primary source (the platform's own docs).
**[S]** is secondary and is named as such. **[U]** is something the research could not verify, kept
in because knowing that a number is unverifiable is itself a finding. Several widely repeated
marketplace facts turned out to be **[U]**, and three of the assumptions this lane started with were
simply out of date. Those are corrected at the top of each section rather than quietly fixed.

---

## 0. Three corrections before anything else

The brief that opened this lane carried three figures that were true and are not anymore. They are
listed first because each one would have propagated into the design.

1. **Atlassian is not "25% / 15%".** The rates are mid-migration on a published escalator. As of
   August 2026: Connect 20%, Forge 16%, Data Center 25%. On 1 October 2026 Connect goes to 25% and
   Forge to 17%. **[P]** https://developer.atlassian.com/platform/marketplace/pricing-payment-and-billing/
   and https://www.atlassian.com/blog/development/updates-to-marketplace-revenue-share-2026
2. **Shopify's $1M exemption is lifetime, not annual.** It reset annually until Shopify ended the
   reset effective 16 June 2025. Revenue earned before 1 January 2025 does not count toward the
   threshold. **[P]** https://shopify.dev/changelog/update-to-shopifys-app-developer-revenue-share
3. **Salesforce's "15% ISV / 25% OEM of net revenue" is not published anywhere on a live Salesforce
   primary source.** **[U]** It appears in many secondary write-ups; the partner program PDFs return
   403 or are dated 2018. Only the AppExchange Checkout 15% is documented. **[P]**
   https://developer.salesforce.com/docs/platform/isvforce/guide/appexchange-checkout-rev-share.html
   That opacity is itself the finding: Salesforce's economics are a negotiated contract term, not a
   posted rate.

---

## 1. Apple App Store and Google Play: the consumer discipline

### What makes a listing trustworthy

Identity is bought, and it is bought cheaply. Apple charges 99 USD per membership year and requires
a **D-U-N-S number** for any company or educational institution, with the bar that "your business
must be recognized as a legal entity"; DBAs, trade names, branches and sole proprietorships are
refused. **[P]** https://developer.apple.com/support/D-U-N-S/ ·
https://developer.apple.com/support/compare-memberships/ Google charges 25 USD once, requires D-U-N-S
for organisation accounts, and government ID plus a credit card for individuals. **[P]**
https://support.google.com/googleplay/android-developer/answer/6112435 ·
https://support.google.com/googleplay/android-developer/answer/13628312

The part that actually reaches a buyer is **public identity disclosure**. Google publishes, on the
store page, the developer's legal name and country for personal accounts, and legal name, **legal
address, email and phone number** for organisation accounts, all verified by one-time password and
required to stay operational for the life of the account. **[P]** (same URL)

Apple additionally requires that apps in regulated fields (banking, healthcare, gambling, air travel,
crypto exchanges) be submitted by "a legal entity that provides the services, and not by an
individual developer" (guideline 5.1.1(ix)). **[P]**
https://developer.apple.com/app-store/review/guidelines/

### What gets a listing rejected

Apple publishes its own ranked answer: "over 40% of unresolved issues are related to guideline 2.1:
App Completeness." **[P]** https://developer.apple.com/distribute/app-review/ The enumerated causes
are mundane and all mechanical: crashes, **broken links including the required support and privacy
links**, placeholder content, missing reviewer credentials, inadequate privacy policies, unclear
purpose strings, inaccurate screenshots.

Guideline 2.3.1(a) is the one worth transplanting verbatim: "All new features, functionality, and
product changes must be described **with specificity** in the Notes for Review section (generic
descriptions will be rejected)." **[P]** (same URL)

### The single most transplantable mechanic in the whole study

Google publishes **numeric quality thresholds** and enforces them with ranking demotion plus a
buyer-visible warning, not with removal: user-perceived crash rate at or above **1.09%** of daily
users across all device models (or 8% on any single model), and ANR rate at or above **0.47%**.
Exceeding them means the app "is likely to be less discoverable on Google Play" and "a warning could
be shown on your app's store listing to set user expectations." **[P]**
https://support.google.com/googleplay/android-developer/answer/9844486

Objective, appeal-proof, continuously auditable from telemetry the platform already has, and it
degrades gracefully. Apple has no equivalent.

### The enforcement ladder, where reversibility is the variable

Google's four tiers are the cleanest published model of graduated sanction found anywhere. **[P]**
https://support.google.com/googleplay/android-developer/answer/2477981

| Tier | What happens | What the developer loses |
|---|---|---|
| **Rejection** | update fails review; **the published version stays live** | nothing; account standing untouched |
| **Removal** | unavailable on Play; **users, statistics and ratings are retained** pending a compliant update | new installs only |
| **Suspension** | strike against account standing | **user data and ratings forfeited** |
| **Termination** | account gone | everything |

Users who installed before a removal get a Google Play Protect notification with the option to keep
or remove the app. That is the only case in either store of a removal notice surfaced to **buyers**
rather than to developers.

### Delisting does not reach existing installs

Apple's App Store Improvements program flags an app that has both not been updated in three years and
not been meaningfully downloaded in a rolling twelve months. The developer gets an email and **90
days**. If removed, existing installs remain "fully functional" with "no interruption to services"
and in-app purchases keep working; the app name stays reserved to that account and can be resubmitted
with no time limit. The one exception with no grace period: **apps that crash on launch are removed
immediately.** **[P]** https://developer.apple.com/support/app-store-improvements/

### Privacy disclosure as self-attestation with a cheap enforcement primitive

Both stores use the same shape: a structured, self-declared disclosure form covering data collected,
linked and used for tracking (Apple) or collected and shared (Google), which the developer must keep
accurate **including for third-party SDKs they bundle**, and which is **updatable without shipping a
release**. **[P]** https://developer.apple.com/app-store/app-privacy-details/ ·
https://support.google.com/googleplay/android-developer/answer/10787469

Google's enforcement escalation is the cheap part worth stealing: on finding a discrepancy between
behaviour and declaration, the first sanction is that **"your app updates will be rejected"**, not
that the app is removed. **[P]** (same URL)

Two Google declarations have no Apple equivalent and are directly relevant here: whether all
collected data is **encrypted in transit**, and whether the developer **provides a way for users to
request data deletion**.

### Scale, and what appeals are actually worth

From Apple's 2024 App Store Transparency Report **[S]** (figures via
https://www.macrumors.com/2025/05/30/app-store-2024-transparency-report/ summarising the primary PDF
at https://www.apple.com/legal/more-resources/docs/2024-App-Store-Transparency-Report.pdf, which did
not decode to text): 7,771,599 submissions reviewed, 1,931,400 rejected (about 24.9%), 295,109
approved after revision, 82,509 apps removed, 146,747 developer accounts terminated.

**26,224 appeals were filed. In the US, 3,571 were filed and 71 were reinstated.** About 2%. Apple
permits one appeal per rejected submission; Google permits one per enforcement action and publishes
no response SLA. **[P]** https://developer.apple.com/distribute/app-review/ ·
https://support.google.com/googleplay/android-developer/answer/2477981

The lesson is not that appeals are unfair. It is that **the rejection message has to do the work,
because the appeal will not.**

Published turnaround: Apple, "on average, 90% of submissions are reviewed in less than 24 hours"
**[P]**. Google, "as soon as possible", with "up to seven days or longer in exceptional cases" for
accounts requiring deeper review **[P]**
https://support.google.com/googleplay/android-developer/answer/9859751

### One anti-pattern to design around

Apple's guideline **4.2.6** refuses "apps created from a commercialized template or app generation
service … unless they are submitted directly by the provider of the app's content", and names the
acceptable alternative: "a single binary to host all client content in an aggregated or 'picker'
model." **[P]** https://developer.apple.com/app-store/review/guidelines/

A fork-per-village platform is exactly the shape 4.2.6 was written about. Apple's own stated remedy
is a single binary with a picker, which is a fair description of a module registry.

---

## 2. Shopify, Atlassian, Salesforce: B2B economics and the billing rail

### The rates, current as of 2026-08-14

| | Platform's cut | Notes |
|---|---|---|
| **Shopify** | **0%** on the first $1,000,000 lifetime; **15%** above | Plus a **2.9% processing fee** on all app billing. One-time **$19** App Store registration. Ineligible for the 0% tier at ≥$20M prior-year App Store revenue or ≥$100M gross company revenue. **[P]** https://shopify.dev/docs/apps/launch/distribution/revenue-share |
| **Atlassian** | Forge **16%** (17% from 1 Oct 2026); Connect **20%** (25% from 1 Oct 2026); Data Center **25%** | **0% on the first $1M lifetime Forge revenue** from 1 Jan 2026. **[P]** https://www.atlassian.com/blog/development/updates-to-marketplace-revenue-share-2026 |
| **Salesforce** | AppExchange Checkout **15%**, plus $0.30 per credit-card transaction | The ISV/OEM 15/25 split is **[U]**. Security review **$999 per submission attempt** for paid apps **[S]**. |

### The finding that matters most: entitlement architecture determines whether a rate is enforceable at all

All three answer "is this customer entitled?" differently, and the answer decides whether the
platform's cut is a rule or a request.

**Shopify: an API call against platform-held state.** The app holds no key and no token. Entitlement
is read from the Admin GraphQL API (`currentAppInstallation` → `activeSubscriptions`) or the Partner
API `activeSubscription(appId:, shopId:)`, which returns "the live contract state, not a derived view
of historical events." **[P]** https://shopify.dev/docs/apps/launch/billing/managed-pricing ·
https://shopify.dev/docs/api/admin-graphql/latest/objects/AppInstallation

That is enforceable because requirement **1.2.1** makes bypass a delisting offence: "Apps that use
off-platform billing cannot be distributed through the Shopify App store." **[P]**
https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements

**Atlassian: a signed key when self-hosted, a platform assertion when cloud.** Connect cloud apps
receive a `lic` query parameter valued `active` or `none`, cached five minutes. Forge apps call
`GET /forge/app/v1/license`, rate-limited to one request per five minutes per installation, with
Atlassian recommending a one-hour cache. Data Center apps read a **signed, base64-encoded licence key
the customer pastes into the plugin manager**, validated by the app itself at every entry point
because no platform is there to do it. **[P]**
https://developer.atlassian.com/platform/marketplace/cloud-app-licensing/ ·
https://developer.atlassian.com/platform/forge/apis-reference/license-api/ ·
https://developer.atlassian.com/platform/marketplace/adding-licensing-support-to-server-apps/

Atlassian can only enforce its cut on **Paid-via-Atlassian**, which is exactly why Cloud, Forge and
DC-approved apps are **contractually barred** from Paid-via-Vendor. **[P]**
https://www.atlassian.com/licensing/marketplace/partneragreement

**Salesforce: a licence record replicated into the customer's own org.** The License Management App
lives in the ISV's business org, creates a licence record on each install, and the ISV mutates seat
count and expiration; the platform's own permission layer enforces it, so an unlicensed user hits a
Salesforce-rendered error without any ISV code. **[P]**
https://developer.salesforce.com/docs/atlas.en-us.pkg2_dev.meta/pkg2_dev/lma_intro.htm

Because the entitlement lives inside the customer's org, Salesforce **cannot technically enforce its
revenue share at all** for ISVs who bill directly. Hence the Channel Order App: a self-reporting
obligation with an audit clause. An honour system, written down.

### Rate rises need a carrot, and the escalator can be forced to slip

Atlassian announced Connect going 15% → 25% and had to **defer the whole schedule by three months**
under partner pressure, in an announcement dated 3 November 2025. **[P]**
https://www.atlassian.com/blog/development/extended-timelines-for-marketplace-revenue-share-changes ·
community thread https://community.developer.atlassian.com/t/marketplace-revenue-share-updates-2026/91727

What made it survivable was pairing it with **0% on the first $1M of Forge revenue**. The rate
differential (25% Connect against 17% Forge) is the actual product decision; the revenue is
secondary. Partners in that thread said plainly that the incentive still ran backwards on timing:
"we decided to not release it … we will wait till December", and cited missing Forge feature parity
(no OAuth2, no websockets) plus **nine Forge incidents in 60 days against one Connect incident**. The
observed behaviour was rational foot-dragging, not exodus.

### Trust badges: only the numeric ones survive

**Built for Shopify** publishes machine-checkable gates: at least 50 net installs from paid-plan
shops, at least 5 reviews, admin Web Vitals at p75 over a 28-day window (**LCP ≤2.5s, CLS ≤0.1, INP
≤200ms**), checkout p95 ≤500ms with ≤0.1% failure rate, carrier services p95 <500ms at 99.9% success,
and re-certification annually. **[P]**
https://shopify.dev/docs/apps/launch/built-for-shopify/requirements

Shopify claims "an average increase of 49% new installs in just 14 days of achieving status" **[S]**
https://www.shopify.com/partners/blog/built-for-shopify-updates — marketing, no sample size, and with
an obvious selection effect, since an app clearing a 50-install/5-review bar is already growing.

**Atlassian Cloud Fortified** asks partners to "maintain SLOs" with **no published uptime number**,
and is being retired: the changelog entry dated 26 June 2026 announces "Atlassian Enterprise
Certified" as its replacement and states the intent to "phase out the Cloud Fortified Apps program by
the end of the year." **[P]** https://developer.atlassian.com/platform/marketplace/changelog/

The badge with numbers is the one that lasted. The badge with adjectives is being replaced. The same
changelog adds customer-facing filters for SOC 2, ISO 27001, penetration testing and bug bounty, plus
**verified indicators distinguishing "Atlassian-verified information from partner-attested
responses"** — which is the honest version of a self-attested disclosure.

One documented, concrete tier benefit across all three platforms: Atlassian's app approval guidelines
state that "Platinum, Gold, and Silver status partners receive expedited SLAs." **[P]**
https://developer.atlassian.com/platform/marketplace/app-approval-guidelines/ The qualification
thresholds for those tiers are **[U]**; the tier page 404s.

### Withdrawal is best documented by Atlassian

From the Marketplace Partner Agreement **[P]**
https://www.atlassian.com/licensing/marketplace/partneragreement:

- Atlassian's discretion is absolute: it may remove any app "in its sole discretion".
- **Existing customers survive it**: "all end user licenses and subscriptions to Marketplace Apps
  (including any related support or maintenance periods) will survive termination or expiration of
  this Agreement."
- **Transition Period: 45 days** to delist, during which the partner must migrate customers to
  non-Atlassian licensing, provide equivalent products and support, and assist data migration.
- **60 days of revenue share is withheld** after termination to cover refunds.

Shopify gives partners at least **60 days** notice of changes, and merchants at least **30 days**
before a policy-violation removal, "though depending on the severity … some app removals may have a
shorter notice period." **[P]** https://help.shopify.com/en/partners/help-support/faq/removal
Unpublishing is not uninstalling; but an unpublished app installed across two or more organisations
must be submitted for review or sunset, or **API access is revoked and it is uninstalled from every
store**. **[P]** https://help.shopify.com/en/partners/help-support/faq/unpublished-app-deprecation

Salesforce documents the listing consequence of a failed periodic review (typically **60 days** to
remedy, then the listing is pulled from public viewing) and is **silent on what happens to installed
packages**. **[U]** — do not assume they keep working just because it seems likely.

---

## 3. WordPress and Odoo: paid modules in an open-source ecosystem

This is the closest analogue to a fork-per-village platform, and it is the section the design leans
on hardest.

### WordPress: the rules did not ban commerce, they relocated it

Three directory guidelines together produce the entire commercial shape of the ecosystem. **[P]**
https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/

- **Guideline 5, trialware is not permitted.** "Plugins may not contain functionality that is
  restricted or locked, only to be made available by payment or upgrade." The guideline then names
  the workaround itself: use "add-on plugins, hosted outside of WordPress.org, in order to exclude
  the premium code."
- **Guideline 6, software as a service is permitted** — but "a service that exists for the sole
  purpose of validating licenses or keys while all functional aspects of the plugin are included
  locally is not permitted."
- **Guideline 8**, no serving updates "from servers other than WordPress.org's".

Inside the directory: fully functional, fully GPL, updates only from WordPress.org. Outside it:
unconstrained. So every commercial vendor sells the pro plugin off-site. The rules **relocated
commerce past the directory boundary** rather than preventing it.

Guideline 4 closes the obvious escape: code must be "(mostly) human readable", and obfuscation is
banned. You cannot hide your licence check either.

### What the customer is actually paying for

GPL means the buyer may copy, modify and redistribute. So the paid thing cannot be the code. The
doctrine that emerged is that **you are buying the update channel and the support desk**.

The stress test is the **GPL club**: sites that legally resell premium plugins. "By the letter of the
law, it is not illegal to resell plugins developed by third parties under your own name." **[S]**
https://alienwp.com/gpl-clubs/ They exist, they are legal, and the premium plugin market survived
anyway, because what a reseller cannot transfer is the update pipe, the support desk, or the vendor's
accountability.

### The enforcement point that survives scrutiny is the download, not the runtime

The **Easy Digital Downloads Software Licensing API** is the reference implementation: four endpoints
(`activate_license`, `deactivate_license`, `check_license`, `get_version`) returning a status from
`valid | invalid | expired | disabled | missing | key_mismatch | no_activations_left | site_inactive`
alongside `license_limit`, `site_count`, `expires`, `activations_left`. **[P]**
https://easydigitaldownloads.com/docs/software-licensing-api/

When the licence is invalid, `download_link` comes back empty, WordPress's update transient sees no
package, and the update simply never appears. **The plugin already on disk keeps running.**

What the major vendors actually do on lapse **[P]**:

| Vendor | On expiry |
|---|---|
| **Gravity Forms** | "will remain on your site(s) and continue to operate"; loses updates, support, new site registrations. https://docs.gravityforms.com/license-expiry/ |
| **WooCommerce** | "remains installed and functional … no longer receives updates, including security patches". https://woocommerce.com/document/managing-woocommerce-com-subscriptions/troubleshoot-common-issues/ |
| **WP Rocket** | keeps working; **cloud-dependent features stop 15 days after expiry**. https://docs.wp-rocket.me/article/1711-what-happens-if-my-license-expires |
| **Freemius SDK** | blocks updates and support automatically; "plugins are designed to keep working normally after a license expires, and even if they are installed without a license key". https://freemius.com/help/documentation/wordpress-sdk/integration/software-licensing/ |

WP Rocket is the legitimate version of feature-gating: **the thing that stops is the thing the vendor
is still paying to run.**

### The backlash ladder, and where the line actually is

Three escalating cases, and the community's response is proportional to how deep the enforcement
reached into the customer's system.

1. **MemberPress (2022) locked the admin UI.** Front end kept working indefinitely; the operator lost
   access to every MemberPress admin screen, and with it the ability to issue refunds or manage
   members on their own live business. The Free Software Foundation's position was that this does not
   violate the GPL as long as users can remove the restriction; the community consensus was that it
   was contrary to "the WordPress way". **[S]**
   https://wptavern.com/memberpress-plugin-is-locking-users-out-after-support-license-expires
2. **Envira Gallery** blocks creating new galleries on expiry, described in its own directory review
   thread as "a blatant example of plugin lock-in". **[S]**
   https://wordpress.org/support/topic/avoid-envira-gallery-deceptive-licensing-and-plugin-lock-in/
3. **BricksUltimate (March 2024) destroyed customer data.** Encoded code phoned home every three
   hours and executed returned commands against the database; on a licence mismatch it modified
   `wp_posts` so the site's posts appeared deleted. The developer first said people were
   "overreacting", then apologised: "I now realize that this was not the right approach." **[S]**
   https://www.searchenginejournal.com/wordpress-site-builder-plugin-accused-of-adding-a-backdoor/510992/

**Stopping updates is universally accepted. Stopping a cloud service you are still paying to run is
accepted. Locking the admin UI draws sustained anger. Touching the customer's data is treated as
malware regardless of intent.**

### Freemius build-stripping: compliance by construction

The most transferable engineering pattern found anywhere in this study. Freemius ships **two builds
from one codebase**: files suffixed `__premium_only` are physically removed from the free build, and
`if ( my_fs()->is__premium_only() ) { … }` blocks are stripped by a preprocessor. **[P]**
https://freemius.com/help/documentation/wordpress-sdk/integration/software-licensing/

The free plugin therefore **contains no premium code at all**, so there is nothing for guideline 5 to
catch. Compliance is achieved by build separation rather than by runtime promise.

### Odoo weakened its own copyleft so that paid modules could exist

Odoo 8 was AGPLv3. Odoo 9 onward is **LGPLv3** for Community, and Odoo said why, on 5 February 2015:
"We can open up a true 'App store' to the benefit of both customers and publishers willing to invest
in fully packaged, ready-to-use apps as long as they get some financial compensation." **[P]**
https://www.odoo.com/blog/odoo-news-5/adapting-our-open-source-license-245

AGPL to LGPL is precisely the change that makes proprietary add-ons legal, because "combining LGPL
modules and proprietary modules is fine, while combining AGPL modules and proprietary modules is not
possible." **[P]** https://www.odoo.com/documentation/18.0/legal/licenses.html

This is the sharpest contrast with WordPress. WordPress's derivative-works stance forces every
commercial plugin to be GPL, which forces the business model onto services. **Odoo deliberately
weakened its copyleft so third-party modules could be proprietary, then built a marketplace on it.**

Odoo's commercials **[P]** https://apps.odoo.com/apps/faq · https://apps.odoo.com/apps/upload ·
https://apps.odoo.com/apps/sales-conditions:

- **30% commission** to Odoo S.A.; 25% on in-app purchases. Payouts close at €400 of unredeemed
  sales.
- **Per-version sale**, not subscription: from version 13.0, "every version of the module is sold
  separately", with unlimited re-downloads within that version.
- Publishers must fix bugs preventing advertised behaviour and **respond within 15 days**.
- Refund claims within **two months**; the vendor gets 15 days to resolve; refunds granted for
  unfixed bugs, missing advertised features, install failure, guideline violations or wrong licence.
- OPL-1, the licence most paid Odoo modules use, ships **source the customer can read and modify but
  may not redistribute**. Odoo relies on contract law where WordPress cannot.

**The per-version sale is the renewal lever that requires no disabling.** Odoo monetises the platform
upgrade cycle rather than elapsed time, so a customer who stands still owes nothing, and the vendor
never faces the "do I break their site to get paid?" decision that produced every backlash case
above.

**And Odoo tiers extensibility by hosting plan.** "Third-party applications can NOT be installed on
Online (SaaS) databases"; only Odoo.sh and on-premise allow arbitrary modules. **[P]**
https://apps.odoo.com/apps/sales-conditions ·
https://www.odoo.com/documentation/18.0/administration/odoo_online.html The cheapest, highest-volume
tier is a walled garden immune by construction to every supply-chain problem below. WordPress has no
equivalent lever, which is why its trust problems are so much worse.

### What actually hurt these ecosystems

**Abandonment and unpatched vulnerabilities.** Patchstack's State of WordPress Security in 2026
counted **11,334 new vulnerabilities across the ecosystem in 2025**, up 42% on 2024; **91% were in
plugins**; and **46% received no fix from the developer in time for public disclosure**. **[P]**
https://patchstack.com/whitepaper/state-of-wordpress-security-in-2026/

**Ownership transfer, twice, a decade apart, same method: buy trust, wait, weaponise.**

- **Display Widgets, 2017.** Sold for $15,000 to a buyer using an alias; malicious versions began
  about a month later; the plugin was removed and readmitted **four times in three months** before
  permanent removal. ~200,000 installs. **[S]**
  https://www.wordfence.com/blog/2017/09/display-widgets-malware/
- **Essential Plugin, 2025 to 2026.** A portfolio of 31 plugins with ~400,000 installs was listed on
  Flippa after a revenue decline and bought for a six-figure sum by a pseudonymous buyer. The first
  commit by the new owner (8 August 2025) added a PHP deserialization backdoor, which sat **dormant
  for about eight months** before activating on 5 April 2026. WordPress.org closed all 30-plus
  plugins in a single day and pushed a forced auto-update. The command-and-control domain was
  resolved **through an Ethereum smart contract**, so takedown was ineffective, and the payload
  cloaked itself to serve spam only to Googlebot. **[S]**
  https://anchor.host/someone-bought-30-wordpress-plugins-and-planted-a-backdoor-in-all-of-them/ ·
  https://www.infoq.com/news/2026/05/wordpress-plugins-supply-chain/

The gap, in the investigator's words: "WordPress.org has no mechanism to flag or review plugin
ownership transfers. There is no 'change of control' notification to users. No additional code review
triggered by a new committer." 400,000 sites were never told their plugin had a new owner. The
directory's own rule requires a written request only for plugins over 10,000 users; everything else
is a self-service form, and the only real defence is a warning aimed at the **seller**. **[P]**
https://developer.wordpress.org/plugins/wordpress-org/plugin-developer-faq/

**Credential stuffing on developer accounts, June 2024.** Five wordpress.org developer accounts were
compromised by password reuse and pushed malicious updates. **The vector was reused passwords, not a
code review failure.** **[S]**
https://www.wordfence.com/blog/2024/06/supply-chain-attack-on-wordpress-org-plugins-leads-to-5-maliciously-compromised-wordpress-plugins/

**The emergency power and the capture risk are the same power.** In October 2024 Matt Mullenweg
invoked guideline 18 to fork Advanced Custom Fields (2M+ installs) into Secure Custom Fields and
reassign the existing plugin slug, during a business dispute with WP Engine; a court ordered
restoration within 72 hours. **[S]**
https://www.therepository.email/wordpress-org-takes-control-of-acf-sparking-community-outrage The
same clause that let the directory close a backdoored plugin in one day let one person point an
established install slug at different code. Any marketplace reserving a "we can take over your
listing" right inherits both halves.

**Review capacity does not scale with submissions.** The WordPress queue went from a 1,260-deep
backlog with 91-day waits (2023), to zero with 7-day waits (October 2024), to ~1,050 again (April
2026), while volume went up roughly fivefold. The stabiliser was **automation on updates** (Plugin
Check security scanning on every update since October 2025), not more reviewers. And **38.7% of
reviewed plugins received no reply at all from their author** — the median submitter is already gone.
**[P]** https://make.wordpress.org/plugins/2026/01/07/a-year-in-the-plugins-team-2025/ ·
https://make.wordpress.org/plugins/2026/06/13/update-on-the-status-of-the-team-june-2026/

---

## 4. VS Code: what a free ecosystem buys and costs

### There is a `pricing` field, and it has no paid value

The extension manifest accepts `pricing` valued **only `"Free"` or `"Trial"`**. There is no "Paid".
**[P]** https://code.visualstudio.com/api/working-with-extensions/publishing-extension

Microsoft did build a payment rail, in August 2016, with a Buy button and per-seat licensing — **for
Visual Studio Team Services extensions only**, and it never extended to VS Code. **[P]**
https://devblogs.microsoft.com/bharry/paid-extension-in-the-visual-studio-marketplace/

What the absence produced is not free software. It is **licence keys**, uniformly. Wallaby.js ships
free from the marketplace with an "Activate License" button validating an email or key against the
vendor's server **[P]** https://wallabyjs.com/docs/support/license/. GitLens is free with Pro features
gated **on private repositories only** — a gate that discriminates by commercial context rather than
by feature, which is why it survived its backlash **[P]** https://www.gitkraken.com/gitlens. And
GitHub Copilot ships as a free marketplace extension whose subscription is billed entirely outside
the marketplace, because there is no rail. **[P]** https://github.com/features/copilot/plans

The sanctioned half-measure is a `sponsor` field rendering a Sponsor button, shipped in VS Code 1.68
(May 2022). **[P]** No data exists on its adoption or earnings. **[U]**

The one developer complaint worth quoting, from the issue asking for monetisation (opened December
2020, since closed with no substantive response): "I have received just 99 dollars for an extension
that I built using more than 100 hours of work." **[P]**
https://github.com/microsoft/vscode/issues/111800

### Chrome proved a rail can be taken away again

Google deprecated Chrome Web Store Payments on a published schedule: paid publishing disabled March
2020, new paid items permanently disabled September 2020, free trials removed December 2020, and
existing items could no longer charge from **1 February 2021**. **[P]**
https://developer.chrome.com/docs/webstore/cws-payments-deprecation

Every paid-extension developer had to build or buy a replacement. That is the direct precedent for
the VS Code situation run in reverse, and the destination is identical: out-of-band licence keys.

Worth knowing why it was probably removed: an August 2019 census found paid extensions were 8.9% of
the catalog but **2.6% of installs**, and about **35% of the 16,718 paid extensions had zero users**.
**[S]** https://extensionmonitor.com/blog/breaking-down-the-chrome-web-store-part-1/

### Every trust signal in this marketplace has been publicly defeated, with dates

| Signal | How it fell |
|---|---|
| **Install counts** | Aqua Security's fake "Pretier" got **>1,000 installs in 48 hours**, Jan 2023. **[S]** https://www.devclass.com/development/2023/01/09/researchers-demonstrate-a-thousand-installs-of-fake-vs-code-extension-in-48-hours/1627850 |
| **The verified badge** | OX Security forged it across four IDEs by editing bundled metadata, July 2025. **Microsoft called it "by design"** and rated it low-to-moderate. **[S]** https://www.ox.security/blog/can-you-trust-that-verified-symbol-exploiting-ide-extensions-is-easier-than-it-should-be/ |
| **Publisher identity** | `juanbIanco` with a capital I against `juanblanco`, Oct 2025, **at least one confirmed $500,000 crypto theft**. **[S]** https://www.rescana.com/post/malicious-crypto-stealing-vscode-extensions-target-openvsx-and-ai-code-editors-threat-analysis-and |
| **Code review** | A June 2024 full-catalog scan found **1,283 extensions with known malicious dependencies across 229M installs**. **[S]** https://www.koi.ai/blog/2-6-exposing-malicious-extensions-shocking-statistics-from-the-vs-code-marketplace |
| **Signing** | Repository signing (Nov 2022, verified from VS Code 1.75) proves the bits came from the marketplace unmodified. It says **nothing about intent and nothing about publisher identity**, and publisher signing was never mandated. **[P]** https://code.visualstudio.com/updates/v1_75 |

The badge's own documentation is honest about its scope: it verifies "the existence of the domain
name and the good standing of the publisher … for at least six months." It asserts nothing about the
code. And **only about 3% of publishers carry it** (~1,800 of ~45,000) after six years.

The structural precondition under all of it: "The extension host has the same permissions as VS Code
itself." **There is no sandbox.** **[P]**
https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security

Microsoft's answer, in November 2025, was to sell enterprises a **Private Marketplace** — a curated
catalog limited to GitHub Enterprise customers. **[P]**
https://code.visualstudio.com/blogs/2025/11/18/privatemarketplace Read it as conceding that the open
catalog's signals do not suffice, and selling curation rather than fixing them.

### Forking a marketplace: Open VSX

Open VSX exists because the VS Marketplace Terms of Use restrict use to "Visual Studio Products and
Services", which excludes forks. **[P]** (quoted in https://github.com/VSCodium/vscodium; the fuller
"forked or branded versions" wording is **[U]** — the ToU PDF did not decode).

Two facts matter. First, **it nearly died of funding**: the Open VSX Working Group formed in 2023
with Google, Salesforce, Amazon, Huawei, Posit and Siemens, and press coverage described the working
group as having saved the registry from closure. **[S]**
https://devclass.com/2023/06/27/open-vsx-alternative-to-vs-code-marketplace-saved-from-closure-by-new-eclipse-working-group/
Second, **a fork inherits the trust problem without inheriting the security budget**: GlassWorm, the
first self-propagating VS Code extension worm, hit Open VSX in October 2025 (~35,800 installs), using
invisible Unicode so the payload is not rendered in the editor and Solana-blockchain C2 immune to
takedown. **[S]** https://www.koi.ai/blog/glassworm-first-self-propagating-worm-using-invisible-code-hits-openvsx-marketplace

And a dormant contractual restriction is a loaded gun. Microsoft had published its C/C++ extension
licence terms since September 2020 without enforcing them; with v1.24.5 on 3 April 2025 the extension
began refusing to run outside Microsoft products. **[S]**
https://www.theregister.com/software/2025/04/24/microsoft-subtracts-c/c-extension-from-vs-code-forks/721912

### The publisher account is the real attack surface

The Cyberhaven Chrome extension compromise, December 2024: an employee was phished by a message
**impersonating the Chrome Web Store**, claiming the extension description had excessive keywords,
and authorised a malicious OAuth app against the company's developer account. At least a dozen
extensions were compromised in the same campaign. **[S]**
https://blog.sekoia.io/targeted-supply-chain-attack-against-chrome-browser-extensions/

The marketplace's own notification emails are a phishing template.

### Discovery capacity is fixed; catalog size is not

| Marketplace | Median | Mean | Ratio |
|---|---|---|---|
| Chrome extensions (Jan 2026) | **17 users** | 12,304 | ~720× **[S]** https://www.debugbear.com/blog/counting-chrome-extensions |
| VS Code (Jun 2024) | **500 installs** | 55,000 | ~110× **[S]** koi.ai, above |

In the 2019 Chrome census, **>10% of extensions had zero installs and 13.5% had exactly one** (the
developer). 50% had fewer than 16. **[S]** extensionmonitor.com, above.

The mobile parallel: the share of App Store apps appearing on no top list rose monotonically from
about 67% (2012) to just under 91% (2016). **[S]** https://www.pocketgamer.biz/adjust-zombie-apps-research/
Discovery capacity is roughly fixed, so as a catalog grows the uncurated fraction approaches
everything.

And curation is regressive. The best-measured intervention (Sensor Tower, Google Play, April 2016 to
March 2018) found featuring roughly tripled median downloads for games in "New + Updated", doubled
them for a Hero Banner, and moved **non-game apps only +10%** — while **78% of Hero Banner features
went to publishers who already had at least a million US downloads**. **[S]**
https://sensortower.com/blog/google-play-featuring-impact Any curation scheme drifts toward the
already-large unless something structurally stops it.

BlackBerry World is the clearest proof that catalog size is a corrupted metric: **47,000 of its
~120,000 apps came from a single developer**, about 39% of the store from one publisher exploiting
liberal publishing rules. **[S]**
https://www.phonearena.com/news/BlackBerry-World-app-store-flooded-by-47-000-apps-from-one-developer-hint-most-of-them-are-crap_id46654

### Two more failures worth the shelf space

**Windows Phone.** Microsoft paid for supply, reportedly $60,000 to $600,000 per ported app. **[S]**
https://www.windowscentral.com/microsoft-pay-out-100000-get-developers-coding-windows-phone It did
not work. The transferable finding is measurement, not money: Windows Phone had **32% developer
*intention* share and added 1% actual mindshare** in 2012. **[S]**
https://www.slashdata.co/blog/mobile-platform-tussles-winners-and-losers-in-2012/ Survey-stated
intent to support a platform is worthless as a forecast.

**Amazon Appstore**, announced February 2025 and shut August 2025 after fourteen years, with Amazon
saying it wanted to focus "on our own devices, as that's where the overwhelming majority of our
customers currently engage with it." **[P]**
https://developer.amazon.com/apps-and-games/blogs/2025/02/upcoming-changes-to-amazon-appstore-for-android-devices-and-coins-program
A marketplace that only matters on its owner's hardware eventually retreats to that hardware. Six
months' notice is the going rate.

**Apple and Basecamp's Hey (June 2020)** is the capriciousness case. Apple approved the app, rejected
an update over the missing in-app purchase, publicly doubled down, and then approved it **with no
in-app purchase and no 30% cut** after Basecamp went public and added a free trial address. **[S]**
https://techcrunch.com/2020/06/22/apple-approves-hey-bug-fix-update-after-basecamp-agrees-to-tweak-app-at-center-of-store-policy-spat/
The lesson is not the 30%. It is that the rule was resolved by public pressure rather than by the
stated policy. **A rule a loud developer can escape and a quiet one cannot is the definition of
capricious**, and that is what poisons developer trust.

---

## 5. Stripe Connect: how platforms pay third-party developers

Researched for the v2 design only. Nothing here is built in v1.

### The terminology moved twice, so write in terms of liability, not product names

Standard, Express and Custom are now marked **"Deprecated feature"** on Stripe's own page, replaced
first by **controller properties** and then by the **Accounts v2** API. **[P]**
https://docs.stripe.com/connect/accounts · https://docs.stripe.com/connect/migrate-to-controller-properties
· https://docs.stripe.com/connect/accounts-v2/connected-account-configuration

A design doc that says "we will use Express accounts" is legacy on arrival. Write the four axes
instead: who bears losses, who pays Stripe's fees, who collects KYC requirements, and which dashboard
the developer gets.

### Two hard constraints that decide the whole product

1. **You cannot give a developer the full Stripe Dashboard and also own their losses.**
   `stripe_dashboard.type = full` is incompatible with `losses.payments = application`,
   `fees.payer = application`, and `requirement_collection = application`. **[P]** The liability model
   and the developer experience are the same decision.
2. **Taking loss liability makes you the 1099 filer.** Stripe issues the 1099-K only when
   `controller.fees.payer = account`. Under `application`, `application_express` or
   `application_custom`, "the platform is responsible for filing any relevant 1099 forms." **[P]**
   https://docs.stripe.com/connect/tax-reporting

   And the binding threshold for a module marketplace is not the 1099-K's $20,000/200. It is the
   **1099-NEC and 1099-MISC threshold of $600**. The $20,000/200 figure was retroactively reinstated
   by the One Big Beautiful Bill, confirmed at IRS release **IR-2025-107, 23 October 2025** **[P]**
   https://www.irs.gov/newsroom/irs-issues-faqs-on-form-1099-k-threshold-under-the-one-big-beautiful-bill-dollar-limit-reverts-to-20000
   — but paying a developer $600 a year in revenue share triggers a filing obligation regardless.
   Stripe charges $2.99 per 1099 e-filed with the IRS and $1.49 per state filing, on a January
   calendar with a hard 31 January IRS deadline. **[P]** https://stripe.com/connect/1099

### Money movement, and the one product decision hiding inside it

| | Direct | Destination | Separate charges + transfers |
|---|---|---|---|
| Merchant of record | **connected account, always** | platform unless `on_behalf_of` | platform unless `on_behalf_of` |
| Refunds hit | connected account | **platform balance** | **platform balance** |
| Disputes hit | connected account | **platform balance**, with or without `on_behalf_of` | **platform balance** |

**[P]** https://docs.stripe.com/connect/charges · /direct-charges · /destination-charges ·
/separate-charges-and-transfers

The product decision: `application_fee_amount` creates an `ApplicationFee` object and **the developer
can see both the total charge and your take rate**. `transfer_data[amount]` creates no such object
and **the developer sees only what was transferred, never the total**. Stripe recommends the former
"to simplify reporting". That is a transparency choice dressed as plumbing.

Traps worth recording: application fees are **not** automatically refunded with a refund
(`refund_application_fee=true`); destination-charge refunds leave the platform covering the negative
balance unless `reverse_transfer=true`; and a transfer reversal only works if the connected account
still holds the balance, so **a developer who already withdrew leaves the platform holding the loss**.

### Why Stripe rather than a ledger of your own

Stripe holds **money transmitter licences in the US and e-money licences in the EU**. **[P]**
https://docs.stripe.com/connect/risk-management That is why a platform can route third-party money
without becoming a licensed money transmitter. Structuring around Stripe is a licensing decision, not
a convenience one.

### Merchant of record alternatives, and why they do not solve this problem

- **Stripe Managed Payments** (announced 25 February 2026): Stripe as merchant of record, tax filed
  and remitted across 80+ countries, **3.5% on the full transaction amount including tax, on top of
  standard processing fees**. **[P]** https://support.stripe.com/questions/managed-payments-pricing ·
  https://docs.stripe.com/payments/managed-payments/how-it-works The customer sees **Link** as the
  merchant, statement descriptor `LINK.COM*`, no custom domains. And a real operational risk: "If you
  don't respond within 48 hours, Stripe might issue a refund without your approval."
- **Paddle**: 5% + 50¢ per checkout transaction, full tax registration, filing and remittance
  included. **[P]** https://www.paddle.com/pricing
- **FastSpring**: publishes no rates at all, quote-only, but commits to **responding to sales-tax and
  VAT audits** — a liability transfer Stripe Tax explicitly does not offer. **[P]**
  https://www.fastspring.com/pricing/
- **Lemon Squeezy**: acquired by Stripe July 2024 and being folded into Managed Payments. **Do not
  design against it.** **[S]**

The decisive point: **MoR services solve the tax problem but are built around one seller with many
customers, not one platform paying many developers.** None of them natively does multi-party split
payout. A platform paying third-party developers needs Connect for the payout leg regardless; the
only open question is whether an MoR sits in front of it for the collection leg.

Stripe Tax, for the record, **calculates and reports. It does not register, file, or remit.** **[P]**
https://docs.stripe.com/tax/connect And Stripe says plainly that its own SaaS/marketplace distinction
"doesn't strictly correspond to the tax definition of marketplaces that are responsible for tax
collection" — whether you are a marketplace facilitator under US state law or an EU deemed supplier
is a legal determination driven by statute, not by which API you called.

### The tax shape, high level and not legal advice

EU: the enlarged **One Stop Shop** took effect 1 July 2021, with a **€10,000 aggregate annual
threshold** for cross-border B2C digital services above which the place of supply is the customer's
member state. **[P]** https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en A non-EU supplier
generally registers under the non-Union scheme with no equivalent threshold **[U]**.

US: **South Dakota v. Wayfair** (21 June 2018) ended the physical-presence rule; typical economic
nexus is $100,000 or 200 transactions into a state, though several states dropped the transaction
prong, and **whether SaaS is taxable at all varies enormously by state**. **[S]**

---

## 6. What transfers here, and what does not

### What transfers

**1. The credential is the licence, and the enforcement point is the download.** WordPress settled
this by experiment over a decade, across a customer base that can read every line of the code. EDD's
shape — an invalid licence returns an empty download link while the installed software keeps running
— is the ecosystem-normal answer, and every vendor who moved enforcement deeper into the customer's
system paid a reputational price proportional to the depth. This platform has the same property for
the same reason: a fork owns `shared/modules.ts`, so any code gate can be deleted, and the only plane
a fork cannot edit is a credential somebody else holds.

**2. The lapse behaviour should be "keeps working, stops being served", never "breaks".** Gravity
Forms, WooCommerce and Freemius all keep running on expiry. WP Rocket stops exactly the features the
vendor is still paying to run, which is the honest line. The 503 vendor-lapse path already built here
sits on the right side of that line: it refuses the vendor-dependent call and says who to reach,
while everything else in the village keeps working.

**3. Withdrawal must be a state, not a deletion.** Atlassian: existing licences "survive termination
or expiration of this Agreement". Apple: a delisted app "remains fully functional" with in-app
purchases working. WordPress: the SVN repository stays readable so the code can be forked, and the
listing page carries a dated closure notice. Every serious marketplace treats delisting as blocking
new acquisition, never as reaching into an existing install. The module library contract already
promises this in clause 9's spirit and in the withdrawal terms; item 3 of this lane's build is what
makes it true.

**4. Graduated sanction where reversibility is the variable.** Google's rejection → removal →
suspension → termination ladder, in which removal preserves ratings and installs and suspension
destroys them, is proportionate and gives a developer a reason to fix rather than abandon. A
registry-level `withdrawn` flag is the "removal" rung. The rungs above it are policy, not code.

**5. Numeric, machine-checkable quality bars beat adjectives.** Built for Shopify publishes p75 Web
Vitals and p95 latency budgets and is thriving; Atlassian's Cloud Fortified asks partners to
"maintain SLOs" with no number and is being retired. This platform already has the raw material:
`integration_health` records outcomes and correlation ids, and `healthReading` returns five verdicts
in which `never-confirmed` cannot collapse into healthy. A published threshold over that record is a
badge that costs no reviewer time.

**6. Self-attested disclosure, enforced by blocking the next change rather than by removal.** Both
mobile stores work this way, and Google's escalation (reject updates first) is much cheaper than
removal. Here the analogue is `dataClass` plus the vendor record: declared by the listing, rendered
to the village, and gated at the point where the listing wants something new.

**7. Verified versus attested must be visually distinguished.** Atlassian's June 2026 changelog adds
indicators separating "Atlassian-verified information from partner-attested responses." That
distinction is the difference between a store that means something and one that repeats what it was
told.

**8. Change of control is a first-class event.** This is the unpatched hole in the largest open-source
marketplace in the world, exploited twice a decade apart, and the 2026 case had a dormancy period of
eight months that would defeat any plausible post-transfer review window. Here it is structurally
easier: every module is first-party code in this repository, so a change of vendor is a pull request
against a registry entry and is reviewable by construction. That advantage is worth naming out loud
rather than assuming.

**9. Publisher account compromise is the dominant realistic threat, and the marketplace's own emails
are the phishing template.** Cyberhaven and the June 2024 WordPress credential-stuffing case were
both account compromises, not code-review failures.

**10. Assume discovery capacity is fixed.** Median 17 users on Chrome, median 500 installs on VS
Code, 91% of App Store apps on no top list. With a catalog measured in tens rather than tens of
thousands, this platform is nowhere near that problem, and the design should aim to stay there:
**refuse to optimise for catalog size**, which BlackBerry's 47,000-apps-from-one-publisher proves is
a corrupted metric.

### What does not transfer, and why

**Apple's and Google's payment rail, and their economics.** Both rest on being the sole distribution
channel for a device. A fork-per-village platform has no such chokepoint by construction: the village
owns the code and the server. There is nothing to be the gatekeeper of.

**Shopify's enforceable 15%.** It works because Shopify owns the billing rail and requirement 1.2.1
makes bypass a delisting offence, and because Shopify hosts every store. Neither holds here. The
honest comparison is Salesforce, whose entitlement lives inside the customer's own org and which
therefore **cannot technically enforce a revenue share at all** — hence self-reporting with an audit
clause. Any platform revenue share here is in the Salesforce position, not the Shopify one, and
should be designed as an honour system with a contract behind it or not designed at all.

**Odoo's licence relicensing move.** Odoo weakened AGPL to LGPL specifically so third-party modules
could ship proprietary. That is not available here and is not wanted: the settled invariant is that
every module is first-party code in this repository, reviewed and merged, with no plugin runtime. The
Odoo pattern trades reviewability for extensibility, and this platform has already made the opposite
trade deliberately.

**Runtime feature-gating on licence state.** Three of the four backlash cases were exactly this, and
the fourth was worse. More decisively, it does not work here: a fork owns the registry file, so a
code gate is one edit away from deleted. Gating on the credential is not a stronger version of the
same idea, it is a different mechanism, and it is the only one that survives a fork.

**Install counts, ratings and review counts as trust signals.** Every one of them has been publicly
defeated on VS Code with a dated incident, and they need a large anonymous buyer population to mean
anything. With villages numbered in the tens, a rating average is noise, and a review system is a
surface to game before it is a signal.

**A sandbox or permission model for extension code.** VS Code's whole security problem descends from
"the extension host has the same permissions as VS Code itself". This platform runs no third-party
code at all, so the entire class is absent. It should stay absent, and that is the strongest single
security property in this study — the same one Odoo achieves for its SaaS tier by refusing
third-party modules outright.

**Marketplace-operated payments in v1.** Stripe Connect's own constraints make the choice concrete:
owning the developer relationship means owning loss liability, which means becoming the 1099 filer at
the $600 threshold with a January operational calendar. Chrome additionally proved a platform can
build a rail, watch 35% of paid items get zero users, and then remove it, dumping the migration cost
on everyone who built to it. Building the rail before there is a developer waiting to be paid is the
expensive half of a mistake that has been made in public at least once.

**A "we can take over your listing" power.** WordPress's guideline 18 is one clause doing two jobs,
and the ACF case is what the second job looks like. If this platform ever needs an emergency power
over a listing, it should be written narrowly, with the trigger named, rather than as a general
reservation of discretion.

---

## 6b. A relayed delisting summary this lane could not verify

**[R]** = relayed. Treat this whole subsection as weaker than anything above it.

During the build the coordinator relayed a summary of a delisting and withdrawal
research task (id `a9e49369e2ea7b54c`), asking that its findings and its ten-item
could-not-verify list be carried here verbatim. **This lane could not retrieve that task.** It is
not one of the five subagents this lane spawned, no `TaskOutput` tool is available in this
environment, and the underlying report, its sources and its could-not-verify list were therefore
never seen. Only the coordinator's prose summary reached here.

That summary is recorded below as a lead, not as a finding, because **one of its claims conflicts
with a figure this lane verified from a primary source**:

| Relayed claim **[R]** | What this lane verified |
|---|---|
| Vendor-exit notice: Shopify 30d | Consistent. Shopify publishes at least 30 days to merchants before a policy-violation removal and at least 60 days to partners before changes. **[P]** |
| **Atlassian 90d minimum, license survival at §11.3(b), 45-day takedown SLA** | **Conflicts.** The Marketplace Partner Agreement this lane read gives a **45-day Transition Period** and 60 days of withheld revenue. Licence survival is real and quoted in section 2 above, but this lane found **no 90-day notice and no clause numbered 11.3(b)**. **[P]** |
| Salesforce: no published notice period | Consistent. **[P]** |
| Unlisting leaves existing installs working on all three | Consistent for Shopify and Atlassian. **Not verified for Salesforce**, which documents the listing consequence and is silent on the installed package. |
| Control spectrum: Shopify kill switch with mandated 48h data redaction; Atlassian graded warn → hide → pause → terminate | **Unverified.** This lane found neither the 48-hour redaction mandate nor a four-rung Atlassian ladder. Google Play's four-tier ladder in section 1 is a verified analogue and is the one the design cites. |

**The ten-item could-not-verify list was not carried over, because it was never seen.** Copying a
list of caveats sight unseen would put this document's own provenance marking to exactly the use it
exists to prevent. Section 7 below and the per-section **[U]** marks are this lane's own honest
list.

The design consequence is unchanged either way. Section 6's "withdrawal must be a state, not a
deletion" rests on the Atlassian licence-survival language and the Apple delisting behaviour, both
verified and quoted above, and on Google Play's graded ladder. If the 90-day figure is real it
strengthens the case that this platform's own 90-day contract commitment already matches the
strictest marketplace; **somebody who can open that task should confirm it before that sentence is
said to a vendor.**

## 7. The eight numbers worth remembering

| Number | What it is |
|---|---|
| **1.09% / 0.47%** | Google Play's published crash and ANR thresholds. A quality bar with a number is enforceable without a reviewer. |
| **~2%** | Apple appeal reinstatement rate (71 of 3,571 in the US, 2024). The rejection message has to do the work. |
| **46%** | WordPress plugin vulnerabilities in 2025 with no developer fix by public disclosure. |
| **38.7%** | Reviewed WordPress plugins whose author never replied. The median submitter is already gone. |
| **8 months** | Dormancy of the Essential Plugin backdoor after the ownership change. Longer than any review window. |
| **17 / 12,304** | Median and mean Chrome extension user counts. Averages are meaningless in marketplaces. |
| **35%** | Paid Chrome extensions with zero users before Google removed the payment rail. |
| **$600** | The 1099-NEC threshold, which is what actually binds a platform paying developers, not $20,000. |
