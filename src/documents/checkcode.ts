/** FNV-1a hash, printed on the cover sheet so any change to the roster, year or amount changes the code. */
export function fnv(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0')
}
