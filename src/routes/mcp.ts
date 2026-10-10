import { createFileRoute } from "@tanstack/react-router";
import { MCP_TOOLS, invokeMcpTool } from "../lib/mcp";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: async () =>
        json({
          name: "deli-aden-mcp",
          version: "1.0.0",
          protocol: "local-json",
          tools: MCP_TOOLS,
        }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            name?: string;
            arguments?: Record<string, unknown>;
          };
          return json({
            name: body.name,
            result: invokeMcpTool(body.name ?? "", body.arguments ?? {}),
          });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Invalid request" }, 400);
        }
      },
    },
  },
});
