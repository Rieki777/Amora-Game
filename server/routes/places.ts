/**
 * Photographs of a place: the village's own gallery on its map.
 *
 * Twelve routes, lifted out of server/index.ts unchanged:
 *
 *   GET    /api/places                        places with photos, plus the lead picture
 *   GET    /api/places/photos                 one page across every place
 *   GET    /api/places/reports                the curator's queue
 *   PUT    /api/places/reports/:id            close one report
 *   GET    /api/places/:key/photos            one place's gallery
 *   POST   /api/places/:key/photos            contribute a photograph
 *   PUT    /api/places/:key/hero              choose the lead picture
 *   POST   /api/places/photo/:id/report       raise a concern
 *   POST   /api/places/photo/:id/subject-request  "that is me, take it down"
 *   POST   /api/places/photo/:id/hide         a curator hides one
 *   POST   /api/places/photo/:id/restore      a curator puts one back
 *   DELETE /api/places/photo/:id              take one down for good
 *
 * WHY THIS IS ONE MODULE. Every route below shares four helpers that exist
 * nowhere else in the server: `photoHand` (what this member may do with the
 * village's pictures), `photoViewer` (who may look at all), `photoCuratorRecipients`
 * (who hears about a report) and `placePhotoUpload` (a multer built per request
 * because the size ceiling is a dial the village turns). Those four plus
 * `PLACE_VILLAGE` are the whole shared state of the domain, and they came
 * across with it, which is what makes this a module rather than a folder.
 *
 * `app.use("/api/places", requireModule("map"))` MOVED WITH THE ROUTES, and
 * has to stay the first line of `register`. It is what makes the whole
 * surface a 404 while the map module is off. Express applies middleware in
 * registration order, so a `use` registered after its routes guards nothing.
 *
 * `UPLOADS_DIR` IS REBUILT HERE FROM ONE NAME. The takedown route unlinks the
 * encoded bytes by joining `UPLOADS_DIR` with the file's basename, which is
 * what that call is called in server/index.ts. Binding `uploadsDir` under the
 * old name keeps the handler bodies byte-identical to the ones that moved,
 * and lets a test point this module at a scratch directory.
 *
 * REGISTERED WHERE IT WAS, because Express matches in registration order:
 * between the map's promise route and the map's own draft/publish doors.
 */
import type express from "express";
import type { Express } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { hasCapability } from "../../shared/capabilities";
import { sanitiseMapKey } from "../../shared/mapAddress";
import {
  ALT_TEXT_MAX,
  CAPTION_MAX,
  REASON_MAX,
  altTextProblem,
  captionProblem,
  isPhotoMimeType,
  orderPhotos,
  remainingForPlace,
  takenOnProblem,
} from "../../shared/placePhotos";
import type { AppDeps } from "../lib/appDeps";
import { requireModule } from "../lib/modules";
import { LocationDataSurvived, suppressUploads, unsuppressUploads, writePhoto } from "../lib/placePhotos";
import { boolVar, numberVar } from "../lib/variables";
import * as placePhotosRepo from "../repos/placePhotos";

type Deps = Pick<
  AppDeps,
  | "authedUser"
  | "capabilityCtx"
  | "guardCapability"
  | "mayStillSee"
  | "members"
  | "notify"
  | "notifyReportReviewed"
  | "getPool"
  | "uploadsDir"
>;

