import { createFileRoute } from "@tanstack/react-router";

// Legacy public tool endpoint disabled pending authenticated integration.
export const Route = createFileRoute("/.mcp/invoke-tool/$tool")({
  server: {
    handlers: {
      POST: async () => new Response(JSON.stringify({ error: "Endpoint disabled" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      }),
    },
  },
});
