import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";

// Lint dos manifests de skills da CLI (skills/<dir>/SKILL.md).
//
// Religado pela auditoria 6A.1 (2026-06-09): este arquivo era órfão (nenhum runner
// coletava tests/unit/docs/) e apodreceu — filtrava dirs `agentproxy*`, mas os skills
// foram renomeados para `cli-*`; com 0 dirs o segundo teste passava VACUOSAMENTE.
// Atualizado para o estado real: todo dir de skills/ com SKILL.md é validado, e o
// invariante de uso é "referencia as env vars ($AGENTPROXY_URL/AGENTPROXY_KEY) OU
// comandos da CLI (`agentproxy …`)" — 3 skills (health/keys/batches) usam só a CLI.
const SKILLS_DIR = join(process.cwd(), "skills");
const REQUIRED_FRONTMATTER = ["name:", "description:"];
const EXTERNAL_SKILL_DIRS = new Set(["ponytail", "typesafe-ai"]);

function frontmatterDescription(content: string): string | null {
  const lines = content.split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;

  for (let i = 1; i < end; i++) {
    const match = lines[i].match(/^description:\s*(.*)$/);
    if (!match) continue;
    const inline = match[1].trim();
    if (inline && inline !== ">" && inline !== "|") return inline;

    const folded: string[] = [];
    for (let j = i + 1; j < end; j++) {
      if (!/^\s+/.test(lines[j])) break;
      folded.push(lines[j].trim());
    }
    return folded.join(" ").trim();
  }
  return null;
}

async function listSkillDirs(): Promise<string[]> {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const dirs: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      await access(join(SKILLS_DIR, e.name, "SKILL.md"));
      dirs.push(e.name);
    } catch {
      // dir sem SKILL.md é coberto pelo teste de completude abaixo
    }
  }
  return dirs;
}

test("each skill dir has SKILL.md with frontmatter", async () => {
  const dirs = await listSkillDirs();
  assert.ok(dirs.length >= 40, `Expected ≥40 skill dirs, got ${dirs.length}`);
  for (const dir of dirs) {
    const path = join(SKILLS_DIR, dir, "SKILL.md");
    const content = await readFile(path, "utf-8");
    assert.ok(content.startsWith("---\n"), `${dir}: missing opening frontmatter`);
    for (const key of REQUIRED_FRONTMATTER) {
      assert.ok(content.includes(key), `${dir}: missing frontmatter key ${key}`);
    }
    // Skills `omni-*` são GERADOS por src/lib/agentSkills/generator.ts (alguns em
    // estado "no endpoints mapped yet", sem refs de uso) — o invariante de uso vale
    // só para os manifests manuscritos (cli-* e config-*). `ponytail` é a entrada
    // `external` do catálogo (#9058, conteúdo MIT de terceiro) — não descreve uso
    // do AgentProxy, então também fica fora do invariante.
    if (!dir.startsWith("omni-") && !EXTERNAL_SKILL_DIRS.has(dir)) {
      assert.ok(
        content.includes("AGENTPROXY_") || content.includes("agentproxy "),
        `${dir}: missing usage references (AGENTPROXY_* env vars or agentproxy CLI commands)`
      );
    }
  }
});

test("every directory under skills/ ships a SKILL.md", async () => {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const missing: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      await access(join(SKILLS_DIR, e.name, "SKILL.md"));
    } catch {
      missing.push(e.name);
    }
  }
  assert.deepEqual(missing, [], `skill dirs without SKILL.md: ${missing.join(", ")}`);
});

test("description field is meaningful (≥50 chars)", async () => {
  const dirs = await listSkillDirs();
  assert.ok(dirs.length > 0, "no skill dirs found — listSkillDirs is broken");
  for (const dir of dirs) {
    const content = await readFile(join(SKILLS_DIR, dir, "SKILL.md"), "utf-8");
    const desc = frontmatterDescription(content);
    assert.ok(desc, dir + ": no description field");
    // Nota: o assert antigo exigia a frase-gatilho "Use when" — nenhum dos 43 skills
    // reais a usa; o invariante verificável é descrição substantiva (≥50 chars).
    assert.ok(desc.length >= 50, `${dir}: description too short (${desc.length})`);
  }
});
