# Security News Content Creator — Feature Specification

> Automated security news aggregation pipeline: Crawl → AI Summarize → Slack Distribution

## Overview

### Goal
Build an MVP that crawls 6 major security news sites, generates AI summaries in Korean, and posts them to a Slack channel on a recurring schedule using Claude Code cloud scheduling.

### Architecture

```
[Cron Trigger (every 2-4 hours)]
    → [Claude Code Cloud Agent]
        → WebFetch: Collect new articles from RSS/web pages
        → AI Summary: Generate Korean summary per article
        → Slack Webhook: Post formatted messages to channel
        → Git Commit: Update posted_articles.json state file
```

### Project Structure

```
secnews-bot/
├── CLAUDE.md                  # Agent instructions (the brain)
├── spec.md                    # This file — feature specification
├── tasks.md                   # Task checklist per phase
├── config/
│   └── sources.json           # News source definitions
├── state/
│   └── posted_articles.json   # Already-posted article tracking
├── templates/
│   └── slack_message.md       # Slack message format template
├── scripts/
│   └── post_to_slack.sh       # Slack webhook posting script
├── .env                       # Secrets (Slack webhook URL) — NOT in git
└── .gitignore
```

---

## Phase 1: Project Setup

### Objective
Initialize the project repository and establish the foundational directory structure.

### Deliverables
- Git repository initialized and pushed to GitHub (required for cloud scheduling)
- Directory structure created as shown above
- `.gitignore` configured to exclude `.env`, secrets, OS files
- Basic `README.md` with project purpose

### Technical Details
- GitHub repo is mandatory because Claude Code cloud scheduling clones from GitHub on every execution
- Repository should be private (contains automation logic and state data)

### Risks
| Risk | Mitigation |
|------|------------|
| GitHub repo not created | Cloud scheduling cannot function without it |

### Verification
- `git remote -v` shows GitHub remote
- Directory structure matches spec

---

## Phase 2: News Source Collection

### Objective
Define and validate all 6 news sources, determining the optimal collection method (RSS vs WebFetch) for each.

### News Sources

| # | Site | URL | Language | Focus |
|---|------|-----|----------|-------|
| 1 | Boannews (보안뉴스) | boannews.com | KR | Domestic security policy, regulations, enterprise incidents |
| 2 | DailySecu (데일리시큐) | dailysecu.com | KR | Hacking incidents, malware analysis, vulnerability deep-dives |
| 3 | The Hacker News | thehackernews.com | EN | Global cyber attacks, data breaches, zero-day alerts |
| 4 | BleepingComputer | bleepingcomputer.com | EN | Ransomware trends, malware analysis, infrastructure breaches |
| 5 | KISA 보호나라 | boho.or.kr | KR | Official security advisories, vulnerability patches from KISA |
| 6 | Exploit Database | exploit-db.com | EN | Vulnerability PoC code, exploit data updates |

### Collection Methods

**Priority: RSS > Web Scraping**

- **RSS available**: Parse XML feed, extract `<item>` elements (title, link, pubDate, description)
- **RSS unavailable**: Use WebFetch on listing pages, let AI extract article entries from HTML

### Deliverables
- RSS feed availability confirmed for all 6 sites
- `config/sources.json` created with:
  ```json
  {
    "sources": [
      {
        "id": "thehackernews",
        "name": "The Hacker News",
        "url": "https://feeds.feedburner.com/TheHackersNews",
        "type": "rss",
        "language": "en",
        "category": "global-threats"
      }
    ]
  }
  ```

### Risks
| Risk | Mitigation |
|------|------------|
| Some sites may not have RSS | Fall back to WebFetch + AI parsing |
| RSS feed structure varies | AI agent handles parsing flexibility |
| Sites block automated access | Respect robots.txt, use reasonable intervals |

### Verification
- Each source's RSS or web page is fetchable via WebFetch
- `sources.json` contains all 6 entries with correct URLs and types

