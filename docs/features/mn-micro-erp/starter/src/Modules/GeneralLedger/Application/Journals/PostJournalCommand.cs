namespace Erp.GeneralLedger.Application.Journals;

/// <summary>Post (or preview) a set of journal lines through a journal template / batch (05-posting-engine.md §5.4).</summary>
internal sealed record PostJournalCommand(string TemplateCode, string BatchCode, IReadOnlyList<JournalLineInput> Lines);
