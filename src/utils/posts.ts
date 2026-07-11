import type { CollectionEntry } from 'astro:content';

// Posts live under src/content/posts/<lang>/<slug>.md purely for author
// convenience; Astro's default collection slug includes that lang
// directory (e.g. "ja/my-post"). Routing uses /blog/posts/<slug>/ (ja,
// default) and /blog/en/posts/<slug>/ (en) without the lang segment, so
// strip it here.
export function getPostSlug(entry: CollectionEntry<'posts'>): string {
  const parts = entry.slug.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : entry.slug;
}

export function getPostHref(entry: CollectionEntry<'posts'>): string {
  const slug = getPostSlug(entry);
  return entry.data.lang === 'en' ? `/blog/en/posts/${slug}/` : `/blog/posts/${slug}/`;
}
