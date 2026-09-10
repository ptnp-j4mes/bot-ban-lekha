type QueryClientLike = {
  cancelQueries: () => Promise<unknown>;
  clear: () => void;
};

export async function clearQueryCache(queryClient: QueryClientLike) {
  await queryClient.cancelQueries();
  queryClient.clear();
}
