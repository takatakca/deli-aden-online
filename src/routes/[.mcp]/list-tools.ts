import { createFileRoute } from "@tanstack/react-router";
import { MCP_TOOLS } from "../../lib/mcp";

export const Route = createFileRoute("/.mcp/list-tools")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ tools: MCP_TOOLS }), {
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
    },
  },
});