---

## Phase 3: AI Summary Pipeline

### Objective
Design the CLAUDE.md agent prompt that drives the entire crawl-summarize-post pipeline.

### Agent Execution Flow
```
1. Read config/sources.json → load source list
2. Read state/posted_articles.json → load already-posted article IDs
3. For each source:
   a. WebFetch the RSS feed or web page
   b. Extract article list (title, URL, date, description)
4. Filter: keep only articles NOT in posted_articles
5. For each new article:
   a. Generate Korean summary (3-5 lines)
   b. Classify category (vulnerability | incident | policy | analysis | exploit)
   c. Format Slack message from template
6. Post all new articles to Slack via webhook
7. Update posted_articles.json with newly posted article IDs
8. Git commit the updated state file
```

### Summary Rules
- **Language**: Korean (translate English articles)
- **Length**: 3-5 lines
- **Must include**: Core impact, affected systems/software, action required
- **Must preserve**: CVE numbers, version numbers, specific product names (do NOT translate these)
- **Tone**: Professional, factual — no sensationalism

### CLAUDE.md Structure
```
# SecNews Bot — Agent Instructions

## Mission
Collect latest security news and post AI summaries to Slack.

## Execution Steps
[Step-by-step pipeline as above]

## Summary Guidelines
[Rules as above]

## Error Handling
- If a source fails to fetch, skip it and continue with others
- If Slack webhook fails, log the error and retry on next execution
- Never post duplicate articles
```

### Risks
| Risk | Mitigation |
|------|------------|
| AI hallucination in summaries | Always include original URL; summarize, don't fabricate |
| CVE/version number errors | Explicit rule to preserve technical identifiers verbatim |
| English→Korean translation quality | Keep summaries short; link to original for details |

### Verification
- Run agent prompt manually once and check output quality
- Verify CVE numbers and product names match original articles
- Confirm Korean summaries are accurate and readable

---

## Phase 4: Slack Distribution

### Objective
Set up Slack integration and design the message format for posting news summaries.

### Slack Setup
1. Create a Slack app in workspace (or use existing)
2. Enable Incoming Webhooks
3. Create a webhook for the target channel (e.g., `#security-news`)
4. Store webhook URL in `.env` file:
   ```
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
   ```

### Message Format
```
:lock: [보안뉴스] 기사 제목
━━━━━━━━━━━━━━━━━━━━━━━━━━
:memo: AI 요약:
요약 텍스트 3~5줄. 핵심 영향과 대응 방안 포함.
CVE-2026-XXXX 등 기술 식별자는 원문 그대로 보존.

:label: 카테고리: 취약점
:link: 원문: https://example.com/article
:clock3: 발행: 2026-03-30
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Posting Script (`scripts/post_to_slack.sh`)
```bash
#!/bin/bash
# Usage: ./post_to_slack.sh "message payload json"
WEBHOOK_URL=$(cat .env | grep SLACK_WEBHOOK_URL | cut -d'=' -f2)
curl -X POST -H 'Content-type: application/json' \
  --data "$1" \
  "$WEBHOOK_URL"
