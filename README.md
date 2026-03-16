# ⚡ Zero-Copy Big Data Harmonization & Virtualization

<div align="center">

![Zero Copy Architecture](https://img.shields.io/badge/Architecture-Zero--Copy-10B981?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMyAyLjA1djIuMDJjMy45NS41NCA3IDMuOTkgNyA4LjFzLTMuMDUgNy41Ni03IDguMXYyLjAyYzUuMDUtLjU1IDktNC41NyA5LTEwLjEyUzE4LjA1IDIuNiAxMyAyLjA1ek0xMSAyLjA1QzUuOTUgMi42IDIgNi42MiAyIDEyLjE3czMuOTUgOS41NyA5IDEwLjEyVjIwLjFjLTMuOTUtLjU0LTctMy45OS03LTguMXMzLjA1LTcuNTYgNy04LjF2LTIuMDJ6Ii8+PC9zdmc+)
![Salesforce](https://img.shields.io/badge/Salesforce-Connect-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-OData_v4_Server-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/Neon-PostgreSQL-3ECF8E?style=for-the-badge&logo=postgresql&logoColor=white)
![Render](https://img.shields.io/badge/Render-Free_Hosting-46E3B7?style=for-the-badge&logo=render&logoColor=white)

<br/>

![Records](https://img.shields.io/badge/Records-500%2C000-10B981?style=flat-square)
![Storage Cost](https://img.shields.io/badge/Salesforce_Storage_Cost-%240-10B981?style=flat-square)
![Infrastructure Cost](https://img.shields.io/badge/Infrastructure_Cost-%240%2Fmonth-10B981?style=flat-square)
![Credit Card](https://img.shields.io/badge/Credit_Card_Required-None-10B981?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

</div>

---

## 📌 What Is This?

This project demonstrates a **production-grade zero-copy integration** between Salesforce and an external PostgreSQL database. Instead of copying 500,000 invoice records *into* Salesforce (which costs money and goes stale), Salesforce **queries them live** — in real-time — without storing a single byte.

> **"I designed a scalable integration architecture that lets Salesforce interact with 500,000 external invoice records in real-time, without consuming a single byte of Salesforce storage and with zero risk of governor limit breaches."**

### The Problem It Solves

| Approach | Storage Cost | Data Freshness | Complexity | Governor Risk |
|----------|-------------|----------------|------------|---------------|
| ❌ Traditional ETL | ~$4,000/yr | Hours/days stale | High — sync jobs, pipelines | High — bulk DML |
| ✅ **This project** | **$0** | **Real-time** | **Low — stateless API** | **Near zero** |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SALESFORCE                               │
│                                                                 │
│   Account Page                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  Lightning Web Component (accountInvoices)               │  │
│   │  • Stat cards: Total / Paid / Pending / Overdue          │  │
│   │  • Filterable datatable with infinite scroll             │  │
│   └────────────────────┬─────────────────────────────────────┘  │
│                        │ @wire Apex calls (Promise.all)          │
│   ┌────────────────────▼─────────────────────────────────────┐  │
│   │  Apex Controller (InvoiceController.cls)                 │  │
│   │  • SOQL against Invoice__x External Object               │  │
│   └────────────────────┬─────────────────────────────────────┘  │
│                        │ SOQL → OData translation               │
│   ┌────────────────────▼─────────────────────────────────────┐  │
│   │  Salesforce Connect (OData 4.0 External Data Source)     │  │
│   │  • Indirect Lookup: Invoice.account_sf_id → Account.Id  │  │
│   └────────────────────┬─────────────────────────────────────┘  │
└────────────────────────┼────────────────────────────────────────┘
                         │ HTTPS OData v4 GET request
                         ▼
┌────────────────────────────────────────────────────────────────┐
│              OData API Server  (Render.com — Free)             │
│  Node.js + Express                                             │
│  • GET /              → Service discovery                      │
│  • GET /$metadata     → XML schema (creates Invoice__x)        │
│  • GET /Invoices      → $filter, $top, $skip, $count, $orderby │
│  • GET /Invoices(:id) → Single record                          │
│  • GET /health        → Status + record count                  │
└────────────────────────┬───────────────────────────────────────┘
                         │ Parameterized SQL
                         ▼
┌────────────────────────────────────────────────────────────────┐
│            Neon PostgreSQL Database  (Free — 3 GB)             │
│                                                                │
│  invoices table  (500,000 rows)                                │
│  • idx_account_sf_id   → primary lookup  (~3ms)               │
│  • idx_status          → filter queries                       │
│  • idx_account_status  → composite (account + status)         │
└────────────────────────────────────────────────────────────────┘
```

### Data Flow (10 Steps)

1. Sales rep opens an Account record in Salesforce
2. LWC mounts → calls two Apex methods in parallel via `Promise.all`
3. Apex executes SOQL: `SELECT ... FROM Invoice__x WHERE account_sf_id__c = :accountId`
4. Salesforce Connect translates SOQL → OData HTTP GET
5. Request hits Node.js server on Render: `GET /Invoices?$filter=account_sf_id eq '001abc...'`
6. Server parses `$filter` → builds parameterized SQL
7. Neon PostgreSQL runs the query using `idx_account_sf_id` → returns rows in ~3ms
8. Server wraps rows in OData JSON format → returns HTTP response
9. Salesforce Connect deserializes → returns as `Invoice__x` SObjects to Apex
10. LWC renders the data table — **data never left Neon**

---

## 📁 Repository Structure

```
zerocopy-salesforce/
│
├── 📄 README.md                          ← You are here
├── 📄 LICENSE
├── 📄 .gitignore
│
├── 📂 odata-server/                      ← Node.js OData API (deploy to Render)
│   ├── 📄 server.js                      ← Main OData server (5 routes)
│   ├── 📄 package.json
│   ├── 📄 .env.example                   ← Environment variable template
│   ├── 📄 .gitignore
│   └── 📄 README.md                      ← Render deployment guide
│
├── 📂 data-generator/                    ← Python script to populate Neon DB
│   ├── 📄 generate_invoices.py           ← Generates 500k realistic records
│   ├── 📄 requirements.txt
│   ├── 📄 .env.example
│   └── 📄 README.md                      ← How to run the generator
│
├── 📂 salesforce/                        ← Salesforce DX project
│   ├── 📄 sfdx-project.json
│   ├── 📄 .forceignore
│   └── 📂 force-app/main/default/
│       ├── 📂 classes/
│       │   ├── 📄 InvoiceController.cls           ← Apex controller
│       │   ├── 📄 InvoiceController.cls-meta.xml
│       │   ├── 📄 InvoiceControllerTest.cls        ← Test class (4 tests)
│       │   └── 📄 InvoiceControllerTest.cls-meta.xml
│       └── 📂 lwc/accountInvoices/
│           ├── 📄 accountInvoices.html             ← Component template
│           ├── 📄 accountInvoices.js               ← Controller logic
│           ├── 📄 accountInvoices.css              ← Summary card styles
│           └── 📄 accountInvoices.js-meta.xml      ← Target: Account record page
│
├── 📂 docs/                              ← Documentation & diagrams
│   ├── 📄 ARCHITECTURE.md               ← Deep-dive architecture notes
│   ├── 📄 SETUP.md                      ← Complete step-by-step setup
│   ├── 📄 TROUBLESHOOTING.md            ← Common errors & fixes
│   └── 📄 BUSINESS_CASE.md             ← ROI & cost analysis
│
└── 📂 .github/
    └── 📂 workflows/
        └── 📄 deploy.yml                ← Auto-deploy to Render on push
```

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Python | 3.9+ | [python.org](https://python.org) |
| Git | Any | [git-scm.com](https://git-scm.com) |
| Salesforce CLI | Latest | `npm install -g @salesforce/cli` |
| Neon account | Free | [neon.tech](https://neon.tech) — no credit card |
| Render account | Free | [render.com](https://render.com) — no credit card |
| Salesforce Dev Org | Free | [developer.salesforce.com/signup](https://developer.salesforce.com/signup) |

### Step 1 — Clone the Repo

```bash
git clone https://github.com/YOUR_USERNAME/zerocopy-salesforce.git
cd zerocopy-salesforce
```

### Step 2 — Set Up Neon Database

1. Sign up at [neon.tech](https://neon.tech) with GitHub (no credit card)
2. Create a project → copy the **Connection String**
3. Open the **SQL Editor** in Neon dashboard and run:

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
```

### Step 3 — Generate 500k Records

```bash
cd data-generator
pip3 install -r requirements.txt
cp .env.example .env
# Edit .env — paste your Neon DATABASE_URL
python3 generate_invoices.py
```

Expected output:
```
Connecting to Neon PostgreSQL...
Generating 500,000 records in batches of 1,000...
    50,000 / 500,000  |  1847 rec/sec
   100,000 / 500,000  |  1891 rec/sec
   ...
Done! 500,000 records inserted into Neon.
```

### Step 4 — Deploy OData Server to Render

```bash
cd odata-server
cp .env.example .env
# Edit .env — paste your Neon DATABASE_URL
```

1. Push to GitHub: `git push origin main`
2. Sign up at [render.com](https://render.com) with GitHub
3. **New +** → **Web Service** → connect this repo → select `odata-server` folder
4. Settings: Runtime=**Node**, Build=`npm install`, Start=`node server.js`, Plan=**Free**
5. Add env var: `DATABASE_URL` = your Neon connection string
6. Click **Create Web Service** — deploys in ~2 minutes

Verify:
```bash
curl https://YOUR-APP.onrender.com/health
# {"status":"healthy","database":"Neon PostgreSQL","totalInvoices":500000}
```

> ⚠️ **Cold Start Warning:** Render free tier sleeps after 15 minutes idle. Open `/health` in your browser to wake the server **before** running Salesforce Validate & Sync.

### Step 5 — Configure Salesforce Connect

In **Salesforce Setup → External Data Sources → New**:

| Field | Value |
|-------|-------|
| Type | Salesforce Connect: OData 4.0 |
| URL | `https://YOUR-APP.onrender.com/` |
| High Data Volume | ✅ Checked |
| Request Timeout | `30000` |
| Authentication | No Authentication |

Click **Save → Validate and Sync → check Invoice → Sync**

Then create the **Indirect Lookup Relationship**:
- Object Manager → Invoice (External) → Fields → New
- Type: **Indirect Lookup Relationship** → Account → Account ID
- External Column: `account_sf_id`

### Step 6 — Deploy Salesforce Code

```bash
cd salesforce
sf org login web --alias devOrg
sf project deploy start --target-org devOrg
sf apex run test --tests InvoiceControllerTest --target-org devOrg
```

### Step 7 — Add Component to Account Page

1. Open any Account record → **⚙️ Edit Page**
2. Drag **Account Invoices** component onto the page
3. **Save → Activate → Assign as Org Default**

### Step 8 — Seed Real Account IDs

In the Neon SQL editor, link some invoices to real Salesforce Account IDs:

```sql
-- Get IDs from Salesforce Account record URLs
-- URL: /Account/001Xx000001abcDEF/view  →  ID is: 001Xx000001abcDEF
UPDATE invoices
SET    account_sf_id = 'YOUR_REAL_SF_ACCOUNT_ID'
WHERE  id BETWEEN 1 AND 500;
```

Now open that Account in Salesforce — invoices appear instantly! 🎉

---

## 🧩 Component Details

### OData API Server (`odata-server/`)

The Node.js server speaks OData v4 to Salesforce and SQL to Neon.

| Route | Purpose |
|-------|---------|
| `GET /` | Service root — entity discovery |
| `GET /$metadata` | XML schema — Salesforce reads this to auto-create `Invoice__x` |
| `GET /Invoices` | Main query: supports `$filter`, `$top`, `$skip`, `$count`, `$orderby` |
| `GET /Invoices(:id)` | Single record lookup |
| `GET /health` | Health check + live record count |

**OData → SQL translation example:**
```
Salesforce sends:  GET /Invoices?$filter=account_sf_id eq '001abc'&$top=50&$skip=0&$count=true
Server produces:   SELECT ... FROM invoices WHERE account_sf_id = $1 ORDER BY created_at DESC OFFSET 0 LIMIT 50
                   SELECT COUNT(*) FROM invoices WHERE account_sf_id = $1
```

### Apex Controller (`InvoiceController.cls`)

| Method | Returns | Purpose |
|--------|---------|---------|
| `getAccountInvoices()` | `InvoiceResult` wrapper | Paginated invoice list + total count |
| `getStatusSummary()` | `Map<String, Object>` | Counts & amounts by status for stat cards |

Both methods use dynamic SOQL against `Invoice__x` with bind variables — SQL-injection safe.

### Lightning Web Component (`accountInvoices`)

| Feature | Implementation |
|---------|---------------|
| Parallel loading | `Promise.all([getStatusSummary, getAccountInvoices])` — cuts load time ~50% |
| Summary cards | 4 cards: Total / Paid / Pending / Overdue |
| Status filter | `lightning-combobox` → re-queries on change |
| Sortable table | `lightning-datatable` with `onsort` handler |
| Infinite scroll | `enable-infinite-loading` + `onloadmore` event |
| Refresh | Button → `ShowToastEvent` confirmation |
| Error state | Graceful error display with `slds-notify` |

---

## 🗄️ Database Schema

```sql
CREATE TABLE invoices (
    id            SERIAL PRIMARY KEY,         -- Auto-increment integer
    invoice_no    VARCHAR(20)   NOT NULL,      -- INV-000001 format
    account_sf_id VARCHAR(18),                 -- 18-char Salesforce Account ID
    customer_name VARCHAR(200),
    amount        DECIMAL(12,2) NOT NULL,      -- DECIMAL not FLOAT (money precision)
    status        VARCHAR(20)   DEFAULT 'Pending', -- Pending/Paid/Overdue/Cancelled
    due_date      DATE,
    description   TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
);
```

**Record distribution (500k rows):**
| Status | Weight | Count |
|--------|--------|-------|
| Pending | 40% | ~200,000 |
| Paid | 35% | ~175,000 |
| Overdue | 18% | ~90,000 |
| Cancelled | 7% | ~35,000 |

---

## 💰 Business Impact

| Metric | ETL Approach | Zero-Copy |
|--------|-------------|-----------|
| Salesforce storage cost | ~$4,000/year | **$0** |
| Data freshness | Hours/days stale | **Real-time** |
| Infrastructure | ETL servers + schedulers | **Single stateless API** |
| Governor limit risk | High (bulk DML) | **Near zero (read-only, paged)** |
| GDPR compliance | Harder (data in 2 systems) | **Simpler (single source)** |
| Scale to 5M records | Sync time grows | **Constant performance** |

---

## 🔧 Environment Variables

### `odata-server/.env`
```env
DATABASE_URL=postgres://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
PORT=3000
```

### `data-generator/.env`
```env
DATABASE_URL=postgres://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
TOTAL_RECORDS=500000
BATCH_SIZE=1000
```

---

## 🐛 Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| Validate & Sync times out | Render cold start | Open `/health` URL in browser first to wake server |
| `METADATA_XML_PARSE_ERROR` | Invalid `$metadata` XML | Run `curl your-url/$metadata` and check XML is valid |
| `Invoice__x` not found in Apex | External Object not created yet | Complete Salesforce Connect setup before deploying Apex |
| No invoices showing | `account_sf_id` mismatch | Seed real Salesforce Account IDs into Neon |
| SSL connection error | Missing `sslmode` | Ensure `?sslmode=require` is in `DATABASE_URL` |
| Render 503 error | Cold start or crash | Check Render logs dashboard |

Full troubleshooting guide: [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)

---

## 🛣️ Roadmap

- [ ] Named Credentials for authenticated OData endpoint
- [ ] Redis cache layer for summary statistics (5-min TTL)
- [ ] Write-back via Apex Callouts (create/update invoices from Salesforce)
- [ ] PDF invoice attachment links in LWC
- [ ] UptimeRobot pinger to prevent Render cold starts
- [ ] GitHub Actions auto-deploy workflow
- [ ] Bulk CSV export from LWC

---

## 🧑‍💻 Tech Stack

| Layer | Technology | Version | Hosting |
|-------|-----------|---------|---------|
| Database | PostgreSQL | 16 | Neon.tech (Free, 3GB) |
| API Server | Node.js + Express | 18+ | Render.com (Free) |
| Integration | Salesforce Connect OData 4.0 | — | Salesforce |
| Backend Logic | Apex | API v60 | Salesforce Dev Org |
| Frontend | Lightning Web Components | — | Salesforce |
| Data Generation | Python + Faker | 3.9+ | Local |

---

## 📚 Further Reading

- [Salesforce Connect OData 4.0 Documentation](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/platform_connect_about.htm)
- [OData v4 Protocol Specification](https://docs.oasis-open.org/odata/odata/v4.0/odata-v4.0-part1-protocol.html)
- [Neon PostgreSQL Documentation](https://neon.tech/docs)
- [Render.com Node.js Deploy Guide](https://render.com/docs/deploy-node-express-app)
- [LWC Developer Guide](https://developer.salesforce.com/docs/component-library/documentation/en/lwc)

---

## 📄 License

MIT License — see [`LICENSE`](LICENSE) for details.

---

<div align="center">

**Built with zero infrastructure cost. Runs on free-tier services. No credit card required.**

[![Neon](https://img.shields.io/badge/DB-Neon.tech-3ECF8E?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech)
[![Render](https://img.shields.io/badge/Host-Render.com-46E3B7?style=flat-square&logo=render&logoColor=white)](https://render.com)
[![Salesforce](https://img.shields.io/badge/CRM-Salesforce-00A1E0?style=flat-square&logo=salesforce&logoColor=white)](https://developer.salesforce.com)

</div>
# updated
