# tech-blog 仕様書

個人の技術ブログ。日々の開発（ゲームエンジン、ネットコード、レトロハードウェア、音声/ML系ツール等）の中から面白いものを厳選して公開し、Google AdSenseで広告収入を得る。

記事候補は [`blogscan`](N:\repos\tools\blogscan)（別リポジトリ）が自動生成する。厳選・執筆は人間が行う。このリポジトリはサイト本体（ビルド設定・テンプレート・記事コンテンツ）を持つ。

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

- `ads.txt` はAstroプロジェクトの `public/ads.txt` を唯一の情報源とする。Cloudflare Tunnel方式では `nazet.jp` がGitHub Pagesに直結されるため、自前サーバー側で「素通し」を実装する必要はない（GitHub Pagesが実ドメイン直下でそのまま返す）
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

未着手：
- Cloudflare側でGitHub Pages向けのDNSレコードを設定（`nazet.jp` apex。GitHub Pages公式手順どおりのA/CNAME、Cloudflareプロキシ有効でTLS/キャッシュ込み）— これが済めば`nazet.jp`が実際に閲覧可能になる
- 将来の動的機能用に `api.nazet.jp` の実サービス（アクセス解析コレクタ等）を実装し、cloudflaredのプレースホルダールートを実ポートに差し替え
- AdSenseアカウント申請・publisher ID設定（`PUBLIC_ADSENSE_CLIENT_ID`環境変数を設定すると`AdSlot`/ヘッダースクリプトが有効化される）
- giscusコメント埋め込み
- Plausible/Umami等のファーストパーティ解析実装
- サンプル記事をblogscanの実際の下書きに差し替え、記事本数を増やす（AdSense申請には15〜20記事が目安）