```

### Rate Limiting
- Batch articles per source: post max 5 articles per source per execution
- 1-second delay between posts to avoid Slack rate limits
- Slack webhook limit: ~1 request/second

### Risks
| Risk | Mitigation |
|------|------------|
| Webhook URL leak | `.env` in `.gitignore`, never commit |
| Slack rate limiting | Batch posts, add delays |
| Message too long | Truncate summary to 5 lines max |
| Webhook rotation/expiry | Document how to update `.env` |

### Verification
- Manual `curl` test with sample payload succeeds
- Message renders correctly in Slack (formatting, links, emoji)
- `.env` is in `.gitignore` and not tracked by git

---

## Phase 5: State Management & Deduplication

### Objective
Implement reliable tracking of posted articles to prevent duplicates across agent executions.

### State File (`state/posted_articles.json`)
```json
{
  "last_updated": "2026-03-30T09:00:00Z",
  "articles": {
    "thehackernews": [
      {
        "url_hash": "a1b2c3d4",
        "title": "Critical RCE in Apache...",
        "posted_at": "2026-03-30T09:00:00Z"
      }
    ],
    "boannews": []
  }
}
```

### Deduplication Logic
1. Generate hash from article URL (first 8 chars of SHA-256)
2. Before posting, check if `url_hash` exists in state file
3. If exists → skip (already posted)
4. If not → post and add to state file
5. After all posts, commit updated state file to git

### State File Maintenance
- **Retention**: Keep last 500 articles per source (older entries pruned)
- **Why 500**: Prevents unbounded file growth; 500 articles ≈ 2-3 months at current volumes
- **Pruning**: On each execution, if a source exceeds 500 entries, remove oldest

### Git as State Store
- Cloud scheduled agents get a fresh clone each run
- Agent commits `posted_articles.json` after each execution
- Next execution's clone includes the latest state
- Commit message format: `chore(state): update posted articles [YYYY-MM-DD HH:MM]`

### Risks
| Risk | Mitigation |
|------|------------|
| Concurrent executions cause conflicts | Cloud schedule minimum interval is 1 hour; unlikely |
| State file corruption | JSON validation before write; keep backup in commit history |
| Git push failure | Agent retries once; state is recoverable from last good commit |

### Verification
- Run agent twice in succession → no duplicate posts
- State file is valid JSON after each execution
- Git log shows state update commits
- File size stays bounded (pruning works)

---

## Phase 6: Schedule Automation & Monitoring

### Objective
Register the Claude Code cloud schedule and establish monitoring practices.

### Schedule Configuration
- **Type**: Claude Code Cloud Scheduled Task
- **Repository**: GitHub `secnews-bot` repo
- **Schedule**: Every 3 hours (`0 */3 * * *`)
- **Prompt**: "Read CLAUDE.md and execute the security news collection pipeline"
- **Branch**: `claude/` prefix (default for cloud agents)

### Registration
Use `/schedule` skill in Claude Code CLI:
```
/schedule create
- repo: <github-username>/secnews-bot
- cron: 0 */3 * * *
- prompt: "Follow CLAUDE.md instructions to collect and post security news"
```

### Monitoring Checklist
- [ ] Check git log for state update commits (confirms execution happened)
- [ ] Review Slack channel for new posts (confirms pipeline works end-to-end)
- [ ] Spot-check 3-5 summaries against original articles (confirms quality)
- [ ] Verify no duplicate posts in Slack (confirms deduplication works)
- [ ] Check for skipped sources in agent logs (confirms error handling)

### Tuning Parameters
| Parameter | Default | Adjustable |
|-----------|---------|------------|
| Execution interval | 3 hours | 1-24 hours |
| Max articles per source per run | 5 | 1-20 |
| Summary length | 3-5 lines | 2-10 lines |
| State retention | 500 per source | 100-1000 |

### Risks
| Risk | Mitigation |
|------|------------|
| Schedule stops running silently | Weekly manual check of git log timestamps |
| Agent costs accumulate | Monitor API usage; adjust interval if needed |
| Source site structure changes break parsing | AI-based parsing is resilient; manual fix if needed |

### Verification
- First automated execution completes successfully
- Slack channel receives posts without manual intervention
- Schedule persists across days (not session-scoped)

---

## Future Phases (Post-MVP)

> Not in scope for MVP. Documented for roadmap visibility.

- **Phase 7**: Multi-channel distribution (X/Twitter, blog, cafe)
- **Phase 8**: Engagement monitoring (views, comments, reactions)
- **Phase 9**: Deep content creation (blog posts, YouTube scripts from trending topics)
- **Phase 10**: Comment management and community interaction
