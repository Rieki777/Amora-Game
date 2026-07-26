/**
 * Audience visibility for tools (S15): who sees which card. Respects the ONE
 * GATE — the ctx mirrors shared/capabilities.ts's shape, no new permission
 * mechanism. Two layers exist by design: the module lifecycle gates the whole
 * /tools surface; this filters cards WITHIN it.
 */
export interface ToolVisibilityCtx {
  /** True when the viewer has an account (any stage). */
  hasAccount: boolean;
  /** Role ids the viewer holds. */
  roleIds: string[];
  /** Admins see every card (plus per-card audience badges in the admin UI). */
  isAdmin: boolean;
}

export interface VisibleTool {
  visibility: "public" | "members" | "roles";
  roleIds?: string[] | null;
  enabled?: boolean;
}

export function canSeeTool(tool: VisibleTool, ctx: ToolVisibilityCtx): boolean {
  if (tool.enabled === false && !ctx.isAdmin) return false;
  if (ctx.isAdmin) return true;
  switch (tool.visibility) {
    case "public":
      return true;
    case "members":
      return ctx.hasAccount;
    case "roles":
      return ctx.hasAccount && (tool.roleIds ?? []).some((r) => ctx.roleIds.includes(r));
    default:
      return false;
  }
}
