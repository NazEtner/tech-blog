---
title: "Sample post: Running a 1990s sound driver from modern Rust (Part 1)"
description: "This is a template-verification sample post. Real content will replace it later."
pubDate: 2026-07-01
category: retro-hardware
tags: ["pmd", "pc98", "emulation", "sample"]
series:
  slug: pmd-driver
  title: "Bridging a PC-98 sound driver into the present"
  part: 1
lang: en
sourceRepo: pmdhost-rs
draft: true
---

> **This is a sample post.** It exists to verify page templates (table of contents, series nav, syntax highlighting, tags) render correctly; the real article will be written later.

## Symptom

A 1990s PC-98 sound driver binary needs to run from a modern Rust program, but it's raw 8086 machine code written against long-gone OS/hardware assumptions.

## Fix

Embed `libx86emu` and trap I/O port writes as a virtual OPNA chip, so the original binary can run unmodified.

```rust
fn handle_io_write(port: u16, value: u8) {
    virtual_opna.write_register(port, value);
}
```

## Lesson

Wrapping something that already works, rather than rewriting it, is often the more practical approach for this kind of reverse-engineering work.
