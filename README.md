# Monitoring Shoma

Telegram attendance bot deployed on Cloudflare Workers with D1.

## Roles
- Owner: mother (Telegram ID configured as OWNER_ID). Management, reports and charts only.
- Employees: Abbas, Sadegh and both father's Telegram accounts. Each can only register their own check-in/check-out and view their own status.

## Deploy
1. Configure the Telegram bot token:
   - `npx wrangler secret put BOT_TOKEN`
2. Ensure the D1 database has been initialized with `schema.sql`:
   - `npx wrangler d1 execute shop-manager --remote --file=./schema.sql`
3. Deploy:
   - `npx wrangler deploy`

Webhook secret validation is disabled. Telegram webhook requests are accepted without the `X-Telegram-Bot-Api-Secret-Token` header.

## Owner commands
- `/report`: today's attendance totals
- `/weekly`: last seven days
- `/chart`: text bar chart for last seven days
- `/users`: registered users
- `/adduser <telegram_id> <name>`: add an employee


## ماژول فروش و انبار

کدهای فروش و انبار از جدول‌ها و تریگرهای مالی موجود استفاده می‌کنند و هیچ migration یا جدول جدیدی اجرا نمی‌کنند. تنظیم `ADMIN_IDS` در `wrangler.toml` فهرست آیدی‌های مدیران مالی است (با کاما جدا شود).

### دستورات مالی
- `/products`: فهرست محصولات و موجودی
- `/product_add نام | قیمت خرید | قیمت فروش | قیمت مصرف‌کننده`: ساخت محصول با موجودی صفر
- `/purchase تأمین‌کننده | شناسه:تعداد:خرید:فروش:مصرف;... | توضیح`: خرید چندقلمی؛ جمع مبلغ خودکار و افزایش موجودی با تریگر موجود
- `/sale شناسه مشتری یا - | cash:مبلغ;card:مبلغ | شناسه:تعداد:قیمت;... | توضیح`: فروش چندقلمی؛ پرداخت ترکیبی با جداکردن روش‌ها به کمک `;`
- `/sale - | 0 | شناسه:تعداد:قیمت | توضیح`: فروش نسیه کامل
- `/debtpay شناسه بدهی | cash/card/transfer | مبلغ | توضیح`: ثبت وصول بدهی
- `/price شناسه محصول | قیمت فروش | قیمت مصرف‌کننده`: تغییر قیمت
- `/inventory_report`: موجودی، فروش امروز/هفته/ماه، تفکیک پرداخت نقد/کارت/انتقال/نسیه، سود تقریبی، بدهکاران و کسری‌ها

قیمت‌ها عدد صحیح تومان هستند. شناسه محصول از `/products` و شناسه بدهی از گزارش مالی قابل مشاهده است. شناسه مشتری در این نسخه باید از قبل در جدول `customers` وجود داشته باشد.

ثبت خرید و اقلام آن در یک `DB.batch()` و ثبت فروش، اقلام، پرداخت‌ها و بدهی در یک `DB.batch()` انجام می‌شود. همه ورودی‌های SQL با bind ارسال می‌شوند. Worker هیچ جدول یا تریگری ایجاد یا تغییر نمی‌دهد.
