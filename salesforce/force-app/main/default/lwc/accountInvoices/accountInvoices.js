/**
 * accountInvoices LWC Controller
 * ================================
 * Master-detail view of invoices from Neon PostgreSQL on the Account record page.
 * Uses zero-copy architecture: data is queried live via Salesforce Connect
 * → OData server on Render → Neon PostgreSQL. Nothing is stored in Salesforce.
 */

import { LightningElement, api, track } from 'lwc';
import getAccountInvoices from '@salesforce/apex/InvoiceController.getAccountInvoices';
import getStatusSummary   from '@salesforce/apex/InvoiceController.getStatusSummary';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const PAGE_SIZE = 10;

export default class AccountInvoices extends LightningElement {
  @api recordId;

  // ── State ───────────────────────────────────────────────────────
  @track invoices        = [];
  @track isLoading       = false;
  @track errorMessage    = '';
  @track selectedStatus  = '';
  @track searchTerm      = '';
  @track selectedInvoice = null;
  @track currentPage     = 1;

  // Summary card counts
  @track totalCount   = 0;
  @track paidCount    = 0;
  @track pendingCount = 0;
  @track overdueCount = 0;

  // Non-reactive — used only for DOM styling, not template binding
  _activeIndex = -1;

  // Pagination
  pageSize       = PAGE_SIZE;
  hasMoreRecords = true;

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

  get hasError()           { return Boolean(this.errorMessage); }
  get showContent()        { return !this.isLoading && !this.hasError; }
  get noSelectedInvoice()  { return this.selectedInvoice === null; }
  get hasSelectedInvoice() { return this.selectedInvoice !== null; }

  // filteredInvoices does NOT reference selectedInvoice — no render cycle
  get filteredInvoices() {
    let list = this.invoices;
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      list = list.filter(inv => {
        const fields = [
          inv.invoice_no__c,
          inv.customer_name__c,
          inv.description__c,
          inv.status__c,
          inv.amount__c != null ? String(inv.amount__c) : '',
        ];
        return fields.some(f => f && f.toLowerCase().includes(term));
      });
    }
    return list.map(inv => ({
      ...inv,
      badgeClass: 'badge-' + (inv.status__c || 'unknown').toLowerCase(),
    }));
  }

  get hasInvoices() { return this.filteredInvoices.length > 0; }
  get isEmpty()     { return !this.isLoading && !this.hasError && this.filteredInvoices.length === 0; }

  get totalPages() {
    const filtered = this.searchTerm ? this.filteredInvoices.length : this.totalCount;
    return Math.max(1, Math.ceil(filtered / this.pageSize));
  }

  get isPreviousDisabled() { return this.currentPage <= 1; }
  get isNextDisabled()     { return this.currentPage >= this.totalPages && !this.hasMoreRecords; }

  get paginationLabel() {
    return `Page ${this.currentPage} of ${this.totalPages}`;
  }

  get selectedBadgeClass() {
    if (!this.selectedInvoice) return '';
    return 'badge-' + (this.selectedInvoice.status__c || 'unknown').toLowerCase();
  }

  // ── Lifecycle ───────────────────────────────────────────────────
  connectedCallback() {
    this.loadInitialData();
  }

  renderedCallback() {
    this._applySelectedStyling();
  }

  // ── Data loading ────────────────────────────────────────────────

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

      if (summaryResult) {
        this.totalCount   = summaryResult.total_count   || 0;
        this.paidCount    = summaryResult.Paid_count    || 0;
        this.pendingCount = summaryResult.Pending_count || 0;
        this.overdueCount = summaryResult.Overdue_count || 0;
      }

      if (invoiceResult.errorMessage) {
        this.errorMessage = invoiceResult.errorMessage;
      } else {
        this.invoices       = invoiceResult.invoices || [];
        this.hasMoreRecords = this.invoices.length === this.pageSize;

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

  async loadPage(page) {
    this.isLoading = true;
    const offset = (page - 1) * this.pageSize;

    try {
      const result = await getAccountInvoices({
        accountId:    this.recordId,
        statusFilter: this.selectedStatus || null,
        pageSize:     this.pageSize,
        pageOffset:   offset,
      });

      if (result.errorMessage) {
        this.errorMessage = result.errorMessage;
      } else {
        this.invoices       = result.invoices || [];
        this.currentPage    = page;
        this.hasMoreRecords = this.invoices.length === this.pageSize;
      }
    } catch (error) {
      this._showToast('Error', this._extractError(error), 'error');
    } finally {
      this.isLoading = false;
    }
  }

  // ── Event handlers ───────────────────────────────────────────────

  handleStatusChange(event) {
    this.selectedStatus = event.detail.value;
    this.currentPage    = 1;
    this._clearSelection();
    this._resetAndReload();
  }

  handleClearFilter() {
    this.selectedStatus = '';
    this.searchTerm     = '';
    this.currentPage    = 1;
    this._clearSelection();
    this._resetAndReload();
  }

  handleSearchInput(event) {
    clearTimeout(this._searchTimeout);
    const value = event.target.value;
    this._searchTimeout = setTimeout(() => {
      this.searchTerm  = value;
      this.currentPage = 1;
      this._clearSelection();
    }, 300);
  }

  handleSearchChange(event) {
    this.searchTerm  = event.target.value;
    this.currentPage = 1;
    this._clearSelection();
  }

  handleSelectInvoice(event) {
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    const list = this.filteredInvoices;
    if (idx >= 0 && idx < list.length) {
      this._activeIndex = idx;
      this.selectedInvoice = Object.assign({}, list[idx]);
      this._applySelectedStyling();
    }
  }

  handlePreviousPage() {
    if (this.currentPage > 1) {
      this._clearSelection();
      this.loadPage(this.currentPage - 1);
    }
  }

  handleNextPage() {
    this._clearSelection();
    this.loadPage(this.currentPage + 1);
  }

  handleRefresh() {
    this.currentPage = 1;
    this._clearSelection();
    this._resetAndReload();
    this._showToast(
      'Refreshed',
      'Invoice data refreshed live from Neon PostgreSQL.',
      'success'
    );
  }

  // ── Private helpers ──────────────────────────────────────────────

  _clearSelection() {
    this._activeIndex = -1;
    this.selectedInvoice = null;
  }

  _applySelectedStyling() {
    const rows = this.template.querySelectorAll('.invoice-row');
    rows.forEach(row => {
      const rowIdx = parseInt(row.dataset.index, 10);
      if (rowIdx === this._activeIndex) {
        row.classList.add('invoice-row--selected');
      } else {
        row.classList.remove('invoice-row--selected');
      }
    });
  }

  _resetAndReload() {
    this.invoices       = [];
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
