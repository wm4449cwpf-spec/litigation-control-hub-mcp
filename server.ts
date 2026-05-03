// Litigation Control Hub MCP Server
// Deploy this as a Node/Express app, then paste your deployed /sse URL into the Custom MCP form.

import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || "./data";
const DATA_FILE = join(DATA_DIR, "litigation-control-hub.json");

type Matter = {
  id: string;
  name: string;
  jurisdictions: string[];
  parties?: string[];
  notes?: string;
  createdAt: string;
};

type Evidence = {
  id: string;
  matterId: string;
  title: string;
  date?: string;
  source?: string;
  jurisdiction?: string;
  documentType?: string;
  tags: string[];
  privilege?: "unknown" | "privileged" | "not_privileged";
  summary?: string;
  link?: string;
  createdAt: string;
};

type Deadline = {
  id: string;
  matterId: string;
  title: string;
  dueDate: string;
  court?: string;
  jurisdiction?: string;
  filingType?: string;
  status: "open" | "done" | "missed" | "uncertain";
  notes?: string;
  createdAt: string;
};

type ChronologyEvent = {
  id: string;
  matterId: string;
  date: string;
  title: string;
  description?: string;
  jurisdiction?: string;
  sourceEvidenceIds: string[];
  issueTags: string[];
  createdAt: string;
};

type Issue = {
  id: string;
  matterId: string;
  issue: string;
  jurisdiction?: string;
  facts?: string;
  evidenceIds: string[];
  legalQuestions?: string[];
  status?: string;
  createdAt: string;
};

type Translation = {
  id: string;
  matterId: string;
  documentTitle: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: "needed" | "in_progress" | "completed" | "certified";
  evidenceId?: string;
  translator?: string;
  notes?: string;
  createdAt: string;
};

type Store = {
  matters: Matter[];
  evidence: Evidence[];
  deadlines: Deadline[];
  chronology: ChronologyEvent[];
  issues: Issue[];
  translations: Translation[];
};

