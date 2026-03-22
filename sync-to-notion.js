const { Client } = require("@notionhq/client");
const { HttpsProxyAgent } = require("https-proxy-agent");
const fs = require("fs");
const path = require("path");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(path.resolve(".env"));
loadDotEnv(path.resolve(".env.local"));

function readJsonIfExists(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

const config = readJsonIfExists("./config.local.json", {});
const indexData = JSON.parse(fs.readFileSync("./data/index.json", "utf-8"));
const notionToken =
  process.env.NOTION_TOKEN || process.env.NOTION_API_TOKEN || config.notion?.token;
const notionDatabaseId =
  process.env.NOTION_DATABASE_ID || config.notion?.databaseId;

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
const clientOptions = { auth: notionToken };
if (proxyUrl) {
  clientOptions.agent = new HttpsProxyAgent(proxyUrl);
}

if (!notionToken || !notionDatabaseId) {
  console.error(
    "Missing Notion configuration. Set NOTION_TOKEN and NOTION_DATABASE_ID, or provide notion.token and notion.databaseId in config.local.json."
  );
  process.exit(1);
}

const notion = new Client(clientOptions);

const categoryMap = config.categories || {
  "ai-research": "AI研究论文",
  news: "行业新闻",
  tutorials: "教程指南",
  tools: "工具介绍",
  opinion: "观点文章",
};

const statusMap = {
  todo: "待阅读",
  reading: "阅读中",
  done: "已完成",
};

function readMarkdownContent(filePath) {
  const fullPath = path.join("./data", filePath.replace("data/", ""));
  if (!fs.existsSync(fullPath)) return null;

  const content = fs.readFileSync(fullPath, "utf-8");
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, "");
  return withoutFrontmatter.trim();
}

function splitIntoParagraphs(text) {
  return text.split(/\n\n+/).filter((p) => p.trim());
}

function markdownToNotionBlocks(text) {
  const blocks = [];
  const paragraphs = splitIntoParagraphs(text);

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("```")) {
      const codeContent = trimmed.replace(/```\w*\n?/g, "");
      if (codeContent.trim()) {
        blocks.push({
          type: "code",
          code: {
            rich_text: [{ type: "text", text: { content: codeContent.slice(0, 2000) } }],
            language: "plain text",
          },
        });
      }
      continue;
    }

    if (trimmed.startsWith("# ")) {
      blocks.push({
        type: "heading_1",
        heading_1: {
          rich_text: [{ type: "text", text: { content: trimmed.slice(2).slice(0, 100) } }],
        },
      });
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push({
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: trimmed.slice(3).slice(0, 100) } }],
        },
      });
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push({
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: trimmed.slice(4).slice(0, 100) } }],
        },
      });
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoteContent = trimmed.replace(/^> /gm, "").slice(0, 1000);
      blocks.push({
        type: "quote",
        quote: {
          rich_text: [{ type: "text", text: { content: quoteContent } }],
        },
      });
      continue;
    }

    if (trimmed.startsWith("- ")) {
      for (const line of trimmed.split("\n")) {
        if (!line.trim().startsWith("- ")) continue;
        blocks.push({
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [{ type: "text", text: { content: line.trim().slice(2).slice(0, 2000) } }],
          },
        });
      }
      continue;
    }

    if (trimmed.startsWith("|")) {
      blocks.push({
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: trimmed.slice(0, 2000) } }],
        },
      });
      continue;
    }

    const chunkSize = 1900;
    if (trimmed.length > chunkSize) {
      for (let i = 0; i < trimmed.length; i += chunkSize) {
        blocks.push({
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: trimmed.slice(i, i + chunkSize) } }],
          },
        });
      }
    } else {
      blocks.push({
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: trimmed } }],
        },
      });
    }

    if (blocks.length >= 95) break;
  }

  return blocks;
}

async function syncEntry(entry, forceUpdate = false) {
  try {
    const existing = await notion.databases.query({
      database_id: notionDatabaseId,
      filter: {
        property: "URL",
        url: { equals: entry.url },
      },
    });

    let existingPageId = null;
    if (existing.results.length > 0) {
      if (!forceUpdate) {
        console.log(`Skipped existing entry: ${entry.title}`);
        return { status: "skipped", id: entry.id };
      }
      existingPageId = existing.results[0].id;
    }

    const mdPath = entry.paths?.byDate || entry.path;
    const mdContent = mdPath ? readMarkdownContent(mdPath) : null;
    const blocks = mdContent ? markdownToNotionBlocks(mdContent) : [];

    if (existingPageId) {
      if (blocks.length > 0) {
        for (let i = 0; i < blocks.length; i += 100) {
          await notion.blocks.children.append({
            block_id: existingPageId,
            children: blocks.slice(i, i + 100),
          });
        }
      }
      console.log(`Updated: ${entry.title} (${blocks.length} blocks)`);
      return { status: "updated", id: entry.id, blocks: blocks.length };
    }

    const response = await notion.pages.create({
      parent: { database_id: notionDatabaseId },
      properties: {
        Name: { title: [{ text: { content: entry.title } }] },
        URL: { url: entry.url },
        Category: { select: { name: categoryMap[entry.category] || entry.category } },
        Tags: { multi_select: (entry.tags || []).map((tag) => ({ name: tag })) },
        Summary: { rich_text: [{ text: { content: entry.summary || "" } }] },
        ReadingTime: { number: entry.readingTime || 0 },
        Date: { date: { start: entry.date } },
        Status: { select: { name: statusMap[entry.status] || "待阅读" } },
      },
    });

    if (blocks.length > 0) {
      for (let i = 0; i < blocks.length; i += 100) {
        await notion.blocks.children.append({
          block_id: response.id,
          children: blocks.slice(i, i + 100),
        });
      }
    }

    console.log(`Synced: ${entry.title} (${blocks.length} blocks)`);
    return { status: "synced", id: entry.id, notionId: response.id, blocks: blocks.length };
  } catch (error) {
    console.error(`Failed: ${entry.title}`);
    console.error(`  Error: ${error.message}`);
    return { status: "failed", id: entry.id, error: error.message };
  }
}

async function syncAll() {
  console.log("========================================");
  console.log("  AI Note -> Notion Sync");
  console.log("========================================\n");

  const forceUpdate = process.argv.includes("--force");
  if (forceUpdate) {
    console.log("Force mode enabled.\n");
  }

  const entries = indexData.entries || [];
  console.log(`Found ${entries.length} entries to process.\n`);

  const results = { synced: 0, updated: 0, skipped: 0, failed: 0 };

  for (const entry of entries) {
    const result = await syncEntry(entry, forceUpdate);
    if (result.status === "synced") results.synced++;
    else if (result.status === "updated") results.updated++;
    else if (result.status === "skipped") results.skipped++;
    else results.failed++;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("\n========================================");
  console.log("Sync Complete");
  console.log("========================================");
  console.log(`Synced: ${results.synced}`);
  console.log(`Updated: ${results.updated}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log(`Failed: ${results.failed}`);
  console.log("========================================\n");
}

syncAll().catch(console.error);
