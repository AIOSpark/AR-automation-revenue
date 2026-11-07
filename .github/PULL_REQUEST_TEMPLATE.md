# Pull Request Checklist

## Architecture & Layering Discipline (Layer 35)

- [ ] **Cross-Layer Boundary Check**: Does this change reach across more than one layer boundary at once? If so, flag for architectural discussion before merging.
- [ ] **Shared Interface Contract**: Does every module import shared interface definitions (`DataAdapter`, `AIAnalysis`, `AgentExecutor`) instead of redefining types locally?
- [ ] **UDM Isolation**: Are source system adapter-specific types strictly confined to `/adapters/` and `/reconciliation/` directories, with all UI views querying the Universal Data Model?
- [ ] **AI/Agent Runtime**: Does every AI Agent module route exclusively through `AgentExecutor` (`callModel()`, `run()`) without importing direct LLM client SDKs or performing direct DB writes?
- [ ] **Safety Middleware Compliance**: Do proposed actions pass through the shared 8-step safety middleware without attempting to bypass policy or risk assessment floors?
