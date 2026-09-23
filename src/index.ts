// Worker 엔트리 — /mcp (Streamable HTTP MCP), /collect (수동 수집), 정적 에셋, scheduled 크론

import { createMcpHandler } from "agents/mcp/server";
import type { Env } from "./env";
import { resolveAuth } from "./lib/auth";
import { buildServer } from "./server";
import { alertFailures, collectAwards, collectRecent, runNotifications } from "./cron";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/mcp") {
      const auth = await resolveAuth(request, env);
      const handler = createMcpHandler(() => buildServer(env, auth));
      return handler(request, env, ctx);
    }

    if (url.pathname === "/collect") {
      // 수동 수집 트리거 (관리자용): /collect?target=recent|awards&hours=3&token=...
      if (url.searchParams.get("token") !== env.ADMIN_TOKEN) {
        return new Response("forbidden", { status: 403 });
      }
      const target = url.searchParams.get("target") ?? "recent";
      const log =
        target === "awards"
          ? await collectAwards(env, Number(url.searchParams.get("days") ?? "2"))
          : await collectRecent(env, Number(url.searchParams.get("hours") ?? "3"));
      ctx.waitUntil(alertFailures(env, log));
      return Response.json({ ok: true, log });
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true, name: "kr-public-mcp", version: "0.1.0" });
    }

    // 나머지 경로는 정적 에셋 (처리방침 등)
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    let log: string;
    if (controller.cron === "17 * * * *") {
      log = await collectRecent(env, 3);
    } else if (controller.cron === "30 0 * * *") {
      log = await collectAwards(env, 2);
    } else {
      // "0 23 * * *" — 08:00 KST 알림
      log = await runNotifications(env);
    }
    ctx.waitUntil(alertFailures(env, log));
  },
} satisfies ExportedHandler<Env>;
