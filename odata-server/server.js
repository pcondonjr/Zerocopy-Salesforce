'use strict';

/**
 * OData v4 API Server
 * Translates Salesforce Connect OData requests → SQL queries → Neon PostgreSQL
 *
 * Routes:
 *   GET /              → Service root (entity discovery)
 *   GET /$metadata     → XML schema (Salesforce reads this to create Invoice__x)
 *   GET /Invoices      → Collection: $filter, $top, $skip, $count, $orderby
 *   GET /Invoices(:id) → Single record
 *   GET /health        → Health check + record count
 */

const express = require('express');
const { Pool } = require('pg');
const cors    = require('cors');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Database connection pool ──────────────────────────────────────
// Compatible with Neon's postgres:// connection string format
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Neon SSL
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('Neon DB connection FAILED:', err.message);
  else     console.log('Neon DB connected at:', res.rows[0].now);
});

// ── Middleware ────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET', 'OPTIONS'] }));
app.use(express.json());

// ── Helpers ───────────────────────────────────────────────────────
function baseUrl(req) {
  // Handles both local dev and Render's HTTPS proxy correctly
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

/**
 * Parse OData $filter string into SQL WHERE conditions + params array.
 * Supported operators: eq (string fields), gt / lt (amount)
 * All values are parameterized — SQL injection safe.
 *
 * Example:
 *   Input:  "account_sf_id eq '001abc' and amount gt 1000"
 *   Output: { conditions: ["account_sf_id = $1", "amount > $2"], params: ["001abc", 1000] }
 */
function parseFilter(filterString) {
  const conditions = [];
  const params     = [];
  let   paramIdx   = 1;

  if (!filterString) return { conditions, params };

  // String equality: fieldName eq 'value'
  const eqRegex = /(\w+)\s+eq\s+'([^']+)'/g;
  let match;
  while ((match = eqRegex.exec(filterString)) !== null) {
    const columnMap = {
      account_sf_id: 'account_sf_id',
      status:        'status',
    };
    if (columnMap[match[1]]) {
      conditions.push(`${columnMap[match[1]]} = $${paramIdx++}`);
      params.push(match[2]);
    }
  }

  // Numeric greater-than: fieldName gt value
  const gtRegex = /(\w+)\s+gt\s+([\d.]+)/g;
  while ((match = gtRegex.exec(filterString)) !== null) {
    if (match[1] === 'amount') {
      conditions.push(`amount > $${paramIdx++}`);
      params.push(parseFloat(match[2]));
    }
  }

  // Numeric less-than: fieldName lt value
  const ltRegex = /(\w+)\s+lt\s+([\d.]+)/g;
  while ((match = ltRegex.exec(filterString)) !== null) {
    if (match[1] === 'amount') {
      conditions.push(`amount < $${paramIdx++}`);
      params.push(parseFloat(match[2]));
    }
  }

  return { conditions, params };
}

// ── Route 1: Service Root ─────────────────────────────────────────
// Salesforce Connect calls this first during Validate & Sync
app.get('/', (req, res) => {
  res.set('OData-Version', '4.0'); // CRITICAL: must be on every response
  res.json({
    '@odata.context': `${baseUrl(req)}/$metadata`,
    value: [
      { name: 'Invoices', kind: 'EntitySet', url: 'Invoices' },
    ],
  });
});

