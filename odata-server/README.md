# OData API Server

Node.js + Express server that implements the OData v4 protocol, connecting Salesforce Connect to Neon PostgreSQL.

## Local Development

```bash
npm install
cp .env.example .env
# Edit .env — add your Neon DATABASE_URL
node server.js
```

Test endpoints:
```bash
curl http://localhost:4000/health
curl http://localhost:4000/
curl "http://localhost:4000/Invoices?\$top=3"
curl "http://localhost:4000/\$metadata"
```

## Render Deployment

1. Push this folder to GitHub
2. Sign up at render.com (no credit card)
3. New + → Web Service → connect your repo
4. Root Directory: `odata-server`
5. Build: `npm install` | Start: `node server.js` | Plan: Free
6. Add env var: `DATABASE_URL` = your Neon connection string
7. Deploy → get your `https://your-app.onrender.com` URL

## API Reference

| Route | Description |
|-------|-------------|
| `GET /` | Service root — OData entity discovery |
| `GET /$metadata` | XML schema — Salesforce reads this |
| `GET /Invoices` | All invoices with filtering/paging |
| `GET /Invoices(:id)` | Single invoice by ID |
| `GET /health` | Health check + record count |

### Supported OData Query Options

- `$top=N` — Return N records (max 500)
- `$skip=N` — Skip N records (for pagination)
- `$count=true` — Include total count in response
- `$orderby=field asc|desc` — Sort results
- `$filter=...` — Filter results (see below)

### Supported Filter Expressions

```
account_sf_id eq '001abc...'           String equality
status eq 'Overdue'                    String equality
amount gt 1000                         Numeric greater-than
amount lt 5000                         Numeric less-than
account_sf_id eq '001abc' and amount gt 500   Combined
```

## Important Notes

- Every response **must** include `OData-Version: 4.0` header — Salesforce rejects responses without it
- Render free tier sleeps after 15 minutes — open `/health` in browser before Salesforce Validate & Sync
- All filter values are parameterized — SQL injection safe
