# Architecture Deep-Dive

## The Zero-Copy Principle

Traditional Salesforce integrations **copy** external data into Salesforce objects. This project uses **data virtualization** — Salesforce queries the data live, on-demand, without ever storing it.

```
Traditional ETL:                    Zero-Copy (This Project):

External DB                         External DB (Neon)
    │                                   │
    │ copy all records                  │ query on demand only
    ▼                                   │ (no data moves)
Salesforce Storage                      │
    │ (costs $$$/year)              OData API (Render)
    │                                   │
    ▼                               Salesforce Connect
  LWC shows stale data                  │
                                    LWC shows live data
```

## Why OData v4?

Salesforce Connect natively understands [OData v4](https://docs.oasis-open.org/odata/odata/v4.0/odata-v4.0-part1-protocol.html) — the OASIS standard for RESTful data APIs. By implementing an OData v4 server, we make our Neon PostgreSQL database appear to Salesforce as a first-class queryable entity, with no Salesforce-specific SDK needed.

## The $metadata Contract

The most important endpoint is `GET /$metadata`. It returns an XML document (EDMX format) that describes:
- Entity types (Invoice) and their properties
- Property data types (Edm.String, Edm.Decimal, Edm.Date, etc.)
- The entity container

Salesforce Connect reads this XML exactly **once** (during Validate & Sync) and uses it to create the `Invoice__x` External Object with all the correct field types. This is the "schema synchronization" step.

```xml
<!-- Salesforce reads this and creates Invoice__x with matching fields -->
<EntityType Name="Invoice">
  <Property Name="invoice_no"    Type="Edm.String"  MaxLength="20"/>
  <Property Name="amount"        Type="Edm.Decimal" Precision="12" Scale="2"/>
  <Property Name="status"        Type="Edm.String"  MaxLength="20"/>
  ...
</EntityType>
```

## The Indirect Lookup Relationship

Standard Salesforce lookups match by Salesforce Record ID. External Objects use **Indirect Lookups** that match by field value instead.

Our indirect lookup:
- **Source field:** `Invoice__x.account_sf_id__c` (stored in Neon as `account_sf_id`)
- **Target field:** `Account.Id` (the 18-char Salesforce Account ID)

When you open Account `001abc...`, Salesforce automatically queries:
```
Invoice__x WHERE account_sf_id__c = '001abc...'
```
Which Salesforce Connect translates to:
```
GET /Invoices?$filter=account_sf_id eq '001abc...'
```
Which the server translates to:
```sql
SELECT * FROM invoices WHERE account_sf_id = '001abc...'
```

## OData Filter Parsing

Salesforce Connect sends filter expressions in OData syntax. The server parses these into SQL using regex:

| OData Filter | SQL Equivalent |
|-------------|----------------|
| `account_sf_id eq '001abc'` | `WHERE account_sf_id = '001abc'` |
| `status eq 'Overdue'` | `WHERE status = 'Overdue'` |
| `amount gt 1000` | `WHERE amount > 1000` |
| `amount lt 5000` | `WHERE amount < 5000` |

All values are **parameterized** (`$1`, `$2`, ...) — SQL injection is not possible.

## Index Strategy

With 500k rows, unindexed queries take ~800ms. With indexes: ~3ms.

```sql
-- Primary lookup: all invoices for an account
CREATE INDEX idx_account_sf_id ON invoices (account_sf_id);

-- Status filter: WHERE status = 'Overdue'
CREATE INDEX idx_status ON invoices (status);

-- Combined filter: WHERE account_sf_id = X AND status = Y
CREATE INDEX idx_account_status ON invoices (account_sf_id, status);
```

## LWC Parallel Loading

The component fires two Apex calls simultaneously using `Promise.all`:

```
Sequential (slow):           Parallel (this project):
  ┌─ getStatusSummary ─┐       ┌─ getStatusSummary ─┐
  └──────────────────── then   └─ getAccountInvoices ─┘
  ┌─ getAccountInvoices ┐       Both complete simultaneously
  └────────────────────┘        ~50% faster initial load
```

## Render Cold Start Mitigation

Render free tier spins down after 15 minutes idle. The server takes ~20-30 seconds to wake. The mitigation options in order of preference:

1. **Monitoring service ping** (free): UptimeRobot pings `/health` every 14 minutes, keeping the server awake
2. **Pre-warm before Validate & Sync**: Open `/health` in browser before Salesforce config
3. **Upgrade to Render Starter ($7/mo)**: Always-on, no cold starts
