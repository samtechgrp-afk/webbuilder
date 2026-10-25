"use server";

import { getTenant } from "@/lib/tenant";
import { run } from "./action-result";
import { bulkAction, createEntry, listEntryRevisions, restoreEntryRevision, saveEntry, type BulkAction, type EntryInput } from "./cms/entries";
import { deleteAssets, tagAssets, updateAssetMeta } from "./cms/media-service";
import { saveSiteIdentity } from "./cms/site-service";
import {
  createSingleTemplate,
  deleteFieldGroup,
  deletePostType,
  deleteTaxonomy,
  deleteTerm,
  saveFieldGroup,
  savePostType,
  saveTaxonomy,
  saveTerm,
  type FieldGroupInput,
} from "./cms/schema-service";

/**
 * Server actions for the CMS screens. Each one resolves the tenant from the
 * session (never from the browser's word) and delegates to a service that
 * checks permissions itself.
 */

type WithSite<T> = T & { siteId: string };

// Entries
export async function createEntryAction(input: WithSite<{ postTypeId: string; title?: string }>) {
  return run(async () => createEntry(await getTenant(input.siteId), input));
}
export async function saveEntryAction(input: WithSite<EntryInput>) {
  return run(async () => saveEntry(await getTenant(input.siteId), input));
}
export async function bulkEntriesAction(input: WithSite<{ ids: string[]; action: BulkAction }>) {
  return run(async () => bulkAction(await getTenant(input.siteId), input));
}
export async function entryRevisionsAction(input: WithSite<{ postId: string }>) {
  return run(async () => listEntryRevisions(await getTenant(input.siteId), input.postId));
}
export async function restoreEntryAction(input: WithSite<{ postId: string; revisionId: string }>) {
  return run(async () => restoreEntryRevision(await getTenant(input.siteId), input));
}

// Post types and taxonomies
export async function savePostTypeAction(input: WithSite<Parameters<typeof savePostType>[1]>) {
  return run(async () => savePostType(await getTenant(input.siteId), input));
}
export async function deletePostTypeAction(input: WithSite<{ id: string }>) {
  return run(async () => deletePostType(await getTenant(input.siteId), input.id));
}
export async function createSingleTemplateAction(input: WithSite<{ postTypeId: string }>) {
  return run(async () => createSingleTemplate(await getTenant(input.siteId), input.postTypeId));
}
export async function saveTaxonomyAction(input: WithSite<Parameters<typeof saveTaxonomy>[1]>) {
  return run(async () => saveTaxonomy(await getTenant(input.siteId), input));
}
export async function deleteTaxonomyAction(input: WithSite<{ id: string }>) {
  return run(async () => deleteTaxonomy(await getTenant(input.siteId), input.id));
}
export async function saveTermAction(input: WithSite<Parameters<typeof saveTerm>[1]>) {
  return run(async () => saveTerm(await getTenant(input.siteId), input));
}
export async function deleteTermAction(input: WithSite<{ id: string }>) {
  return run(async () => deleteTerm(await getTenant(input.siteId), input.id));
}

// Field groups
export async function saveFieldGroupAction(input: WithSite<FieldGroupInput>) {
  return run(async () => saveFieldGroup(await getTenant(input.siteId), input));
}
export async function deleteFieldGroupAction(input: WithSite<{ id: string }>) {
  return run(async () => deleteFieldGroup(await getTenant(input.siteId), input.id));
}

// Media
export async function updateAssetAction(input: WithSite<Parameters<typeof updateAssetMeta>[1]>) {
  return run(async () => updateAssetMeta(await getTenant(input.siteId), input));
}
export async function deleteAssetsAction(input: WithSite<{ ids: string[]; force?: boolean }>) {
  return run(async () => deleteAssets(await getTenant(input.siteId), input));
}
export async function tagAssetsAction(input: WithSite<{ ids: string[]; tag: string }>) {
  return run(async () => tagAssets(await getTenant(input.siteId), input));
}

// Site identity
export async function saveSiteIdentityAction(input: WithSite<Parameters<typeof saveSiteIdentity>[1]>) {
  return run(async () => saveSiteIdentity(await getTenant(input.siteId), input));
}
