# Complete Setup Guide

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Python | 3.9+ | [python.org](https://python.org) |
| Git | Any | [git-scm.com](https://git-scm.com) |
| Salesforce CLI | Latest | `npm install -g @salesforce/cli` |

**Free accounts needed (no credit card):**
- [neon.tech](https://neon.tech) — PostgreSQL database
- [render.com](https://render.com) — Node.js hosting
- [developer.salesforce.com/signup](https://developer.salesforce.com/signup) — Salesforce Developer Org

---

## Phase 1 — Database (Neon)

### 1.1 Create Neon account and project
1. Go to [neon.tech](https://neon.tech) → **Sign Up** with GitHub
2. Click **Create a project** → name it `invoice-project`
3. Choose region closest to you → **Create project**
4. Go to **Connection Details** → copy the **Connection string**
   - It looks like: `postgres://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require`
5. Save this — it is your `DATABASE_URL`

### 1.2 Create the table and indexes
Open the **SQL Editor** tab in the Neon dashboard and run:

```sql
CREATE TABLE invoices (
    id            SERIAL PRIMARY KEY,
    invoice_no    VARCHAR(20)   NOT NULL,
    account_sf_id VARCHAR(18),
    customer_name VARCHAR(200),
    amount        DECIMAL(12,2) NOT NULL,
    status        VARCHAR(20)   DEFAULT 'Pending',
    due_date      DATE,
    description   TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_account_sf_id  ON invoices (account_sf_id);
CREATE INDEX idx_status         ON invoices (status);
CREATE INDEX idx_due_date       ON invoices (due_date);
CREATE INDEX idx_account_status ON invoices (account_sf_id, status);

-- Verify
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

---

## Phase 2 — Data Generation

### 2.1 Install dependencies
```bash
cd data-generator
pip3 install -r requirements.txt
cp .env.example .env
```

### 2.2 Edit .env
```env
DATABASE_URL=postgres://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
TOTAL_RECORDS=500000
BATCH_SIZE=1000
```

### 2.3 Run the generator
```bash
python3 generate_invoices.py
# Takes ~4-5 minutes. Shows progress every 50k records.
```

### 2.4 Verify
In the Neon SQL Editor:
```sql
SELECT COUNT(*) FROM invoices;
-- Expected: 500000

SELECT status, COUNT(*) FROM invoices GROUP BY status;
```

---

## Phase 3 — OData API Server (Render)

### 3.1 Local test first
```bash
cd odata-server
npm install
cp .env.example .env
# Edit .env with your Neon DATABASE_URL
node server.js
```

Test:
```bash
curl http://localhost:3000/health
# {"status":"healthy","database":"Neon PostgreSQL","totalInvoices":500000}
curl "http://localhost:3000/Invoices?\$top=2"
curl http://localhost:3000/'$metadata'
```

### 3.2 Push to GitHub
```bash
# From the repo root
git add .
git commit -m "Initial commit"
git push origin main
```

### 3.3 Deploy to Render
1. Go to [render.com](https://render.com) → Sign up with GitHub
2. **New +** → **Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Root Directory:** `odata-server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. **Environment Variables** → Add:
   - Key: `DATABASE_URL` → Value: your Neon connection string
6. Click **Create Web Service**
7. Wait ~2 minutes → your URL: `https://your-app-name.onrender.com`

### 3.4 Verify deployment
```bash
curl https://your-app-name.onrender.com/health
# {"status":"healthy","database":"Neon PostgreSQL","totalInvoices":500000}
```

> ⚠️ **Important:** Render free tier sleeps after 15 minutes idle. Before the Salesforce setup steps, open your `/health` URL in a browser tab and wait for it to respond. Then immediately proceed to Phase 4.

---

## Phase 4 — Salesforce Connect

### 4.1 Create External Data Source
1. In Salesforce: **Setup** → Quick Find: `External Data Sources` → **New**
2. Fill in:

| Field | Value |
|-------|-------|
| Label | `Invoice OData DB` |
| Type | `Salesforce Connect: OData 4.0` |
| URL | `https://your-app-name.onrender.com/` (trailing slash required) |
| High Data Volume | ✅ Checked |
| Request Timeout | `30000` |
| Authentication | No Authentication |

3. **Save**
4. **Validate and Sync**
5. Check **Invoice** → **Sync**
6. ✅ `Invoice__x` External Object is created automatically

### 4.2 Create Indirect Lookup Relationship
1. **Setup** → **Object Manager** → **Invoice** (External) → **Fields & Relationships** → **New**
2. Select: **Indirect Lookup Relationship** → Next
3. Related To: **Account** | Field: **Account ID**
4. External Column Name: `account_sf_id`
5. Field Label: `Account` → Next → Next → **Save**

---

## Phase 5 — Salesforce Code Deployment

### 5.1 Authenticate CLI
```bash
cd salesforce
sf org login web --alias devOrg --instance-url https://login.salesforce.com
```

### 5.2 Deploy
```bash
sf project deploy start --target-org devOrg
```

### 5.3 Run tests
```bash
sf apex run test --tests InvoiceControllerTest --result-format human --target-org devOrg
# All 6 tests should pass
```

---

## Phase 6 — Account Page Setup

### 6.1 Add component to Account page
1. Open any Account record in Salesforce
2. Click **⚙️** → **Edit Page**
3. In Lightning App Builder, search `Account Invoices` in the left panel
4. Drag onto the page layout
5. **Save** → **Activate** → **Assign as Org Default** → **Save**

### 6.2 Seed real Salesforce Account IDs
1. Open an Account record → copy the 18-char ID from the URL
   - URL: `/Account/001Xx000001abcDEF/view` → ID: `001Xx000001abcDEF`
2. In Neon SQL Editor:
```sql
UPDATE invoices
SET    account_sf_id = '001Xx000001abcDEF'  -- Replace with your real ID
WHERE  id BETWEEN 1 AND 300;

-- Add more accounts as needed
UPDATE invoices
SET    account_sf_id = 'YOUR_SECOND_ACCOUNT_ID'
WHERE  id BETWEEN 301 AND 600;
```

### 6.3 Verify everything works
1. Open the Account whose ID you seeded above
2. Scroll to the **External Invoices (Zero-Copy)** card
3. Invoices should load — real-time from Neon PostgreSQL 🎉

---

## Quick Commands Reference

```bash
# Generate data
cd data-generator && python3 generate_invoices.py

# Run OData server locally
cd odata-server && node server.js

# Deploy to Salesforce
cd salesforce && sf project deploy start --target-org devOrg

# Run Apex tests
sf apex run test --tests InvoiceControllerTest --result-format human --target-org devOrg

# Check Render server health
curl https://your-app.onrender.com/health

# Verify record count in Neon
# (use Neon SQL Editor or psql "YOUR_DATABASE_URL")
# SELECT COUNT(*) FROM invoices;
```
