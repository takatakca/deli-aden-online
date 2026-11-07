import { createFileRoute } from "@tanstack/react-router";

// The former public Lovable MCP endpoint is deliberately disabled.
// The menu and restaurant tools remain available as internal functions.
// Do not re-enable unauthenticated tool invocation without an approved,
// authenticated API contract and rate limits.
export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ error: "Endpoint disabled" }), {
          status: 404,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        }),
      POST: async () =>
        new Response(JSON.stringify({ error: "Endpoint disabled" }), {
          status: 404,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        }),
    },
  },
});
