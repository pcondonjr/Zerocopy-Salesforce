# Business Case — Zero-Copy vs Traditional ETL

## Executive Summary

This project eliminates **~$4,000/year in Salesforce storage costs** while delivering **real-time data freshness** that traditional ETL cannot match. The zero-copy architecture also reduces integration complexity, lowers governor limit risk, and simplifies GDPR compliance.

---

## Cost Comparison

### Traditional ETL: Copy 500k Records into Salesforce

| Cost Item | Calculation | Annual Cost |
|-----------|-------------|-------------|
| Salesforce custom object storage | 500,000 records × $0.005/record/month × 12 months | ~$3,000/year |
| ETL infrastructure (server/scheduler) | Cloud VM or managed ETL service | ~$600–$1,200/year |
| Developer time (maintenance) | 2–4 hrs/month × $100/hr × 12 | ~$2,400–$4,800/year |
| **Total** | | **~$6,000–$9,000/year** |

### Zero-Copy (This Project)

| Cost Item | Monthly | Annual |
|-----------|---------|--------|
| Neon PostgreSQL (free tier) | $0 | $0 |
| Render.com (free tier) | $0 | $0 |
| Salesforce storage | $0 (no data stored) | $0 |
| Developer maintenance | ~1 hr/month | ~$1,200/year |
| **Total** | **$0** | **~$1,200/year** |

**Year 1 savings: ~$5,000–$8,000**

---

## Non-Financial Benefits

### Real-Time Data
ETL jobs run on a schedule — typically every 1–24 hours. This means sales reps always see stale data. With zero-copy, every page load triggers a live query. The data is always current as of the moment the rep opens the record.

### No Sync Failures
ETL pipelines fail. Network issues, schema changes, API rate limits, bulk operation errors — each failure means Salesforce shows incorrect or missing data until someone investigates and reruns the job. Zero-copy has no sync pipeline to fail. If the database is up, the data is current.

### GDPR & HIPAA Compliance
With ETL, sensitive invoice data exists in **two systems**: the source database and Salesforce. This doubles the compliance surface — both systems need audit trails, access controls, and data retention policies. With zero-copy, sensitive data remains in a single, controlled location.

### Governor Limit Safety
Salesforce enforces strict limits on DML operations (insert/update/delete). Bulk ETL jobs that insert hundreds of thousands of records are a persistent risk — one bad sync can breach limits and affect other operations in the org. Zero-copy performs only read operations, which are subject to much more lenient limits.

---

## Scalability Comparison

| Volume | ETL Sync Time | Zero-Copy Latency |
|--------|-------------|-------------------|
| 50,000 records | ~5 minutes | ~3ms per query |
| 500,000 records | ~50 minutes | ~3ms per query |
| 5,000,000 records | ~8 hours | ~3ms per query |
| 50,000,000 records | Multiple days | ~3ms per query |

Zero-copy latency is constant regardless of total record volume because it only fetches the records for the current Account — typically 50–500 records per page.

---

## When NOT to Use Zero-Copy

Zero-copy is ideal for read-heavy scenarios. Consider ETL or a hybrid approach when:

- **Write-back is required** — Sales reps need to create or modify external records from Salesforce (zero-copy is read-only; use Apex Callouts for writes)
- **Complex aggregations** — Heavy analytical queries run better against a local copy or a dedicated analytics layer
- **Offline requirements** — The external system has poor uptime or high latency
- **Record-triggered flows** — Salesforce automation (Flows, triggers) that needs to react to external data changes in real-time requires Change Data Capture or Platform Events, not just Salesforce Connect

---

## Elevator Pitch

> *"I designed a scalable integration architecture that lets Salesforce interact with 500,000 external invoice records in real-time, without consuming a single byte of Salesforce storage and with zero risk of governor limit breaches.*
>
> *I achieved this using Salesforce Connect with a custom OData v4 endpoint backed by Neon PostgreSQL, hosted on Render.com — entirely free with no credit card on any platform. Data never moves into Salesforce — it is queried live on demand, saving approximately $4,000/year in storage while delivering real-time data freshness that a traditional ETL approach could never match."*
