import { filterMenuSections, menuPermission } from '../src/permissions';

test('mobile maps menu ids to canonical permissions and hides ungranted menus', () => {
  expect(menuPermission('bills')).toBe('plans');
  expect(menuPermission('line-oa')).toBe('oa');
  expect(filterMenuSections([{ label: 'x', items: [{ id: 'customers' }, { id: 'banks' }] } as any], ['customers'])).toEqual([
    { label: 'x', items: [{ id: 'customers' }] },
  ]);
});
