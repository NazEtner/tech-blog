// Build-time OG image generation: one 1200x630 PNG per published post,
// rendered from the post's frontmatter (title + tags). satori lays out
// the text (with Japanese line wrapping) into SVG paths, resvg rasterizes
// to PNG, so no fonts are needed at render time in the browser.
//
// URLs mirror the collection slug: /blog/og/ja/<slug>.png, /blog/og/en/<slug>.png
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// process.cwd() is the project root both in `astro dev` and `astro build`.
const fontData = readFileSync(
  join(process.cwd(), 'src', 'assets', 'fonts', 'NotoSansJP-Bold.otf')
);

const BG = '#121212';
const FG = '#e6e6e6';
const MUTED = '#a0a0a0';
const ACCENT = '#2563eb';
const ACCENT_LIGHT = '#60a5fa';

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection('posts', (p) => !p.data.draft);
  return posts.map((entry) => ({ params: { slug: entry.slug }, props: { entry } }));
};

interface Props {
  entry: CollectionEntry<'posts'>;
}

// satori accepts React-element-shaped plain objects; a tiny helper keeps
// the tree readable without pulling in JSX.
function el(style: Record<string, unknown>, children: unknown): unknown {
  return { type: 'div', props: { style, children } };
}

export const GET: APIRoute<Props> = async ({ props }) => {
  const { title, tags } = props.entry.data;

  const tree = el(
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: BG,
      fontFamily: 'Noto Sans JP',
    },
    [
      el({ height: 12, backgroundColor: ACCENT }, undefined),
      el(
        {
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 72px',
        },
        [
          el(
            {
              display: 'block',
              lineClamp: 4,
              fontSize: 58,
              lineHeight: 1.4,
              color: FG,
            },
            title
          ),
          el(
            { display: 'flex', flexDirection: 'column', gap: 20 },
            [
              tags.length > 0
                ? el(
                    { display: 'flex', fontSize: 26, color: MUTED },
                    tags.slice(0, 5).map((t) => `#${t}`).join('　')
                  )
                : el({ display: 'flex' }, undefined),
              el(
                {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                },
                [
                  el({ display: 'flex', fontSize: 36, color: '#ffffff' }, 'なななみの倉庫'),
                  el({ display: 'flex', fontSize: 30, color: ACCENT_LIGHT }, 'nazet.jp'),
                ]
              ),
            ]
          ),
        ]
      ),
      el({ height: 12, backgroundColor: ACCENT }, undefined),
    ]
  );

  const svg = await satori(tree as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: [{ name: 'Noto Sans JP', data: fontData, weight: 700, style: 'normal' }],
  });

  // satori outputs glyphs as SVG paths, so resvg needs no fonts; skipping
  // the system font scan cuts ~50s off the first render on Windows.
  const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
};
