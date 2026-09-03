/**
 * Shapes returned by the CMS (cms.thetriangle.org/wp-json/triangle/*).
 * Derived from the live API responses; the WordPress side is the source of
 * truth, so widen a field here rather than casting at a call site if it drifts.
 *
 * Fields marked "triangle-cms" are served by the Go CMS at /v1/* rather than by
 * WordPress. They are optional because pages still render against either
 * backend while the cutover is in progress.
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
  /** triangle-cms: ISO timestamp; preferred over `date` when present. */
  published_date?: string;
  /** triangle-cms: replaces `categories_list`. */
  categories?: Category[];
  /** triangle-cms: controls whether public comment submission is open. */
  comment_status?: string;
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
  /**
   * triangle-cms: the editor's description of `featured_image`, written on the
   * article rather than on the library record. Absent on WordPress-era
   * articles, which never had anywhere to put one.
   */
  featured_image_alt?: string;
  categories_list: Category[];
  seo: Seo;
  related: RelatedArticle[];
  /** triangle-cms: ISO timestamp; preferred over `date` when present. */
  published_date?: string;
  /** triangle-cms: replaces `categories_list`. */
  categories?: Category[];
  /** triangle-cms: controls whether public comment submission is open. */
  comment_status?: string;
}

/**
 * Homepage "developing stories" rail. The live endpoint returns [] today, so
 * these fields are taken from what Developing.astro/DevStory.astro render
 * rather than from a sample response.
 */
export interface DevelopingStory {
  title: string;
  link?: string;
  excerpt?: string;
  /** Rendered as a badge by DevStory.astro, which reads `label[0].name`. */
  label?: Array<{ name: string }>;
}

/** triangle-cms: one story on the breaking-news banner. */
export interface BreakingNewsItem {
  text: string;
  /**
   * Set when an editor raised the banner by flagging an article; absent for a
   * banner an admin typed by hand, which links nowhere. The CMS sends the slug
   * alone and leaves the /article/ prefix to us, as it does for developing
   * stories.
   */
  article_slug?: string;
}

/** triangle-cms: sitewide breaking-news banner served on /v1/homepage. */
export interface BreakingNews {
  enabled: boolean;
  /**
   * `items` is the whole banner, newest story first. `text` and `article_slug`
   * describe items[0] and predate it: a CMS that has not deployed multiple
   * breaking stories yet sends only those two, so read them as the fallback
   * rather than assuming `items` is there.
   */
  text: string;
  article_slug?: string;
  items?: BreakingNewsItem[];
}

/** triangle-cms: one item in the editable homepage Splide carousel. */
export interface HomepageCarouselSlide {
  enabled: boolean;
  title: string;
  link_url: string;
  image_url: string;
  background_color: string;
  text_color: string;
  desktop_only: boolean;
}

export interface Homepage {
  news: ArticleSummary[];
  opinion: ArticleSummary[];
  sports: ArticleSummary[];
  entertainment: ArticleSummary[];
  candp: ArticleSummary[];
  columns: ArticleSummary[];
  developingstories: DevelopingStory[];
  /** triangle-cms */
  breaking_news?: BreakingNews;
  /** triangle-cms */
  carousel?: HomepageCarouselSlide[];
}

export interface SectionInfo {
  id: number;
  name: string;
  slug: string;
  description: string;
  /** triangle-cms: display title, preferred over `name` when present. */
  canonical_title?: string;
}

export interface Subsection {
  id: number;
  name: string;
  slug: string;
  /** triangle-cms: display title, preferred over `name` when present. */
  canonical_title?: string;
}

/**
 * triangle-cms pagination. Note the snake_case: this is the CMS JSON shape,
 * not the camelCase one the old WordPress endpoints returned. Reading
 * `hasMore` off this silently yields undefined, which reads as "no more
 * pages" and stops infinite scroll before it makes a single request.
 */
export interface Pagination {
  page: number;
  limit: number;
  offset: number;
  has_more: boolean;
  total_count: number;
}

export interface SectionArticles {
  section: SectionInfo;
  subsections: Subsection[];
  articles: ArticleSummary[];
  pagination: Pagination;
  /** triangle-cms: set only on /v1/subsections/<slug>/articles responses. */
  subsection?: Subsection;
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
  /** triangle-cms: ISO timestamp; preferred over `date` when present. */
  published_date?: string;
  /** triangle-cms: replaces `categories_list`. */
  categories?: Category[];
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

/** triangle-cms: one image from /v1/gallery. */
export interface GalleryImage {
  id: number;
  path: string;
  file_name: string;
  url: string;
  mime_type: string;
  width?: number;
  height?: number;
  alt_text?: string;
}

/** triangle-cms: /v1/sitemap/slugs — every live article, for the year-partitioned sitemaps. */
export interface SitemapSlug {
  slug: string;
  lastmod: string;
}

/** triangle-cms: /v1/articles/random — just enough to redirect to. */
export interface RandomArticle {
  slug: string;
  title: string;
}

/** triangle-cms: a comment from /v1/articles/<slug>/comments. */
export interface Comment {
  id: number;
  article_id: number;
  /** 0 for a top-level comment, otherwise the id of the comment replied to. */
  parent_id: number;
  author_name: string;
  author_url?: string;
  content: string;
  created_at?: string;
  created_at_gmt?: string;
  status: string;
  type: string;
}

/** triangle-cms: /v1/articles/<slug>/comments. */
export interface ArticleComments {
  article_slug: string;
  comments: Comment[];
  total_count: number;
}

/**
 * triangle-cms: one row of the CMS's site_taxonomy. `/v1/taxonomy` returns
 * these as a bare array -- sections, subsections and tags together, so callers
 * that care about one kind have to filter on `type`.
 */
export interface TaxonomyItem {
  id: number;
  type: 'section' | 'subsection' | 'tag';
  slug: string;
  canonical_title: string;
  /** Set on subsections: the slug of the section they hang under. */
  parent_slug?: string;
  article_count: number;
  /** Extra category titles whose articles also belong to this item. */
  category_aliases: string[];
}

/** triangle-cms: an approved classified from /v1/classifieds. */
export interface ClassifiedPost {
  id: number;
  name: string;
  email: string;
  label: string;
  message: string;
  end_date: string;
  status: string;
  created_at?: string;
}
