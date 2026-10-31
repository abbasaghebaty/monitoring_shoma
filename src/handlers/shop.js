import { sendMessage } from "../telegram.js";
import {
  listProducts, getProduct, listOpenDebts, getDebt, getSalesSummary,
  getApproxProfit, getShortages, getCurrentStockValue,
} from "../db/shop.js";
import { formatToman } from "../utils/time.js";

const METHODS = new Set(["cash", "card", "transfer"]);
const SALE_TYPES = new Set(["cash", "card", "transfer", "mixed", "credit"]);

function makeId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let value = 0;
  for (const byte of bytes) value = value * 256 + byte;
  return value;
}

function splitFields(raw) {
  return raw.split("|").map((part) => part.trim());
}

function integer(value, label, { min = 0 } = {}) {
  if (!/^\d+$/.test(String(value ?? ""))) throw new Error(`${label} باید عدد صحیح باشد.`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min) throw new Error(`${label} نامعتبر است.`);
  return n;
}

function parseItems(raw, purchase = false) {
  if (!raw) throw new Error("فهرست اقلام خالی است.");
  return raw.split(";").map((entry) => {
    const parts = entry.split(":").map((x) => x.trim());
    const expected = purchase ? 5 : 3;
    if (parts.length !== expected) {
      throw new Error(purchase
        ? "قالب هر قلم خرید: شناسه:تعداد:قیمت‌خرید:قیمت‌فروش:قیمت‌مصرف‌کننده"
        : "قالب هر قلم فروش: شناسه:تعداد:قیمت‌واحد");
    }
    const [idRaw, qtyRaw, ...prices] = parts;
    const item = {
      productId: integer(idRaw, "شناسه محصول", { min: 1 }),
      qty: integer(qtyRaw, "تعداد", { min: 1 }),
    };
    if (purchase) {
      [item.purchasePrice, item.sellPrice, item.consumerPrice] =
        prices.map((x) => integer(x, "قیمت"));
    } else {
      item.unitPrice = integer(prices[0], "قیمت فروش");
    }
    return item;
  });
}

function parsePayments(raw, total) {
  if (!raw || raw.toLowerCase() === "credit" || raw === "0") return [];
  const entries = raw.split(";").map((x) => x.trim());
  const payments = entries.map((entry) => {
    const [method, amountRaw] = entry.split(":").map((x) => x.trim().toLowerCase());
    if (!METHODS.has(method)) throw new Error("روش پرداخت باید cash، card یا transfer باشد.");
    return { method, amount: integer(amountRaw, "مبلغ پرداخت", { min: 1 }) };
  });
  const paid = payments.reduce((sum, x) => sum + x.amount, 0);
  if (paid > total) throw new Error("مجموع پرداخت از مبلغ کل فروش بیشتر است.");
  return payments;
}

async function replyError(env, chatId, error) {
  return sendMessage(env, chatId, `⚠️ ${error?.message || "خطای نامشخص"}`);
}

export async function handleProducts({ env, chatId }) {
  const products = await listProducts(env);
  if (!products.length) return sendMessage(env, chatId, "📦 هنوز محصول فعالی ثبت نشده است.");
  const lines = products.map((p) =>
    `#${p.id} | ${p.name}\nموجودی: ${p.stock} | خرید: ${formatToman(p.purchase_price)} | فروش: ${formatToman(p.sell_price)} | مصرف‌کننده: ${formatToman(p.consumer_price)}`
  );
  return sendMessage(env, chatId, `📦 فهرست محصولات\n\n${lines.join("\n\n")}`);
}

export async function handleProductAdd({ env, chatId, args }) {
  try {
    const fields = splitFields(args.join(" "));
    if (fields.length !== 4 || !fields[0]) {
      throw new Error("قالب: /product_add نام محصول | قیمت خرید | قیمت فروش | قیمت مصرف‌کننده");
    }
    const [name, purchaseRaw, sellRaw, consumerRaw] = fields;
    const purchase = integer(purchaseRaw, "قیمت خرید");
    const sell = integer(sellRaw, "قیمت فروش");
    const consumer = integer(consumerRaw, "قیمت مصرف‌کننده");
    const result = await env.DB.prepare(
      `INSERT INTO products (name, purchase_price, sell_price, consumer_price, stock)
       VALUES (?, ?, ?, ?, 0)`
    ).bind(name, purchase, sell, consumer).run();
    return sendMessage(env, chatId, `✅ محصول «${name}» ساخته شد.\nشناسه: #${result.meta?.last_row_id ?? "—"}\nموجودی اولیه: ۰\nبرای افزایش موجودی، آن را در خرید ثبت کن.`);
  } catch (error) {
    return replyError(env, chatId, error);
  }
}

