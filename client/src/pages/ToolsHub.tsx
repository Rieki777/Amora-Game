/**
 * The Tools Hub (S15): one audience-aware grid of the village's tools, with
 * the Hypha governance card pinned first. The first real module through the
 * S13 framework — the module lifecycle gates this page; canSeeTool filtered
 * the cards server-side before they arrived.
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { authToken } from "@/lib/gameApi";
import { ExamplesBanner } from "@/components/ExamplesBanner";
import {
  ExternalLink,
  Landmark,
  MessageCircle,
  FileText,
  Wrench,
  Users,
  Calendar,
  Globe,
  BookOpen,
  Vote,
  Coins,
} from "lucide-react";

const TOOL_ICONS: Record<string, React.ElementType> = {
  Landmark, MessageCircle, FileText, Wrench, Users, Calendar, Globe, BookOpen, Vote, Coins,
};
const iconFor = (slug: string | null | undefined): React.ElementType => TOOL_ICONS[String(slug ?? "")] ?? Wrench;

interface Tool {
  id: string;
  name: string;
  purpose: string;
  description?: string | null;
  url: string;
  ctaLabel: string;
  category: string;
  iconKind: string;
  icon?: string | null;
  gettingStarted?: string | null;
  order: number;
}

export default function ToolsHub() {
  const modules = useModules();
  const toolsModule = useModule("tools");
  const [data, setData] = useState<{ categories: any[]; hyphaCard: any; tools: Tool[] } | null>(null);
  const [expanded, setExpanded] = useState<string>("");

  useEffect(() => {
    if (!toolsModule) return;
    const token = authToken();
    fetch("/api/tools", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, [toolsModule?.id]);

  // The framework decides existence: invisible module = the ordinary 404.
  if (modules.loaded && !toolsModule) return <NotFound />;

  const beacon = (id: string) => {
    try {
      navigator.sendBeacon(`/api/tools/${id}/click`);
    } catch { /* analytics, never load-bearing */ }
  };

  const byCategory = (catId: string) =>
    (data?.tools ?? []).filter((t) => t.category === catId).sort((a, b) => a.order - b.order);
  const orphanTools = (data?.tools ?? []).filter(
    (t) => !(data?.categories ?? []).some((c: any) => c.id === t.category),
  );

  return (
    <Layout>
      <section className="py-16 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">Village Tools</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Everything the village runs on, in one place. Where to talk, where to
            decide, where the documents live.
          </p>
          <ExamplesBanner moduleId="tools" noun="tool" />
        </div>
      </section>

      <section className="py-10 bg-background">
        <div className="container max-w-5xl space-y-10">
          {data?.hyphaCard && (
            <div className="rounded-2xl border-2 border-[#2D5A5A]/30 bg-[#2D5A5A]/5 p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#2D5A5A]/10 flex items-center justify-center">
                  <Landmark className="w-5 h-5 text-teal-deep" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">{data.hyphaCard.name} on Hypha</h2>
                  <p className="text-xs text-teal-deep font-medium">Governance &amp; Pay</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Agreements, contributions, expenses and membership all live on the
                village's Hypha DHO. This platform links out, decisions happen there.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  ["governance", "Open the DHO"],
                  ["proposals", "Create Agreement"],
                  ["treasury", "Treasury"],
                  ["members", "Members"],
                ].map(([name, label]) => (
                  <a
                    key={name}
                    href={data.hyphaCard.links[name]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 font-medium text-teal-deep hover:bg-gray-50"
                  >
                    {label}
                    <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {(data?.categories ?? [])
            .slice()
            .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .filter((cat: any) => byCategory(cat.id).length > 0)
            .map((cat: any) => (
              <div key={cat.id}>
                <h2 className="font-display text-lg font-bold text-foreground mb-4">{cat.label}</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {byCategory(cat.id).map((tool) => {
                    const Icon = iconFor(tool.icon);
                    return (
                      <div key={tool.id} className="bg-card rounded-xl border border-border p-5 flex flex-col">
                        <div className="flex items-start gap-3 mb-2">
                          {tool.iconKind === "upload" && tool.icon ? (
                            <img src={tool.icon} alt="" className="w-9 h-9 rounded-lg object-cover" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-teal/10 flex items-center justify-center">
                              <Icon className="w-4.5 h-4.5 w-5 h-5 text-teal-700" />
                            </div>
                          )}
                          <div>
                            <h3 className="font-semibold text-foreground text-sm">{tool.name}</h3>
                            <p className="text-xs text-muted-foreground">{tool.purpose}</p>
                          </div>
                        </div>
                        {expanded === tool.id && (tool.description || tool.gettingStarted) && (
                          <div className="text-xs text-muted-foreground mb-2 space-y-1">
                            {tool.description && <p>{tool.description}</p>}
                            {tool.gettingStarted && (
                              <p className="italic">Getting started: {tool.gettingStarted}</p>
                            )}
                          </div>
                        )}
                        <div className="mt-auto pt-3 flex items-center justify-between">
                          {(tool.description || tool.gettingStarted) && (
                            <button
                              onClick={() => setExpanded(expanded === tool.id ? "" : tool.id)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              {expanded === tool.id ? "Less" : "More"}
                            </button>
                          )}
                          <a
                            href={tool.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => beacon(tool.id)}
                            className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-teal-deep hover:text-teal min-h-[44px] px-2 -mr-2"
                          >
                            {tool.ctaLabel}
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

          {orphanTools.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orphanTools.map((tool) => (
                <div key={tool.id} className="bg-card rounded-xl border border-border p-5">
                  <h3 className="font-semibold text-foreground text-sm">{tool.name}</h3>
                  <p className="text-xs text-muted-foreground mb-3">{tool.purpose}</p>
                  <a href={tool.url} target="_blank" rel="noopener noreferrer" onClick={() => beacon(tool.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-deep">
                    {tool.ctaLabel} <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}

          {data && data.tools.length === 0 && !data.hyphaCard && (
            <p className="text-center text-muted-foreground text-sm py-12">
              No tools have been added yet.
            </p>
          )}
        </div>
      </section>
    </Layout>
  );
}
