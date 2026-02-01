
export async function getHomepageArticles() {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/homepage';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) throw new Error(res.status);
  return res.json();
}

export async function getSectionArticles(section) {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/section/'+section;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}

export async function getAuthorArticles(author) {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/author/'+author;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}

export async function getArticle(article) {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/post/' + article;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}

export async function search(search) {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/search?q=' + search;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}
export async function gallery() {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/gallery';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}