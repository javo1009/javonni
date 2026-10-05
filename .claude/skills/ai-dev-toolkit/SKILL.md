---
name: ai-dev-toolkit
description: Decide which AI-coding tool to use for a task (Context7 docs lookup, Repomix context packing, Serena semantic code tools, Aider, OpenHands, SWE-agent, E2B/Daytona sandboxes, DeepEval, SWE-bench) and how to apply it in this project. Use when starting a feature, hitting an unfamiliar library API, working in a large codebase, running untrusted/AI-generated code, or measuring whether an AI change actually improved quality.
---

# AI dev toolkit

Pick the tool by the problem, not by hype. Most work needs only the first three.

## Quick decision table

| Problem | Tool | Command / entry point |
|---|---|---|
| Unsure about a library's current API, version differences | **Context7** | `npx ctx7@latest library <name> "<question>"` then `npx ctx7@latest docs <libraryId> "<question>"` (max 3 calls per question) |
| Need to give a whole repo (or a slice) to an LLM in one file | **Repomix** | `npx repomix@latest --compress` · slice: `--include "src/**/*.ts"` · remote: `--remote owner/repo --compress` |
| Large codebase: find symbols, references, rename/move across files | **Serena** (MCP) | Install per its README Quick Start (not via marketplace); then use symbol-level tools instead of grep + line numbers |
| Terminal pair programming with auto git commits | **Aider** | `aider` in the repo; every change is a commit, undo with `/undo` |
| Autonomous agent team (Slack/GitHub triggers, always-on) | **OpenHands** | Self-hosted; see its `docs/SELF_HOSTING.md`. Needs hardening, runs agents with real access |
| Research / reproducing SWE-bench-style issue fixing | **SWE-agent** | Superseded by `mini-swe-agent`; prefer that for new work |
| Run AI-generated or untrusted code safely | **E2B** (hosted, SDK) or **Daytona** | `Sandbox.create()` then `sandbox.commands.run(...)`. Daytona's OSS repo is unmaintained since June 2026; use the hosted product or E2B |
| Measure LLM/agent quality, catch regressions | **DeepEval** | Pytest-style tests with metrics (G-Eval, Task Completion, Tool Correctness) |
| Benchmark an agent on real GitHub issues | **SWE-bench** | Docker-based harness; heavy, only for research-grade evaluation |

## Default workflow for a coding task here

1. **Docs first.** For any library call you are not 100% sure about, query Context7 before writing code. Do not rely on memory for signatures or config.
2. **Context.** Small task: read the files directly. Cross-cutting task in a big repo: use Serena for symbol lookups, or `repomix --compress` to build one overview file and read that.
3. **Change.** Make the edit, keep commits small.
4. **Verify.** Run the project's tests/linters. If the change touches LLM behavior (prompts, agents, RAG), add a DeepEval test instead of eyeballing output.
5. **Isolation.** If the task requires executing code you did not write or do not trust, do it in a sandbox (E2B), never on the host.

## Rules

- Never paste secrets into Repomix output; keep `.repomixignore` current and review the output before sharing it.
- Context7 and E2B need API keys: read them from environment variables, never commit them.
- Heavy tools (OpenHands, SWE-bench, Daytona) are opt-in. Do not install them unless the task needs them.
- Reference clones of all ten repos live outside this project at `/home/user/<owner>/<repo>` (shallow, read-only); consult their READMEs and `docs/` for exact flags.
