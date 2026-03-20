# Changelog

## 2026-03-19 — LWC Master-Detail Redesign & External Object Fixes

### Overview
Redesigned the `accountInvoices` LWC from a full-width datatable to a master-detail split layout with search, pagination, and an invoice detail panel. Also fixed multiple Apex controller issues related to External Object governor limits.

---

### LWC Changes (`accountInvoices`)

#### Layout: Master-Detail Split
- **Before:** Full-width `lightning-datatable` with infinite scroll
- **After:** 5/12 + 7/12 split layout
  - **Left panel (master):** Compact invoice list with Invoice #, Amount, Customer, and Status badge per row
  - **Right panel (detail):** Full invoice detail card, or "Select an invoice" placeholder when nothing is selected

#### Search
- Added `lightning-input` (type=search) with 300ms debounced `oninput` for real-time client-side filtering
- Searches across: invoice number, customer name, description, status, and amount
- Works alongside the existing status dropdown filter

#### Pagination
- Replaced infinite scroll with Previous/Next button pagination
- Reduced page size from 50 to 10 records per page (better fit for compact list layout)
- Server-side pagination via Apex `LIMIT`/`OFFSET`

#### Invoice Selection & Detail Panel
- Clicking a row in the left list populates the right detail panel
- Detail panel shows: Invoice #, Customer, Amount (large formatted), Status badge, Due Date, Created timestamp, Description
- Selected row highlighted with blue left border via `renderedCallback` DOM manipulation
- Selection clears on filter change, page change, or refresh

#### Key Technical Decision: Index-Based Row Selection
External Object `Id` values do not survive HTML `data-*` attribute serialization reliably. Multiple attempts using `data-id={inv.Id}` resulted in the click handler always resolving to the first invoice regardless of which row was clicked.

**Solution:** Use `for:index="idx"` and `data-index={idx}` instead of `data-id`. The click handler reads the numeric index and indexes directly into the `filteredInvoices` array. This completely sidesteps any External Object ID format issues.

```html
<!-- Before (broken) -->
<div data-id={inv.Id} onclick={handleSelectInvoice}>

<!-- After (working) -->
<div data-index={idx} onclick={handleSelectInvoice}>
```

```javascript
// Before — Id matching fails for External Objects
handleSelectInvoice(event) {
  const id = event.currentTarget.dataset.id;
  const inv = this.invoices.find(i => i.Id === id); // always finds first
}

// After — index-based, reliable
handleSelectInvoice(event) {
  const idx = parseInt(event.currentTarget.dataset.index, 10);
  const list = this.filteredInvoices;
  if (idx >= 0 && idx < list.length) {
    this.selectedInvoice = Object.assign({}, list[idx]);
  }
}
```

#### Key Technical Decision: Separated Render Cycles
`filteredInvoices` getter does NOT reference `selectedInvoice`. Row highlighting is applied via direct DOM manipulation in `renderedCallback()` using `_applySelectedStyling()`, not through reactive template binding. This prevents a render cycle where:

1. User clicks row → sets `selectedInvoice`
2. `filteredInvoices` re-evaluates (because it referenced `selectedInvoice`)
3. List re-renders with new objects
4. Click handler breaks / detail panel doesn't update

#### CSS
- Custom compact row styling (`.invoice-row`) with hover and selected states
- Status-colored badges using SLDS CSS custom properties (`--slds-c-badge-color-background`)
- Detail panel with labeled fields using uppercase labels and large formatted amount
- Placeholder with dashed border and centered icon

---

### Apex Changes (`InvoiceController`)

#### Problem: `COUNT()` Not Supported on External Objects
External Objects do not support aggregate functions like `COUNT(Id)`. The original query caused a runtime error.

**Fix:** Replaced `COUNT()` with a "peek" query — fetches 1 record at `OFFSET = currentOffset + pageSize` to determine if more records exist.

#### Problem: "Too many query rows" Governor Limit
The summary query returned all invoices for the account (up to 500K generated records), exceeding Salesforce's 50,001 row governor limit.

**Fix:**
- Converted inline SOQL (`for (Invoice__x inv : [SELECT ...])`) to `Database.query()` with `LIMIT 200`
- `Database.query()` handles External Object pagination differently than inline SOQL and avoids the "Inline query has too many rows for direct assignment" error

#### Problem: `COUNT()` in Summary Query
The summary query originally used `GROUP BY` with `COUNT()` which is not supported on External Objects.

**Fix:** Replaced with a simple loop that iterates over up to 200 invoices and manually counts/sums by status.

---

### Meta XML Changes (`accountInvoices.js-meta.xml`)

#### Problem: Component Not Persisting on Lightning Page
The component would disappear from the Account record page after saving in Lightning App Builder. Each edit session required re-adding it.

**Fix:** Added `targetConfigs` with `<object>Account</object>` so Lightning App Builder knows which object the component belongs to and persists the placement.

#### Problem: Console App vs Standard App
The component was activated as "Org Default" but not visible in the Sales Console app.

**Fix:** Activated the page as "App Default" for the Sales Console app specifically. Console apps use separate page assignments from standard navigation apps.

---

### Salesforce Setup Notes

#### External Data Source
- Type: Salesforce Connect OData 4.0
- URL: `https://zerocopy-salesforce.onrender.com/`
- Authentication: Anonymous (no auth)
- High Data Volume: enabled
- Format: JSON

#### External Object: `Invoice__x`
- Synced from External Data Source
- Name Field: `invoice_no`
- Fields: `account_sf_id__c`, `amount__c`, `created_at__c`, `customer_name__c`, `description__c`, `due_date__c`, `id__c`, `invoice_no__c`, `status__c`

#### Indirect Lookup Relationship
- Requires an **External ID + Unique** text field on the Account object (`External_Account_ID__c`)
- Without this field, the "Related To" dropdown in the External Object relationship wizard shows no options

#### Render Deployment
- Build command: `npm install` (was incorrectly set to `npm installyarn` initially)
- Root directory: `odata-server`

---

### Files Changed

| File | Change |
|------|--------|
| `salesforce/force-app/main/default/lwc/accountInvoices/accountInvoices.html` | Redesigned to master-detail split layout |
| `salesforce/force-app/main/default/lwc/accountInvoices/accountInvoices.js` | Search, pagination, index-based selection, separated render cycles |
| `salesforce/force-app/main/default/lwc/accountInvoices/accountInvoices.css` | Compact list rows, detail panel, status badges, placeholder |
| `salesforce/force-app/main/default/lwc/accountInvoices/accountInvoices.js-meta.xml` | Added targetConfigs for Account |
| `salesforce/force-app/main/default/classes/InvoiceController.cls` | Fixed External Object governor limit issues |
