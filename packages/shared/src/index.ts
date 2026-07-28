export const ROLES = ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "SUPERVISOR", "AGENT"] as const;
export type AppRole = (typeof ROLES)[number];

export type AuthPrincipal = {
  userId: string;
  sessionId: string;
  organizationId: string | null;
  role: AppRole;
  email: string;
  name: string;
};

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export const ROLE_PERMISSIONS: Record<AppRole, readonly string[]> = {
  SUPER_ADMIN: ["platform:manage", "organization:select"],
  ORGANIZATION_ADMIN: ["organization:manage", "conversation:read", "conversation:write", "analytics:read", "prompt:write", "automation:write"],
  SUPERVISOR: ["conversation:read", "conversation:assign", "conversation:write", "analytics:read"],
  AGENT: ["conversation:read:assigned", "conversation:write:assigned", "contact:read", "note:write"],
};

export function roleAllows(role: AppRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
