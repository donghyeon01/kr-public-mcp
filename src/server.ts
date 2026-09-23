// MCP 서버 팩토리 — 요청마다 env·인증 컨텍스트를 클로저로 주입

import { McpServer } from "@modelcontextprotocol/server";
import type { AuthCtx, Env } from "./env";
import { registerBidTools } from "./tools/bids";
import { registerProTools } from "./tools/pro";

export function buildServer(env: Env, ctx: AuthCtx): McpServer {
  const server = new McpServer({
    name: "kr-public-mcp",
    version: "0.1.0",
  });
  registerBidTools(server, env, ctx);
  registerProTools(server, env, ctx);
  return server;
}
