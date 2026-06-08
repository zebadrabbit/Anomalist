export const Permissions = {
  WIDGET_ADD: "widget.add",
  WIDGET_REMOVE: "widget.remove",
  WIDGET_EDIT: "widget.edit",
  WIDGET_TRANSFORM: "widget.transform",
  WIDGET_VISIBILITY: "widget.visibility",
  SCENE_MANAGE: "scene.manage",
  MEDIA_UPLOAD: "media.upload",
  MEDIA_DELETE_OWN: "media.delete.own",
  MEDIA_DELETE_ANY: "media.delete.any",
  SOUNDBOARD_PLAY: "soundboard.play",
  USER_MANAGE: "user.manage"
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

const allPermissions = Object.values(Permissions) as Permission[];

const roleDefaults: Record<string, Permission[]> = {
  owner: allPermissions,
  editor: allPermissions.filter((permission) => permission !== Permissions.USER_MANAGE),
  moderator: [
    Permissions.WIDGET_TRANSFORM,
    Permissions.WIDGET_VISIBILITY,
    Permissions.SOUNDBOARD_PLAY,
    Permissions.MEDIA_UPLOAD,
    Permissions.MEDIA_DELETE_OWN
  ]
};

export function getRolePermissions(role: string): Permission[] {
  const permissions = roleDefaults[role];
  if (!permissions) {
    return [];
  }

  return [...permissions];
}

export interface PermissionOverride {
  permission: Permission;
  granted: boolean;
}

export function resolvePermission(
  role: string,
  permission: Permission,
  overrides: PermissionOverride[]
): boolean {
  if (role === "owner" && permission === Permissions.USER_MANAGE) {
    return true;
  }

  const override = overrides.find((entry) => entry.permission === permission);
  if (override) {
    return override.granted;
  }

  return getRolePermissions(role).includes(permission);
}

export function listAllPermissions(): Permission[] {
  return [...allPermissions];
}
