/**
 * Display HTML for a closed `<prose-mirror>`.
 *
 * v14's `HTMLProseMirrorElement` keeps two separate strings: the raw form
 * value, taken from the `value` attribute, and the *enriched* content it shows
 * while a `toggled` editor is closed — and the constructor reads that second
 * one straight off the element's body (`this.#enriched = enriched ||
 * this.innerHTML`). An element written with an empty body therefore renders an
 * empty `.editor-content` div: the text is in the document, and in `value`, but
 * invisible until the user clicks the edit button. Probed on 14.365.
 *
 * So every toggled editor in this system passes its enriched HTML as the
 * element's body. The value attribute still carries the raw text, which is what
 * the editor loads when it opens and what gets submitted back.
 */

/** Anything that looks like real markup, as opposed to prose containing "<". */
const LOOKS_LIKE_HTML = /<\/?[a-z][a-z0-9]*(\s[^<>]*)?\/?>/i;

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Enrich a stored text field for display.
 *
 * The shipped compendium descriptions are plain text with `\n` between
 * paragraphs, and `enrichHTML` passes newlines through untouched — HTML then
 * collapses them into single spaces, so 186 perks would read as one wall of
 * text. Plain values are therefore split into paragraphs first; a value that
 * already carries markup (anything a user has typed through the editor) is
 * enriched as-is.
 */
export async function enrichField(
  value: string | undefined | null,
  options: { secrets?: boolean; relativeTo?: unknown; rollData?: object } = {},
): Promise<string> {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const html = LOOKS_LIKE_HTML.test(raw)
    ? raw
    : raw
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join("");
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(html, options);
}
