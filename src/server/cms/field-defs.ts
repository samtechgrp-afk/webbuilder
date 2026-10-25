import type { CustomField } from "@prisma/client";
import type { FieldConfig, FieldDef } from "@/lib/cms/fields";

/** A CustomField row as the shared field engine sees it. */
export function fieldDefFromRow(row: CustomField): FieldDef {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type as FieldDef["type"],
    instructions: row.instructions,
    required: row.required,
    clientEditable: row.clientEditable,
    config: (row.config ?? {}) as FieldConfig,
  };
}
