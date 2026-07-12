# なななみの倉庫 仕様書（リポジトリ名: tech-blog）

個人サイト。トップページから **Blog** / **Portfolio** / **About** の3つに分かれる。Blogは日々の開発（ゲームエンジン、ネットコード、レトロハードウェア、音声/ML系ツール等）の中から面白いものを厳選して公開し、Google AdSenseで広告収入を得るのが主目的。Portfolioは作ってきたものの紹介（現状プレースホルダー、中身未着手）。

記事候補は [`blogscan`](N:\repos\tools\blogscan)（別リポジトリ）が自動生成する。厳選・執筆は人間が行う。このリポジトリはサイト本体（ビルド設定・テンプレート・記事コンテンツ）を持つ。リポジトリ名は`tech-blog`のまま（GitHub上の実名）だが、サイトの表示名・ブランドは「なななみの倉庫」。

現状: サイト実装済み（2026-07-10、ビルド・主要ページ確認済み）。ドメイン決定済み。ドメイン反映・自前サーバー構築・AdSense申請等は未着手。

**ドメイン: `nazet.jp`（apex）**。所有ドメインは`nazet.jp`と`nazetws.com`の2つで、apexの`ads.txt`要件のシンプルさを優先して`nazet.jp`を採用。`nazetws.com`は別プロジェクト用に温存。

---

## 1. ホスティング構成（GitHub Pages + Cloudflare Tunnel経由の自前LXC）

役割分担の原則：**GitHub Pagesにできないことだけ自前LXCが担う**。ポートは一切開放しない方針（自宅/自前サーバーのグローバルIP露出を避けるため）のため、GitHub Pagesへの透過プロキシは自前サーバーではなく **Cloudflareの通常DNS/CDN機能** に任せ、自前LXCは **Cloudflare Tunnel（cloudflared）** 経由でしか外部と通信しない。

- **前提**：`nazet.jp` のネームサーバーをCloudflareに委任する（Cloudflareに無料でゾーン追加）必要がある。cloudflaredのトンネル・ホスト名紐付けもCloudflare側の機能なので、Cloudflareでのドメイン管理が前提になる。
- **GitHub Pages（メインサイト）**：`nazet.jp` の通常のDNSレコード（GitHub Pages公式手順どおりのA/CNAME、Cloudflareプロキシ有効でTLS/キャッシュ込み）をGitHub Pagesへ直接向ける。`/`, `/posts/*`, `/rss.xml`, `/ads.txt`, `/sitemap.xml` など静的コンテンツは全てここで完結し、自前LXCを経由しない。`ads.txt`もGitHub Pagesが実ドメイン直下でそのまま返すため、「素通し」を別途実装する必要がなくなった（旧設計より単純化）。
- **自前LXC（cloudflaredのみが担当する部分）**：
  1. **cloudflared**：LXC上でトンネルクライアントとして常駐。LXC→Cloudflareへの outbound 接続のみで、80/443番ポートの開放は不要
  2. 将来の動的機能（アクセス解析コレクタ、コメントAPI、検索、ニュースレター等）は、別ホスト名 `api.nazet.jp` をCloudflare Tunnel経由でこのLXCの該当ローカルポートにルーティングして公開する（メインサイトのドメイン`nazet.jp`とは分離し、GitHub Pages側のホスト解決と混線させない）
  3. **コメント機能**：まずは **giscus**（GitHub Discussions連携、サーバー不要）で開始。将来、自前でコメントデータを持ちたくなったらこのLXC上に軽量APIを立て、`api.nazet.jp`経由で公開する
  4. **ファーストパーティ解析**：Google Analyticsの代わりにこのLXC上でPlausible/Umami系の軽量セルフホスト解析（`api.nazet.jp`経由）

リクエストフロー概要：
```
nazet.jp（Cloudflare DNS） → GitHub Pages（直結、静的コンテンツ全部）
api.nazet.jp（Cloudflare Tunnel） → 自前LXC上のcloudflared → localhost:<port>（解析コレクタ/コメントAPI等、将来実装）
```
自前LXCはコンテンツの複製を持たない＝二重デプロイパイプラインにならない。ポートは一切開放しない。

### cloudflared用LXCのリソース割り当て（2026-07-10決定、2026-07-10 cloudflared方式に更新）

