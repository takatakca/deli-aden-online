import { createFileRoute } from "@tanstack/react-router";
import { invokeMcpTool } from "../../../lib/mcp";

export const Route = createFileRoute("/.mcp/invoke-tool/$tool")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { name?: string; arguments?: Record<string, unknown> };
          const result = invokeMcpTool(body.name ?? "", body.arguments ?? {});
          return new Response(JSON.stringify({ result }), {
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Invalid request" }),
            { status: 400, headers: { "content-type": "application/json; charset=utf-8" } },
          );
        }
      },
    },
  },
});
