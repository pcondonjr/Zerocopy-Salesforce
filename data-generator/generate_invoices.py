"""
Invoice Data Generator
======================
Generates 500,000 realistic invoice records and inserts them into Neon PostgreSQL.

Usage:
    pip3 install -r requirements.txt
    cp .env.example .env      # then edit .env with your DATABASE_URL
    python3 generate_invoices.py

Performance: ~1,800 records/second → ~4.5 minutes for 500k records
"""

import os
import random
import psycopg2
from faker import Faker
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

# ── Configuration ─────────────────────────────────────────────────
fake          = Faker('en_US')
TOTAL_RECORDS = int(os.getenv('TOTAL_RECORDS', 500_000))
BATCH_SIZE    = int(os.getenv('BATCH_SIZE', 1_000))
DATABASE_URL  = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    raise ValueError(
        'DATABASE_URL not found.\n'
        'Copy .env.example to .env and add your Neon connection string.'
    )

# ── Generate 500 fake Salesforce Account IDs ─────────────────────
# These are 18-character strings in the correct Salesforce ID format.
# In production: replace with real Account IDs from your Salesforce org.
def make_sf_id():
    chars = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    return '001' + ''.join(random.choices(chars, k=15))

ACCOUNT_IDS   = [make_sf_id() for _ in range(500)]
ACCOUNT_NAMES = {aid: fake.company() for aid in ACCOUNT_IDS}

# ── Status distribution — mirrors real-world B2B invoice patterns ─
STATUS_OPTIONS = ['Pending', 'Paid', 'Overdue', 'Cancelled']
STATUS_WEIGHTS = [0.40,       0.35,   0.18,      0.07]

# ── Invoice categories ────────────────────────────────────────────
CATEGORIES = [
    'Software License', 'Professional Services', 'Hardware',
    'Consulting', 'Support & Maintenance', 'Training',
    'Cloud Hosting', 'Implementation', 'Custom Development', 'Subscription',
]

def generate_invoice(invoice_number: int) -> dict:
    """Generate a single realistic invoice record."""
    account_id = random.choice(ACCOUNT_IDS)
    status     = random.choices(STATUS_OPTIONS, STATUS_WEIGHTS)[0]
    category   = random.choice(CATEGORIES)

    # Realistic amount ranges per category
    if category in ('Software License', 'Subscription'):
        amount = round(random.uniform(500, 50_000), 2)
    elif category == 'Hardware':
        amount = round(random.uniform(1_000, 100_000), 2)
    else:
        amount = round(random.uniform(200, 25_000), 2)

    # Due date: mix of past (overdue candidates) and future
    days_offset = random.randint(-730, 180)
    due_date    = (datetime.now() + timedelta(days=days_offset)).date()

    # Created before the due date
    days_before = random.randint(15, 60)
    created_at  = (
        datetime.combine(due_date, datetime.min.time())
        - timedelta(days=days_before)
    )

    return {
        'invoice_no':    f'INV-{invoice_number:06d}',
        'account_sf_id': account_id,
        'customer_name': ACCOUNT_NAMES[account_id],
        'amount':        amount,
        'status':        status,
        'due_date':      due_date,
        'description':   f'{category} - {fake.bs().capitalize()}'[:500],
        'created_at':    created_at,
    }

INSERT_SQL = """
    INSERT INTO invoices
        (invoice_no, account_sf_id, customer_name, amount,
         status, due_date, description, created_at)
    VALUES
        (%(invoice_no)s, %(account_sf_id)s, %(customer_name)s, %(amount)s,
         %(status)s, %(due_date)s, %(description)s, %(created_at)s)
"""

def main():
    print('Connecting to Neon PostgreSQL...')
    conn   = psycopg2.connect(DATABASE_URL, sslmode='require')
    cursor = conn.cursor()
    print(f'Connected. Generating {TOTAL_RECORDS:,} records in batches of {BATCH_SIZE:,}...\n')

    start_time = datetime.now()
    inserted   = 0

    for batch_start in range(1, TOTAL_RECORDS + 1, BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE - 1, TOTAL_RECORDS)
        batch     = [generate_invoice(i) for i in range(batch_start, batch_end + 1)]
        cursor.executemany(INSERT_SQL, batch)
        conn.commit()
        inserted += len(batch)

        if inserted % 50_000 == 0 or inserted == TOTAL_RECORDS:
            elapsed   = max((datetime.now() - start_time).seconds, 1)
            rate      = inserted / elapsed
            remaining = (TOTAL_RECORDS - inserted) / max(rate, 1)
            print(
                f'  {inserted:>8,} / {TOTAL_RECORDS:,}'
                f'  |  {rate:>6.0f} rec/sec'
                f'  |  ~{remaining:.0f}s remaining'
            )

    cursor.close()
    conn.close()

    total_time = (datetime.now() - start_time).seconds
    print(f'\nDone! {TOTAL_RECORDS:,} records inserted in {total_time}s.')
    print(f'Verify: SELECT COUNT(*) FROM invoices;  -- should return {TOTAL_RECORDS:,}')

if __name__ == '__main__':
    main()
