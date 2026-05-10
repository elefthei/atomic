(no external research applicable)

All files in `src/services/` depend exclusively on Bun native APIs (`Bun.file`, `Bun.write`, `Bun.which`, `Bun.spawnSync`) and Node.js built-in modules (`node:fs`, `node:path`, `node:os`) — there are no external npm library dependencies whose documentation would bear meaningfully on how atomic's deterministic workflows operate in this partition.
