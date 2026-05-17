# Product Spec Changelog

## 2026-05-17 - Multi Employee Product Model

### Changed

- Product subject changed from a single AI employee/workspace to multiple digital employees.
- Existing workspace pages now belong to the current employee conceptually:
  - Chat
  - History
  - Tasks
  - Kanban
  - Channels
  - AI Engine
  - Skills
  - Memory
  - Usage
- AI engine changed from a global runtime switch to an employee-level property.
- Product layer owns employee context, files, memory, tasks, channels, skills, usage, and history.

### Added

- Employee model.
- Employee status model.
- Employee management API requirements.
- Context Pack boundary for future engine adapters and employee migration.

### Deferred

- Real HMS / OpenClaw / COCO installation.
- Multi-tenant SaaS.
- Employee marketplace.
- Cross-engine lossless migration.
