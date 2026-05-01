import he from "he";

export function normalizeText(s) {
    if (!s) return s;
    s = he.decode(s).replace(/<[^>]*>/g, "")
    return s
    // replace smart single quotes (’ ‘) with straight apostrophe
    .replace(/\u2018|\u2019|\u201B/g, "'")
    // replace smart double quotes (“ ”) with straight quotes
    .replace(/\u201C|\u201D/g, '"')
    // replace unicode ellipsis (…) with three dots
    .replace(/\u2026/g, '...')
    // replace common mojibake sequence for ellipsis (â€¦) with three dots
    .replace(/â€¦/g, '...')
    .replace(/\u2014/g, "–")
    // collapse repeated whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Replace absolute CMS image URLs with the local /proxy path,
 * and strip srcset attributes (not needed with proxy images).
 * Used in article pages to rewrite WordPress content HTML.
 */
export function proxyContent(html) {
  return html
    .replaceAll('https://cms.thetriangle.org/wp-content', '/proxy/wp-content')
    .replaceAll('https://www.thetriangle.org/wp-content', '/proxy/wp-content')
    .replace(/srcset="[^"]*"/g, '');
}


/**
 * Format a date string like "March 5, 2025" using AP-style month abbreviations.
 * Used consistently in article bylines and listings.
 */
const MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June',
                'July', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

export function formatDate(dateString) {
  const d = new Date(dateString);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Build the author byline as an HTML string with links.
 * Returns a string like: "<a href='/author/jane'>Jane</a> and <a ...>John</a> | March 5, 2025"
 */
export function buildByline(authors, dateString) {
  if (!authors || !authors.length) return '';

  const links = authors.map(
    (a) => `<a class='hover:underline' href='/author/${a.slug}'>${a.name}</a>`
  );

  if (links.length > 1) {
    links[links.length - 1] = ' and ' + links[links.length - 1];
  }

  const authorStr = links.length > 2 ? links.join(', ') : links.join('');
  return dateString ? `${authorStr} | ${formatDate(dateString)}` : authorStr;
}
