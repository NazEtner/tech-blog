import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { getPostHref } from '../../utils/posts';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('posts', (p) => !p.data.draft);
  return rss({
    title: 'なななみの倉庫 Blog',
    description: 'いつものコードを、たまには読み物として。',
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
