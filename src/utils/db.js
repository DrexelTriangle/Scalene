
export async function getHomepageArticles() {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/homepage';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) throw new Error(res.status);
  return res.json();
}

export async function getSectionArticles(section, page) {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v2/section/'+section+'?page='+page;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}

export async function getAuthorArticles(author, page) {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v2/author/'+author+'?page='+page;

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