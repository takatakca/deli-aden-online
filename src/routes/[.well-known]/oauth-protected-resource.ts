import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        new Response(
          JSON.stringify({
            resource: new URL("/mcp", request.url).toString(),
            authorization_servers: [],
          }),
          { headers: { "content-type": "application/json; charset=utf-8" } },
        ),
    },
  },
});
