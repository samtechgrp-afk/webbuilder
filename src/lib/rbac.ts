/**
 * Permission keys. Roles (system or per-site) are just named lists of these,
 * stored in Role.permissions. Code checks permissions, never role names, so a
 * designer can create a custom role without code changes.
 */
export const PERMISSIONS = {
  "site.settings": "Change site settings, domains and integrations",
  "site.users": "Invite and remove users, assign roles",
  "design.tokens": "Edit global colours, typography, radii and shadows",
  "design.layout": "Edit structure, layout and styles; toggle locks",
  "design.code": "Edit custom CSS and head code",
  "developer.api": "Turn on the GraphQL API and create or revoke API keys",
  "schema.manage": "Create post types, taxonomies and custom field groups",
  "content.edit": "Edit text, images, links and prices in unlocked areas",
  "media.upload": "Upload media",
  "media.manage": "Rename, tag, move and delete any media",
  "post.create": "Create and edit own drafts",
  "post.editAny": "Edit drafts by anyone",
  "post.submit": "Submit drafts for review",
  "post.publish": "Publish and unpublish content",
  "revisions.restore": "Roll back to an earlier revision",
  "commerce.manage": "Manage products, prices and inventory",
  "analytics.view": "View site analytics",
  "forms.manage": "Read form submissions and manage newsletter subscribers",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export type SystemRoleKey = "designer" | "client_admin" | "editor" | "author";

export const SYSTEM_ROLES: Record<
  SystemRoleKey,
  { name: string; description: string; permissions: Permission[] }
> = {
  designer: {
    name: "Designer",
    description: "Full control of design, layout, schema and settings for the site.",
    permissions: ALL_PERMISSIONS,
  },
  client_admin: {
    name: "Client Admin",
    description: "Edits content, media, posts and products; views analytics. Cannot change layout or design.",
    permissions: [
      "site.users", "content.edit", "media.upload", "media.manage", "post.create",
      "post.editAny", "post.submit", "post.publish", "revisions.restore",
      "commerce.manage", "analytics.view", "forms.manage",
    ],
  },
  editor: {
    name: "Editor",
    description: "Writes and edits content and submits it for approval.",
    permissions: ["content.edit", "media.upload", "post.create", "post.editAny", "post.submit"],
  },
  author: {
    name: "Author",
    description: "Writes own posts and submits them for approval.",
    permissions: ["media.upload", "post.create", "post.submit"],
  },
};

export function hasPermission(granted: readonly string[], needed: Permission): boolean {
  return granted.includes(needed);
}