| 項目 | 割り当て | 理由 |
|---|---|---|
| vCPU | 1 core | cloudflared自体は非常に軽量。将来同居させるUmami/コメントAPI込みでも1コアで十分 |
| RAM | 1 GB | cloudflared単体なら100MB未満だが、将来Umami等の解析やコメントAPIを同居させる前提で余裕を持たせた |
| Disk | 16 GB | OS+cloudflared+ログ用途に加え、将来sqlite/postgres（Umami/コメントDB）を見込んだ余裕 |
| Swap | 512 MB | メモリスパイクの安全弁 |
| ネットワーク | **inboundポート開放は不要**（cloudflaredはoutboundのみ）。固定IPも不要 | Cloudflare Tunnelはoutbound接続のみでLXCを外部公開するため |
| コンテナ種別 | unprivileged LXC、**Ubuntu 26.04 LTS**（手元にあるテンプレートを使用） | unprivilegedは引き続き推奨（多層防御として、cloudflaredやその上で動くサービスの脆弱性対策） |

ホスト側の空きリソースが少ない場合はRAM 512MBまで削ってもcloudflared単体としては動作する。

## 2. 静的サイトジェネレータ：Astro

理由：
- コンテンツコレクション＋MDXで、コード多めの技術記事に必要な埋め込みコンポーネント（図解、インタラクティブな可視化等）を静的サイトのまま扱える
- 日英バイリンガルルーティングが標準機能として強い
- Islands architectureでJS出力が最小＝ページ速度（AdSenseの表示品質・Core Web Vitalsにも影響）
- Markdown+frontmatterが `blogscan` の `outline.md` 形式とほぼそのまま繋がる（記事化のときのコピー元）

## 3. サイト構成・タクソノミー

サイト全体はトップページ（`/`）から**Blog / Portfolio / About**の3リンクへ分岐する構成（2026-07-11変更、当初はBlogがそのままトップだった）。

Blogの分類は**タグのみ**（2026-07-11、固定5カテゴリのenum分類から変更）。カテゴリだと排他的な1記事1分類になり、たとえば「ブログ基盤（blogscan/Astroサイト）構築の話」のようなメタな記事がどのカテゴリにも収まらない問題があったため、自由なタグ付けに一本化した。タグは`tags: string[]`でfrontmatterに自由記述（例: `engine-architecture`, `netcode-multiplayer`, `retro-hardware`, `audio-ml-tooling`, `devlog-retrospective`, `meta`, `tooling`等、記事に応じて複数付けてよい）。旧カテゴリ名はタグの語彙としてそのまま使い続けて構わない。

URLスキーム：
```
/                                   トップページ（Blog/Portfolio/Aboutへのリンクのみ）
/blog/                              Blogホーム（最新記事・シリーズ・タグ一覧）
/blog/posts/<slug>/                 個別記事（スラッグは英語kebab-case固定、日本語記事でもURL安定性のため）
/blog/en/posts/<slug>/              英語版記事
/blog/tags/<tag>/                   タグ一覧
/blog/series/<series-slug>/         シリーズ一覧
/blog/rss.xml                       Blog全体フィード
/portfolio/                         Portfolio（現状「準備中」プレースホルダーのみ）
/about/
/privacy/
```

## 4. ページテンプレート

- **トップページ**：Blog/Portfolio/Aboutへの3つの大きなリンクのみのシンプルなランディング
- **記事**：TOC自動生成、Shikiによるシンタックスハイライト、シリーズ前後ナビ、言語切替、広告枠、出典フッター（公開して問題ないリポジトリのみ、記事ごとに設定可能）、タグ一覧
- **シリーズ一覧**：各パートの一言要約と公開状況
- **タグ一覧**：該当記事のリスト
- **Blogホーム**：最新記事、シリーズ進行状況、使われているタグ一覧
- **Portfolio**：現状プレースホルダーのみ、中身は未着手
- **About**：AdSense審査で必須
- **プライバシーポリシー**：AdSense審査で必須

## 5. AdSense統合

