---
name: note
description: Save and organize web notes in this project, with translation, categorization, and optional Notion sync.
argument-hint: "[save <url1> <url2> ... | list [category] | catalog | note <id> | plan <id>]"
when_to_use: Use when the user wants to save web links into this project's note library, list archived entries, open the generated catalog, add personal notes, or create a reading plan. This skill depends on mcp__web_reader__webReader for webpage extraction.
user-invocable: true
---

# AI Note Skill

This skill saves and organizes AI-related links in the local project, with optional Notion sync.

## Commands

### Save one or more links

```text
/note save <url>
/note save <url1> <url2> <url3> ...
```

- Extract the webpage with `mcp__web_reader__webReader`.
- If extraction fails, content is empty, or parsing is unreliable, stop and explain the failure. Do not invent content.
- Detect language. If the content is in English, translate it to Chinese and preserve the original text.
- Generate title, summary, 3-5 key points, category, reading suggestion, and 2-5 tags.
- Before writing, check `data/index.json`. If the same URL already exists, skip it. Do not create a duplicate and do not overwrite the existing entry.
- Save the markdown file under `data/by-date/YYYY/MM/DD/`.
- Create or refresh the category copy under `data/by-category/{category}/`.
- Update `data/index.json`.
- Regenerate `data/CATALOG.md`.
- Check if Notion is configured by verifying `.env` or `.env.local` contains both `NOTION_TOKEN` and `NOTION_DATABASE_ID`. If configured, run `node sync-to-notion.js` to sync the new entry to Notion.

### List archived entries

```text
/note list [category]
```

- Read `data/index.json` and respond in the current conversation.
- Default ordering is newest first.
- Each listed item should include at least `id`, `title`, `category`, and `date`.
- If a category is provided, only show entries in that category.

### Show catalog

```text
/note catalog
```

- Prefer showing the current `data/CATALOG.md`.
- If the catalog is missing or clearly stale compared with `data/index.json`, regenerate it first.

### Add a personal note

```text
/note note <id>
```

- Find the target entry by `id` in `data/index.json`.
- Create or update `data/notes/note-{id}.md`.
- Include the entry title, original URL, personal takeaways, and concrete follow-up ideas.
- If the file already exists, update or extend it instead of creating duplicates.

### Create a reading plan

```text
/note plan <id>
```

- Find the target entry by `id` in `data/index.json`.
- Create or update `data/notes/plan-{id}.md`.
- Include reading goal, estimated time, step-by-step plan, and completion criteria.
- If the file already exists, update it instead of creating duplicates.

## Execution Rules

- Reuse existing project files and scripts instead of inventing parallel implementations.
- Secrets must come from environment variables such as `NOTION_TOKEN` and `NOTION_DATABASE_ID`.
- `config.local.json` is for non-sensitive configuration only.
- If Notion is not configured, skip Notion sync without failing local save behavior.
- Prefer `node sync-to-notion.js` for Notion sync. Only call the Notion API directly if the script cannot cover the task.

## Markdown Template

```markdown
---
id: {unique-id}
title: {title}
url: {url}
category: {category}
tags: [{tags}]
date: {date}
readingTime: {minutes} min
---

# {title}

## 原文

{original-content}

## 中文翻译

{translated-content}

## 摘要

{summary}

## 关键点

- {key-point}
- {key-point}
- {key-point}

## 阅读建议

{reading-suggestion}

## 相关链接

- {url}

---

保存于 {datetime}
```
