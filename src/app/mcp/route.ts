import {
  authorizeMcpRequest,
  isMcpEnabled,
  mcpAuthErrorResponse,
} from "@/lib/mcp/auth";
import {registerPubgMcpTools} from "@/lib/mcp/tools";
import {createMcpHandler} from "mcp-handler";

const mcpHandler = createMcpHandler(
  (server) => {
    registerPubgMcpTools(server);
  },
  {
    serverInfo: {
      name: "pubg-review",
      version: "0.1.0",
    },
  },
);

async function handler(request: Request) {
  if (!isMcpEnabled()) {
    return Response.json(
      {error: "MCP disabled", message: "Remote MCP 已关闭（设置 MCP_ENABLED=true 可开启）"},
      {status: 404},
    );
  }

  const auth = authorizeMcpRequest(request);
  if (!auth.ok) {
    return mcpAuthErrorResponse(auth);
  }

  return mcpHandler(request);
}

export {handler as GET, handler as POST, handler as DELETE};
