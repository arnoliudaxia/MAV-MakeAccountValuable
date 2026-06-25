import { and, eq, ne } from "drizzle-orm";
import type { Tag } from "../../contracts/tag";
import { DEFAULT_CATEGORY_TREE, TAG_COLORS } from "../../contracts/tag";
import { tags, bills } from "../../db/schema";
import { getDb } from "../queries/connection";

let defaultCategoriesPromise: Promise<void> | null = null;

function normalizeTag(tag: typeof tags.$inferSelect): Tag {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    parentId: tag.parentId ?? null,
    icon: tag.icon || "Tag",
    sortOrder: tag.sortOrder ?? 0,
    createdAt: tag.createdAt,
  };
}

function colorForName(name: string) {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return TAG_COLORS[hash % TAG_COLORS.length];
}

async function upsertDefaultCategory(
  category: { name: string; icon: string; color: string },
  parentId: string | null,
  sortOrder: number
): Promise<Tag> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(tags)
    .where(eq(tags.name, category.name))
    .limit(1);

  if (!existing) {
    const tag: Tag = {
      id: crypto.randomUUID(),
      name: category.name,
      color: category.color,
      parentId,
      icon: category.icon,
      sortOrder,
      createdAt: new Date().toISOString(),
    };
    await db.insert(tags).values(tag);
    return tag;
  }

  const updateData: Partial<typeof tags.$inferInsert> = {};
  const looksLikeMigratedTag =
    (!existing.icon || existing.icon === "Tag") &&
    (existing.sortOrder ?? 0) === 0;
  if (looksLikeMigratedTag && (existing.parentId ?? null) !== parentId) {
    updateData.parentId = parentId;
  }
  if (looksLikeMigratedTag) {
    updateData.icon = category.icon;
  }
  if (looksLikeMigratedTag) {
    updateData.sortOrder = sortOrder;
  }

  if (Object.keys(updateData).length > 0) {
    await db.update(tags).set(updateData).where(eq(tags.id, existing.id));
    return {
      ...normalizeTag(existing),
      ...updateData,
    };
  }

  return normalizeTag(existing);
}

export async function ensureDefaultCategories(): Promise<void> {
  if (!defaultCategoriesPromise) {
    defaultCategoriesPromise = (async () => {
      let parentIndex = 0;
      for (const category of DEFAULT_CATEGORY_TREE) {
        const parentSortOrder = (parentIndex + 1) * 1000;
        const parent = await upsertDefaultCategory(
          category,
          null,
          parentSortOrder
        );

        let childIndex = 1;
        for (const child of category.children) {
          await upsertDefaultCategory(
            child,
            parent.id,
            parentSortOrder + childIndex
          );
          childIndex += 1;
        }
        parentIndex += 1;
      }
    })();
  }
  return defaultCategoriesPromise;
}

export async function findAll(): Promise<Tag[]> {
  await ensureDefaultCategories();
  const db = await getDb();
  const rows = await db.select().from(tags).orderBy(tags.sortOrder, tags.name);
  return rows.map(normalizeTag);
}

export async function findById(id: string): Promise<Tag | undefined> {
  await ensureDefaultCategories();
  const db = await getDb();
  const [tag] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  return tag ? normalizeTag(tag) : undefined;
}

export async function findByName(name: string): Promise<Tag | undefined> {
  await ensureDefaultCategories();
  const db = await getDb();
  const [tag] = await db
    .select()
    .from(tags)
    .where(eq(tags.name, name))
    .limit(1);
  return tag ? normalizeTag(tag) : undefined;
}

export async function create(tag: Tag): Promise<Tag> {
  const db = await getDb();
  const nextTag: Tag = {
    ...tag,
    parentId: tag.parentId ?? null,
    icon: tag.icon || "Tag",
    sortOrder: tag.sortOrder ?? Date.now(),
  };
  await db.insert(tags).values(nextTag);
  return nextTag;
}

export async function ensureTagByName(
  name: string,
  color?: string
): Promise<Tag> {
  const trimmed = name.trim();
  const existing = await findByName(trimmed);
  if (existing) return existing;

  const tag: Tag = {
    id: crypto.randomUUID(),
    name: trimmed,
    color: color || colorForName(trimmed),
    parentId: null,
    icon: "Tag",
    sortOrder: Date.now(),
    createdAt: new Date().toISOString(),
  };
  return create(tag);
}

export async function update(
  id: string,
  data: Partial<Tag>
): Promise<Tag | undefined> {
  const db = await getDb();
  const oldTag = await findById(id);
  if (!oldTag) return undefined;

  if (data.name) {
    data.name = data.name.trim();
  }
  await db.update(tags).set(data).where(eq(tags.id, id));
  if (data.name && data.name !== oldTag.name) {
    await db
      .update(bills)
      .set({ category: data.name })
      .where(eq(bills.category, oldTag.name));
  }
  return findById(id);
}

export async function remove(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.delete(tags).where(eq(tags.id, id));
  return result.rowsAffected > 0;
}

export async function hasChildren(id: string): Promise<boolean> {
  const db = await getDb();
  const [child] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.parentId, id))
    .limit(1);
  return !!child;
}

export async function mergeInto(
  source: Tag,
  target: Tag
): Promise<{ mergedBills: number; deleted: boolean }> {
  const db = await getDb();
  const updateResult = await db
    .update(bills)
    .set({ category: target.name })
    .where(eq(bills.category, source.name));
  const deleteResult = await db.delete(tags).where(eq(tags.id, source.id));

  return {
    mergedBills: updateResult.rowsAffected,
    deleted: deleteResult.rowsAffected > 0,
  };
}

export async function isTagInUse(tagName: string): Promise<boolean> {
  const db = await getDb();
  const [bill] = await db
    .select({ id: bills.id })
    .from(bills)
    .where(eq(bills.category, tagName))
    .limit(1);
  return !!bill;
}

export async function isNameUsedByAnotherTag(
  name: string,
  id: string
): Promise<boolean> {
  const db = await getDb();
  const [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.name, name), ne(tags.id, id)))
    .limit(1);
  return !!tag;
}
