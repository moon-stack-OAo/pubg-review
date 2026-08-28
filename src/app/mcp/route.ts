import {registerPubgMcpTools} from "@/lib/mcp/tools";
import {createMcpHandler} from "mcp-handler";

const handler = createMcpHandler(
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

export { handler as GET, handler as POST, handler as DELETE };