async function loadStore(): Promise<Store> {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) {
    const empty: Store = { matters: [], evidence: [], deadlines: [], chronology: [], issues: [], translations: [] };
    await writeFile(DATA_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  return JSON.parse(await readFile(DATA_FILE, "utf8"));
}

async function saveStore(store: Store) {
  await writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

function now() {
  return new Date().toISOString();
}

function makeServer() {
  const server = new McpServer({
    name: "Litigation Control Hub",
    version: "0.1.0",
  });

  server.tool(
    "create_matter",
    "Create a litigation matter for AU, CZ, EU or related parallel proceedings.",
    {
      name: z.string(),
      jurisdictions: z.array(z.string()).default(["AU", "CZ", "EU"]),
      parties: z.array(z.string()).optional(),
      notes: z.string().optional(),
    },
    async (input) => {
      const store = await loadStore();
      const matter: Matter = { id: randomUUID(), createdAt: now(), ...input };
      store.matters.push(matter);
      await saveStore(store);
      return { content: [{ type: "text", text: JSON.stringify(matter, null, 2) }] };
    }
  );

  server.tool(
    "add_evidence",
    "Add evidence metadata and tags. Store links to Drive/SharePoint rather than confidential file contents.",
    {
      matterId: z.string(),
      title: z.string(),
      date: z.string().optional(),
      source: z.string().optional(),
      jurisdiction: z.string().optional(),
      documentType: z.string().optional(),
      tags: z.array(z.string()).default([]),
      privilege: z.enum(["unknown", "privileged", "not_privileged"]).default("unknown"),
      summary: z.string().optional(),
      link: z.string().optional(),
    },
    async (input) => {
      const store = await loadStore();
      const item: Evidence = { id: randomUUID(), createdAt: now(), ...input };
      store.evidence.push(item);
      await saveStore(store);
      return { content: [{ type: "text", text: JSON.stringify(item, null, 2) }] };
    }
  );

  server.tool(
    "add_deadline",
    "Record a court/procedural deadline. Mark uncertain deadlines explicitly until verified by counsel or court rules.",
    {
      matterId: z.string(),
      title: z.string(),
      dueDate: z.string(),
      court: z.string().optional(),
      jurisdiction: z.string().optional(),
      filingType: z.string().optional(),
      status: z.enum(["open", "done", "missed", "uncertain"]).default("uncertain"),
      notes: z.string().optional(),
    },
    async (input) => {
      const store = await loadStore();
      const item: Deadline = { id: randomUUID(), createdAt: now(), ...input };
      store.deadlines.push(item);
      await saveStore(store);
      return { content: [{ type: "text", text: JSON.stringify(item, null, 2) }] };
    }
  );

  server.tool(
    "add_chronology_event",
    "Add a dated event to the litigation chronology and link it to evidence.",
    {
      matterId: z.string(),
      date: z.string(),
      title: z.string(),
      description: z.string().optional(),
      jurisdiction: z.string().optional(),
      sourceEvidenceIds: z.array(z.string()).default([]),
      issueTags: z.array(z.string()).default([]),
    },
    async (input) => {
      const store = await loadStore();
      const item: ChronologyEvent = { id: randomUUID(), createdAt: now(), ...input };
      store.chronology.push(item);
      await saveStore(store);
      return { content: [{ type: "text", text: JSON.stringify(item, null, 2) }] };
    }
  );

  server.tool(
    "add_issue",
    "Create or track a legal/factual issue across jurisdictions.",
    {
      matterId: z.string(),
      issue: z.string(),
      jurisdiction: z.string().optional(),
      facts: z.string().optional(),
      evidenceIds: z.array(z.string()).default([]),
      legalQuestions: z.array(z.string()).optional(),
      status: z.string().optional(),
    },
    async (input) => {
      const store = await loadStore();
      const item: Issue = { id: randomUUID(), createdAt: now(), ...input };
      store.issues.push(item);
      await saveStore(store);
      return { content: [{ type: "text", text: JSON.stringify(item, null, 2) }] };
    }
  );

  server.tool(
    "add_translation",
    "Track originals, translations, certification status, and translator notes.",
    {
      matterId: z.string(),
      documentTitle: z.string(),
      sourceLanguage: z.string(),
      targetLanguage: z.string(),
      status: z.enum(["needed", "in_progress", "completed", "certified"]).default("needed"),
      evidenceId: z.string().optional(),
      translator: z.string().optional(),
      notes: z.string().optional(),
    },
    async (input) => {
      const store = await loadStore();
      const item: Translation = { id: randomUUID(), createdAt: now(), ...input };
      store.translations.push(item);
      await saveStore(store);
      return { content: [{ type: "text", text: JSON.stringify(item, null, 2) }] };
    }
  );

  server.tool(
    "search_case_file",
    "Search matters, evidence, deadlines, chronology, issues, and translations by keyword.",
    {
      query: z.string(),
      matterId: z.string().optional(),
    },
    async ({ query, matterId }) => {
      const store = await loadStore();
      const q = query.toLowerCase();
      const matches = Object.fromEntries(
        Object.entries(store).map(([key, rows]) => [
          key,
          (rows as any[]).filter((row) => {
            if (matterId && row.matterId && row.matterId !== matterId) return false;
            return JSON.stringify(row).toLowerCase().includes(q);
          }),
        ])
      );
      return { content: [{ type: "text", text: JSON.stringify(matches, null, 2) }] };
    }
  );

  server.tool(
    "case_dashboard",
    "Return a compact dashboard of matters, open deadlines, evidence counts, issue counts, and translation status.",
    { matterId: z.string().optional() },
    async ({ matterId }) => {
      const store = await loadStore();
      const filter = (row: any) => !matterId || row.id === matterId || row.matterId === matterId;
      const dashboard = {
        matters: store.matters.filter(filter),
        evidenceCount: store.evidence.filter(filter).length,
        openDeadlines: store.deadlines.filter((d) => filter(d) && d.status !== "done"),
        chronologyCount: store.chronology.filter(filter).length,
        issueCount: store.issues.filter(filter).length,
        translations: store.translations.filter(filter),
      };
      return { content: [{ type: "text", text: JSON.stringify(dashboard, null, 2) }] };
    }
  );

  return server;
}

const app = express();
app.use(cors());
app.use(express.json());

const transports: Record<string, SSEServerTransport> = {};

app.get("/", (_req, res) => {
  res.json({ name: "Litigation Control Hub MCP", status: "ok", sse: "/sse", messages: "/messages" });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/sse", async (_req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;

  res.on("close", () => {
    delete transports[transport.sessionId];
  });

  const server = makeServer();
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (!transport) {
    res.status(400).send("No transport found for sessionId");
    return;
  }
  await transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`Litigation Control Hub MCP listening on port ${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});
