import { defineCollection, z } from 'astro:content';

export const CATEGORIES = [
  'engine-architecture',
  'netcode-multiplayer',
  'retro-hardware',
  'audio-ml-tooling',
  'devlog-retrospective',
] as const;

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.enum(CATEGORIES),
    tags: z.array(z.string()).default([]),
    series: z
      .object({
        slug: z.string(),
        title: z.string(),
        part: z.number(),
      })
      .optional(),
    lang: z.enum(['ja', 'en']).default('ja'),
    draft: z.boolean().default(false),
    // Repo the post is about, for an optional "出典" footer link. Only set
    // this for repos the user is comfortable linking publicly.
    sourceRepo: z.string().optional(),
  }),
});

export const collections = { posts };
