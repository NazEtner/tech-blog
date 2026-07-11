import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { getPostHref } from '../../../utils/posts';
import { CATEGORIES } from '../../../content/config';
import type { APIContext } from 'astro';

export async function getStaticPaths() {
  return CATEGORIES.map((category) => ({ params: { category } }));
}

export async function GET(context: APIContext) {
  const category = context.params.category as string;
  const posts = await getCollection('posts', (p) => !p.data.draft && p.data.category === category);
  return rss({
    title: `tech-blog: ${category}`,
    description: `tech-blogのカテゴリ「${category}」のフィード`,
    site: context.site!,
    items: posts
      .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
      .map((post) => ({
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.pubDate,
        link: getPostHref(post),
      })),
  });
}
