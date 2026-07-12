---
title: "wgpuのDeviceとQueueをあえて公開しない自作レンダラの設計"
description: "Rust製の自作ECSエンジンで、wgpu::DeviceとQueueを取得する公開APIを一切用意しなかった話。不便になる代わりに、リソースの初期化場所とライフタイムが設計レベルで一意に決まる。"
pubDate: 2026-07-12
tags: ["rust", "wgpu", "engine-architecture", "ecs"]
lang: ja
draft: false
---

## RenderTaskという単位

Rustで書いている自作ECSエンジン（`pameecs-rs`。公開しているC++のPameECSとは別物です）の描画はwgpu上に構築されていて、描画パスを `RenderTask` という単位で差し替える設計になっています。レンダラは毎フレーム、GPUリソースの準備用タスク（`prepare_tasks`）をrayonで並列実行し、サーフェステクスチャを取得して、描画タスク（`render_tasks`）を並列実行してコマンドバッファを生成し、submitしてpresentする。それだけです。

```rust
pub trait RenderTask: Send + Sync {
    fn tag(&self) -> &'static str;
    fn render(&self, encoder: &mut CommandEncoder, view: Arc<TextureView>, device: &Device);
}

pub trait RenderPrepareTask: Send + Sync {
    fn prepare(&self, device: &Device, queue: &Queue, surface_format: TextureFormat);
}
```

`render_tasks` は実行のたびにdrainで消費されます。継続して描きたいタスクは毎フレーム積み直すか、`render_tasks` が空のときに使われる `default_task` として登録します。

## 最大の設計判断: DeviceとQueueを公開しない

このレンダラには、`wgpu::Device` や `Queue` を取得する公開APIがありません。これらはレンダラ内部に完全に隠蔽されていて、触れる場所は上のトレイトのコールバック引数だけです。`Device` は `render` と `prepare` で、`Queue` に至っては `prepare` でしか受け取れません。

wgpuを直接使ったことがある人なら、これがどれだけ不便か分かると思います。テクスチャマネージャやスプライトレンダラのような「デバイスを必要とする常駐リソース」を、好きな場所で作れないのです。

その代わり、常駐リソースの置き場所は**タスクの中で初回に遅延生成して保持する**、の一択に強制されます。典型的には `RenderTask` を実装する構造体が `Option<SpriteRenderer>` を持ち、初回の `render` で初期化します。システム側と状態を共有したければ `Arc<Mutex<…>>` に包む。それ以外の書き方が存在しません。

## なぜこうしたか

正直に言うと、最初の動機は大層なものではありません。単に、それが最小の公開範囲だったからです。`RenderTask` と `RenderPrepareTask` が仕事をするのに必要な引数だけを渡していったら、DeviceとQueueをそれ以外の場所へ出す理由がどこにもなかった。それだけです。

ただ、この「出さない」選択は結果として思った以上に効いたので、後付けの分も含めて理由を言語化しておきます。

DeviceとQueueを自由に取れるようにすると、GPUリソースの生成がコードベースの好きな場所にばら撒かれます。どのリソースがいつ作られ、どのスレッドから触られるのかを追うのが一気に難しくなります。エンジンを長期運用する前提だと、この自由は負債です。

コールバック引数でしか渡さない設計なら、GPUに触るコードは構造的にタスクの中にしか存在できません。「このリソースはどこで初期化されるのか」という問いの答えが常に「そのタスクの初回実行時」になるので、利用側のコード配置が考えるまでもなく決まります。不便さと引き換えに、規律を型で買っている感覚です。

`render_tasks` を毎フレームdrainする仕様も同じ思想です。「一度積んだら描き続ける」方式は、消し忘れたタスクが描き続けるバグを生みます。毎フレーム積み直しを基本にして、恒久的なものだけ明示的に `default_task` にする方が、「積み忘れ」も「消し忘れ」も1フレームで露見します。

## その上に載る2D描画

この土台の上に、バインドレステクスチャベースの2D描画ユーティリティを載せています。`TextureManager` がテクスチャを1つのバインドレス配列にまとめてシェーダからインデックス参照できるようにし、`SpriteRenderer` が常駐のパイプラインを持って、毎フレーム `Sprite` の配列から描画タスクを組み立てます。

```rust
// 初期化は1回だけ（deviceはrender/prepareの引数から）
let sprite_renderer = SpriteRenderer::new(&device, textures.bind_group_layout(), surface_format);

// 毎フレーム
let sprites = [
    Sprite::new(0.0, 0.0, 0.5, 0.5, tex0),
    Sprite::new(-1.0, 1.0, 0.3, 0.3, tex1).with_anchor(Anchor::TopLeft),
];
let task = sprite_renderer.task(textures.bind_group(&device), &sprites);
```

状態管理の落とし穴になりやすい点は、ドキュメントに明記する方針にしています。深度テスト有効のパイプラインは半透明ピクセルをdiscardするので `with_depth` の設定が必須になること。オフスクリーンバッファの `resize` がtrueを返したら、そのビューを参照していたバインドグループは再構築が必要なこと。この手の「知らないと1回は踏む」仕様は、APIで防げるならAPIで防ぎ、防げないなら少なくとも文書で待ち伏せしておきます。

## 正直な感想

`Option<資源>` を持って初回に初期化するパターンは、正直に言えば美しくはありません。initフェーズが欲しくなる気持ちも分かります。それでも、DeviceとQueueが野放しになったコードベースを数ヶ月後にデバッグする未来と比べれば、Optionのアンラップくらいは安い出費だと思っています。

制約の強いAPIは、書く時に少し嫌われて、読む時にとても感謝されます。自作エンジンは自分しか使わないので、嫌うのも感謝するのも自分ですが。
