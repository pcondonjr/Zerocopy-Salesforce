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

            // Get total count for pagination (separate query)
            String countQ = 'SELECT COUNT(Id) cnt '
                          + 'FROM   Invoice__x '
                          + 'WHERE  account_sf_id__c = :accountId ';
            if (String.isNotBlank(statusFilter)) {
                countQ += 'AND status__c = :statusFilter';
            }

            List<AggregateResult> countResult = Database.query(countQ);
            result.totalCount = (Integer) countResult[0].get('cnt');

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
            List<AggregateResult> results = [
                SELECT status__c          status,
                       COUNT(Id)          cnt,
                       SUM(amount__c)     totalAmt
                FROM   Invoice__x
                WHERE  account_sf_id__c = :accountId
                GROUP  BY status__c
            ];

            Decimal grandTotal = 0;
            Integer grandCount = 0;

            for (AggregateResult ar : results) {
                String  s   = (String)  ar.get('status');
                Integer cnt = (Integer) ar.get('cnt');
                Decimal amt = (Decimal) ar.get('totalAmt');

                summary.put(s + '_count',  cnt);
                summary.put(s + '_amount', amt != null ? amt : 0);

                grandTotal += (amt  != null ? amt  : 0);
                grandCount += (cnt  != null ? cnt  : 0);
            }

            summary.put('total_count',  grandCount);
            summary.put('total_amount', grandTotal);

        } catch (Exception e) {
            summary.put('error', e.getMessage());
        }

        return summary;
    }
}
