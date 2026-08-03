/**
 * The refusal, said where it happened.
 *
 * Every guarded route answers a standing example with 409 and
 * `code: "example_immutable"` (server/lib/examples.ts). Until this shipped the
 * client threw that discriminator away: the refusal landed in whatever slot
 * the page used for validation errors and server faults. On the forum that
 * slot is teal, the same colour and the same element as the success word
 * "Done." — so a member who tapped Follow on an example thread got what read
 * like a confirmation. On the feed the slot lives in the composer at the top
 * of the page, so hearting the fifteenth post flashed a line off-screen.
 *
 * A refusal is neither an error nor a success. It is the feature working: the
 * example is inert, and saying so is the lesson. So it gets the SAME amber
 * the standing-examples banner uses, and it renders next to the control that
 * was pressed rather than at the top of a section.
 */
import { AlertCircle } from "lucide-react";

/** The server's discriminator. One string, one place. */
export const EXAMPLE_REFUSAL_CODE = "example_immutable";

/**
 * Did this response body come from an example guard?
 *
 * Switches on the CODE, never the message: the copy is a village's to reword
 * and a string compare would silently stop matching the day someone does.
 */
export function isExampleRefusal(body: unknown): boolean {
  return !!body && typeof body === "object"
    && (body as { code?: unknown }).code === EXAMPLE_REFUSAL_CODE;
}

/**
 * Read a fetch Response into `{ ok, data, refusal }` in one step.
 *
 * Call sites were all doing the same three lines by hand and disagreeing on
 * the details, which is how the code got dropped in the first place.
 */
export async function readRefusal(r: Response): Promise<{
  ok: boolean;
  data: any;
  refusal: string | null;
}> {
  const data = await r.json().catch(() => null);
  if (r.ok) return { ok: true, data, refusal: null };
  return {
    ok: false,
    data,
    refusal: isExampleRefusal(data) ? String(data.error ?? "") : null,
  };
}

/**
 * Renders nothing when `message` is empty, so a call site can drop it beside
 * a control unconditionally.
 *
 * `role="alert"` (the banner is `role="note"`): a refusal is the answer to
 * something the member just did, and a screen reader should say it without
 * being asked. The banner is standing context and interrupts nothing.
 */
export function ExampleRefusal({ message, className = "" }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={`flex items-start gap-1.5 text-xs rounded-lg border border-amber-300/70 bg-amber-50 px-2.5 py-1.5 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100 ${className}`}
    >
      <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
      <span>{message}</span>
    </p>
  );
}
