# tech-blog 仕様書

個人の技術ブログ。日々の開発（ゲームエンジン、ネットコード、レトロハードウェア、音声/ML系ツール等）の中から面白いものを厳選して公開し、Google AdSenseで広告収入を得る。

記事候補は [`blogscan`](N:\repos\tools\blogscan)（別リポジトリ）が自動生成する。厳選・執筆は人間が行う。このリポジトリはサイト本体（ビルド設定・テンプレート・記事コンテンツ）を持つ。

現状: **仕様のみ。サイト実装は未着手。**

---

## 1. ホスティング構成（GitHub Pages + 自前サーバーのハイブリッド）

役割分担の原則：**GitHub Pagesにできないことだけ自前サーバーが担う**。

- **GitHub Pages**：ビルド済み静的サイト全部（HTML/CSS/JS、記事、画像、RSS、sitemap）。このリポジトリの `main` push → GitHub Actionsでビルド → Pagesが配信。無料・CDN・メンテ不要。
- **自前サーバー**：
  1. **DNS/ドメインのエッジ**：カスタムドメインの向き先を自前サーバーにし、リバースプロキシ（nginx/Caddy）がGitHub Pagesへ透過的にプロキシ
  2. **`/ads.txt` の一貫性保証**：AdSenseはブラウザに表示される実ドメインのルートで `ads.txt` を要求する。ソースはこのリポジトリの `public/ads.txt`（Pagesがビルド）一箇所のみとし、プロキシは `/ads.txt` を無加工で素通しする。デプロイ時に実ドメインへcurlして疎通確認するのを運用に組み込む
  3. **コメント機能**：まずは **giscus**（GitHub Discussions連携、サーバー不要）で開始。将来、自前でコメントデータを持ちたくなったら自前サーバーに軽量APIを立てる
  4. **ファーストパーティ解析**：Google Analyticsの代わりに自前サーバーでPlausible/Umami系の軽量セルフホスト解析（AdSenseスクリプトに加えてもう一つ重いサードパーティJSを載せない）
  5. 将来の動的機能（検索、ニュースレター等）の置き場

リクエストフロー概要：
```
yourdomain.com（DNS→自前サーバー）
  / , /posts/*, /rss.xml, /ads.txt, /sitemap.xml → GitHub Pagesへプロキシ（キャッシュ）
  /api/analytics/collect → 自前サーバーのローカルサービス
  （コメントは当面giscusでサーバー内蔵不要）
```
自前サーバー側はコンテンツの複製を持たない＝二重デプロイパイプラインにならない。

## 2. 静的サイトジェネレータ：Astro

理由：
- コンテンツコレクション＋MDXで、コード多めの技術記事に必要な埋め込みコンポーネント（図解、インタラクティブな可視化等）を静的サイトのまま扱える
- 日英バイリンガルルーティングが標準機能として強い
- Islands architectureでJS出力が最小＝ページ速度（AdSenseの表示品質・Core Web Vitalsにも影響）
- Markdown+frontmatterが `blogscan` の `outline.md` 形式とほぼそのまま繋がる（記事化のときのコピー元）

## 3. サイト構成・タクソノミー

カテゴリ（実際の開発リポジトリ群から対応）：
- `engine-architecture` — 自作ゲームエンジン（ECS/レンダリング内部、エンジン系譜レトロスペクティブ）
- `netcode-multiplayer` — 決定論的ロックステップnetcode等
- `retro-hardware` — PC-98/OPNA音源ドライバ、自作ハードウェア、リバースエンジニアリング
- `audio-ml-tooling` — 音声ML系の個人ツール
- `devlog-retrospective` — 横断的な開発ログ系

URLスキーム：
```
/posts/<slug>/                     個別記事（スラッグは英語kebab-case固定、日本語記事でもURL安定性のため）
/en/posts/<slug>/  /ja/posts/<slug>/   言語バリアント
/category/<category>/              カテゴリ一覧
/tags/<tag>/                       タグ一覧
/series/<series-slug>/             シリーズ一覧
/about/
/privacy/
/rss.xml                           全体フィード
/category/<category>/rss.xml       カテゴリ別フィード
```

## 4. ページテンプレート