// ── Route 2: $metadata ────────────────────────────────────────────
// Salesforce reads this XML to automatically create the Invoice__x External Object
// with all the correct field types. Must be valid OData 4.0 EDMX.
app.get('/\\$metadata', (req, res) => {
  res.set('OData-Version', '4.0');
  res.type('application/xml; charset=utf-8');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="InvoiceService"
            xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Invoice">
        <Key><PropertyRef Name="id"/></Key>
        <Property Name="id"            Type="Edm.Int32"   Nullable="false"/>
        <Property Name="invoice_no"    Type="Edm.String"  MaxLength="20"/>
        <Property Name="account_sf_id" Type="Edm.String"  MaxLength="18"/>
        <Property Name="customer_name" Type="Edm.String"  MaxLength="200"/>
        <Property Name="amount"        Type="Edm.Decimal" Precision="12" Scale="2"/>
        <Property Name="status"        Type="Edm.String"  MaxLength="20"/>
        <Property Name="due_date"      Type="Edm.Date"/>
        <Property Name="description"   Type="Edm.String"/>
        <Property Name="created_at"    Type="Edm.DateTimeOffset"/>
      </EntityType>
      <EntityContainer Name="InvoiceContainer">
        <EntitySet Name="Invoices" EntityType="InvoiceService.Invoice"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`);
});

// ── Route 3: Invoices Collection ──────────────────────────────────
// Main endpoint — handles all SOQL queries from Salesforce Connect.
// Supports: $top, $skip, $filter, $count, $orderby
app.get('/Invoices', async (req, res) => {
  try {
    // Parse query parameters with safe defaults
    const top    = Math.min(parseInt(req.query['$top'])  || 100, 500); // cap at 500
    const skip   = Math.max(parseInt(req.query['$skip']) || 0, 0);
    const filter = req.query['$filter']  || '';
    const orderby = req.query['$orderby'] || 'created_at desc';
    const count   = req.query['$count'] === 'true';

    // Build WHERE clause from $filter
    const { conditions, params } = parseFilter(filter);
    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // Build ORDER BY — whitelist allowed columns to prevent injection
    const allowedSorts = ['id', 'invoice_no', 'amount', 'status', 'due_date', 'created_at'];
    let orderByClause  = 'created_at DESC';
    const obParts      = orderby.trim().split(/\s+/);
    if (allowedSorts.includes(obParts[0])) {
      const dir  = (obParts[1] || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderByClause = `${obParts[0]} ${dir}`;
    }

    // Build final query — OFFSET and LIMIT are also parameterized
    const offsetParam = params.length + 1;
    const limitParam  = params.length + 2;
    const dataSQL = `
      SELECT id, invoice_no, account_sf_id, customer_name,
             amount, status, due_date, description, created_at
      FROM   invoices
      ${whereClause}
      ORDER  BY ${orderByClause}
      OFFSET $${offsetParam}
      LIMIT  $${limitParam}
    `;

    // Optionally run COUNT in parallel for $count=true
    let dataResult, countResult;
    if (count) {
      [dataResult, countResult] = await Promise.all([
        pool.query(dataSQL, [...params, skip, top]),
        pool.query(`SELECT COUNT(*) AS total FROM invoices ${whereClause}`, params),
      ]);
    } else {
      dataResult = await pool.query(dataSQL, [...params, skip, top]);
    }

    // Build OData response
    const response = {
      '@odata.context': `${baseUrl(req)}/$metadata#Invoices`,
      value: dataResult.rows.map(row => ({
        '@odata.id':   `${baseUrl(req)}/Invoices(${row.id})`,
        id:            row.id,
        invoice_no:    row.invoice_no,
        account_sf_id: row.account_sf_id,
        customer_name: row.customer_name,
        amount:        parseFloat(row.amount),
        status:        row.status,
        due_date:      row.due_date
          ? row.due_date.toISOString().split('T')[0]
          : null,
        description:   row.description,
        created_at:    row.created_at
          ? row.created_at.toISOString()
          : null,
      })),
    };

    if (count && countResult) {
      response['@odata.count'] = parseInt(countResult.rows[0].total);
    }

    res.set('OData-Version', '4.0');
    res.json(response);

  } catch (error) {
    console.error('Error in /Invoices:', error);
    res.status(500).json({
      error: { code: '500', message: error.message },
    });
  }
});

// ── Route 4: Single Invoice ───────────────────────────────────────
app.get('/Invoices\\(:id\\)', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: { code: '400', message: 'Invalid ID' } });
    }

    const result = await pool.query(
      'SELECT * FROM invoices WHERE id = $1', [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: '404', message: 'Invoice not found' } });
    }

    const row = result.rows[0];
    res.set('OData-Version', '4.0');
    res.json({
      '@odata.context': `${baseUrl(req)}/$metadata#Invoices/$entity`,
      id:            row.id,
      invoice_no:    row.invoice_no,
      account_sf_id: row.account_sf_id,
      customer_name: row.customer_name,
      amount:        parseFloat(row.amount),
      status:        row.status,
      due_date:      row.due_date?.toISOString().split('T')[0] ?? null,
      description:   row.description,
      created_at:    row.created_at?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('Error in /Invoices(:id):', error);
    res.status(500).json({ error: { code: '500', message: error.message } });
  }
});

// ── Route 5: Health Check ─────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) AS total FROM invoices');
    res.json({
      status:        'healthy',
      database:      'Neon PostgreSQL',
      totalInvoices: parseInt(result.rows[0].total),
      timestamp:     new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

// ── Start server ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`OData v4 server running on port ${PORT}`);
  console.log(`  Service root:  http://localhost:${PORT}/`);
  console.log(`  Metadata:      http://localhost:${PORT}/$metadata`);
  console.log(`  Invoices:      http://localhost:${PORT}/Invoices`);
  console.log(`  Health:        http://localhost:${PORT}/health`);
});
