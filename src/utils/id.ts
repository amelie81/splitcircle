// Short URL-safe ids. crypto.randomUUID exists in both the browser and Node 25.
export function newId(prefix = ''): string {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return prefix ? `${prefix}_${id}` : id;
}
