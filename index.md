---
title: The Classroom Continuous Build Butler
---

# The Classroom Continuous Build Butler - Didit

A continuous build server designed for the classroom.

{% assign pages = site.pages | where: 'category', 'intro' %}
{% include toc.md %}

## User documentation

{% assign pages = site.pages | where: 'category', 'user' %}
{% include toc.md %}

## Developer documentation

### [README] <small>To get started developing or deploying Didit</small>
[README]: https://github.com/maxg/didit/blob/master/README.md

{% assign pages = site.pages | where: 'category', 'dev' %}
{% include toc.md %}

![Didit](public/didit-logo.png "Didit logo by @katrina_")
