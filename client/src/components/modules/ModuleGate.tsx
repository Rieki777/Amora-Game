/**
 * The one gate every module page renders when its module is invisible (R36).
 *
 * Before this, fourteen pages each carried `if (modules.loaded && !module)
 * return <NotFound />`, which made a members-only module read as a 404 to a
 * signed-out visitor: the manifest omits members modules for anonymous
 * readers, so the page's own sign-in card never rendered. Rye's ruling:
 * ["Non signed in members should get a prompt to sign-in not a 401 in
 * messaging"], widened to every members-only page.
 *
 * The decision: signed out AND the id is in the manifest's `signInToSee`
 * (modules whose SERVED lifecycle is members) renders the sign-in card, with
 * the Sign in link carrying `?next=` back here. Everything else renders
 * NotFound exactly as before, so off and preview stay indistinguishable from
 * a page that never existed.
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useModules } from "@/modules/ModuleProvider";

/** Internal paths only: anything else falls back to home. The backslash
 *  variant is refused too, so this stays safe even in front of a consumer
 *  that normalises "/\" the way location.href would. */
function safeNext(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

/**
 * The sign-in card, extracted from Messages.tsx and shared. `name` is the
 * page's catalog name; `next` defaults to where the visitor already is.
 */
export function SignInToSee({ name, next }: { name: string; next?: string }) {
  const [location] = useLocation();
  const target = safeNext(next ?? location);
  return (
    <Layout>
      <div className="container py-16 text-center">
        <h1 className="font-display text-3xl font-bold mb-3">{name}</h1>
        <p className="text-muted-foreground mb-6">This part of the village opens when you sign in.</p>
        <Link
          href={`/login?next=${encodeURIComponent(target)}`}
          className="inline-flex items-center min-h-[44px] px-5 rounded-lg bg-teal-deep text-white font-semibold"
        >
          Sign in
        </Link>
      </div>
    </Layout>
  );
}

export default function ModuleGate({
  moduleId, name, next,
}: {
  moduleId: string;
  name: string;
  next?: string;
}) {
  const { user } = useAuth();
  const { signInToSee } = useModules();
  if (!user && signInToSee.includes(moduleId)) return <SignInToSee name={name} next={next} />;
  return <NotFound />;
}