export async function handlePurchase({ env, chatId, args }) {
  try {
    const [dateRaw, supplier, itemsRaw, note = ""] = splitFields(args.join(" "));
    if (!dateRaw || !itemsRaw) throw new Error("قالب: /purchase تاریخ-میلادی-YYYY-MM-DD | تأمین‌کننده یا - | شناسه:تعداد:خرید:فروش:مصرف;... | توضیح");
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateRaw) || new Date(dateRaw + "T00:00:00Z").toISOString().slice(0, 10) !== dateRaw) {
      throw new Error("تاریخ خرید باید معتبر و با قالب YYYY-MM-DD باشد.");
    }
    const items = parseItems(itemsRaw, true);
    const products = await Promise.all(items.map((x) => getProduct(env, x.productId)));
    for (let i = 0; i < items.length; i++) {
      if (!products[i]) throw new Error(`محصول #${items[i].productId} پیدا نشد یا غیرفعال است.`);
    }
    const total = items.reduce((sum, x) => sum + x.qty * x.purchasePrice, 0);
    if (!Number.isSafeInteger(total)) throw new Error("مبلغ کل خرید بیش از حد مجاز است.");
    const purchaseId = makeId();
    const statements = [
      env.DB.prepare(
        "INSERT INTO purchases (id, supplier, purchase_date, total_amount, note) VALUES (?, ?, ?, ?, ?)"
      ).bind(purchaseId, supplier === "-" ? null : (supplier || null), dateRaw, total, note || null),
      ...items.map((x) => env.DB.prepare(
        `INSERT INTO purchase_items (purchase_id, product_id, qty, purchase_price, sell_price, consumer_price)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(purchaseId, x.productId, x.qty, x.purchasePrice, x.sellPrice, x.consumerPrice)),
    ];
    await env.DB.batch(statements);
    return sendMessage(env, chatId,
      `✅ خرید ثبت شد\nشماره خرید: #${purchaseId}\nتاریخ: ${dateRaw}\nتأمین‌کننده: ${supplier && supplier !== "-" ? supplier : "ثبت نشده"}\nتعداد اقلام: ${items.length}\n💰 جمع خرید: ${formatToman(total)}\nموجودی محصولات طبق تریگر افزایش یافت.`
    );
  } catch (error) {
    return replyError(env, chatId, error);
  }
}

