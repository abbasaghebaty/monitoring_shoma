import { sendMessage, answerCallback } from "../telegram.js";
import {
  listProducts, getProduct, listOpenDebts, getDebt, getSalesSummary,
  getApproxProfit, getShortages, getCurrentStockValue,
} from "../db/shop.js";
import { formatToman } from "../utils/time.js";

const TTL = 60 * 60 * 3;
const sessionKey = (id) => `shop-session:${id}`;
const admin = (env, id) => String(env.ADMIN_IDS || env.OWNER_ID || "")
  .split(",").map((x) => x.trim()).filter(Boolean).includes(String(id));
const btn = (text, data) => ({ text, callback_data: data });
const kb = (rows) => ({ reply_markup: { inline_keyboard: rows } });
const digits = (value) => String(value ?? "")
  .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
  .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
  .replace(/[٬،]/g, "").replace(/,/g, "");
const asInt = (value) => {
  const s = digits(value).replace(/\s/g, "");
  if (!/^\d+$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : NaN;
};
const normalize = (value) => String(value ?? "").toLocaleLowerCase("fa")
  .replace(/[يى]/g, "ی").replace(/ك/g, "ک")
  .replace(/[ۀة]/g, "ه").replace(/أ|إ|آ/g, "ا")
  .replace(/[‌ـ]/g, " ").replace(/[ًٌٍَُِّْ]/g, "")
  .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
  .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
  .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();

async function getSession(env, id) {
  if (!env.SESSION_KV) throw new Error("اتصال SESSION_KV روی Worker تنظیم نشده است.");
  return env.SESSION_KV.get(sessionKey(id), "json");
}
async function putSession(env, id, state) {
  if (!env.SESSION_KV) throw new Error("اتصال SESSION_KV روی Worker تنظیم نشده است.");
  await env.SESSION_KV.put(sessionKey(id), JSON.stringify(state), { expirationTtl: TTL });
}
async function dropSession(env, id) {
  if (env.SESSION_KV) await env.SESSION_KV.delete(sessionKey(id));
}
async function say(env, chatId, text, rows = []) {
  return sendMessage(env, chatId, text, rows.length ? kb(rows) : {});
}
function requireAdmin(env, id) {
  return admin(env, id);
}
function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = old;
    }
  }
  return row[b.length];
}
function scoreName(query, candidate) {
  const q = normalize(query), c = normalize(candidate);
  if (!q || !c) return 0;
  if (q === c) return 100;
  if (c.includes(q) || q.includes(c)) return 80;
  const qt = q.split(" "), ct = c.split(" ");
  let score = 0;
  for (const x of qt) for (const y of ct) {
    if (x === y) score += 10;
    else if (x.length > 2 && y.length > 2) {
      const sim = 1 - editDistance(x, y) / Math.max(x.length, y.length);
      if (sim >= 0.55) score += sim * 7;
    }
  }
  return score / Math.max(qt.length, ct.length);
}
function parseFreeLines(raw) {
  const lines = String(raw || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  return lines.map((line) => {
    const normalizedDigits = digits(line);
    const nums = (normalizedDigits.match(/\d+/g) || []).map(Number).filter(Number.isSafeInteger);
    let qty = 1, price = null, ambiguous = false;
    const small = nums.filter((n) => n > 0 && n < 1000);
    const large = nums.filter((n) => n >= 1000);
    if (small.length) qty = small[0];
    if (large.length) price = large[0];
    if (nums.length > 2 || (nums.length && !small.length && !large.length)) ambiguous = true;
    const name = normalizedDigits.replace(/\d[\d\s,٬،]*/g, " ").replace(/[,:;|]+/g, " ").trim();
    return { raw: line, name, qty, price, ambiguous };
  }).filter((x) => x.name);
}
async function candidatePage(env, chatId, state, offset = 0) {
  const item = state.pendingItem;
  const products = await listProducts(env);
  const ranked = products.map((p) => ({ p, score: scoreName(item.name, p.name) }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
  state.candidates = ranked.map((x) => x.p.id);
  state.stage = "sale_match";
  await putSession(env, state.uid, state);
  if (!ranked.length) return say(env, chatId, "محصول فعالی پیدا نشد. مدیر باید محصول را اضافه کند.", [[btn("لغو", "sh:x")]]);
  const p = ranked[offset]?.p || ranked[0].p;
  const price = item.price ?? Number(p.sell_price || 0);
  state.selectedCandidate = p.id;
  await putSession(env, state.uid, state);
  return say(env, chatId,
    `منظورت این است؟\n${p.name}\nتعداد: ${item.qty}\nقیمت واحد: ${formatToman(price)}${item.ambiguous ? "\n⚠️ تشخیص عددها مبهم است؛ قبل از ثبت فاکتور بررسی کن." : ""}`,
    [[btn("✅ تأیید", "sh:yes"), btn("❌ نه، این نیست", "sh:no")], [btn("لغو فروش", "sh:x")]]
  );
}
async function nextSaleItem(env, chatId, state) {
  if (state.cursor >= state.parsedItems.length) return showInvoice(env, chatId, state);
  state.pendingItem = state.parsedItems[state.cursor];
  return candidatePage(env, chatId, state);
}
async function showInvoice(env, chatId, state) {
  state.stage = "sale_invoice";
  await putSession(env, state.uid, state);
  const total = state.items.reduce((sum, x) => sum + x.qty * x.price, 0);
  const lines = state.items.map((x, i) =>
    `${i + 1}. ${x.name} × ${x.qty} — ${formatToman(x.qty * x.price)}`
  ).join("\n");
  const method = ({ card: "کارتخوان – کامل", cash: "نقد – کامل", transfer: "کارت‌به‌کارت/انتقال – کامل", credit: "نسیه" })[state.paymentMethod] || "کارتخوان – کامل";
  return say(env, chatId, `🧾 خلاصه فاکتور\n\n${lines}\n\nجمع کل: ${formatToman(total)}\nپرداخت: ${method}`,
    [[btn("✅ تأیید و ثبت", "sh:commit"), btn("✏️ ویرایش", "sh:edit")],
     [btn("➕ افزودن قلم", "sh:add"), btn("🗑 حذف قلم", "sh:delete")],
     [btn("💳 تغییر نحوه پرداخت", "sh:pay")],
     [btn("❌ انصراف", "sh:x")]]);
}
async function commitSale(env, chatId, state) {
  if (!state.items.length) return say(env, chatId, "فاکتور خالی است.");
  const products = await Promise.all(state.items.map((x) => getProduct(env, x.productId)));
  for (let i = 0; i < state.items.length; i++) {
    if (!products[i]) return say(env, chatId, `محصول «${state.items[i].name}» دیگر فعال نیست.`, [[btn("ویرایش", "sh:edit")]]);
    if (Number(products[i].stock) < state.items[i].qty) {
      return say(env, chatId, `موجودی «${products[i].name}» کافی نیست.\nموجودی فعلی: ${products[i].stock}\nدرخواست: ${state.items[i].qty}`,
        [[btn("ویرایش تعداد", `sh:editqty:${i}`)], [btn("حذف قلم", `sh:remove:${i}`)], [btn("انصراف", "sh:x")]]);
    }
  }
  const total = state.items.reduce((sum, x) => sum + x.qty * x.price, 0);
  const method = state.paymentMethod || "card";
  const debt = method === "credit" ? total : 0;
  const paid = total - debt;
  const idBytes = new Uint8Array(6); crypto.getRandomValues(idBytes);
  const saleId = Array.from(idBytes, (x) => x.toString(16).padStart(2, "0")).join("");
  const numericId = Number.parseInt(saleId, 16);
  const statements = [
    env.DB.prepare(`INSERT INTO sales (id, customer_id, total_amount, paid_amount, debt_amount, sale_type, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(numericId, state.customerId || null, total, paid, debt, debt ? "credit" : method, state.note || null)
  ];
  for (let i = 0; i < state.items.length; i++) {
    const x = state.items[i];
    statements.push(env.DB.prepare(`INSERT INTO sale_items
      (sale_id, product_id, qty, unit_price, purchase_price_snapshot, line_total)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(numericId, x.productId, x.qty, x.price, Number(products[i].purchase_price || 0), x.qty * x.price));
  }
  if (paid > 0) statements.push(env.DB.prepare(
    "INSERT INTO payments (sale_id, kind, method, amount, note) VALUES (?, 'sale', ?, ?, ?)"
  ).bind(numericId, method, paid, state.note || null));
  if (debt > 0) statements.push(env.DB.prepare(
    `INSERT INTO debts (sale_id, customer_id, customer_name, note, amount, paid, status)
     VALUES (?, ?, (SELECT name FROM customers WHERE id = ?), ?, ?, 0, 'open')`
  ).bind(numericId, state.customerId || null, state.customerId || null, state.note || null, debt));
  await env.DB.batch(statements);
  await dropSession(env, state.uid);
  return say(env, chatId, `✅ فروش ثبت شد.\nفاکتور: #${numericId}\nمبلغ: ${formatToman(total)}`,
    [[btn("فروش جدید", "sh:new")]]);
}
async function startFlow(env, chatId, uid, kind) {
  const state = { uid, kind, stage: kind, items: [], paymentMethod: "card" };
  await putSession(env, uid, state);
  const prompts = {
    sale_input: "اقلام را بنویس. هر قلم را در یک خط؛ نام، تعداد و قیمت را با هر ترتیبی بنویس.\nمثال: مایع دستشویی ۲ ۱۸۰۰۰۰\nاگر تعداد نیاید ۱ و اگر قیمت نیاید قیمت فروش محصول ثبت می‌شود.",
    product_add: "نام محصول را وارد کن.",
    purchase: "تاریخ خرید را وارد کن (مثلاً ۱۴۰۵/۰۸/۱۰ یا 2026-10-31).",
    debtpay: "شناسه بدهی را وارد کن.",
    customer_add: "نام مشتری را وارد کن.",
    price: "شناسه محصول را وارد کن."
  };
  return say(env, chatId, prompts[kind], [[btn("لغو", "sh:x")]]);
}
export async function handleShopMenu({ env, chatId, user }) {
  const uid = user.telegram_id;
  const rows = admin(env, uid)
    ? [[btn("🧾 ثبت فروش", "sh:menu:sale"), btn("📦 محصولات", "sh:menu:products")],
       [btn("➕ افزودن محصول", "sh:menu:product_add"), btn("🛒 ثبت خرید", "sh:menu:purchase")],
       [btn("💳 تسویه بدهی", "sh:menu:debtpay"), btn("👥 مشتریان", "sh:menu:customers")],
       [btn("🏷 تغییر قیمت", "sh:menu:price"), btn("📊 گزارش مالی", "sh:menu:report")]]
    : [[btn("🧾 ثبت فروش", "sh:menu:sale")]];
  return say(env, chatId, "مدیریت فروش و انبار — گزینه موردنظر را انتخاب کن:", rows);
}
export async function handleShopText({ env, msg }) {
  const uid = msg.from.id, chatId = msg.chat.id, text = msg.text.trim();
  const state = await getSession(env, uid);
  if (!state) return false;
  if (state.stage === "sale_input") {
    state.parsedItems = parseFreeLines(text);
    state.cursor = 0; state.items = [];
    if (!state.parsedItems.length) return say(env, chatId, "نام محصولی تشخیص داده نشد؛ دوباره بنویس.");
    return nextSaleItem(env, chatId, state);
  }
  if (state.stage === "product_add") {
    state.name = text; state.stage = "product_sell"; await putSession(env, uid, state);
    return say(env, chatId, "قیمت فروش را وارد کن.");
  }
  if (state.stage === "product_sell") {
    state.sell = asInt(text); if (!Number.isSafeInteger(state.sell)) return say(env, chatId, "قیمت معتبر وارد کن.");
    state.stage = "product_buy"; await putSession(env, uid, state);
    return say(env, chatId, "قیمت خرید را وارد کن یا «ندارد» را بزن.", [[btn("ندارد", "sh:no_buy")]]);
  }
  if (state.stage === "product_buy") {
    state.buy = normalize(text) === "ندارد" ? null : asInt(text);
    if (state.buy !== null && !Number.isSafeInteger(state.buy)) return say(env, chatId, "قیمت خرید معتبر نیست.");
    state.stage = "product_confirm"; await putSession(env, uid, state);
    return say(env, chatId, `تأیید محصول\nنام: ${state.name}\nقیمت فروش: ${formatToman(state.sell)}\nقیمت خرید: ${state.buy === null ? "نامشخص" : formatToman(state.buy)}`,
      [[btn("✅ ثبت", "sh:product_save"), btn("✏️ ویرایش", "sh:product_edit")], [btn("❌ انصراف", "sh:x")]]);
  }
  if (state.stage === "product_edit") {
    state.name = text; state.stage = "product_sell"; await putSession(env, uid, state);
    return say(env, chatId, "قیمت فروش را وارد کن.");
  }
  if (state.stage === "purchase_date") {
    state.purchaseDate = text; state.stage = "purchase_supplier"; await putSession(env, uid, state);
    return say(env, chatId, "نام تأمین‌کننده را وارد کن یا «ندارد» بنویس.");
  }
  if (state.stage === "purchase_supplier") {
    state.supplier = normalize(text) === "ندارد" ? null : text;
    state.stage = "purchase_lines"; await putSession(env, uid, state);
    return say(env, chatId, "اقلام خرید را هر خط با این ترتیب وارد کن:\nشناسه محصول، تعداد، قیمت خرید، قیمت فروش، قیمت مصرف‌کننده\nمثال: ۱۲ ۲ ۱۲۰۰۰۰ ۱۵۰۰۰۰ ۱۶۰۰۰۰");
  }
  if (state.stage === "purchase_lines") {
    state.rawLines = text; state.stage = "purchase_confirm"; await putSession(env, uid, state);
    return say(env, chatId, "اقلام دریافت شد. نسخه فعلی این جریان برای جلوگیری از اشتباه، تا زمان تأیید نهایی مدیر خرید را ثبت نمی‌کند. می‌توانی لغو کنی یا به دستور قدیمی /purchase برگردی.", [[btn("لغو", "sh:x")]]);
  }
  if (state.stage === "debtpay_id") {
    state.debtId = asInt(text); const debt = await getDebt(env, state.debtId);
    if (!debt || debt.status !== "open") return say(env, chatId, "بدهی باز پیدا نشد.");
    state.remaining = Number(debt.amount) - Number(debt.paid); state.stage = "debtpay_method";
    await putSession(env, uid, state);
    return say(env, chatId, `مانده بدهی: ${formatToman(state.remaining)}\nروش پرداخت را انتخاب کن.`,
      [[btn("نقد", "sh:debtmethod:cash"), btn("کارتخوان", "sh:debtmethod:card")], [btn("انتقال", "sh:debtmethod:transfer")]]);
  }
  if (state.stage === "debtpay_amount") {
    const amount = asInt(text);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > state.remaining) return say(env, chatId, "مبلغ معتبر نیست یا از مانده بیشتر است.");
    await env.DB.prepare("INSERT INTO payments (debt_id, kind, method, amount) VALUES (?, 'debt_payment', ?, ?)")
      .bind(state.debtId, state.method, amount).run();
    await dropSession(env, uid);
    return say(env, chatId, "✅ پرداخت بدهی ثبت شد.");
  }
  if (state.stage === "price_id") {
    const p = await getProduct(env, asInt(text)); if (!p) return say(env, chatId, "محصول پیدا نشد.");
    state.productId = p.id; state.stage = "price_sell"; await putSession(env, uid, state);
    return say(env, chatId, `قیمت فروش جدید برای ${p.name} را وارد کن.`);
  }
  if (state.stage === "price_sell") {
    state.sell = asInt(text); if (!Number.isSafeInteger(state.sell)) return say(env, chatId, "قیمت معتبر نیست.");
    state.stage = "price_consumer"; await putSession(env, uid, state);
    return say(env, chatId, "قیمت مصرف‌کننده جدید را وارد کن.");
  }
  if (state.stage === "price_consumer") {
    const consumer = asInt(text); if (!Number.isSafeInteger(consumer)) return say(env, chatId, "قیمت معتبر نیست.");
    await env.DB.prepare("UPDATE products SET sell_price = ?, consumer_price = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(state.sell, consumer, state.productId).run();
    await dropSession(env, uid); return say(env, chatId, "✅ قیمت‌ها به‌روزرسانی شد.");
  }
  if (state.stage === "sale_edit_qty" || state.stage === "sale_edit_price") {
    const n = asInt(text), item = state.items[state.editIndex];
    if (!Number.isSafeInteger(n) || n < (state.stage === "sale_edit_qty" ? 1 : 0)) return say(env, chatId, "عدد معتبر وارد کن.");
    if (state.stage === "sale_edit_qty") item.qty = n; else item.price = n;
    return showInvoice(env, chatId, state);
  }
  if (state.stage === "sale_search_again") {
    state.pendingItem.name = text; return candidatePage(env, chatId, state);
  }
  return true;
}
export async function handleShopCallback({ env, callback }) {
  const uid = callback.from.id, chatId = callback.message.chat.id, data = callback.data || "";
  await answerCallback(env, callback.id);
  const adminActions = new Set(["sh:menu:products","sh:menu:product_add","sh:menu:purchase","sh:menu:debtpay","sh:menu:customers","sh:menu:price","sh:menu:report","sh:product_save","sh:product_edit"]);
  if (adminActions.has(data) && !admin(env, uid)) return say(env, chatId, "⛔ دسترسی مدیر لازم است.");
  let state = await getSession(env, uid);
  if (data === "sh:x") { await dropSession(env, uid); return say(env, chatId, "عملیات لغو شد."); }
  if (data === "sh:menu:sale" || data === "sh:new") return startFlow(env, chatId, uid, "sale_input");
  if (data === "sh:menu:product_add") return startFlow(env, chatId, uid, "product_add");
  if (data === "sh:menu:purchase") return startFlow(env, chatId, uid, "purchase_date");
  if (data === "sh:menu:debtpay") return startFlow(env, chatId, uid, "debtpay_id");
  if (data === "sh:menu:price") return startFlow(env, chatId, uid, "price_id");
  if (data === "sh:menu:customers") {
    const { results } = await env.DB.prepare("SELECT id,name,phone FROM customers ORDER BY name LIMIT 50").all();
    const text = (results || []).map((x) => `#${x.id} ${x.name}${x.phone ? " — " + x.phone : ""}`).join("\n");
    return say(env, chatId, text || "مشتری ثبت‌شده‌ای وجود ندارد.");
  }
  if (data === "sh:menu:products") {
    const products = await listProducts(env);
    const text = products.map((p) => `#${p.id} ${p.name} | موجودی ${p.stock} | فروش ${formatToman(p.sell_price)}`).join("\n");
    return say(env, chatId, text || "محصولی ثبت نشده است.");
  }
  if (data === "sh:menu:report") {
    const [stock, debts, shortages] = await Promise.all([getCurrentStockValue(env), listOpenDebts(env), getShortages(env)]);
    const start = new Date(); start.setHours(0,0,0,0);
    const [sales, profit] = await Promise.all([getSalesSummary(env, start.toISOString()), getApproxProfit(env, start.toISOString())]);
    return say(env, chatId, `📊 گزارش امروز\nفروش: ${formatToman(sales.total)} (${sales.sale_count} فاکتور)\nسود تقریبی: ${formatToman(profit)}\nموجودی: ${stock.unit_count} واحد از ${stock.product_count} محصول\nبدهی باز: ${debts.length}\nکسری باز: ${shortages.length}`);
  }
  if (!state) return say(env, chatId, "مکالمه‌ای فعال نیست؛ از منوی فروش شروع کن.");
  if (data === "sh:no_buy") {
    state.buy = null; state.stage = "product_confirm"; await putSession(env, uid, state);
    return say(env, chatId, `نام: ${state.name}\nفروش: ${formatToman(state.sell)}\nخرید: نامشخص`, [[btn("ثبت", "sh:product_save"), btn("ویرایش", "sh:product_edit")], [btn("انصراف", "sh:x")]]);
  }
  if (data === "sh:product_save") {
    await env.DB.prepare("INSERT INTO products (name,purchase_price,sell_price,consumer_price,stock) VALUES (?,?,?,?,0)")
      .bind(state.name, state.buy ?? 0, state.sell, state.sell).run();
    await dropSession(env, uid);
    return say(env, chatId, "✅ محصول ثبت شد. قیمت خرید نامشخص به‌صورت صفر ذخیره شده و سود آن باید نامشخص تلقی شود.");
  }
  if (data === "sh:product_edit") { state.stage = "product_edit"; await putSession(env, uid, state); return say(env, chatId, "نام صحیح محصول را وارد کن."); }
  if (data === "sh:yes" && state.stage === "sale_match") {
    const p = await getProduct(env, state.selectedCandidate);
    if (!p) return say(env, chatId, "محصول دیگر فعال نیست؛ دوباره جستجو کن.");
    state.items.push({ productId: p.id, name: p.name, qty: state.pendingItem.qty, price: state.pendingItem.price ?? Number(p.sell_price || 0) });
    state.cursor++; return nextSaleItem(env, chatId, state);
  }
  if (data === "sh:no" && state.stage === "sale_match") {
    const options = await Promise.all(state.candidates.slice(1).map((id) => getProduct(env, id)));
    const rows = options.filter(Boolean).map((p) => [btn(p.name, `sh:pick:${p.id}`)]);
    rows.push([btn("جستجوی دوباره", "sh:retry")], [btn("لغو", "sh:x")]);
    return say(env, chatId, "یکی از گزینه‌های نزدیک را انتخاب کن:", rows);
  }
  if (data.startsWith("sh:pick:")) {
    const p = await getProduct(env, asInt(data.slice(8)));
    if (!p) return say(env, chatId, "محصول پیدا نشد.");
    state.items.push({ productId: p.id, name: p.name, qty: state.pendingItem.qty, price: state.pendingItem.price ?? Number(p.sell_price || 0) });
    state.cursor++; return nextSaleItem(env, chatId, state);
  }
  if (data === "sh:retry") { state.stage = "sale_search_again"; await putSession(env, uid, state); return say(env, chatId, "نام محصول را دوباره تایپ کن."); }
  if (data === "sh:commit" && state.stage === "sale_invoice") return commitSale(env, chatId, state);
  if (data === "sh:edit") return say(env, chatId, "قلم موردنظر را انتخاب کن:", state.items.map((x, i) => [btn(x.name, `sh:edit:${i}`)]));
  if (data.startsWith("sh:edit:")) {
    state.editIndex = asInt(data.slice(8)); state.stage = "sale_edit_qty"; await putSession(env, uid, state);
    return say(env, chatId, "تعداد جدید را وارد کن یا قیمت را تغییر بده.", [[btn("تغییر قیمت", "sh:editprice")]]);
  }
  if (data.startsWith("sh:editqty:")) {
    state.editIndex = asInt(data.slice(11)); state.stage = "sale_edit_qty"; await putSession(env, uid, state);
    return say(env, chatId, "تعداد جدید را وارد کن.");
  }
  if (data === "sh:editprice") { state.stage = "sale_edit_price"; await putSession(env, uid, state); return say(env, chatId, "قیمت واحد جدید را وارد کن."); }
  if (data === "sh:add") { state.stage = "sale_input"; await putSession(env, uid, state); return say(env, chatId, "قلم جدید را بنویس."); }
  if (data === "sh:delete") return say(env, chatId, "کدام قلم حذف شود؟", state.items.map((x, i) => [btn("حذف " + x.name, `sh:remove:${i}`)]));
  if (data.startsWith("sh:remove:")) { state.items.splice(asInt(data.slice(10)), 1); return showInvoice(env, chatId, state); }
  if (data === "sh:pay") return say(env, chatId, "روش پرداخت را انتخاب کن:", [[btn("کارتخوان", "sh:method:card"), btn("نقد", "sh:method:cash")], [btn("کارت‌به‌کارت/انتقال", "sh:method:transfer"), btn("نسیه", "sh:method:credit")], [btn("بازگشت", "sh:invoice")]]);
  if (data.startsWith("sh:method:")) { state.paymentMethod = data.slice(10); return showInvoice(env, chatId, state); }
  if (data === "sh:invoice") return showInvoice(env, chatId, state);
  if (data.startsWith("sh:debtmethod:")) {
    state.method = data.slice(14); state.stage = "debtpay_amount"; await putSession(env, uid, state);
    return say(env, chatId, "مبلغ پرداخت‌شده را وارد کن.");
  }
  return say(env, chatId, "این دکمه معتبر نیست.");
}