- `ads.txt` はAstroプロジェクトの `public/ads.txt` を唯一の情報源とする。Cloudflare Tunnel方式では `nazet.jp` がGitHub Pagesに直結されるため、自前サーバー側で「素通し」を実装する必要はない（GitHub Pagesが実ドメイン直下でそのまま返す）
- 広告スクリプトはベースレイアウトの`<head>`で1回だけ読み込み
- 配置：**コードブロックの直前直後には絶対に広告を挟まない**。導入2〜3段落後に1枠、記事末尾（コメント欄の前）に1枠、広い画面のみサイドバー枠（モバイルは非表示）。Auto adsの「本文内自動挿入」はオフにし、配置は手動制御のみ許可（コード中央への誤挿入を防ぐ）

## 6. AdSense審査を現実的に通すための下地

- 申請前に**最低15〜20記事**を、ある程度トピックの幅（タグの多様性）を持たせて公開しておく（`blogscan`が既存の数千コミットから掘り起こせるので、ゼロから書くより現実的な期間で到達可能）
- postmortem/how-it-worksのような実質のある内容を優先（コミットログの言い換えのような薄い内容は避ける）
- About・プライバシーポリシーページ必須
- sitemap.xml、リンク切れなし、迷子ページなし

## 7. 運用面

- RSS（全体のみ、タグ別RSSは現状無し）
- Shikiでの言語別ハイライト（Rust, C++, HLSL/WGSL, asm, Lua, TS）
- 画像はAstroの画像最適化、図解は極力SVG（ダークモード対応・鮮明さのため）
- i18n：デフォルト日本語、海外興味が見込めるもの（retro-hardware, netcode-multiplayer系）から優先的に英語化
- デプロイ：GitHub Actions上でビルド後、`dist/`に対する最終的な自動シークレットスキャンをCIゲートとして追加してからPagesへデプロイ（`blogscan`側のredactionをすり抜けた人的ミスの最終防波堤）

## 8. 記事の取り込みフロー（`blogscan` との連携）

1. `N:\repos\tools\blogscan\candidates\queue.yaml` で候補をレビューし、気に入ったものは `status: shortlisted` にする（または confidence 0.8以上で自動昇格）
2. `blogscan scan` 実行時に `candidates/drafted/<id>/outline.md` が生成され、定期実行タスクが「変更の概要」と各見出しの本文プローズまで下書きする
3. 気に入った下書きを、このリポジトリの `src/content/posts/<lang>/<slug>.md` にコピーし、frontmatter（title, tags, series, pubDate等。categoryは廃止しタグのみ）を付けて仕上げる
4. `master` にpush → GitHub Actionsでビルド・デプロイ

## 未着手のもの（次にやること）

実装済み（2026-07-10）：Astroプロジェクト雛形、コンテンツコレクションのスキーマ、各種ページテンプレート（記事/カテゴリ/タグ/シリーズ/ホーム/About/プライバシー）、RSS（全体+カテゴリ別）・sitemap、ads.txtプレースホルダーとAdSlotコンポーネント、GitHub Actionsのビルド+シークレットスキャン+Pagesデプロイワークフロー。動作確認用のサンプル記事2本（日英ペア、シリーズ・タグ・コードハイライト確認用）込み。`npm run build`成功、主要ページ全種を実際にブラウザで表示確認済み。

ドメイン決定済み（`nazet.jp`、`astro.config.mjs`の`SITE_URL`に反映済み）。ホスティング方式をCloudflare Tunnel（cloudflared）ベースに決定済み、LXCのリソース割り当て・OS（Ubuntu 26.04 LTS）も決定済み（1節参照）。

