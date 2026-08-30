/**
 * One place's photographs, at a shareable address.
 *
 * The page is thin on purpose. Everything a person does here lives in
 * `PlaceGallery`, because the Living Map's place panel mounts that same
 * component in its Photos tab and two copies of a gallery would drift.
 */
import Layout from "@/components/Layout";
import ModuleGate from "@/components/modules/ModuleGate";
import { PAGE_GATE_LINES } from "@/components/modules/gateCopy";
import PlaceGallery from "@/components/places/PlaceGallery";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { Link, useRoute } from "wouter";

export default function PlacePhotos() {
  const modules = useModules();
  const mapModule = useModule("map");
  const [, params] = useRoute("/places/:key");
  const key = params?.key ? decodeURIComponent(params.key) : "";

  if (modules.loaded && !mapModule) {
    return <ModuleGate moduleId="map" name="Places" behind={PAGE_GATE_LINES.places} />;
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-x-4">
          <Link href="/places" className="text-sm text-teal-deep underline inline-block py-1.5 min-h-[44px]">
            All places
          </Link>
          <Link href="/photographs" className="text-sm text-teal-deep underline inline-block py-1.5 min-h-[44px]">
            Every photograph
          </Link>
        </nav>
        <h1 className="font-serif text-3xl">{key || "This place"}</h1>
        {key ? (
          <PlaceGallery structureKey={key} placeName={key} />
        ) : (
          <p className="text-muted-foreground">That address names no place on this map.</p>
        )}
      </div>
    </Layout>
  );
}
