namespace Erp.GeneralLedger.Domain;

/// <summary>Stable error codes owned by the G/L module (05-posting-engine.md §8).</summary>
internal static class GlErrorCodes
{
    public const string VoucherEmpty = "gl.voucher_empty";
    public const string VoucherUnbalanced = "gl.voucher_unbalanced";
    public const string AmountNotRounded = "gl.amount_not_rounded";
    public const string LineAmountZero = "gl.line_amount_zero";
    public const string DuplicateLineKey = "gl.duplicate_line_key";
    public const string PeriodNotFound = "gl.period_not_found";
    public const string PeriodClosed = "gl.period_closed";
    public const string PeriodLocked = "gl.period_locked";
    public const string PostingDateOutsideWindow = "gl.posting_date_outside_window";
    public const string AccountNotFound = "gl.account_not_found";
    public const string AccountNotPosting = "gl.account_not_posting";
    public const string AccountBlocked = "gl.account_blocked";
    public const string DirectPostingNotAllowed = "gl.direct_posting_not_allowed";
    public const string ReasonCodeRequired = "gl.reason_code_required";
    public const string ReasonCodeNotFound = "gl.reason_code_not_found";
    public const string ReasonCodeBlocked = "gl.reason_code_blocked";
    public const string ClosingEntryInvalid = "gl.closing_entry_invalid";
    public const string PostingDateRequired = "gl.posting_date_required";
    public const string DocumentNoRequired = "gl.document_no_required";
    public const string JournalEmpty = "gl.journal_empty";
    public const string JournalTemplateNotFound = "gl.journal_template_not_found";
    public const string JournalSeriesMissing = "gl.journal_series_missing";
    public const string GenPostingTypeRequired = "gl.gen_posting_type_required";
    public const string TransactionNotFound = "gl.transaction_not_found";
    public const string TransactionAlreadyReversed = "gl.transaction_already_reversed";
    public const string ReversalNotReversible = "gl.reversal_not_reversible";
    public const string ReversalUseCreditMemo = "gl.reversal_use_credit_memo";
    public const string PostingLockTimeout = "gl.posting_lock_timeout";
    public const string NumberSeriesMissingLine = "platform.number_series_missing_line";
    public const string NumberSeriesDateOrder = "platform.number_series_date_order";
    public const string NumberSeriesExhausted = "platform.number_series_exhausted";
}