export async function handleSale({ env, chatId, args }) {
  try {
    const [customerRaw, paymentRaw, itemsRaw, note = ""] = splitFields(args.join(" "));
    if (!itemsRaw) {
      throw new Error("قالب: /sale شناسه‌مشتری‌یا- | cash:مبلغ;card:مبلغ | شناسه:تعداد:قیمت;... | توضیح\nبرای فروش نسیه، بخش پرداخت را 0 بگذار.");
    }
    const items = parseItems(itemsRaw, false);
    const products = await Promise.all(items.map((x) => getProduct(env, x.productId)));
    for (let i = 0; i < items.length; i++) {
      const product = products[i];
      if (!product) throw new Error(`محصول #${items[i].productId} پیدا نشد یا غیرفعال است.`);
      if (Number(product.stock) < items[i].qty) {
        throw new Error(`موجودی «${product.name}» کافی نیست؛ موجودی فعلی: ${product.stock}`);
      }
      items[i].snapshot = Number(product.purchase_price || 0);
      items[i].lineTotal = items[i].qty * items[i].unitPrice;
      if (!Number.isSafeInteger(items[i].lineTotal)) throw new Error("مبلغ یک قلم بیش از حد مجاز است.");
    }
    const total = items.reduce((sum, x) => sum + x.lineTotal, 0);
    if (!Number.isSafeInteger(total)) throw new Error("مبلغ کل فروش بیش از حد مجاز است.");
    const payments = parsePayments(paymentRaw, total);
    const paid = payments.reduce((sum, x) => sum + x.amount, 0);
    const debt = total - paid;
    const saleType = debt === total ? "credit" : (debt > 0 || payments.length > 1 ? "mixed" : payments[0].method);
    if (!SALE_TYPES.has(saleType)) throw new Error("نوع پرداخت نامعتبر است.");
    const customerId = customerRaw && customerRaw !== "-" ? integer(customerRaw, "شناسه مشتری", { min: 1 }) : null;
    if (customerId != null) {
      const customer = await env.DB.prepare("SELECT id FROM customers WHERE id = ?").bind(customerId).first();
      if (!customer) throw new Error("شناسه مشتری پیدا نشد.");
    }
    const saleId = makeId();
    const statements = [
      env.DB.prepare(
        `INSERT INTO sales (id, customer_id, total_amount, paid_amount, debt_amount, sale_type, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(saleId, customerId, total, paid, debt, saleType, note || null),
      ...items.map((x) => env.DB.prepare(
        `INSERT INTO sale_items (sale_id, product_id, qty, unit_price, purchase_price_snapshot, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(saleId, x.productId, x.qty, x.unitPrice, x.snapshot, x.lineTotal)),
      ...payments.map((x) => env.DB.prepare(
        "INSERT INTO payments (sale_id, kind, method, amount, note) VALUES (?, 'sale', ?, ?, ?)"
      ).bind(saleId, x.method, x.amount, note || null)),
    ];
    if (debt > 0) {
      statements.push(env.DB.prepare(
        `INSERT INTO debts (sale_id, customer_id, customer_name, note, amount, paid, status)
         VALUES (?, ?, (SELECT name FROM customers WHERE id = ?), ?, ?, 0, 'open')`
      ).bind(saleId, customerId, customerId, note || null, debt));
    }
    await env.DB.batch(statements);
    const lines = items.map((x) => `#${x.productId} × ${x.qty}: ${formatToman(x.lineTotal)}`).join("\n");
    return sendMessage(env, chatId,
      `✅ فروش ثبت شد (#${saleId})\n\n${lines}\n\nجمع کل: ${formatToman(total)}\nپرداخت‌شده: ${formatToman(paid)}\n${debt ? `🔴 مانده نسیه: ${formatToman(debt)}` : "🟢 تسویه شد"}\nروش: ${saleType === "credit" ? "نسیه" : saleType === "mixed" ? "ترکیبی" : saleType}`
    );
  } catch (error) {
    return replyError(env, chatId, error);
  }
}

export async function handleDebtPayment({ env, chatId, args }) {
  try {
    const [debtRaw, methodRaw, amountRaw, note = ""] = splitFields(args.join(" "));
    const debtId = integer(debtRaw, "شناسه بدهی", { min: 1 });
    const method = (methodRaw || "").toLowerCase();
    if (!METHODS.has(method)) throw new Error("روش پرداخت: cash یا card یا transfer");
    const amount = integer(amountRaw, "مبلغ", { min: 1 });
    const debt = await getDebt(env, debtId);
    if (!debt || debt.status === "settled" || Number(debt.amount) <= Number(debt.paid)) {
      throw new Error("بدهی باز با این شناسه پیدا نشد.");
    }
    if (amount > Number(debt.amount) - Number(debt.paid)) throw new Error("مبلغ از مانده بدهی بیشتر است.");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO payments (debt_id, kind, method, amount, note) VALUES (?, 'debt_payment', ?, ?, ?)"
      ).bind(debtId, method, amount, note || null),
    ]);
    return sendMessage(env, chatId, `✅ پرداخت بدهی #${debtId} ثبت شد.\nمبلغ: ${formatToman(amount)}\nمانده قبلی: ${formatToman(Number(debt.amount) - Number(debt.paid))}\nتریگر دیتابیس وضعیت بدهی را به‌روزرسانی کرد.`);
  } catch (error) {
    return replyError(env, chatId, error);
  }
}

