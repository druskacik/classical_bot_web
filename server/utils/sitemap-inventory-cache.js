// A single complete snapshot shared by the index and all chunks. Never publish
// a partial refresh; concurrent requests share one loader and failures keep the
// last successful snapshot. No disk writes or background jobs are required.
export function createSitemapInventoryCache(loader, { maxAge = 3600_000, now = Date.now } = {}) {
  let inventory
  let expires = 0
  let pending
  return async event => {
    if (inventory && now() < expires) return inventory
    if (!pending) {
      pending = Promise.resolve().then(() => loader(event)).then(result => {
        inventory = result
        expires = now() + maxAge
        return inventory
      }).catch(error => {
        if (inventory) return inventory
        throw error
      }).finally(() => { pending = null })
    }
    return pending
  }
}
