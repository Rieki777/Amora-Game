/**
 * The two routes behind "Already have a site? Paste the address."
 *
 *   POST /api/admin/site-pull          read the page, hand it to the extractor
 *   POST /api/admin/site-pull/assets   copy named pictures, after a rights
 *                                      affirmation that names each one
 *
 * The fetching, and every refusal it makes, lives in server/lib/sitePull.ts.
 * This file is the gate, the rate limit, the rights contract and the shape of
 * the answer. Reading that module first is the fastest way to review this one.
 *
 * ── TWO CALLS, BECAUSE READING AND COPYING ARE DIFFERENT ACTS ────────────
 *
 * The first call fetches ONE document and no sub-resources. That is reading a
 * public page, which is what a browser does when the founder visits their own
 * site, and it needs no permission from anybody.
 *
 * The second call copies photographs onto this deployment's volume, where they
 * will be served from the village's own pages. That is publishing somebody's
 * work, and a founder's marketing site routinely carries pictures the project
 * does not own: a stock library licensed for that site alone, a photographer's
 * work under a one-time commission, a partner's logo. So the second call
 * refuses to run until the caller affirms rights, and the affirmation has to
 * NAME each picture. `checkRights` in the library holds that rule and explains
 * why a blanket confirmation is worth nothing here.
 *
 * ── WHAT THE BROWSER GETS BACK, AND WHAT IT NEVER GETS ───────────────────
 *
 * Never the fetched HTML. Not as a string, not as a preview, not for
 * debugging. A document pulled from an address a stranger chose is untrusted
 * input, and handing it back to a page on this deployment's own origin turns
 * a fetch into stored cross-site scripting with the founder's session sitting
 * next to it. What comes back is the extractor's tokens, the addresses that
 * were dialled, and the sizes. If a founder needs to see the page, they have
 * a browser.
 *
 * Pictures come back as `/api/uploads/...` addresses, never as bytes in JSON,
 * and they get there through `sanitiseForVolume`, which is the one door in
 * this codebase that writes to the uploads volume. That door re-encodes every
 * image with no metadata, so a photograph pulled off a public site cannot
 * carry the coordinates of the place it was taken onto this village's pages.
 *
 * ── EXPRESS 4 HANGS ON A THROW ───────────────────────────────────────────
 *
 * A rejected promise from an async handler is an unhandled rejection in
 * Express 4, not a 500. The caller gets nothing at all and the request sits
 * open until it times out. Every handler here is wrapped end to end and
 * answers with a status on every path.
 */
import type { Express, Request, Response } from "express";
import type { AppDeps } from "../lib/appDeps";
import { sanitiseForVolume, stampedName, writeToVolume } from "../lib/uploads";
import {
  PullRefused,
  RIGHTS_STATEMENT,
  SITE_PULL,
  checkRights,
  normaliseTypedUrl,
  pullAssets,
  pullDocument,
  type PulledDocument,
  type PullIo,
} from "../lib/sitePull";

/**
 * The extractor seam.
 *
 * Turning a document into brand tokens is another module's work, and this
 * route does not import it: it takes it as a dependency, so the fetcher ships
 * and is testable before the extractor exists and neither lane blocks on the
 * other. A deployment with nothing wired gets an honest `extractor: "none"`
 * in the answer instead of a silent empty result that reads like a site with
 * no branding on it.
 */
export type BrandExtractor = (doc: PulledDocument) => Promise<unknown> | unknown;

type Deps = Pick<AppDeps, "isAdmin" | "adminActor" | "overLimit" | "clientIp" | "uploadsDir"> & {
  /** Owned by the brand extractor module. Absent until that lane lands. */
  extractBrand?: BrandExtractor;
  /** The transport, replaced in tests. The guard around it never is. */
  io?: PullIo;
};

/**
 * How often one address may ask.
 *
 * A founder pastes their site, looks at the result, fixes a typo and pastes
 * again. Ten in an hour covers that several times over. The limit is not
 * really about that founder: it is about this route being an outbound fetcher
 * that anyone holding an admin session can point at a third party, so the
 * ceiling is what stops it being used as one.
 */
const PULL_PER_HOUR = 10;
const ASSETS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

/** What every refusal looks like, so the screen has one shape to render. */
const refuse = (res: Response, status: number, reason: string, message: string): Response =>
  res.status(status).json({ ok: false, reason, message });

/**
 * Turn anything thrown inside a handler into an answer.
 *
 * A `PullRefused` carries a sentence written for a founder and a code written
 * for a test, and both travel. Anything else is this platform's fault and says
 * so without leaking what went wrong internally.
 */
function answerFailure(res: Response, e: unknown, what: string): Response {
  if (e instanceof PullRefused) return refuse(res, 400, e.reason, e.message);
  console.error(`[site-pull] ${what} failed`, e);
  return refuse(res, 500, "server", "Something went wrong on this platform while reading that address.");
}

