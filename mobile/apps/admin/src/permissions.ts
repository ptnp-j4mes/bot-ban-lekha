import type { AdminPermission } from '../../../shared/src/types';

export const menuPermission = (id: string): AdminPermission => {
  if (id === 'bills') return 'plans';
  if (id === 'line-oa') return 'oa';
  if (id === 'messages') return 'message-settings';
  return id as AdminPermission;
};

export function hasMenuPermission(permissions: readonly AdminPermission[] | undefined, id: string) {
  return !permissions || permissions.length === 0 ? false : permissions.includes(menuPermission(id));
}

export function filterMenuSections<T extends { label: string; items: Array<{ id: string }> }>(sections: T[], permissions: readonly AdminPermission[]) {
  return sections.map((section) => ({ ...section, items: section.items.filter((item) => permissions.includes(menuPermission(item.id))) })).filter((section) => section.items.length > 0);
}
