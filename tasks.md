# Security News Content Creator — Task Checklist

> Check off tasks as completed. Each phase maps 1:1 to `spec.md`.

---

## Phase 1: Project Setup

- [ ] Create `~/workspace/secnews-bot/` directory structure
- [ ] Initialize git repository (`git init`)
- [ ] Create `.gitignore` (exclude `.env`, `.DS_Store`, `node_modules/`, `*.log`)
- [ ] Create GitHub repository (private)
- [ ] Add GitHub remote and push initial commit
- [ ] Create placeholder directories: `config/`, `state/`, `templates/`, `scripts/`

---

## Phase 2: News Source Collection

- [ ] Check RSS feed availability for Boannews (boannews.com)
- [ ] Check RSS feed availability for DailySecu (dailysecu.com)
- [ ] Verify The Hacker News RSS feed URL works
- [ ] Verify BleepingComputer RSS feed URL works
- [ ] Check RSS/feed availability for KISA 보호나라 (boho.or.kr)
- [ ] Check RSS/feed availability for Exploit Database (exploit-db.com)
- [ ] Create `config/sources.json` with all 6 sources (URL, type, language, category)
- [ ] Test WebFetch on each source to confirm accessibility

---

## Phase 3: AI Summary Pipeline

- [ ] Draft CLAUDE.md with agent execution steps
- [ ] Define summary rules (language, length, preserve CVEs, tone)
- [ ] Define error handling rules (skip failed source, retry webhook, no duplicates)
- [ ] Define article extraction rules for RSS sources (XML parsing guidance)
- [ ] Define article extraction rules for non-RSS sources (HTML parsing guidance)
- [ ] Manual test: run agent prompt once and review output quality
- [ ] Refine CLAUDE.md based on test results

---

## Phase 4: Slack Distribution

- [ ] Create Slack app (or select existing workspace)
- [ ] Enable Incoming Webhooks in Slack app settings
- [ ] Create webhook for target channel (e.g., `#security-news`)
- [ ] Store webhook URL in `.env` file
- [ ] Add `.env` to `.gitignore` (verify it's not tracked)
- [ ] Create `templates/slack_message.md` with message format
- [ ] Create `scripts/post_to_slack.sh` with curl webhook script
- [ ] Manual test: send sample message via webhook and verify rendering
- [ ] Verify message format: links clickable, emoji renders, text readable

---

## Phase 5: State Management & Deduplication

- [ ] Create `state/posted_articles.json` with initial empty structure
- [ ] Define URL hash function in CLAUDE.md (SHA-256, first 8 chars)
- [ ] Add deduplication logic to CLAUDE.md agent instructions
- [ ] Add state file pruning rules (max 500 per source)
- [ ] Add git commit instructions to CLAUDE.md (commit state after each run)
- [ ] Test: run agent twice → verify no duplicate Slack posts
- [ ] Test: verify state file is valid JSON after execution
- [ ] Test: verify git log shows state update commit

---

## Phase 6: Schedule Automation & Monitoring

- [ ] Register cloud schedule via `/schedule` (cron: `0 */3 * * *`)
- [ ] Verify schedule is active (`/schedule list`)
- [ ] Wait for first automated execution
- [ ] Check git log for automated state commit
- [ ] Check Slack channel for automated posts
- [ ] Spot-check 3-5 summaries for accuracy
- [ ] Verify no duplicates across automated runs
- [ ] Document tuning parameters (interval, max articles, retention)

---

## Completion Criteria

All phases complete when:
- [x] Phase checked = all tasks within that phase are `[x]`
- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
- [ ] **MVP DONE**: Automated security news pipeline running unattended
