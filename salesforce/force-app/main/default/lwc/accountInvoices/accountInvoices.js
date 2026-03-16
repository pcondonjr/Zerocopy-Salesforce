/**
 * accountInvoices LWC Controller
 * ================================
 * Displays invoices from Neon PostgreSQL on the Account record page.
 * Uses zero-copy architecture: data is queried live via Salesforce Connect
 * → OData server on Render → Neon PostgreSQL. Nothing is stored in Salesforce.
 *
 * Features:
 *  - Parallel data loading (Promise.all) — ~50% faster than sequential calls
 *  - Summary stat cards (Total / Paid / Pending / Overdue)
 *  - Status filter with instant re-query
 *  - Client-side column sorting
 *  - Infinite scroll pagination
 *  - Refresh with toast confirmation
 *  - Graceful error and loading states
 */

import { LightningElement, api, track } from 'lwc';
import getAccountInvoices from '@salesforce/apex/InvoiceController.getAccountInvoices';
import getStatusSummary   from '@salesforce/apex/InvoiceController.getStatusSummary';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// ── Datatable column definitions ─────────────────────────────────
const COLUMNS = [
  {
    label:    'Invoice #',
    fieldName: 'invoice_no__c',
    type:     'text',
    sortable:  true,
    initialWidth: 110,
  },
  {
    label:    'Amount',
    fieldName: 'amount__c',
    type:     'currency',
    sortable:  true,
    typeAttributes: { currencyCode: 'USD', minimumFractionDigits: 2 },
    cellAttributes: { alignment: 'right' },
    initialWidth: 120,
  },
  {
    label:    'Status',
    fieldName: 'status__c',
    type:     'text',
    sortable:  true,
    initialWidth: 100,
  },
  {
    label:    'Due Date',
    fieldName: 'due_date__c',
    type:     'date-local',
    sortable:  true,
    typeAttributes: { year: 'numeric', month: '2-digit', day: '2-digit' },
    initialWidth: 110,
  },
  {
    label:    'Customer',
    fieldName: 'customer_name__c',
    type:     'text',
    sortable:  true,
  },
  {
    label:    'Description',
    fieldName: 'description__c',
    type:     'text',
    wrapText:  true,
  },
];

export default class AccountInvoices extends LightningElement {
  /** Auto-populated by Salesforce with the current Account's 18-char ID */
  @api recordId;

  // ── State ───────────────────────────────────────────────────────
  @track invoices       = [];
  @track isLoading      = false;
  @track isLoadingMore  = false;
  @track errorMessage   = '';
  @track selectedStatus = '';
  @track sortedBy       = 'created_at__c';
  @track sortDirection  = 'desc';

  // Summary card counts
  @track totalCount   = 0;
  @track paidCount    = 0;
  @track pendingCount = 0;
  @track overdueCount = 0;

  // ── Constants ───────────────────────────────────────────────────
  columns        = COLUMNS;
  pageSize       = 50;          // records per page
  loadMoreOffset = 20;          // pixels from bottom to trigger load-more
  currentOffset  = 0;           // current pagination offset
  hasMoreRecords = true;        // whether more pages exist

  // ── Computed properties ─────────────────────────────────────────
  get statusOptions() {
    return [
      { label: 'All Statuses', value: '' },
      { label: 'Pending',      value: 'Pending' },
      { label: 'Paid',         value: 'Paid' },
      { label: 'Overdue',      value: 'Overdue' },
      { label: 'Cancelled',    value: 'Cancelled' },
    ];
  }

  get hasError()       { return Boolean(this.errorMessage); }
  get hasInvoices()    { return this.invoices.length > 0; }
  get showContent()    { return !this.isLoading && !this.hasError; }
  get isEmpty()        { return !this.isLoading && !this.hasError && this.invoices.length === 0; }
  get displayedCount() { return this.invoices.length; }

  // ── Lifecycle ───────────────────────────────────────────────────
  connectedCallback() {
    this.loadInitialData();
  }

  // ── Data loading ────────────────────────────────────────────────

