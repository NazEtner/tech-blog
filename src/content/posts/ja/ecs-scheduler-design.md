---
title: "サンプル記事: 自作ECSの並列スケジューラはどう設計したか"
description: "これはテンプレート確認用のサンプル記事です。実際の内容は後で差し替えます。"
pubDate: 2026-06-20
tags: ["ecs", "rust", "engine-architecture", "サンプル"]
lang: ja
sourceRepo: pameecs-rs
draft: true
---

> **これはサンプル記事です。** カテゴリページ・タグページの動作確認用です。

## 背景

ECSでは複数のシステムを並列実行したいが、同じコンポーネントに同時書き込みするとデータ競合になる。

## 設計

各システムが宣言するコンポーネントアクセス（読み取り/書き込み）を静的に解析し、競合するシステム同士だけを直列化するスケジューラを実装した。

```rust
struct SystemAccess {
    reads: Vec<ComponentId>,
    writes: Vec<ComponentId>,
}
```

## 得られた知見

静的解析だけでは動的に変化するアクセスパターンを拾いきれないため、一部は実行時フォールバックも用意した。
