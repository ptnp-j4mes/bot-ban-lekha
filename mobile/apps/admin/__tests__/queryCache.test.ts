import { clearQueryCache } from '../../../shared/src/queryCache';

test('cancels active admin queries before clearing their cached data', async () => {
  const order: string[] = [];
  const queryClient = {
    cancelQueries: jest.fn(async () => { order.push('cancel'); }),
    clear: jest.fn(() => { order.push('clear'); }),
  };

  await clearQueryCache(queryClient);

  expect(order).toEqual(['cancel', 'clear']);
  expect(queryClient.cancelQueries).toHaveBeenCalledTimes(1);
  expect(queryClient.clear).toHaveBeenCalledTimes(1);
});