export async function handleReports({ env, chatId }) {
  try {
    const tz = env.TIMEZONE || "Asia/Tehran";
    const now = new Date();
    const localParts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (type) => localParts.find((x) => x.type === type)?.value;
    const today = `${get("year")}-${get("month")}-${get("day")}`;
    const todayStart = localStart(today, tz);
    const weekday = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now) === "Sat" ? 0 : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now) === "Sun" ? 1 : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now) === "Mon" ? 2 : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now) === "Tue" ? 3 : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now) === "Wed" ? 4 : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now) === "Thu" ? 5 : 6);
    const weekDate = new Date(today + "T12:00:00Z"); weekDate.setUTCDate(weekDate.getUTCDate() - weekday);
    const monthDate = new Date(today + "T12:00:00Z"); monthDate.setUTCDate(1);
    const weekStart = localStart(weekDate.toISOString().slice(0, 10), tz);
    const monthStart = localStart(monthDate.toISOString().slice(0, 10), tz);
    const [stock, todaySummary, weekSummary, monthSummary, todayProfit, weekProfit, monthProfit, debts, shortages] = await Promise.all([
      getCurrentStockValue(env),
      getSalesSummary(env, todayStart),
      getSalesSummary(env, weekStart),
      getSalesSummary(env, monthStart),
      getApproxProfit(env, todayStart),
      getApproxProfit(env, weekStart),
      getApproxProfit(env, monthStart),
      listOpenDebts(env),
      getShortages(env),
    ]);
    const summaryText = (label, s, profit) => {
      const methods = Object.fromEntries((s.methods || []).map((x) => [x.method, Number(x.amount)]));
      return `📅 ${label}: ${formatToman(s.total)} در ${s.sale_count} فاکتور\n  نقد: ${formatToman(methods.cash || 0)} | کارت: ${formatToman(methods.card || 0)} | انتقال: ${formatToman(methods.transfer || 0)} | نسیه: ${formatToman(s.credit_total)}\n  سود تقریبی: ${formatToman(profit)}`;
    };
    const debtText = debts.length
      ? debts.slice(0, 20).map((d) => `#${d.id} ${d.customer_name || "مشتری نامشخص"}: ${formatToman(Number(d.remaining))}`).join("\n")
      : "بدهی بازی وجود ندارد.";
    const shortageText = shortages.length
      ? shortages.slice(0, 20).map((s) => `#${s.id} ${s.product_name} — ${s.reason === "sold_out" ? "اتمام موجودی" : "درخواست مشتری"}`).join("\n")
      : "کسری بازی وجود ندارد.";
    return sendMessage(env, chatId,
      `📊 گزارش مالی و انبار\n\n📦 موجودی: ${stock.product_count} محصول فعال، ${stock.unit_count} واحد\n\n${summaryText("امروز", todaySummary, todayProfit)}\n\n${summaryText("این هفته", weekSummary, weekProfit)}\n\n${summaryText("این ماه", monthSummary, monthProfit)}\n\n👤 بدهکاران:\n${debtText}\n\n⚠️ کسری‌ها:\n${shortageText}`
    );
  } catch (error) {
    return replyError(env, chatId, error);
  }
}

function localStart(dayKey, tz) {
  const guess = new Date(dayKey + "T00:00:00.000Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(guess);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const offset = Date.UTC(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute, +values.second) - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}


export async function handleCustomerAdd({ env, chatId, args }) {
  try {
    const [name, phone = "", note = ""] = splitFields(args.join(" "));
    if (!name) throw new Error("قالب: /customer_add نام مشتری | تلفن | توضیح");
    const result = await env.DB.prepare(
      "INSERT INTO customers (name, phone, note) VALUES (?, ?, ?)"
    ).bind(name, phone || null, note || null).run();
    return sendMessage(env, chatId, `✅ مشتری «${name}» ثبت شد. شناسه: #${result.meta?.last_row_id ?? "—"}`);
  } catch (error) {
    return replyError(env, chatId, error);
  }
}

export async function handleCustomers({ env, chatId }) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, phone FROM customers ORDER BY name COLLATE NOCASE LIMIT 50"
  ).all();
  const lines = (results || []).map((x) => `#${x.id} ${x.name}${x.phone ? ` — ${x.phone}` : ""}`);
  return sendMessage(env, chatId, lines.length ? `👥 مشتریان\n\n${lines.join("\n")}` : "هنوز مشتری ثبت نشده است.");
}

export async function handleShortage({ env, chatId, args }) {
  try {
    const [productRaw, reasonRaw, note = ""] = splitFields(args.join(" "));
    const productId = integer(productRaw, "شناسه محصول", { min: 1 });
    const reason = (reasonRaw || "").toLowerCase();
    if (!["customer_request", "sold_out"].includes(reason)) {
      throw new Error("دلیل باید customer_request یا sold_out باشد.");
    }
    const product = await getProduct(env, productId);
    if (!product) throw new Error("محصول پیدا نشد.");
    await env.DB.prepare(
      "INSERT INTO shortages (product_id, product_name, reason, note) VALUES (?, ?, ?, ?)"
    ).bind(productId, product.name, reason, note || null).run();
    return sendMessage(env, chatId, `✅ کسری «${product.name}» ثبت شد.`);
  } catch (error) {
    return replyError(env, chatId, error);
  }
}

export async function handlePriceUpdate({ env, chatId, args }) {
  try {
    const [idRaw, sellRaw, consumerRaw] = splitFields(args.join(" "));
    const id = integer(idRaw, "شناسه محصول", { min: 1 });
    const sell = integer(sellRaw, "قیمت فروش");
    const consumer = integer(consumerRaw, "قیمت مصرف‌کننده");
    const product = await getProduct(env, id);
    if (!product) throw new Error("محصول پیدا نشد.");
    await env.DB.prepare(
      "UPDATE products SET sell_price = ?, consumer_price = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(sell, consumer, id).run();
    return sendMessage(env, chatId, `✅ قیمت «${product.name}» به‌روزرسانی شد.\nفروش: ${formatToman(sell)}\nمصرف‌کننده: ${formatToman(consumer)}`);
  } catch (error) {
    return replyError(env, chatId, error);
  }
}
