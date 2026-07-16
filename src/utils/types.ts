/**
 * Shapes returned by the CMS (cms.thetriangle.org/wp-json/triangle/*).
 * Derived from the live API responses; the WordPress side is the source of
 * truth, so widen a field here rather than casting at a call site if it drifts.
 */

export interface Author {
  id: string;
  name: string;
  slug: string;
  url: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
}

export interface Tag {
  name: string;
  slug: string;
}

export interface Seo {
  seo_title: string;
  meta_description: string;
  focus_keyword: string;
  canonical_url: string;
  tags: Tag[];
}

/** Article as listed in /v1/homepage, /v2/section, /v2/author and /v1/search. */
export interface ArticleSummary {
  slug: string;
  date: string;
  title: string;
  authors: Author[];
  excerpt: string;
  featured_image: string;
  categories_list: Category[];
  breaking_news?: boolean;
}

/** Sidebar "related" entries carried on a full article. */
export interface RelatedArticle {
  id: number;
  slug: string;
  title: string;
  url: string;
  date: string;
  featured_image: string;
  shared_tags: number;
  authors: Author[];
}

/** Full article from /v1/post/<slug>. */
export interface Article {
  slug: string;
  date: string;
  title: string;
  authors: Author[];
  content: string;
  featured_image: string;
  categories_list: Category[];
  seo: Seo;
  related: RelatedArticle[];
}

/**
 * Homepage "developing stories" rail. The live endpoint returns [] today, so
 * these fields are taken from what Developing.astro/DevStory.astro render
 * rather than from a sample response.
 */
export interface DevelopingStory {
  title: string;
  link: string;
  excerpt: string;
  label: string;
}

export interface Homepage {
  news: ArticleSummary[];
  opinion: ArticleSummary[];
  sports: ArticleSummary[];
  entertainment: ArticleSummary[];
  candp: ArticleSummary[];
  columns: ArticleSummary[];
  developingstories: DevelopingStory[];
}

export interface SectionInfo {
  id: number;
  name: string;
  slug: string;
  description: string;
}

export interface Subsection {
  id: number;
  name: string;
  slug: string;
}

export interface Pagination {
  currentPage: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface SectionArticles {
  section: SectionInfo;
  subsections: Subsection[];
  articles: ArticleSummary[];
  pagination: Pagination;
}

/**
 * The fields the Section-* row components actually render. Both ArticleSummary
 * and RelatedArticle satisfy this, which is what lets Section.astro forward
 * either kind of list to a row component without a union at every call site.
 */
export interface SectionCardArticle {
  slug: string;
  title: string;
  date: string;
  authors: Author[];
  featured_image: string;
  excerpt?: string;
  categories_list?: Category[];
  breaking_news?: boolean;
}

export interface AuthorInfo {
  display_name: string;
  slug: string;
}

/** /v2/author/<slug> — same paging as a section, but keyed by author. */
export interface AuthorArticles {
  author: AuthorInfo;
  articles: ArticleSummary[];
  pagination: Pagination;
}

export interface GalleryImage {
  id: number;
  title: string;
  url: string;
}

/** /v2/sitemap-slugs — every published article, for the year-partitioned sitemaps. */
export interface SitemapSlug {
  slug: string;
  lastmod: string;
}

export interface ClassifiedPost {
  title: string;
  content: string;
  meta: { email: string; label: string };
}
