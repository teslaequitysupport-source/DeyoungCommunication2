import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

/**
 * Client-side auth handle. `inferAdditionalFields` carries the platform
 * fields (role, status) into the session type — type-only import of the
 * server instance, so no server code reaches the client bundle.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});
