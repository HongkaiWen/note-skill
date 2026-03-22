# Note Skill

Reusable Claude Code `/note` skill for saving web links into a local note library, organizing them by date and category, and optionally syncing entries to Notion.

## What This Repo Contains

- `.claude/skills/note/SKILL.md`
- `sync-to-notion.js`
- `config.local.json.example`
- a minimal `data/` skeleton

This repo does not include Telegram integration, personal data, or runtime secrets.

## Install

### Option 1: Project-local

Copy the `.claude/skills/note/` directory into your project:

```text
your-project/
└── .claude/
    └── skills/
        └── note/
            └── SKILL.md
```

### Option 2: User-global

Copy the `note` directory into:

```text
~/.claude/skills/note/
```

## Runtime Files

The skill expects a project layout like this:

```text
project-root/
├── .claude/skills/note/SKILL.md
├── data/
│   ├── by-date/
│   ├── by-category/
│   ├── notes/
│   ├── CATALOG.md
│   └── index.json
├── config.local.json
└── sync-to-notion.js
```

## Commands

```text
/note save <url>
/note save <url1> <url2> ...
/note list [category]
/note catalog
/note note <id>
/note plan <id>
```

## Behavior

- `save` extracts webpage content with `mcp__web_reader__webReader`
- duplicate URLs are skipped
- entries are stored under `data/by-date/` and `data/by-category/`
- `list` reads from `data/index.json`
- `catalog` shows `data/CATALOG.md`
- `note` writes `data/notes/note-{id}.md`
- `plan` writes `data/notes/plan-{id}.md`

## Notion Sync

Install dependencies:

```bash
npm install
```

Create `.env` or `.env.local`:

```env
NOTION_TOKEN=ntn_xxx_or_secret_xxx
NOTION_DATABASE_ID=your_notion_database_id
HTTPS_PROXY=http://127.0.0.1:7897
HTTP_PROXY=http://127.0.0.1:7897
```

Optional non-sensitive config goes in `config.local.json`:

```json
{
  "categories": {
    "ai-research": "AI研究论文",
    "news": "行业新闻",
    "tutorials": "教程指南",
    "tools": "工具介绍",
    "opinion": "观点文章"
  }
}
```

Run sync:

```bash
npm run sync:notion
npm run sync:notion:force
```

## Publish To GitHub

This directory is designed to be published as-is:

- no `.env`
- no `config.local.json`
- no archived article data
- no Telegram code