- **記事**：TOC自動生成、Shikiによるシンタックスハイライト、シリーズ前後ナビ、言語切替、広告枠、出典フッター（公開して問題ないリポジトリのみ、記事ごとに設定可能）
- **シリーズ一覧**：各パートの一言要約と公開状況
- **カテゴリ・タグ一覧**：ページネーション、カテゴリ説明文
- **ホーム**：最新記事、シリーズ進行状況、短いAbout
- **About**：AdSense審査で必須
- **プライバシーポリシー**：AdSense審査で必須

## 5. AdSense統合

- `ads.txt` はAstroプロジェクトの `public/ads.txt` を唯一の情報源とし、プロキシは素通し
- 広告スクリプトはベースレイアウトの`<head>`で1回だけ読み込み
- 配置：**コードブロックの直前直後には絶対に広告を挟まない**。導入2〜3段落後に1枠、記事末尾（コメント欄の前）に1枠、広い画面のみサイドバー枠（モバイルは非表示）。Auto adsの「本文内自動挿入」はオフにし、配置は手動制御のみ許可（コード中央への誤挿入を防ぐ）

## 6. AdSense審査を現実的に通すための下地

- 申請前に**最低15〜20記事、5カテゴリ中3カテゴリ以上**を公開しておく（`blogscan`が既存の数千コミットから掘り起こせるので、ゼロから書くより現実的な期間で到達可能）
- postmortem/how-it-worksのような実質のある内容を優先（コミットログの言い換えのような薄い内容は避ける）
- About・プライバシーポリシーページ必須
- sitemap.xml、リンク切れなし、迷子ページなし

## 7. 運用面

- RSS（全体＋カテゴリ別）
- Shikiでの言語別ハイライト（Rust, C++, HLSL/WGSL, asm, Lua, TS）
- 画像はAstroの画像最適化、図解は極力SVG（ダークモード対応・鮮明さのため）
- i18n：デフォルト日本語、海外興味が見込めるもの（retro-hardware, netcode-multiplayer系）から優先的に英語化
- デプロイ：GitHub Actions上でビルド後、`dist/`に対する最終的な自動シークレットスキャンをCIゲートとして追加してからPagesへデプロイ（`blogscan`側のredactionをすり抜けた人的ミスの最終防波堤）

## 8. 記事の取り込みフロー（`blogscan` との連携）

1. `N:\repos\tools\blogscan\candidates\queue.yaml` で候補をレビューし、気に入ったものは `status: shortlisted` にする（または confidence 0.8以上で自動昇格）
2. `blogscan scan` 実行時に `candidates/drafted/<id>/outline.md` が生成され、定期実行タスクが「変更の概要」と各見出しの本文プローズまで下書きする
3. 気に入った下書きを、このリポジトリの `src/content/posts/<lang>/<slug>.md` にコピーし、frontmatter（title, category, tags, series, pubDate等）を付けて仕上げる
4. `main` にpush → GitHub Actionsでビルド・デプロイ

## 未着手のもの（次にやること）

実装済み（2026-07-10）：Astroプロジェクト雛形、コンテンツコレクションのスキーマ、各種ページテンプレート（記事/カテゴリ/タグ/シリーズ/ホーム/About/プライバシー）、RSS（全体+カテゴリ別）・sitemap、ads.txtプレースホルダーとAdSlotコンポーネント、GitHub Actionsのビルド+シークレットスキャン+Pagesデプロイワークフロー。動作確認用のサンプル記事2本（日英ペア、シリーズ・タグ・コードハイライト確認用）込み。`npm run build`成功、主要ページ全種を実際にブラウザで表示確認済み。

未着手：
- 実際のドメイン取得・確定（`astro.config.mjs`の`SITE_URL`は`https://example.com`のプレースホルダー）
- 自前サーバー側のリバースプロキシ設定（ドメイン確定後）
- AdSenseアカウント申請・publisher ID設定（`PUBLIC_ADSENSE_CLIENT_ID`環境変数を設定すると`AdSlot`/ヘッダースクリプトが有効化される）
- giscusコメント埋め込み
- Plausible/Umami等のファーストパーティ解析実装
- サンプル記事をblogscanの実際の下書きに差し替え、記事本数を増やす（AdSense申請には15〜20記事が目安）
- GitHub上にリモートリポジトリを作成しpush（現状ローカルのみ）
