/**
 * Month buckets computed in JS (UTC) instead of $year/$month in the pipeline.
 * Same result as a $group on year+month, but portable across Mongo-compatible servers
 * and trivially testable. Volumes for one agency are tiny, so this is cheap.
 * Returns [{ _id: { y, m }, total, count }] sorted oldest -> newest.
 */
async function monthly(Model, match, dateField, amountField = 'amount') {
  const docs = await Model.find(match).select(`${dateField} ${amountField}`).lean();
  const map = new Map();
  for (const d of docs) {
    const dt = d[dateField]; if (!dt) continue;
    const y = dt.getUTCFullYear(); const m = dt.getUTCMonth() + 1; const k = y * 100 + m;
    const cur = map.get(k) || { _id: { y, m }, total: 0, count: 0 };
    cur.total += Number(d[amountField]) || 0; cur.count += 1; map.set(k, cur);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}
module.exports = monthly;
