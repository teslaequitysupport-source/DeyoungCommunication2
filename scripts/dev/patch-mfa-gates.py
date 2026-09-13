#!/usr/bin/env python3
"""Insert the MFA gate after the requireUser guard in elevated routes."""
import re, sys

FILES = [
    "src/app/api/moderation/reports/route.ts",
    "src/app/api/moderation/reports/[id]/decision/route.ts",
    "src/app/api/admin/users/route.ts",
    "src/app/api/admin/users/[id]/route.ts",
    "src/app/api/admin/users/[id]/status/route.ts",
    "src/app/api/admin/users/[id]/role/route.ts",
    "src/app/api/admin/workers/route.ts",
    "src/app/api/admin/audit/route.ts",
]

GUARD = '  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");\n'
MFA = (
    "\n  // MFA gate: elevated roles must hold a verified TOTP enrollment\n"
    "  // before touching moderation or admin surfaces (spec §26/§28).\n"
    "  const mfaDenied = requireMfa(user);\n"
    "  if (mfaDenied) return mfaDenied;\n"
)

for path in FILES:
    with open(path) as f:
        src = f.read()
    if "requireMfa" in src:
        print(f"skip (already gated): {path}")
        continue
    if GUARD not in src:
        print(f"FAIL: guard line not found in {path}")
        sys.exit(1)
    src = src.replace(GUARD, GUARD + MFA, 1)
    # add requireMfa to the api-helpers import block
    m = re.search(r"import \{([^}]*)\} from \"@/lib/api-helpers\";", src)
    if not m:
        print(f"FAIL: api-helpers import not found in {path}")
        sys.exit(1)
    names = [n.strip() for n in m.group(1).split(",") if n.strip()]
    if "requireMfa" not in names:
        names.append("requireMfa")
    src = src.replace(m.group(0), "import {\n  " + ",\n  ".join(names) + ",\n} from \"@/lib/api-helpers\";")
    with open(path, "w") as f:
        f.write(src)
    print(f"patched: {path}")
