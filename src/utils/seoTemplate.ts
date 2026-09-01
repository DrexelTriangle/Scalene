/**
 * Yoast SEO title templates, expanded here.
 *
 * WordPress stored an article's SEO title as a Yoast template rather than as
 * finished text -- "%%title%% %%page%%", or an editor-written headline with
 * "%%page%% %%sep%% %%sitename%%" appended -- and Yoast substituted the
 * variables at render time. The import kept the templates verbatim, and nothing
 * expands them now, so the raw tokens reached <title>, og:title and
 * twitter:title: a 2022 crossword showed up in the browser tab, in search
 * results and on every shared link as "%%title%% %%page%%".
 *
 * Only the variables the corpus actually carries are substituted. Anything else
 * is dropped rather than left visible: an unrecognised token is still a token,
 * and printing it is the bug being fixed.
 */

const VARIABLE_PATTERN = /%%[a-z0-9_]+%%/gi;

export interface SeoVariables {
  /** The article headline, for %%title%%. */
  title?: string;
  /** The publication name, for %%sitename%%. */
  sitename?: string;
  /** The article's first category, for %%primary_category%%. */
  primary_category?: string;
  /** Yoast's title separator, for %%sep%%. Its default is an en dash. */
  sep?: string;
}

/** Does this value still carry an unexpanded Yoast variable? */
export function hasSeoVariables(value: string | null | undefined): boolean {
  return VARIABLE_PATTERN.test(String(value ?? ""));
}

/**
 * Expand the Yoast variables in a title template.
 *
 * %%page%% is deliberately absent from the substitutions: it numbers the pages
 * of a paginated archive, and an article is one page, so Yoast rendered it as
 * nothing here too.
 *
 * Returns "" when the template expands to nothing usable, so the caller can
 * fall back the same way it does for a missing SEO title.
 */
export function expandSeoVariables(
  template: string | null | undefined,
  variables: SeoVariables = {},
): string {
  const raw = String(template ?? "");
  if (!raw) return "";

  const sep = variables.sep?.trim() || "-";
  const substitutions: Record<string, string> = {
    title: variables.title?.trim() ?? "",
    sitename: variables.sitename?.trim() ?? "",
    primary_category: variables.primary_category?.trim() ?? "",
    sep,
  };

  const expanded = raw.replace(VARIABLE_PATTERN, (token) => {
    const name = token.slice(2, -2).toLowerCase();
    return Object.hasOwn(substitutions, name) ? substitutions[name] : "";
  });

  return tidySeparators(expanded, sep);
}

/**
 * A dropped variable leaves the punctuation that framed it behind: expanding
 * "%%title%% %%page%% %%sep%% %%sitename%%" on an article gives a double space
 * before the separator, and a template ending in %%sep%% leaves a title hanging
 * on a dash. Collapse the whitespace, drop separators that no longer sit
 * between two things, and return "" if nothing but punctuation survived.
 */
function tidySeparators(value: string, sep: string): string {
  const escaped = sep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const collapsed = value
    .replace(/\s+/g, " ")
    .replace(new RegExp(`(?:\\s*${escaped}\\s*){2,}`, "g"), ` ${sep} `)
    .trim()
    .replace(new RegExp(`^(?:${escaped}\\s*)+`), "")
    .replace(new RegExp(`(?:\\s*${escaped})+$`), "")
    .trim();

  return collapsed === sep ? "" : collapsed;
}