実装済み（2026-07-10、続き）：
- ネームサーバーをCloudflareに委任済み
- CT163（Ubuntu 26.04 LTS）を構築、cloudflaredをインストールしダッシュボード管理トンネル（`techblog-ct163`）を接続済み。`api.nazet.jp`はプレースホルダー（`localhost:8080`、実サービス未実装のため502）でルート登録済み
- サンプル記事3本は`draft: true`にして公開時にビルドから除外されるようにした
- `public/CNAME`（`nazet.jp`）を追加。GitHub Pagesはpublicリポジトリ [NazEtner/tech-blog](https://github.com/NazEtner/tech-blog) として作成・push済み（GitHubアカウントがFreeプランのためprivateリポジトリからのPages公開は不可、publicで運用）
- GitHub Pagesを`gh api`でActionsビルドソースとして有効化、カスタムドメイン`nazet.jp`を設定済み
- デプロイworkflowのトリガーブランチを`master`に修正（デフォルトブランチが`main`ではなく`master`だったため、当初`main`指定のままでは発火しなかった不具合を修正）

実装済み（2026-07-11）：
- Cloudflare DNSに`nazet.jp` apex → `nazetner.github.io`のCNAME（Proxied）を設定
- `https://nazet.jp/`が実際に公開され、`/`・`/about/`・`/privacy/`・`/ads.txt`が200、draft記事は404になることを確認済み

実装済み（2026-07-11、続き）：
- サイト名を「なななみの倉庫」に変更し、トップページ（`/`）をBlog/Portfolio/Aboutへのランディングページに変更。Blog関連の全ページ（記事/タグ/シリーズ/RSS）を`/blog/`配下に移動
- `/portfolio/`をプレースホルダーページとして追加
- ヘッダーナビを簡素化（Title左・Blog/Portfolio/About右揃え、カテゴリ一覧はヘッダーから削除）
- Aboutページの中身を執筆（名乗り・連絡先・経歴・サイトの動機）
- **固定5カテゴリのenum分類を廃止し、タグのみの分類に変更**（メタな記事がどのカテゴリにも属さない問題があったため）。`category`フィールドをスキーマから削除、`/blog/category/*`関連ページを削除、Blogホーム・記事ページ・PostCardの表示をタグベースに変更

実装済み（2026-07-12）: **SEO自動化**
- テンプレート側（記事を書くだけでfrontmatterから全メタ自動生成）: canonical、OGP一式（og:title/description/type/url/image/locale、article:published_time/modified_time/tag）、Twitterカード、JSON-LD（BlogPosting、著者・シリーズ込み）、日英ペア記事のhreflang（ja/en/x-default、x-defaultは日本語原文）、`<html lang>`を記事言語に追従
- デフォルトOG画像 `public/og-default.png`（1200x630、サイト名+タグライン。System.Drawingで生成した静的アセット）。記事以外のページで使用
- **記事別OG画像のビルド時動的生成**（2026-07-12追加）: `src/pages/blog/og/[...slug].png.ts` が公開記事ごとに `/blog/og/<lang>/<slug>.png`（1200x630）を生成。satori（日本語の行折り返しレイアウト対応、テキストはSVGパス化）+ @resvg/resvg-js（PNG化）、どちらもdevDependencies。フォントはNoto Sans JP Bold（JPサブセットOTF、約4.4MB、OFLライセンス）を `src/assets/fonts/` に同梱しネットワーク非依存。**注意: resvgは `loadSystemFonts: false` 必須**（デフォルトだとシステムフォント全スキャンで1枚約50秒かかる。無効化で約150ms）。タイトル4行でlineClamp、タグは先頭5個まで表示
- `robots.txt` のSitemap参照を絶対URLに修正（規格上必須）
- **CIのSEOゲート** `scripts/seo-check.mjs`（`npm run seo:check`、依存パッケージなし）: deploy.ymlのビルド直後・シークレットスキャン前に実行し、エラーがあればデプロイを止める。エラー扱い＝メタ欠落（title/description/canonical/OGP/`<html lang>`）、canonical不一致、内部リンク切れ、sitemap網羅性の不整合（載っていないページ/存在しないURL）、og:imageが指す画像がdistに実在しない、RSS/robots/OG画像の欠落、slugがkebab-case以外、言語内slug重複。警告扱い（デプロイは止めない）＝title>45字、description 30〜160字圏外、タグなし、h1が1個でない、alt無しimg。日本語タグ等の非ASCII URLはパーセントエンコードで比較

**現状: `nazet.jp` は実際に公開状態。** 中身はサンプル/About/プライバシー/Portfolioプレースホルダーのみで、記事本文・Portfolio中身はまだ無い。

未着手：
- Portfolioページの中身（[[portfolio-project]]の棚卸し結果をベースに構築）
- 将来の動的機能用に `api.nazet.jp` の実サービス（アクセス解析コレクタ等）を実装し、cloudflaredのプレースホルダールートを実ポートに差し替え
- AdSenseアカウント申請・publisher ID設定（`PUBLIC_ADSENSE_CLIENT_ID`環境変数を設定すると`AdSlot`/ヘッダースクリプトが有効化される）
- giscusコメント埋め込み
- Plausible/Umami等のファーストパーティ解析実装
- サンプル記事をblogscanの実際の下書きに差し替え、記事本数を増やす（AdSense申請には15〜20記事が目安）
