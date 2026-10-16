import { createFileRoute } from "@tanstack/react-router";

// Legacy public tool endpoint disabled pending authenticated integration.
export const Route = createFileRoute("/.mcp/list-tools")({
  server: {
    handlers: {
      GET: async () => new Response(JSON.stringify({ error: "Endpoint disabled" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      }),
    },
  },
});
