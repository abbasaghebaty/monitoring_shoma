# Monitoring Shoma

Telegram attendance bot deployed on Cloudflare Workers with D1.

## Roles
- Owner: mother (Telegram ID configured as OWNER_ID). Management, reports and charts only.
- Employees: Abbas, Sadegh and both father's Telegram accounts. Each can only register their own check-in/check-out and view their own status.

## Deploy
1. Configure secrets:
   - `npx wrangler secret put BOT_TOKEN`
   - `npx wrangler secret put WEBHOOK_SECRET`
2. Ensure the D1 database has been initialized with `schema.sql`:
   - `npx wrangler d1 execute shop-manager --remote --file=./schema.sql`
3. Deploy:
   - `npx wrangler deploy`

## Owner commands
- `/report`: today's attendance totals
- `/weekly`: last seven days
- `/chart`: text bar chart for last seven days
- `/users`: registered users
- `/adduser <telegram_id> <name>`: add an employee
