# Vercel (from Codex)

## Source
- Platform: codex
- Plugin ID: codex--vercel
- Upstream: https://github.com/openai/plugins.git
- Source Path: plugins/vercel
- Version: 0.21.0

## Compatibility Summary
- Overall: partial
- Skill: full — Skills are cross-platform compatible
- .app.json: unsupported — App connectors are Codex-specific and not supported on other platforms
- Warning: App connector will be dropped when converting to other platforms

## Components
- Skills: vercel-agent, routing-middleware, agent-browser-verify, micro, agent-browser, json-render, payments, deployments-cicd, vercel-storage, ncc, investigation-mode, bootstrap, vercel-cli, runtime-cache, ai-gateway, auth, ai-generation-persistence, vercel-queues, turbopack, marketplace, vercel-flags, shadcn, cron-jobs, vercel-services, observability, verification, cms, geist, workflow, react-best-practices, nextjs, ai-elements, vercel-sandbox, satori, chat-sdk, turborepo, ai-sdk, v0-dev, env-vars, geistdocs, email, vercel-api, sign-in-with-vercel, next-forge, vercel-firewall, vercel-functions, swr
- Agents: none
- Hooks: none
- MCP: none
- Commands: none
- Instructions: none

## Dropped Components
- .app.json: App connectors are Codex-specific and not supported on other platforms

## Notes
- No additional conversion notes.
- No command files required manual verification.
- Codex `.app.json` support is not available in VS Code and was omitted from the generated plugin.
