import { createFileRoute } from "@tanstack/react-router";

// The legacy MCP endpoint is disabled until a real, authenticated public
// integration is approved. Do not advertise an unauthenticated OAuth resource.
export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      GET: async () => new Response(null, {
        status: 404,
        headers: { "cache-control": "no-store" },
      }),
    },
  },
});