export function register(app: Express, deps: Deps): void {
  const {
    authedUser,
    capabilityCtx,
    guardCapability,
    mayStillSee,
    members,
    notify,
    notifyReportReviewed,
    getPool,
    uploadsDir,
  } = deps;
  /** The volume path, under the name the moved handlers already call it. */
  const UPLOADS_DIR = uploadsDir;

  /*
   * ── PHOTOGRAPHS OF A PLACE (0093) ──────────────────────────────────────
   *
   * Rye asked for the map to work "like a google maps listing where the
   * community can upload photos". Everything below is that, and three of its
   * decisions are worth reading before changing any of them.
   *
   * 1. THE GATE IS HERE, AND IT IS A CAPABILITY, NEVER AN ADMIN CHECK.
   *    Taking somebody's photograph off the village's map is the kind of
   *    power that becomes `isAdmin(req)` by default, and an admin check is
   *    scaffolding a village cannot inherit (R54). `map.curatePhotos` reaches
   *    admins through step 1 of the one gate and reaches a role holder or a
   *    badge holder without one. That is also why the queue lives at
   *    `/api/places/reports` and not under `/api/admin`: a curator who is not
   *    an admin has to be able to open it.
   *
   * 2. AUTHORISE BEFORE MULTER. A gate behind the parser still lets any
   *    caller make the server write to the village's shared volume as fast
   *    as it can send, which on a small mounted disk is one anonymous script
   *    away from a village that can no longer receive anything.
   *
   * 3. THE STRIP IS ENFORCED, NOT ASSUMED. `writePhoto` reads the encoded
   *    bytes back and throws if any metadata survived, so a photograph whose
   *    coordinates could not be removed never reaches the volume at all.
   *    See server/lib/placePhotos.ts for why that is a runtime check and not
   *    a comment about sharp's defaults.
   */
  app.use("/api/places", requireModule("map"));

  /** Same scope column the 0069+ tables carry, and the same value. */
  const PLACE_VILLAGE = "local";

  /**
   * What this member may do with the village's photographs, asked once per
   * request.
   *
   * 0103: a LOOK. Both flags ride the pure gate, no override is read and
   * nothing is written, because these answers are DRAWING HINTS: they decide
   * which controls a gallery renders and whether hidden rows ride the
   * payload. The five routes that act on `map.curatePhotos` each ask
   * `guardCapability` for themselves.
   *
   * The two reads that REFUSE, the curator's queue and the bytes of a
   * suppressed picture, keep the operator's short-circuit through
   * `mayStillSee`. There is no break-glass on a GET, so a village taking
   * curation on must not take the operator's eyes with it.
   */
  async function photoHand(req: express.Request): Promise<{ user: any | null; canContribute: boolean; canCurate: boolean }> {
    const user = await authedUser(req);
    if (!user) return { user: null, canContribute: false, canCurate: false };
    const ctx = await capabilityCtx(user);
    return {
      user,
      canContribute: hasCapability("map.photograph", ctx),
      canCurate: hasCapability("map.curatePhotos", ctx),
    };
  }

  /**
   * Everyone who may act on a report about a photograph.
   *
   * Decided by THE ONE GATE, the same way `questConsentRecipients` decides
   * who may release recognition. A queue that rings a different set of people
   * from the set who can act on it is a queue with a wait built into it.
   *
   * 0103: stays `hasCapability` and is not converted. It runs the gate over
   * every member and has no request, so there is no break-glass to read and
   * nobody to attribute a record to. The admins pushed in above the loop keep
   * their line on a village-held key on purpose: they can still reach the act
   * through the 409, and a queue that stopped telling them would have a hole
   * in it.
   */
  async function photoCuratorRecipients(): Promise<string[]> {
    const out: string[] = [];
    for (const m of await members.all()) {
      if (!m?.id) continue;
      if (m.role === "admin" || m.role === "founder") {
        out.push(m.id);
        continue;
      }
      try {
        if (hasCapability("map.curatePhotos", await capabilityCtx(m))) out.push(m.id);
      } catch (e) {
        console.error("[places] could not read the curate gate for a member", e);
      }
    }
    return out;
  }

  /**
   * Built per request, because the size ceiling is a dial the village turns.
   * A multer instance fixes its limit at construction, so one built at boot
   * would keep enforcing whatever the number was when the process started.
   */
  function placePhotoUpload() {
    return multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: Math.max(1, numberVar("map.photo_max_mb")) * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (isPhotoMimeType(file.mimetype)) cb(null, true);
        else cb(new Error("Send a JPG, PNG, WebP, AVIF or HEIC picture."));
      },
    }).single("photo");
  }

  /**
   * Who may read the village's photographs.
   *
   * The same pair the map itself uses: a signed-in member always, and an
   * anonymous visitor only while `map.public_structure` is on. A village that
   * has turned its map away from strangers has turned its photographs away
   * too, because a picture of the land says more about where the land is than
   * a circle diagram does.
   */
  async function photoViewer(req: express.Request) {
    const viewer = await authedUser(req);
    if (!viewer && !boolVar("map.public_structure")) return null;
    return viewer ?? false;
  }

  /** The places that have photographs, with the one picture each leads with. */
  app.get("/api/places", async (req, res) => {
    if ((await photoViewer(req)) === null) return res.status(401).json({ error: "auth_required" });
    const hand = await photoHand(req);
    res.json({
      places: await placePhotosRepo.placesWithPhotos(getPool(), PLACE_VILLAGE),
      canContribute: hand.canContribute,
      canCurate: hand.canCurate,
      openReports: hand.canCurate ? await placePhotosRepo.openReportCount(getPool()) : 0,
      perPlace: numberVar("map.photos_per_place"),
      // ?gallery=1 adds a few photographs per place in one query, for the
      // living map, which opens with every structure on screen and would
      // otherwise cost a round trip per building.
      gallery: req.query.gallery === "1"
        ? await placePhotosRepo.photosByPlace(getPool(), PLACE_VILLAGE, 6)
        : undefined,
    });
  });

  /**
   * EVERY photograph in the village, newest first, across every place.
   *
   * ── WHY THIS PAGE EXISTS, AND WHAT IT DELIBERATELY IS NOT ────────────────
   *
   * Somebody who wants a picture of themselves taken down has to be able to
   * find it. They do not know which place it was filed under, and making them
   * guess is the same failure as making them ask a curator. The cheap way to
   * solve that is to work out who is in every photograph and let a person
   * search for their own face. That would find the picture, and it would also
   * leave the village holding a permanent record of who appears in every
   * photograph of it, for everybody, forever. A page somebody can scroll
   * answers the same question and leaves nothing behind that can be turned on
   * anyone later.
   *
   * ── IT AGGREGATES, SO IT MUST NOT AGGREGATE PAST A PERMISSION ────────────
   *
   * An index is the classic way a surface leaks what its sources protect. The
   * two rules here are the SAME two the per-place gallery runs, in the same
   * order and through the same functions:
   *
   *  - `photoViewer` decides whether this caller may read the village's
   *    photographs at all: a signed-in member always, an anonymous visitor
   *    only while `map.public_structure` is on.
   *  - `includeHidden` is `hand.canCurate`, exactly as
   *    `/api/places/:key/photos` passes it. A member who cannot see a hidden
   *    photograph in its place cannot see it here.
   *
   * Anything stricter than the place page would be an index that hides a
   * member's own record from them; anything looser is a leak.
   */
  app.get("/api/places/photos", async (req, res) => {
    if ((await photoViewer(req)) === null) return res.status(401).json({ error: "auth_required" });
    const hand = await photoHand(req);
    const raw = req.query.before;
    let before: placePhotosRepo.PhotoCursor | null = null;
    if (raw !== undefined) {
      before = placePhotosRepo.parsePhotoCursor(String(raw));
      // A cursor this route cannot read is refused rather than dropped.
      // Silently starting again from the newest page would hand a person
      // scrolling for their own picture the top of the list a second time,
      // dressed as the next page down.
      if (!before) return res.status(400).json({ error: "That is not a place in the list to carry on from." });
    }
    const page = await placePhotosRepo.photosAcrossPlaces(getPool(), PLACE_VILLAGE, {
      // The place page's own value, read from the same hand. Not 'true', which
      // is what this route was first written with and what put a hidden
      // photograph in front of the member its place refuses.
      includeHidden: hand.canCurate,
      before,
    });
    res.json({
      photos: page.photos,
      nextBefore: page.nextBefore,
      canCurate: hand.canCurate,
      // The viewer's own id, so a contributor's own takedown control renders
      // here exactly as it does on the place page, without a second request.
      viewerId: hand.user?.id ?? null,
      signedIn: !!hand.user,
    });
  });

  /**
   * The curator's queue. Capability-gated and outside `/api/admin` on purpose.
   *
   * A member can flag a photograph, and this is where that flag arrives. It
   * has a browser surface (`/places`, the Reports panel) and the same people
   * who can open it are the people the notification rings, so a report goes
   * to somebody who can act on it and the reporter hears when it closes.
   */
  app.get("/api/places/reports", async (req, res) => {
    const hand = await photoHand(req);
    if (!hand.user) return res.status(401).json({ error: "auth_required" });
    // 0103: a LOOK that refuses, so the operator keeps the queue on a
    // village-held key. Acting on a row in it is a different question, asked
    // one route down.
    if (!(await mayStillSee(req, "map.curatePhotos"))) {
      return res.status(403).json({ error: "Reading this queue needs the capability to curate the village's photographs" });
    }
    const status = ["open", "resolved", "dismissed"].includes(String(req.query.status)) ? (String(req.query.status) as any) : "open";
    res.json({ reports: await placePhotosRepo.listReports(getPool(), status), status });
  });

  /** Close one report. The person who raised it hears that somebody looked. */
  app.put("/api/places/reports/:id", async (req, res) => {
    const hand = await photoHand(req);
    if (!hand.user) return res.status(401).json({ error: "auth_required" });
    // 0103: ACT. Closing a report tells the member who raised it that a human
    // looked, which is a thing that happened to somebody.
    const mayClose = await guardCapability(req, res, "map.curatePhotos", {
      status: 403,
      body: { error: "Closing a report needs the capability to curate the village's photographs" },
    });
    if (!mayClose) return;
    const status = String(req.body?.status ?? "");
    if (!["resolved", "dismissed"].includes(status)) return res.status(400).json({ error: "status must be resolved or dismissed" });
    const before = await placePhotosRepo.reporterOf(getPool(), req.params.id);
    const closed = await placePhotosRepo.closeReport(getPool(), req.params.id, status as "resolved" | "dismissed", hand.user.id);
    if (!closed) return res.status(404).json({ error: "No open report with that id" });
    if (before?.reporterId) await notifyReportReviewed(before.reporterId, req.params.id, "place");
    res.json({ success: true });
  });

  /** One place's gallery, ordered the way shared/placePhotos.ts explains. */
  app.get("/api/places/:key/photos", async (req, res) => {
    if ((await photoViewer(req)) === null) return res.status(401).json({ error: "auth_required" });
    const key = sanitiseMapKey(req.params.key);
    if (!key) return res.status(404).json({ error: "Not found" });
    const hand = await photoHand(req);
    // A curator sees hidden rows, because deciding whether to put one back
    // means looking at it. Nobody else does.
    const rows = await placePhotosRepo.photosForPlace(getPool(), PLACE_VILLAGE, key, { includeHidden: hand.canCurate });
    const perPlace = numberVar("map.photos_per_place");
    const live = rows.filter((r) => !r.hiddenAt).length;
    res.json({
      structureKey: key,
      photos: orderPhotos(rows),
      canContribute: hand.canContribute,
      canCurate: hand.canCurate,
      // The viewer's own id, so a contributor's takedown control renders
      // without a second request and without the client guessing.
      viewerId: hand.user?.id ?? null,
      signedIn: !!hand.user,
      perPlace,
      remaining: remainingForPlace(live, perPlace),
      maxMb: numberVar("map.photo_max_mb"),
      altTextMax: ALT_TEXT_MAX,
      captionMax: CAPTION_MAX,
    });
  });

  app.post("/api/places/:key/photos", async (req, res) => {
    // Rule 2 in the header: every refusal below happens before multer writes
    // a single byte.
    const hand = await photoHand(req);
    if (!hand.user) return res.status(401).json({ error: "auth_required", message: "Sign in to add a photograph" });
    if (!hand.canContribute) {
      return res.status(403).json({ error: "Adding a photograph opens at the member stage, or with a role or badge that grants it" });
    }
    const key = sanitiseMapKey(req.params.key);
    if (!key) return res.status(400).json({ error: "That is not a place on this map" });

    const perPlace = numberVar("map.photos_per_place");
    const held = await placePhotosRepo.countForPlace(getPool(), PLACE_VILLAGE, key);
    if (remainingForPlace(held, perPlace) <= 0) {
      return res.status(409).json({ error: `This place holds ${held} photographs, and the village's limit is ${perPlace}.` });
    }
    const perDay = numberVar("map.photos_per_member_daily");
    const mine = await placePhotosRepo.countByContributorSince(getPool(), hand.user.id, 24);
    if (mine >= perDay) {
      return res.status(429).json({ error: `You have added ${mine} photographs today, and the village's daily limit is ${perDay}.` });
    }

    placePhotoUpload()(req, res, async (err: any) => {
      try {
        if (err) {
          const tooBig = err?.code === "LIMIT_FILE_SIZE";
          return res.status(400).json({
            error: tooBig
              ? `That picture is over the village's limit of ${numberVar("map.photo_max_mb")} MB.`
              : err.message || "Upload failed",
          });
        }
        if (!req.file) return res.status(400).json({ error: "Missing file" });

        const altProblem = altTextProblem(req.body?.altText);
        if (altProblem) return res.status(400).json({ error: altProblem });
        const capProblem = captionProblem(req.body?.caption ?? null);
        if (capProblem) return res.status(400).json({ error: capProblem });
        const takenRaw = typeof req.body?.takenOn === "string" && req.body.takenOn.trim() ? req.body.takenOn.trim() : null;
        const takenProblem = takenOnProblem(takenRaw);
        if (takenProblem) return res.status(400).json({ error: takenProblem });

        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        let encoded;
        try {
          encoded = await writePhoto(req.file.buffer, UPLOADS_DIR, stamp);
        } catch (e) {
          if (e instanceof LocationDataSurvived) {
            // The one failure here that is about somebody's safety. Loud in
            // the log, refused to the uploader, and nothing on the volume.
            console.error("[places] refused an upload whose metadata survived the strip", e.markers);
            return res.status(500).json({ error: "That picture kept its metadata through the re-encode, so it was not stored." });
          }
          console.error("[places] could not read an uploaded file as a picture", e);
          return res.status(400).json({ error: "That file could not be read as a picture." });
        }

        const id = `pph-${stamp}`;
        await placePhotosRepo.insertPhoto(getPool(), {
          id,
          villageId: PLACE_VILLAGE,
          structureKey: key,
          url: `/api/uploads/${encoded.filename}`,
          thumbUrl: encoded.thumbFilename ? `/api/uploads/${encoded.thumbFilename}` : null,
          altText: String(req.body.altText).trim(),
          caption: typeof req.body?.caption === "string" && req.body.caption.trim() ? req.body.caption.trim() : null,
          takenOn: takenRaw,
          width: encoded.width,
          height: encoded.height,
          bytes: encoded.bytes,
          contributorId: hand.user.id,
        });
        const stored = await placePhotosRepo.photoById(getPool(), id);
        res.json({ success: true, photo: stored });
      } catch (e) {
        console.error("[places] upload failed after the parser", e);
        res.status(500).json({ error: "That did not save. Try again in a moment." });
      }
    });
  });

  /** Pin the picture a place leads with, or clear the pin and lead with the newest. */
  app.put("/api/places/:key/hero", async (req, res) => {
    const hand = await photoHand(req);
    if (!hand.user) return res.status(401).json({ error: "auth_required" });
    // 0103: ACT. The lead shot is the picture the whole village sees first.
    const mayPin = await guardCapability(req, res, "map.curatePhotos", {
      status: 403,
      body: { error: "Choosing a place's lead photograph needs the capability to curate them" },
    });
    if (!mayPin) return;
    const key = sanitiseMapKey(req.params.key);
    if (!key) return res.status(404).json({ error: "Not found" });
    const photoId = req.body?.photoId == null ? null : String(req.body.photoId);
    if (photoId) {
      const target = await placePhotosRepo.photoById(getPool(), photoId);
      if (!target || target.structureKey !== key || target.removedAt || target.hiddenAt) {
        return res.status(404).json({ error: "No live photograph here with that id" });
      }
    }
    await placePhotosRepo.setHero(getPool(), PLACE_VILLAGE, key, photoId);
    res.json({ success: true, heroId: photoId });
  });

  /**
   * A member flags a photograph.
   *
   * Signed in, and nothing more. Reporting is as open as looking: a member who
   * can see a picture on the village's map can say it should not be there.
   * Enough distinct members saying so hides it pending review, which is the
   * forum's rule and the village acting on its own record.
   */
  app.post("/api/places/photo/:id/report", async (req, res) => {
    const user = await authedUser(req);
    if (!user) return res.status(401).json({ error: "auth_required", message: "Sign in to report" });
    const photo = await placePhotosRepo.photoById(getPool(), req.params.id);
    if (!photo || photo.removedAt) return res.status(404).json({ error: "Not found" });
    const reason = String(req.body?.reason ?? "").slice(0, REASON_MAX) || null;
    try {
      await placePhotosRepo.insertReport(getPool(), {
        id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        villageId: PLACE_VILLAGE,
        photoId: photo.id,
        reporterId: user.id,
        kind: "concern",
        reason,
      });
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY") return res.json({ success: true, fresh: false });
      throw e;
    }
    const threshold = numberVar("map.photo_report_hide_threshold");
    let hidden = false;
    if (threshold > 0 && (await placePhotosRepo.openConcernReporters(getPool(), photo.id)) >= threshold) {
      hidden = await placePhotosRepo.hidePhoto(getPool(), photo.id, "community", "hidden by the village's own reports");
      if (hidden) suppressUploads([photo.url, photo.thumbUrl]);
    }
    // The people who can act hear about it, carrying no content and no names.
    for (const recipient of await photoCuratorRecipients()) {
      await notify({
        userId: recipient,
        type: "moderation",
        title: "A photograph on the map was flagged for review",
        link: "/places",
        dedupeKey: `place-photo-report:${photo.id}:${user.id}:${recipient}`,
      });
    }
    res.json({ success: true, fresh: true, hidden });
  });

  /**
   * "That is a photograph of me. Take it down."
   *
   * ── THIS ONE IS NOT A VOTE AND IT DOES NOT WAIT ────────────────────────
   *
   * R56 says an interface states what is true and gets out of the way, and
   * that a village sets its own dials. This is one of the two narrow
   * exceptions, and the reason is that it protects a PERSON from a
   * consequence they can neither see coming nor undo: their face on a public
   * map of a rural land project. That is not the village choosing something
   * for itself.
   *
   * So three properties hold here that hold nowhere else in this file:
   *
   *  - NO CAPABILITY. Any account may file one. A warning badge's deny
   *    suspends posting pictures and never touches this, because the deny is
   *    about what somebody may add to the village and this is about their own
   *    image.
   *  - NO THRESHOLD. One person is enough. `map.photo_report_hide_threshold`
   *    is not read on this path, and a village setting it to 0 does not turn
   *    this off.
   *  - THE PICTURE GOES DARK IMMEDIATELY, and the bytes go with it: the
   *    filename joins the suppression set, so the address stops answering as
   *    well as leaving the gallery. Hiding the row alone would have left the
   *    file fetchable forever by anyone holding the link, which is exactly
   *    what the person was asking to stop.
   *
   * A curator then decides between putting it back and taking it down for
   * good. While nobody has decided, it stays hidden, and the default sitting
   * with the person is the point.
   *
   * WHAT THIS DOES NOT REACH, stated plainly: a person with no account here.
   * Filing needs a session, so somebody photographed at a gathering who never
   * joined has to reach the village another way. Opening it to anonymous
   * callers would make one unauthenticated request enough to darken any
   * picture on the map, with nobody to ask about it afterwards.
   */
  app.post("/api/places/photo/:id/subject-request", async (req, res) => {
    const user = await authedUser(req);
    if (!user) return res.status(401).json({ error: "auth_required", message: "Sign in to ask for a photograph of you to come down" });
    const photo = await placePhotosRepo.photoById(getPool(), req.params.id);
    if (!photo || photo.removedAt) return res.status(404).json({ error: "Not found" });
    const reason = String(req.body?.reason ?? "").slice(0, REASON_MAX) || null;
    let fresh = true;
    try {
      await placePhotosRepo.insertReport(getPool(), {
        id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        villageId: PLACE_VILLAGE,
        photoId: photo.id,
        reporterId: user.id,
        kind: "subject",
        reason,
      });
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY") fresh = false;
      else throw e;
    }
    // Hide on every call, fresh or repeated. A second press from somebody who
    // can still see the picture must not answer "already filed" and leave it
    // up, and a curator may have restored it since.
    await placePhotosRepo.hidePhoto(getPool(), photo.id, "subject", "a person asked for their own image to come down");
    suppressUploads([photo.url, photo.thumbUrl]);
    if (fresh) {
      for (const recipient of await photoCuratorRecipients()) {
        await notify({
          userId: recipient,
          type: "moderation",
          title: "Someone asked for a photograph of themselves to come down",
          link: "/places",
          dedupeKey: `place-photo-subject:${photo.id}:${user.id}:${recipient}`,
        });
      }
    }
    res.json({ success: true, fresh, hidden: true });
  });

  /** Take a photograph out of the galleries, reversibly. */
  app.post("/api/places/photo/:id/hide", async (req, res) => {
    const hand = await photoHand(req);
    if (!hand.user) return res.status(401).json({ error: "auth_required" });
    // 0103: ACT. Taking somebody's photograph out of the village's record.
    const mayHide = await guardCapability(req, res, "map.curatePhotos", {
      status: 403,
      body: { error: "Hiding a photograph needs the capability to curate the village's photographs" },
    });
    if (!mayHide) return;
    const photo = await placePhotosRepo.photoById(getPool(), req.params.id);
    if (!photo || photo.removedAt) return res.status(404).json({ error: "Not found" });
    const reason = String(req.body?.reason ?? "").slice(0, 200) || null;
    const done = await placePhotosRepo.hidePhoto(getPool(), photo.id, hand.user.id, reason);
    if (done) suppressUploads([photo.url, photo.thumbUrl]);
    res.json({ success: true, hidden: true });
  });

  /** Put it back. The bytes start answering again in the same call. */
  app.post("/api/places/photo/:id/restore", async (req, res) => {
    const hand = await photoHand(req);
    if (!hand.user) return res.status(401).json({ error: "auth_required" });
    // 0103: ACT. Putting a picture back is as much a decision as taking it
    // down, and the same people make both.
    const mayRestore = await guardCapability(req, res, "map.curatePhotos", {
      status: 403,
      body: { error: "Restoring a photograph needs the capability to curate the village's photographs" },
    });
    if (!mayRestore) return;
    const photo = await placePhotosRepo.photoById(getPool(), req.params.id);
    if (!photo || photo.removedAt) return res.status(404).json({ error: "Not found" });
    const done = await placePhotosRepo.restorePhoto(getPool(), photo.id);
    if (done) unsuppressUploads([photo.url, photo.thumbUrl]);
    res.json({ success: true, restored: done });
  });

  /**
   * Take a photograph down for good. The file is unlinked in this call.
   *
   * Two people can do it: a curator, and the person who took it. A member
   * withdrawing their own photograph is not moderation and should never have
   * needed anybody's permission.
   *
   * The row survives as a tombstone so a resolved report still names something
   * real; `map.photo_tombstone_days` decides when the daily sweep forgets it.
   */
  app.delete("/api/places/photo/:id", async (req, res) => {
    const hand = await photoHand(req);
    if (!hand.user) return res.status(401).json({ error: "auth_required" });
    const photo = await placePhotosRepo.photoById(getPool(), req.params.id);
    if (!photo || photo.removedAt) return res.status(404).json({ error: "Not found" });
    const mine = photo.contributorId === hand.user.id;
    /*
     * 0103: ACT, and the gate is asked ONLY when the picture belongs to
     * somebody else. The order matters and it is not cosmetic: `mayAct` reads
     * the break-glass, so asking it first would mean an admin withdrawing
     * their OWN photograph, with a stray override header on the request,
     * wrote "acted on a power this village holds" to the public pulse for
     * tidying up after themselves.
     *
     * A DELETE carries no body, so the hatch here is the
     * `x-capability-override` header.
     */
    if (!mine) {
      const mayTakeDown = await guardCapability(req, res, "map.curatePhotos", {
        status: 403,
        body: { error: "Taking down someone else's photograph needs the capability to curate them" },
      });
      if (!mayTakeDown) return;
    }
    const done = await placePhotosRepo.removePhoto(getPool(), photo.id, hand.user.id);
    if (done) {
      suppressUploads([photo.url, photo.thumbUrl]);
      for (const address of [photo.url, photo.thumbUrl]) {
        if (!address) continue;
        try {
          fs.unlinkSync(path.join(UPLOADS_DIR, path.basename(address)));
        } catch {
          /* already gone, or never written: the takedown still stands */
        }
      }
      // A takedown answers every open report on the picture, and everybody who
      // raised one hears that somebody looked.
      const reporters = await placePhotosRepo.closeReportsForPhoto(getPool(), photo.id, hand.user.id);
      for (const reporterId of reporters) {
        await notifyReportReviewed(reporterId, `${photo.id}:removed`, "place");
      }
    }
    res.json({ success: true, removed: done });
  });
}
