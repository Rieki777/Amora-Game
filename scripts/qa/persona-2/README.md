# Persona 2: a new member on a phone, finding their footing

Lane L8, round 4. Report-only QA against the deployed site. This directory holds the
probe for the signed-in member journey; the report and evidence live at the program
hub, never in this repo.

```bash
node scripts/qa/persona-2/probe.mjs --validate     # detectors prove themselves on fixtures first
QA_BASE_URL=... QA_TOKEN=... QA_OUT=<hub dir> QA_PW_DIR=<dir with node_modules/playwright> \
  node scripts/qa/persona-2/probe.mjs --profile wk-390x844   # one viewport per run
QA_OUT=<hub dir> node scripts/qa/persona-2/probe.mjs --assemble
```

Rules inherited from `../lib.mjs` and `../README.md`, plus this persona's own:

- **Strictly GET/render.** A context-wide route guard fulfils every non-GET locally
  with an empty 200 and logs it. Nothing this probe does can write to the site,
  even where the journey hovers over a write (RSVP, opt-out, meet-me, mark-read).
- **The token is never printed, logged, or written to disk.** It arrives in
  `QA_TOKEN`, goes into the storage key read out of the client source, and is
  attached as a bearer only to same-site requests. Debug output is presence and
  length only.
- **Every band is asserted finite.** NaN passes every comparison, so a non-finite
  number becomes a loud NOT MEASURABLE entry, never a pass.
- **Viewports mobile first**: WebKit iPhone 14 DPR3 at 390x844, 390x664 (URL bar
  showing), 375x812, 360x800; Chromium 1280x800 last.
- **networkidle never fires** on this stack: domcontentloaded plus ~3.5s, longer
  on the two map surfaces.
