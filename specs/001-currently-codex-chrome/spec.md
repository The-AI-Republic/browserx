# Feature Specification: Config Refactoring for Chrome Extension

**Feature Branch**: `001-currently-codex-chrome`
**Created**: 2025-09-25
**Status**: Draft
**Input**: User description: "currently codex-chrome/ is converted from codex-rs/, turning the terminal agent code into chrome extension based agent, we've found the config implementaion from codex-rs/core/src/config.rs is not aligned with the implementation in codex-chrome/, scan through both codex-rs/ and codex-chrome/ and bring refactor of code related to config in codex-chrome. The config should remove unnecessary part for chrome extension, for example, mcp_servers config is no necessary for chome extension, analyze other configs as well to check if it is necessary."

## Execution Flow (main)
```
1. Parse user description from Input
   → Identify: config misalignment between codex-rs and codex-chrome
2. Extract key concepts from description
   → Actors: Chrome extension users, developers
   → Actions: refactor config, remove unnecessary parts
   → Data: configuration settings
   → Constraints: Chrome extension environment limitations
3. Analyze current implementations:
   → codex-rs has comprehensive config.rs with many terminal-specific settings
   → codex-chrome has minimal config, mostly API keys in ModelClientFactory
4. Identify required config refactoring:
   → Remove terminal-specific configs
   → Adapt to Chrome extension storage model
5. Generate Functional Requirements
   → Each requirement must be Chrome extension compatible
6. Identify Key Entities for Chrome config
7. Run Review Checklist
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## User Scenarios & Testing

### Primary User Story
As a Chrome extension user, I want the Codex agent to have a properly configured settings system that aligns with Chrome extension capabilities and storage mechanisms, so that I can configure the agent behavior without unnecessary terminal-specific options cluttering the interface.

### Acceptance Scenarios
1. **Given** a user installs the Codex Chrome extension, **When** they access settings, **Then** they see only Chrome-relevant configuration options
2. **Given** a user configures API keys and model preferences, **When** they restart the browser, **Then** their settings persist through Chrome's storage sync
3. **Given** a developer maintains the codebase, **When** they compare config between codex-rs and codex-chrome, **Then** the Chrome version contains only extension-appropriate settings

### Edge Cases
- What happens when Chrome storage quota is exceeded?
- How does system handle migration from old config format to new?
- What happens when sync conflicts occur between devices?

## Requirements

### Functional Requirements
- **FR-001**: System MUST provide configuration management appropriate for Chrome extension environment
- **FR-002**: System MUST remove terminal-specific configurations (mcp_servers, shell environment policies, sandbox settings, file system paths)
- **FR-003**: System MUST store user preferences using Chrome storage API (sync/local)
- **FR-004**: System MUST retain essential model configuration (API keys, model selection, provider settings)
- **FR-005**: System MUST remove approval policies not applicable to browser environment
- **FR-006**: System MUST exclude file system dependent features (project documentation paths, AGENTS.md loading, codex_home directory)
- **FR-007**: System MUST exclude terminal UI specific settings (TUI notifications, paste burst detection)
- **FR-008**: System MUST retain and adapt web-appropriate settings (model parameters, reasoning settings, verbosity)
- **FR-009**: Users MUST be able to configure multiple model providers and switch between them
- **FR-010**: System MUST exclude history file persistence to local filesystem
- **FR-011**: System MUST remove Linux sandbox and shell command execution configs
- **FR-012**: System MUST provide migration path for users updating from current implementation

### Key Entities
- **AgentConfig**: Core configuration object containing only Chrome-appropriate settings
- **ModelConfig**: Model provider settings including API keys, endpoints, and model selection
- **UserPreferences**: User-configurable options like model choice, verbosity, reasoning effort
- **StorageManager**: Handles persistence to Chrome storage APIs instead of filesystem

---

## Review & Acceptance Checklist

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---