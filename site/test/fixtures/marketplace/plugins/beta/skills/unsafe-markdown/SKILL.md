---
name: unsafe-markdown
description: Fixture with hostile markdown that the site must neutralise.
---

# Unsafe markdown

<script>alert('script')</script>

<img src="x" onerror="alert('img')">

<iframe src="https://example.com/frame"></iframe>

<div onclick="alert('div')">Click me</div>

[A javascript link](javascript:alert('link'))

![External image](https://example.com/tracker.png)

[A relative link](./notes/guide.md)

[An external link](https://example.com/docs)
