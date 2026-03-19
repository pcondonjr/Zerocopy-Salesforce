/**
 * InvoiceController
 * =================
 * Apex controller for the accountInvoices Lightning Web Component.
 * Executes SOQL against the Invoice__x External Object (created by Salesforce Connect).
 * Salesforce Connect transparently translates these queries into OData HTTP requests
 * to the Render-hosted Node.js server, which queries Neon PostgreSQL.
 *
 * Methods:
 *   getAccountInvoices() — Paginated invoice list with optional status filter
 *   getStatusSummary()   — Counts and amounts grouped by status (for stat cards)
 */
public with sharing class InvoiceController {

    /**
     * Wrapper class returned by getAccountInvoices().
     * Bundles the invoice list + total count in a single Apex call.
     */
    public class InvoiceResult {
        @AuraEnabled public List<Invoice__x> invoices;
        @AuraEnabled public Integer          totalCount;
        @AuraEnabled public String           errorMessage;
    }

    /**
     * Returns a paginated list of invoices for the given Account.
     *
     * @param accountId     18-character Salesforce Account ID
     * @param statusFilter  Optional: 'Pending' | 'Paid' | 'Overdue' | 'Cancelled' | null
     * @param pageSize      Number of records per page (max 200, default 50)
     * @param pageOffset    Number of records to skip (for pagination)
     * @return              InvoiceResult with invoices list + totalCount
     */
    @AuraEnabled(cacheable=false)
    public static InvoiceResult getAccountInvoices(
        String  accountId,
        String  statusFilter,
        Integer pageSize,
        Integer pageOffset
    ) {
        InvoiceResult result = new InvoiceResult();

        // Validate required input
        if (String.isBlank(accountId)) {
            result.errorMessage = 'Account ID is required';
            result.invoices     = new List<Invoice__x>();
            result.totalCount   = 0;
            return result;
        }

        // Apply safe defaults and caps
        if (pageSize   == null || pageSize   <= 0) pageSize   = 50;
        if (pageSize   > 200)                      pageSize   = 200;  // SF Connect limit
        if (pageOffset == null || pageOffset <  0) pageOffset = 0;

        try {
            // Build dynamic SOQL — bind variables prevent SOQL injection
            String q = 'SELECT Id, invoice_no__c, account_sf_id__c, customer_name__c, '
                     + '       amount__c, status__c, due_date__c, '
                     + '       description__c, created_at__c '
                     + 'FROM   Invoice__x '
                     + 'WHERE  account_sf_id__c = :accountId ';

            if (String.isNotBlank(statusFilter)) {
                q += 'AND status__c = :statusFilter ';
            }

            q += 'ORDER BY created_at__c DESC '
               + 'LIMIT  :pageSize '
               + 'OFFSET :pageOffset';

            result.invoices = Database.query(q);

            // Total count — use the invoice list size + whether more exist
            // External Objects don't support COUNT() aggregate
            // Check if there are more records beyond this page
            Integer nextOffset = pageOffset + pageSize;
            String peekQ = 'SELECT Id '
                         + 'FROM   Invoice__x '
                         + 'WHERE  account_sf_id__c = :accountId ';
            if (String.isNotBlank(statusFilter)) {
                peekQ += 'AND status__c = :statusFilter ';
            }
            peekQ += 'LIMIT 1 OFFSET :nextOffset';

            List<Invoice__x> peekResult = Database.query(peekQ);
            // If we got a full page and there's at least 1 more, report offset + pageSize + 1
            // Otherwise, report actual count
            if (result.invoices.size() == pageSize && !peekResult.isEmpty()) {
                result.totalCount = nextOffset + 1;
            } else {
                result.totalCount = pageOffset + result.invoices.size();
            }

        } catch (Exception e) {
            result.errorMessage = 'Failed to load invoices: ' + e.getMessage();
            result.invoices     = new List<Invoice__x>();
            result.totalCount   = 0;
        }

        return result;
    }

    /**
     * Returns invoice counts and total amounts grouped by status.
     * Used to populate the summary stat cards in the LWC.
     *
     * @param accountId  18-character Salesforce Account ID
     * @return           Map with keys like 'Paid_count', 'Paid_amount', 'total_count', etc.
     */
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> getStatusSummary(String accountId) {
        Map<String, Object> summary = new Map<String, Object>();

        if (String.isBlank(accountId)) {
            return summary;
        }

        try {
            // Query a small page of invoices to compute summary
            // External Objects don't support aggregates and have strict row limits
            Integer summaryLimit = 200;
            List<Invoice__x> invoices = Database.query(
                'SELECT status__c, amount__c '
                + 'FROM Invoice__x '
                + 'WHERE account_sf_id__c = :accountId '
                + 'LIMIT :summaryLimit'
            );

            Map<String, Integer> countByStatus = new Map<String, Integer>();
            Map<String, Decimal> amountByStatus = new Map<String, Decimal>();
            Decimal grandTotal = 0;
            Integer grandCount = invoices.size();

            for (Invoice__x inv : invoices) {
                String s = inv.status__c;
                if (s == null) { s = 'Unknown'; }

                Integer cnt = countByStatus.containsKey(s) ? countByStatus.get(s) : 0;
                countByStatus.put(s, cnt + 1);

                Decimal amt = inv.amount__c != null ? inv.amount__c : 0;
                Decimal total = amountByStatus.containsKey(s) ? amountByStatus.get(s) : 0;
                amountByStatus.put(s, total + amt);

                grandTotal += amt;
            }

            for (String s : countByStatus.keySet()) {
                summary.put(s + '_count', countByStatus.get(s));
                summary.put(s + '_amount', amountByStatus.get(s));
            }

            summary.put('total_count',  grandCount);
            summary.put('total_amount', grandTotal);

        } catch (Exception e) {
            summary.put('error', e.getMessage());
        }

        return summary;
    }
}
