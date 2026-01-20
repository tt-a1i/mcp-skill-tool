#!/usr/bin/env node
import { Command } from "commander";
import { DEFAULT_SPEC_PATH, initSpecIfMissing, loadSpec, saveSpec } from "./lib/spec-io.js";
import { resolveHosts } from "./hosts/index.js";
import { mergeSpec, sanitizeSpecSecrets, setMcpEnabled, setSkillEnabled } from "./lib/merge.js";
import { scanRepoSkills } from "./lib/skills-scan.js";
import { redactObject } from "./lib/redact.js";
import type { ToolchainSpec } from "./spec.js";
import { listSkills, installSkillToHost } from "./hosts/skills.js";
import { HOSTS } from "./hosts/index.js";
import { disableMcpOnHost, disableSkillOnHost, type HostId } from "./hosts/disable.js";

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function run(): Promise<void> {
  const program = new Command();
  program.name("mcp-skill-tool").description("Manage MCP servers & skills across multiple AI coding tools").version("0.1.0");

  program
    .option("--spec <path>", "Path to unified spec YAML", DEFAULT_SPEC_PATH)
    .option("--hosts <ids>", "Comma-separated: antigravity,claude-code,gemini-cli,codex,opencode", parseList);

  program
    .command("init")
    .description("Create an empty unified spec in the repo if missing")
    .action(async () => {
      const opts = program.opts<{ spec: string }>();
      const res = await initSpecIfMissing(opts.spec);
      process.stdout.write(res.created ? `created ${opts.spec}\n` : `exists ${opts.spec}\n`);
    });

  program
    .command("list")
    .description("Load MCP servers & skills from host default paths (no spec needed)")
    .option("--host <id>", "One host: antigravity|claude-code|gemini-cli|codex|opencode")
    .action(async (cmdOpts: { host?: string }) => {
      const repoRoot = process.cwd();
      const hostIds = cmdOpts.host ? [cmdOpts.host] : undefined;
      const hosts = resolveHosts(hostIds);

      for (const host of hosts) {
        const res = await host.importFromSystem(repoRoot);
        process.stdout.write(`\n# ${host.id}\n`);
        process.stdout.write(`mcp:\n`);
        for (const s of res.mcpServers) {
          const kind = s.transport.kind;
          const detail =
            kind === "remote"
              ? `${s.transport.url}`
              : `${s.transport.command} ${(s.transport.args ?? []).join(" ")}`.trim();
          process.stdout.write(`- ${s.name} (${s.scope}, ${kind}) ${detail}\n`);
        }
      }

      const skills = await listSkills(repoRoot, cmdOpts.host as any);
      if (skills.length) {
        process.stdout.write(`\n# skills\n`);
        for (const sk of skills) process.stdout.write(`- ${sk.host}:${sk.scope}:${sk.name} ${sk.dir}\n`);
      } else {
        process.stdout.write(`\n# skills\n(no skills found)\n`);
      }
    });

  program
    .command("import")
    .description("Import existing host configs into the unified spec (non-destructive merge)")
    .option("--print-notes", "Print discovery notes", false)
    .action(async (cmdOpts: { printNotes: boolean }) => {
      const opts = program.opts<{ spec: string; hosts?: string[] }>();
      await initSpecIfMissing(opts.spec);
      let spec = await loadSpec(opts.spec);

      const repoRoot = process.cwd();
      const hosts = resolveHosts(opts.hosts);

      for (const host of hosts) {
        const res = await host.importFromSystem(repoRoot);
        spec = mergeSpec(spec, { mcpServers: res.mcpServers });
        if (cmdOpts.printNotes) {
          for (const note of res.notes) process.stdout.write(`${note}\n`);
        }
      }

      // Also import repo-local skill directories (skills/<name>/SKILL.md)
      const repoSkills = await scanRepoSkills(repoRoot);
      spec = mergeSpec(spec, { skills: repoSkills });
      spec = sanitizeSpecSecrets(spec);

      await saveSpec(opts.spec, spec);
      process.stdout.write(`updated ${opts.spec}\n`);
    });

  program
    .command("sanitize")
    .description("Replace secret-looking values in the spec with ${ENV_VAR} placeholders")
    .action(async () => {
      const opts = program.opts<{ spec: string }>();
      const spec = await loadSpec(opts.spec);
      const updated = sanitizeSpecSecrets(spec);
      await saveSpec(opts.spec, updated);
      process.stdout.write(`sanitized ${opts.spec}\n`);
    });

  program
    .command("status")
    .description("Show what would be applied to each host (redacted)")
    .action(async () => {
      const opts = program.opts<{ spec: string; hosts?: string[] }>();
      const spec = await loadSpec(opts.spec);
      const repoRoot = process.cwd();
      const hosts = resolveHosts(opts.hosts);
      const redacted = redactObject(spec) as ToolchainSpec;
      process.stdout.write(JSON.stringify(redacted, null, 2) + "\n");
      process.stdout.write(`hosts: ${hosts.map((h) => h.id).join(", ")}\n`);
      process.stdout.write(`repo: ${repoRoot}\n`);
    });

  program
    .command("enable")
    .description("Enable an MCP server or skill by name in the spec")
    .argument("<kind>", "mcp|skill")
    .argument("<name>", "Name in the spec")
    .action(async (kind: string, name: string) => {
      const opts = program.opts<{ spec: string }>();
      const spec = await loadSpec(opts.spec);
      const updated = kind === "mcp" ? setMcpEnabled(spec, name, true) : setSkillEnabled(spec, name, true);
      await saveSpec(opts.spec, updated);
      process.stdout.write(`enabled ${kind} ${name}\n`);
    });

  program
    .command("disable")
    .description("Disable an MCP server or skill by name in the spec")
    .argument("<kind>", "mcp|skill")
    .argument("<name>", "Name in the spec")
    .action(async (kind: string, name: string) => {
      const opts = program.opts<{ spec: string }>();
      const spec = await loadSpec(opts.spec);
      const updated = kind === "mcp" ? setMcpEnabled(spec, name, false) : setSkillEnabled(spec, name, false);
      await saveSpec(opts.spec, updated);
      process.stdout.write(`disabled ${kind} ${name}\n`);
    });

  program
    .command("apply")
    .description("Apply unified spec to the selected hosts (writes files; creates .bak backups)")
    .option("--dry-run", "Do not write; just print actions", false)
    .action(async (cmdOpts: { dryRun: boolean }) => {
      const opts = program.opts<{ spec: string; hosts?: string[] }>();
      const spec = await loadSpec(opts.spec);
      const repoRoot = process.cwd();
      const hosts = resolveHosts(opts.hosts);

      for (const host of hosts) {
        const logs = await host.applyFromSpec(repoRoot, spec, { repoRoot, dryRun: cmdOpts.dryRun });
        for (const line of logs) process.stdout.write(line + "\n");
      }
    });

  program
    .command("sync")
    .description("Copy MCP servers and/or skills from one host to other hosts (reads live config)")
    .requiredOption("--from <host>", "Source host id")
    .requiredOption("--to <hosts>", "Comma-separated destination host ids", parseList)
    .option("--mcp <names>", "Comma-separated MCP server names to sync", parseList)
    .option("--skills <names>", "Comma-separated skill names to sync", parseList)
    .option("--dest-scope <scope>", "Where to install skills on destination: repo|user", "repo")
    .option("--dry-run", "Do not write; just print actions", false)
    .action(
      async (cmdOpts: {
        from: string;
        to: string[];
        mcp?: string[];
        skills?: string[];
        destScope: "repo" | "user";
        dryRun: boolean;
      }) => {
        const repoRoot = process.cwd();
        const srcHost = resolveHosts([cmdOpts.from])[0];
        const dstHosts = resolveHosts(cmdOpts.to);

        const src = await srcHost.importFromSystem(repoRoot);
        const mcpFilter = cmdOpts.mcp?.length ? new Set(cmdOpts.mcp) : null;
        const selectedMcp = mcpFilter ? src.mcpServers.filter((s) => mcpFilter.has(s.name)) : src.mcpServers;

        // Build a minimal spec to apply.
        const spec: ToolchainSpec = { version: 1, mcpServers: [], skills: [] };
        for (const s of selectedMcp) {
          // Map scope to destination expectations:
          // - antigravity/codex are user-scoped configs on disk
          // - claude-code/gemini-cli/opencode are repo-scoped configs
          spec.mcpServers.push({
            ...s,
            scope: "repo",
          });
        }

        for (const dst of dstHosts) {
          const desiredScope: "repo" | "user" = dst.id === "antigravity" || dst.id === "codex" ? "user" : "repo";
          const perHostSpec: ToolchainSpec = {
            version: 1,
            mcpServers: spec.mcpServers.map((s) => ({ ...s, scope: desiredScope })),
            skills: [],
          };
          const logs = await dst.applyFromSpec(repoRoot, perHostSpec, { repoRoot, dryRun: cmdOpts.dryRun });
          for (const line of logs) process.stdout.write(line + "\n");
        }

        if (cmdOpts.skills?.length) {
          const wanted = new Set(cmdOpts.skills);
          const allSkills = await listSkills(repoRoot, cmdOpts.from as any);
          const chosen = allSkills.filter((s) => wanted.has(s.name));
          if (!chosen.length) {
            process.stdout.write(`no matching skills found in source host ${cmdOpts.from}\n`);
            return;
          }
          for (const dstId of cmdOpts.to) {
            for (const sk of chosen) {
              const destScope = dstId === "codex" ? "user" : cmdOpts.destScope;
              const log = await installSkillToHost({
                repoRoot,
                host: dstId as any,
                destScope,
                srcDir: sk.dir,
                name: sk.name,
                dryRun: cmdOpts.dryRun,
              });
              process.stdout.write(log + "\n");
            }
          }
        }
      },
    );

  program
    .command("target-disable")
    .description("Disable MCP server or skill directly in the target host config (no spec)")
    .requiredOption("--host <id>", "Target host id")
    .requiredOption("--kind <kind>", "mcp|skill")
    .requiredOption("--name <name>", "Name of MCP server or skill")
    .option("--scope <scope>", "For skill: repo|user (default repo; codex is always user)")
    .option("--dry-run", "Do not write; just print actions", false)
    .action(
      async (cmdOpts: {
        host: HostId;
        kind: "mcp" | "skill";
        name: string;
        scope?: "repo" | "user";
        dryRun: boolean;
      }) => {
        const repoRoot = process.cwd();
        if (cmdOpts.kind === "mcp") {
          const logs = await disableMcpOnHost({ repoRoot, host: cmdOpts.host, name: cmdOpts.name, dryRun: cmdOpts.dryRun });
          for (const line of logs) process.stdout.write(line + "\n");
          return;
        }
        if (cmdOpts.host === "opencode") {
          process.stderr.write("opencode does not use Agent Skills standard directories; skill disable not supported yet.\n");
          process.exit(2);
        }
        const logs = await disableSkillOnHost({
          repoRoot,
          host: cmdOpts.host as any,
          name: cmdOpts.name,
          scope: cmdOpts.scope,
          dryRun: cmdOpts.dryRun,
        });
        for (const line of logs) process.stdout.write(line + "\n");
      },
    );

  await program.parseAsync(process.argv);
}

run().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(msg + "\n");
  process.exit(1);
});
