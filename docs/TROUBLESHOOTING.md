# Troubleshooting Guide

## Salesforce Connect Errors

### "Unable to connect to external system"
**Cause:** The Render server is sleeping (cold start) or crashed.

**Fix:**
1. Open `https://your-app.onrender.com/health` in your browser
2. Wait for the JSON response (may take up to 30 seconds on cold start)
3. Immediately go back to Salesforce and click Validate & Sync

**Check Render logs:**
- Go to render.com → your service → Logs tab
- Look for startup errors or crash reasons

---

### "METADATA_XML_PARSE_ERROR"
**Cause:** The `/$metadata` endpoint is returning invalid XML.

**Fix:**
```bash
curl https://your-app.onrender.com/'$metadata'
# Should return well-formed XML starting with:
# <?xml version="1.0" encoding="UTF-8"?>
# <edmx:Edmx Version="4.0" ...>
```

Common causes:
- Server crash before sending response
- Extra characters before the `<?xml` declaration
- Unclosed XML tags

---

### "Invalid OData version"
**Cause:** The `OData-Version: 4.0` response header is missing.

**Fix:** Ensure every route in `server.js` includes:
```javascript
res.set('OData-Version', '4.0');
```
This header must be present on **every** response. Salesforce Connect rejects responses without it.

---

### "No entity types found"
**Cause:** The `$metadata` XML is missing the `EntityContainer` element.

**Fix:** The `$metadata` route must include both `EntityType` and `EntityContainer`:
```xml
<EntityContainer Name="InvoiceContainer">
  <EntitySet Name="Invoices" EntityType="InvoiceService.Invoice"/>
</EntityContainer>
```

---

## Salesforce Apex / Deploy Errors

### "Variable does not exist: Invoice__x"
**Cause:** Apex was deployed before the External Object was created.

**Fix:**
1. Complete Salesforce Connect setup first (Chapter 7 in the docs)
2. Verify `Invoice__x` exists: Setup → Object Manager → Invoice (External)
3. Then redeploy: `sf project deploy start --target-org devOrg`

---

### "Test coverage 0%" / Deploy fails with coverage error
**Cause:** Test class is missing or not included in the deploy.

**Fix:**
```bash
# Verify both files exist:
ls salesforce/force-app/main/default/classes/
# Should show:
#   InvoiceController.cls
#   InvoiceController.cls-meta.xml
#   InvoiceControllerTest.cls
#   InvoiceControllerTest.cls-meta.xml

# Run tests manually first:
sf apex run test --tests InvoiceControllerTest --result-format human --target-org devOrg
```

---

### Session expired during deploy
```bash
sf org login web --alias devOrg
sf project deploy start --target-org devOrg
```

---

## Component / UI Issues

### Component shows but no invoices appear
**Most likely cause:** The `account_sf_id` values in Neon don't match real Salesforce Account IDs.

**Diagnose:**
1. Get a real Account ID from Salesforce URL: `/Account/001Xx000001abcDEF/view`
2. Check if any matching rows exist in Neon:
```sql
SELECT COUNT(*) FROM invoices WHERE account_sf_id = '001Xx000001abcDEF';
-- If 0: the IDs don't match
```
3. Seed real IDs:
```sql
UPDATE invoices
SET    account_sf_id = '001Xx000001abcDEF'
WHERE  id BETWEEN 1 AND 200;
```

**Also check:**
- The Indirect Lookup External Column Name is exactly `account_sf_id` (lowercase, underscore)
- The OData server is returning the correct `account_sf_id` field in responses

---

### Infinite scroll not loading more records
**Cause:** `hasMoreRecords` flag is set to false prematurely.

**Debug in browser console:**
```javascript
// Open Salesforce, open browser DevTools → Console
// Look for any JavaScript errors from the LWC
```

**Also check:**
- `pageSize` in `accountInvoices.js` (default: 50)
- `loadMoreOffset` (default: 20px from bottom)
- Total count vs displayed count in the component

---

## Database Issues

### Neon connection timeout
**Cause:** Neon free tier pauses after 5 minutes of inactivity. First query after pause takes 1-2 seconds.

**Fix:** This is normal and automatic. No action needed — the pg library will reconnect automatically.

**For production:** Upgrade to Neon Launch ($19/mo) for always-active compute.

---

### "SSL SYSCALL error: EOF detected"
**Cause:** Missing SSL configuration.

**Fix:** Ensure your `DATABASE_URL` includes `?sslmode=require` and `server.js` has:
```javascript
ssl: { rejectUnauthorized: false }
```

---

### "too many connections"
**Cause:** Connection pool exhausted.

**Fix:** Neon's free tier allows 100 simultaneous connections. The default pool max is 10.
If you're seeing this, check that connections are being properly released (no connection leaks in the code).

---

## Local Development Issues

### Port already in use
```bash
# Find and kill the process on port 4000
lsof -ti:4000 | xargs kill -9
node server.js
```

### "DATABASE_URL not found"
```bash
# Make sure you have a .env file (not just .env.example)
cp odata-server/.env.example odata-server/.env
# Then edit .env with your actual Neon connection string
```
