export async function listProducts(env, includeInactive = false) {
  const sql = `SELECT id, name, purchase_price, sell_price, consumer_price, stock
               FROM products ${includeInactive ? "" : "WHERE is_active = 1"}
               ORDER BY name COLLATE NOCASE`;
  const { results } = await env.DB.prepare(sql).all();
  return results || [];
}

export async function getProduct(env, id) {
  return env.DB.prepare(
    "SELECT id, name, purchase_price, sell_price, consumer_price, stock FROM products WHERE id = ? AND is_active = 1"
  ).bind(id).first();
}

export async function listOpenDebts(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, customer_name, amount, paid, amount - paid AS remaining, note, created_at
     FROM debts WHERE status = 'open' AND amount > paid ORDER BY created_at ASC`
  ).all();
  return results || [];
}

export async function getDebt(env, id) {
  return env.DB.prepare(
    "SELECT id, amount, paid, status FROM debts WHERE id = ?"
  ).bind(id).first();
}

export async function getSalesSummary(env, startIso) {
  const { results } = await env.DB.prepare(
    `SELECT
       COUNT(*) AS sale_count,
       COALESCE(SUM(total_amount), 0) AS total,
       COALESCE(SUM(debt_amount), 0) AS credit_total
     FROM sales WHERE datetime(created_at) >= datetime(?)`
  ).bind(startIso).all();
  const totals = results?.[0] || { sale_count: 0, total: 0, credit_total: 0 };
  const { results: methods } = await env.DB.prepare(
    `SELECT method, COALESCE(SUM(amount), 0) AS amount
     FROM payments WHERE kind = 'sale' AND datetime(created_at) >= datetime(?)
     GROUP BY method`
  ).bind(startIso).all();
  return { ...totals, methods: methods || [] };
}

export async function getApproxProfit(env, startIso) {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(si.line_total - (si.purchase_price_snapshot * si.qty)), 0) AS profit
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE datetime(s.created_at) >= datetime(?)`
  ).bind(startIso).first();
  return Number(row?.profit || 0);
}

export async function getShortages(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, product_name, reason, note, created_at
     FROM shortages WHERE status = 'open' ORDER BY created_at DESC`
  ).all();
  return results || [];
}

export async function getCurrentStockValue(env) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS product_count, COALESCE(SUM(stock), 0) AS unit_count FROM products WHERE is_active = 1"
  ).first();
  return row || { product_count: 0, unit_count: 0 };
}

export async function getSalesItems(env, saleId) {
  const { results } = await env.DB.prepare(
    `SELECT si.product_id, p.name, si.qty, si.unit_price, si.purchase_price_snapshot, si.line_total
     FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = ?`
  ).bind(saleId).all();
  return results || [];
}
