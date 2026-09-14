import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

/**
 * Client-side auth handle. `inferAdditionalFields` carries the platform
 * fields (role, status, twoFactorEnabled) into the session type —
 * type-only import of the server instance, so no server code reaches the
 * client bundle. `twoFactorClient` powers the MFA enrollment flow in the
 * admin console (enable → verify code → disable).
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>(), twoFactorClient()],
});
