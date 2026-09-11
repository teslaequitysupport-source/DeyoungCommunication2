/**
 * Characters API — CRUD for the user's own characters (spec §15).
 * Cross-user access is impossible by construction: every query filters on
 * the session user id (IDOR/BOLA defense, spec §30).
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { characters } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  apiError,
  getApiUser,
  jsonResponse,
  readJson,
  requireUser,
} from "@/lib/api-helpers";
import { z } from "zod";

const MAX_NAME_LENGTH = 60;
const MAX_ABOUT_LENGTH = 500;

const createSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  style: z.string().trim().max(MAX_ABOUT_LENGTH).optional().default(""),
  hue: z.number().int().min(0).max(360).optional(),
  saturation: z.number().min(0).max(3).optional(),
  vignette: z.boolean().optional(),
});

export async function GET(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const rows = await getDb()
    .select()
    .from(characters)
    .where(eq(characters.userId, user.id))
    .orderBy(desc(characters.createdAt));
  return jsonResponse({ characters: rows });
}

export async function POST(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const body = await readJson(request);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "invalid_input", "Name (1-60 chars) is required.");
  }
  const { name, style, hue, saturation, vignette } = parsed.data;

  const appearance: Record<string, unknown> = {
    style: style ?? "",
    hue: hue ?? 210,
    saturation: saturation ?? 1.15,
    vignette: vignette ?? true,
  };

  const [created] = await getDb()
    .insert(characters)
    .values({
      userId: user.id,
      name,
      appearanceConfig: appearance,
      status: "ACTIVE",
    })
    .returning();

  await recordAudit(getDb(), {
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: "character.create",
    targetType: "character",
    targetId: created.id,
    outcome: "SUCCESS",
    metadata: { name },
  });

  return jsonResponse({ character: created }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const body = await readJson(request);
  const parsed = z
    .object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
      style: z.string().trim().max(MAX_ABOUT_LENGTH).optional(),
      hue: z.number().int().min(0).max(360).optional(),
      saturation: z.number().min(0).max(3).optional(),
      vignette: z.boolean().optional(),
      status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return apiError(400, "invalid_input", "Invalid update payload.");
  }
  const { id, name, style, hue, saturation, vignette, status } = parsed.data;

  const [existing] = await getDb()
    .select()
    .from(characters)
    .where(and(eq(characters.id, id), eq(characters.userId, user.id)))
    .limit(1);
  if (!existing) return apiError(404, "not_found", "Character not found.");

  const mergedAppearance = {
    ...(existing.appearanceConfig ?? {}),
    ...(style !== undefined ? { style } : {}),
    ...(hue !== undefined ? { hue } : {}),
    ...(saturation !== undefined ? { saturation } : {}),
    ...(vignette !== undefined ? { vignette } : {}),
  };

  const [updated] = await getDb()
    .update(characters)
    .set({
      name: name ?? existing.name,
      appearanceConfig: mergedAppearance,
      status: status ?? existing.status,
      updatedAt: new Date(),
    })
    .where(and(eq(characters.id, id), eq(characters.userId, user.id)))
    .returning();

  await recordAudit(getDb(), {
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: "character.update",
    targetType: "character",
    targetId: id,
    outcome: "SUCCESS",
  });
  return jsonResponse({ character: updated });
}

export async function DELETE(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return apiError(400, "invalid_input", "id query parameter required.");

  const [deleted] = await getDb()
    .delete(characters)
    .where(and(eq(characters.id, id), eq(characters.userId, user.id)))
    .returning();
  if (!deleted) return apiError(404, "not_found", "Character not found.");

  await recordAudit(getDb(), {
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: "character.delete",
    targetType: "character",
    targetId: id,
    outcome: "SUCCESS",
  });
  return jsonResponse({ deleted: true });
}