export function register(app: Express, deps: Deps): void {
  const { isAdmin, adminActor, overLimit, clientIp, uploadsDir } = deps;

  /**
   * Read the page.
   *
   * Answers with what the extractor made of it, the addresses that were
   * dialled, and the rights sentence the second call will hold the caller to.
   * Sending that sentence here is deliberate: the screen that lists the
   * pictures needs to show it beside them, and taking it from the server means
   * the wording shown is the wording stored.
   */
  app.post("/api/admin/site-pull", async (req: Request, res: Response) => {
    try {
      if (!(await isAdmin(req))) return refuse(res, 401, "auth_required", "Sign in as an admin first.");
      if (await overLimit(`site-pull:${clientIp(req)}`, PULL_PER_HOUR, HOUR_MS)) {
        return refuse(res, 429, "rate_limited", "That is a lot of addresses in one hour. Try again later.");
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const typed = String(body.url ?? "").trim();
      if (!typed) {
        return refuse(res, 400, "empty", "Paste the address of your site, such as your-village.example.");
      }
      if (typed.length > 2048) {
        return refuse(res, 400, "not-a-url", "That address is too long to be a web address.");
      }

      const doc = await pullDocument(typed, { io: deps.io });
      const brand = deps.extractBrand ? await deps.extractBrand(doc) : null;

      return res.json({
        ok: true,
        source: {
          requestedUrl: doc.requestedUrl,
          finalUrl: doc.finalUrl,
          hops: doc.hops,
          status: doc.status,
          contentType: doc.contentType,
          bytes: doc.bytes,
          truncated: doc.truncated,
        },
        brand,
        extractor: deps.extractBrand ? "wired" : "none",
        /*
         * The contract the picture call will enforce, sent here so the screen
         * can render the checkbox and the list together and does not have to
         * hold its own copy of either.
         */
        rights: {
          required: true,
          statement: RIGHTS_STATEMENT,
          maxAssets: SITE_PULL.MAX_ASSETS_PER_PULL,
        },
      });
    } catch (e) {
      return answerFailure(res, e, "document");
    }
  });

  /**
   * Copy the pictures the founder named, and only those.
   *
   * `assets` is the list to fetch and `rights.assetUrls` is the list the
   * founder affirmed. They have to match address for address, which is what
   * makes the affirmation about these pictures instead of about the idea of
   * pictures.
   */
  app.post("/api/admin/site-pull/assets", async (req: Request, res: Response) => {
    try {
      if (!(await isAdmin(req))) return refuse(res, 401, "auth_required", "Sign in as an admin first.");
      if (await overLimit(`site-pull-assets:${clientIp(req)}`, ASSETS_PER_HOUR, HOUR_MS)) {
        return refuse(res, 429, "rate_limited", "That is a lot of pictures in one hour. Try again later.");
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const pageUrl = normaliseTypedUrl(String(body.pageUrl ?? ""));
      if (!pageUrl) {
        return refuse(res, 400, "empty", "Name the site these pictures came from.");
      }
      const asked = Array.isArray(body.assets) ? body.assets.map((v) => String(v)) : [];
      if (!asked.length) {
        return refuse(res, 400, "empty", "Name at least one picture to copy.");
      }
      if (asked.length > SITE_PULL.MAX_ASSETS_PER_PULL) {
        return refuse(
          res,
          400,
          "too_many",
          `This platform copies ${SITE_PULL.MAX_ASSETS_PER_PULL} pictures at a time. Choose your favourites and come back for more.`,
        );
      }

      /*
       * The rights gate runs BEFORE the fetcher, so a caller who has not
       * affirmed costs the far end nothing at all. A gate that ran after the
       * download would have already copied the pictures it was refusing.
       */
      const actor = adminActor(req)?.id ?? null;
      const rights = checkRights(body.rights, pageUrl, asked, actor);
      if (!rights.ok) return refuse(res, 400, "rights_not_affirmed", rights.message);

      const pulled = await pullAssets(asked, { io: deps.io, base: pageUrl });

      const images: Array<{ requestedUrl: string; finalUrl: string; url: string; bytes: number }> = [];
      const refused = [...pulled.refused];
      for (const asset of pulled.fetched) {
        try {
          // The one door: re-encoded, metadata dropped, result asserted.
          const clean = await sanitiseForVolume(asset.bytes, "site-pull");
          const filename = stampedName("sitepull", clean.ext || ".jpg");
          writeToVolume(uploadsDir, filename, clean.bytes);
          images.push({
            requestedUrl: asset.requestedUrl,
            finalUrl: asset.finalUrl,
            url: `/api/uploads/${filename}`,
            bytes: clean.bytes.length,
          });
        } catch (e) {
          console.error("[site-pull] could not store a picture", e);
          refused.push({
            url: asset.requestedUrl,
            reason: "not-an-image",
            message: "This platform could not store that picture.",
          });
        }
      }

      /*
       * The record goes back to the caller to keep beside the identity pack.
       * It is not written here: the pack is another module's document and a
       * second writer to it is how two screens come to disagree about what a
       * founder agreed to. The log line is this route's own audit trail.
       */
      console.log(
        `[site-pull] ${actor ?? "an admin"} affirmed rights over ${rights.record.assetUrls.length} picture(s) from ${pageUrl}`,
      );

      return res.json({
        ok: true,
        rightsAck: rights.record,
        images,
        refused,
        skipped: pulled.skipped,
      });
    } catch (e) {
      return answerFailure(res, e, "assets");
    }
  });
}
