# Data Generator

Generates 500,000 realistic invoice records and inserts them into Neon PostgreSQL using the Faker library.

## Setup

```bash
pip3 install -r requirements.txt
cp .env.example .env
# Edit .env — paste your Neon DATABASE_URL
```

## Run

```bash
python3 generate_invoices.py
```

Expected output:
```
Connecting to Neon PostgreSQL...
Connected. Generating 500,000 records in batches of 1,000...

      50,000 / 500,000  |    1847 rec/sec  |  ~244s remaining
     100,000 / 500,000  |    1891 rec/sec  |  ~211s remaining
     150,000 / 500,000  |    1903 rec/sec  |  ~183s remaining
     ...
Done! 500,000 records inserted in 271s.
```

## Verify in Neon SQL Editor

```sql
SELECT COUNT(*) FROM invoices;
-- Expected: 500000

SELECT status, COUNT(*), ROUND(AVG(amount), 2) AS avg_amount
FROM   invoices
GROUP  BY status
ORDER  BY COUNT(*) DESC;
```

## Data Distribution

| Status | Weight | ~Count |
|--------|--------|--------|
| Pending | 40% | 200,000 |
| Paid | 35% | 175,000 |
| Overdue | 18% | 90,000 |
| Cancelled | 7% | 35,000 |

## Notes

- Generates 500 unique fake Salesforce Account IDs (18-char strings starting with `001`)
- After setup, replace these with real Salesforce Account IDs using the UPDATE SQL in the main README
- Set `TOTAL_RECORDS=200000` if you're near Neon's free 3 GB storage limit