  /**
   * Load summary stats + first page of invoices in parallel.
   * Promise.all fires both Apex calls simultaneously — ~50% faster
   * than sequential await calls.
   */
  async loadInitialData() {
    this.isLoading    = true;
    this.errorMessage = '';

    try {
      const [summaryResult, invoiceResult] = await Promise.all([
        getStatusSummary({ accountId: this.recordId }),
        getAccountInvoices({
          accountId:    this.recordId,
          statusFilter: this.selectedStatus || null,
          pageSize:     this.pageSize,
          pageOffset:   0,
        }),
      ]);

      // Populate summary cards
      if (summaryResult) {
        this.totalCount   = summaryResult.total_count   || 0;
        this.paidCount    = summaryResult.Paid_count    || 0;
        this.pendingCount = summaryResult.Pending_count || 0;
        this.overdueCount = summaryResult.Overdue_count || 0;
      }

      // Populate invoice list
      if (invoiceResult.errorMessage) {
        this.errorMessage = invoiceResult.errorMessage;
      } else {
        this.invoices       = invoiceResult.invoices || [];
        this.currentOffset  = this.invoices.length;
        this.hasMoreRecords = this.invoices.length < (invoiceResult.totalCount || 0);

        // Use invoice total count if summary wasn't available
        if (!summaryResult || !summaryResult.total_count) {
          this.totalCount = invoiceResult.totalCount || 0;
        }
      }

    } catch (error) {
      this.errorMessage = this._extractError(error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load the next page of invoices (triggered by infinite scroll).
   * Appends results to the existing this.invoices array.
   */
  async handleLoadMore() {
    if (this.isLoadingMore || !this.hasMoreRecords) return;

    this.isLoadingMore = true;

    try {
      const result = await getAccountInvoices({
        accountId:    this.recordId,
        statusFilter: this.selectedStatus || null,
        pageSize:     this.pageSize,
        pageOffset:   this.currentOffset,
      });

      if (result.invoices && result.invoices.length > 0) {
        // Append new page to existing list
        this.invoices      = [...this.invoices, ...result.invoices];
        this.currentOffset = this.invoices.length;
        this.hasMoreRecords = this.invoices.length < (this.totalCount || 0);
      } else {
        this.hasMoreRecords = false;
      }
    } catch (error) {
      this._showToast('Error loading more', this._extractError(error), 'error');
    } finally {
      this.isLoadingMore = false;
    }
  }

  // ── Event handlers ───────────────────────────────────────────────

  handleStatusChange(event) {
    this.selectedStatus = event.detail.value;
    this._resetAndReload();
  }

  handleClearFilter() {
    this.selectedStatus = '';
    this._resetAndReload();
  }

  handleRefresh() {
    this._resetAndReload();
    this._showToast(
      'Refreshed',
      'Invoice data refreshed live from Neon PostgreSQL.',
      'success'
    );
  }

  /**
   * Client-side sort — sorts the already-loaded invoices array.
   * For server-side sort, call _resetAndReload() with sortedBy/sortDirection.
   */
  handleSort(event) {
    const { fieldName, sortDirection } = event.detail;
    this.sortedBy      = fieldName;
    this.sortDirection = sortDirection;

    const multiplier = sortDirection === 'asc' ? 1 : -1;
    this.invoices = [...this.invoices].sort((a, b) => {
      const av = a[fieldName] ?? '';
      const bv = b[fieldName] ?? '';
      if (av > bv) return  1 * multiplier;
      if (av < bv) return -1 * multiplier;
      return 0;
    });
  }

  // ── Private helpers ──────────────────────────────────────────────

  _resetAndReload() {
    this.invoices       = [];
    this.currentOffset  = 0;
    this.hasMoreRecords = true;
    this.loadInitialData();
  }

  _showToast(title, message, variant) {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }

  _extractError(error) {
    if (typeof error === 'string')   return error;
    if (error?.body?.message)        return error.body.message;
    if (error?.message)              return error.message;
    return 'An unexpected error occurred. Check browser console for details.';
  }
}
