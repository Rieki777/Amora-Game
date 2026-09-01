/**
 * The Setup Wizard's six steps, and which of them the screen can actually count.
 *
 * THE STEPS, IN ONE PLACE. There used to be two lists: the wizard's own, and a
 * copy in the Admin shell that decides whether setup is finished. Adding a
 * seventh step to one of them would leave the shell calling setup complete
 * while a step sat undone, which is the kind of drift that only shows up as
 * "why is it still telling me I'm done". Both callers now read this file.
 *
 * Order is the order a founder works: name the place, dress it, set its
 * numbers, write its words, style its map, then ship. Go live stays last
 * because it is the step you stop coming back to.
 *
 * WHY COMPLETION IS NOW READ RATHER THAN TICKED. All six steps used to be
 * checkboxes a founder ticked, and a ticked box outlives whatever it was
 * ticked about. What is measured on the live deployment: /api/game/config
 * serves all nine images as empty strings, every hero draws the placeholder,
 * and this checklist read none of those nine fields. So a village whose
 * Pictures box was ever ticked showed six of six while carrying no art at all,
 * on the exact screen a founder opens to ask whether the village is set up.
 * Who ticked it, and when, is not recorded anywhere this lane could read, so
 * that part is left unsaid. Nothing was lying. Nothing was reading anything
 * either.
 *
 * So the two steps whose fields live in the brand record this same screen
 * already loads are MEASURED: their completion is derived from the record and
 * there is no box to tick. The other four stay SELF-REPORTED and keep their
 * checkbox, because what they ask about is genuinely not in that record:
 *
 *   numbers    the figures on the Settings tab, where every single one is
 *              allowed to stay blank on purpose (a village states its own
 *              land figures or states none), so "blank" is a finished answer
 *              and an unfinished one and this file cannot tell them apart
 *   content    nine separate editors behind nine separate endpoints
 *   map        a skin and a walk with no "finished" state to read
 *   technical  a Railway deploy, a volume and three env vars, none of which
 *              a browser can see
 *
 * The UI says which row is which. A checklist that mixes measured and
 * self-reported rows without saying so is how the empty images survived.
 *
 * WHICH FIELDS COUNT, for a measured row: the ones the wizard renders without
 * calling them optional. Site URL, events URL and contact email each say in
 * their own label that blank is a real answer (blank hides the link or the
 * button rather than pointing a visitor at the wrong village), so requiring
 * them would leave a finished village reading as unfinished forever.
 *
 * A blank field and a real zero are different facts, and this file only ever
 * reports the first: `filled` counts what the village has typed, and an empty
 * string is always "not yet", never "deliberately none". Any future step whose
 * blank is a legitimate final answer belongs in the self-reported group above,
 * not in `fields`.
 */

export type SetupStepKey =
  | "identity"
  | "images"
  | "numbers"
  | "content"
  | "map"
  | "technical";

/** A field of the brand record, named the way the wizard labels it. */
export interface SetupField {
  group: "project" | "images";
  key: string;
  label: string;
}

export interface SetupStep {
  key: SetupStepKey;
  label: string;
  /** Empty on a self-reported step. A non-empty list makes the step measured. */
  fields: readonly SetupField[];
}

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    key: "identity",
    label: "Identity",
    fields: [
      { group: "project", key: "name", label: "Project name" },
      { group: "project", key: "tagline", label: "Tagline" },
      { group: "project", key: "memberName", label: "What a member is called" },
      { group: "project", key: "location", label: "Location" },
      { group: "project", key: "footerBlurb", label: "Footer introduction" },
      /*
       * THE TWO CURRENCY FIELDS ARE GONE FROM THIS COUNT because the boxes
       * they measured are gone from the wizard, and those boxes were dead
       * before they were removed: `mergedConfig()` takes the recognition
       * currency's name from the token registry ahead of the brand document,
       * so nothing a founder typed there was ever displayed anywhere.
       *
       * Leaving them counted here would have been the worse half of the bug:
       * two fields nobody can fill, so Identity never finishes and the village
       * reads as half set up forever. A token's name is set under Admin then
       * Tokens, which is not part of the brand record and so is not this
       * file's to measure.
       */
    ],
  },
  {
    key: "images",
    label: "Pictures",
    fields: [
      { group: "images", key: "hero", label: "Homepage hero" },
      { group: "images", key: "investorHero", label: "Investor hero" },
      { group: "images", key: "residentHero", label: "Resident hero" },
      { group: "images", key: "stewardHero", label: "Steward hero" },
      { group: "images", key: "prosperityHero", label: "Prosperity hero" },
      { group: "images", key: "masterPlanHero", label: "Master plan hero" },
      { group: "images", key: "logo", label: "Header logo" },
      { group: "images", key: "heartLogo", label: "Footer mark" },
      { group: "images", key: "favicon", label: "Browser tab icon" },
    ],
  },
  { key: "numbers", label: "Numbers", fields: [] },
  { key: "content", label: "Content", fields: [] },
  { key: "map", label: "Map & styling", fields: [] },
  { key: "technical", label: "Go live", fields: [] },
];

/** The brand document as `GET /api/admin/brand` returns it, loosely typed
 *  because the wizard holds it as `any` and every field is optional. */
export interface BrandLike {
  project?: Record<string, unknown> | null;
  images?: Record<string, unknown> | null;
  setup?: Record<string, unknown> | null;
  /* `currency` is still IN the stored document and is deliberately not here.
     Nothing measures it any more, and a key on this interface is a key some
     future step could start counting again. */
}

export interface SetupRow {
  key: SetupStepKey;
  label: string;
  /** True when `done` was read from the record. False when a founder ticked it. */
  measured: boolean;
  done: boolean;
  /** Both zero on a self-reported row, which has nothing to count. */
  filled: number;
  total: number;
  /** Labels of the measured fields still blank, for the row's own hint. */
  blank: string[];
}

/** A field counts as filled when the village's own record holds a non-blank
 *  string. Whitespace does not count: a space bar is not a village name. */
function hasValue(brand: BrandLike | null | undefined, field: SetupField): boolean {
  const group = brand?.[field.group];
  return String(group?.[field.key] ?? "").trim().length > 0;
}

/**
 * One row per step, in order, ready to render.
 *
 * Pass the brand document. A missing or half-loaded document yields every
 * measured row at zero, which is the honest reading: nothing has been seen.
 */
export function measureSetup(brand: BrandLike | null | undefined): SetupRow[] {
  return SETUP_STEPS.map((step) => {
    const blank = step.fields.filter((f) => !hasValue(brand, f)).map((f) => f.label);
    const measured = step.fields.length > 0;
    return {
      key: step.key,
      label: step.label,
      measured,
      done: measured ? blank.length === 0 : Boolean(brand?.setup?.[step.key]),
      filled: step.fields.length - blank.length,
      total: step.fields.length,
      blank,
    };
  });
}

/** Whether every step is finished, for the Admin shell's nav posture. The
 *  shell and the wizard have to agree, so they share this one answer. */
export function setupIsComplete(brand: BrandLike | null | undefined): boolean {
  return measureSetup(brand).every((row) => row.done);
}
