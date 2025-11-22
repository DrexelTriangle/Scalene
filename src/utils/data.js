export function normalizeText(s) {
    if (!s) return s;
    return s
    // replace smart single quotes (’ ‘) with straight apostrophe
    .replace(/\u2018|\u2019|\u201B/g, "'")
    // replace smart double quotes (“ ”) with straight quotes
    .replace(/\u201C|\u201D/g, '"')
    // replace unicode ellipsis (…) with three dots
    .replace(/\u2026/g, '...')
    // replace common mojibake sequence for ellipsis (â€¦) with three dots
    .replace(/â€¦/g, '...')
    // collapse repeated whitespace
    .replace(/\s+/g, ' ')
    .trim();
}