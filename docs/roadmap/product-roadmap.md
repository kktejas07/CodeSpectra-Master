# Product Roadmap — CodeSpectra

> **Auto-Generated**: Internal Engineering documentation.

> **Document**: Product Roadmap  
> **Date**: 2026-07-08  
> **Classification**: Internal — Strategic Planning  

---

## 1. Roadmap Overview

```mermaid
gantt
    title CodeSpectra Product Roadmap (2026-2027)
    dateFormat  YYYY-MM-DD
    axisFormat  %b %Y

    section Phase 0 — Security & Hardening
    Fix SESSION_SECRET fallback              :p0_1, 2026-07-08, 7d
    Enable TypeScript strict mode            :p0_2, 2026-07-08, 14d
    Replace in-memory rate limiting           :p0_3, 2026-07-10, 10d
    Audit Firebase dependency removal         :p0_4, 2026-07-12, 7d
    Add security headers & CSP                :p0_5, 2026-07-15, 5d

    section Phase 1 — Core Infrastructure (30 days)
    Re-implement billing server (Stripe)      :p1_1, after p0_2, 21d
    Distributed rate limiting (Upstash Redis)  :p1_2, after p0_3, 7d
    Add comprehensive audit logging           :p1_3, 2026-08-01, 14d
    Implement proper error boundaries          :p1_4, 2026-08-01, 10d
    Auth improvements (MFA enforcement)        :p1_5, 2026-08-05, 14d
    API rate limiting per user/plan           :p1_6, 2026-08-10, 10d

    section Phase 2 — Feature Completion (60 days)
    AST-based code analyzer                   :p2_1, 2026-08-15, 30d
    GitHub Actions / CI plugin                :p2_2, 2026-08-20, 21d
    Complete subscription billing             :p2_3, after p1_1, 14d
    VS Code extension (scanner + review)      :p2_4, 2026-09-01, 30d
    Bulk assessment scheduling                :p2_5, 2026-09-05, 21d
    Team analytics dashboard                  :p2_6, 2026-09-10, 21d

    section Phase 3 — AI Enhancement (90 days)
    Vector search / RAG pipeline              :p3_1, 2026-09-15, 30d
    Fine-tuned code models                    :p3_2, 2026-10-01, 45d
    AI usage analytics & cost tracking        :p3_3, 2026-10-01, 21d
    Multi-step AI agent improvements          :p3_4, 2026-10-15, 21d
    AI-based problem difficulty calibration   :p3_5, 2026-11-01, 21d
    MCP server expansion (10+ tools)          :p3_6, 2026-11-01, 14d

    section Phase 4 — Enterprise & Scale (120+ days)
    SSO / OIDC (SAML, Google, Entra)          :p4_1, 2026-11-15, 30d
    SOC 2 compliance preparation              :p4_2, 2026-12-01, 60d
    SCIM provisioning                         :p4_3, 2026-12-01, 30d
    Global CDN & edge deployment              :p4_4, 2026-12-15, 45d
    Webhook system (outbound)                 :p4_5, 2027-01-01, 21d
    Mobile app (React Native)                 :p4_6, 2027-01-15, 60d
    Horizontal scaling / sharding             :p4_7, 2027-02-01, 45d
```

---

## 2. Phase 0 — Security & Hardening (Immediate)

**Timeline**: Days 1–14  
**Theme**: Security first — fix critical vulnerabilities before any feature work  

### Objectives

| Objective | Priority | Verification |
|---|---|---|
| Remove hardcoded `SESSION_SECRET` fallback | Critical | CI fails if env var absent |
| Enable TypeScript strict mode & fix all errors | Critical | `yarn build` must pass with strict rules |
| Replace in-memory rate limiting with distributed | High | Rate limit persists across restarts |
| Audit and remove Firebase dependency | High | No Firebase imports in production build |
| Add security headers (CSP, HSTS, X-Frame-Options) | Medium | Security scan passes |

### Rationale

The codebase has `ignoreBuildErrors: true` in `next.config.mjs` (`frontend/next.config.mjs:18`), a hardcoded fallback dev secret (`frontend/lib/session.ts:6:` `'fallback-dev-secret-do-not-use-in-production-32chars'`), and in-memory-only rate limiting that resets on every server restart (`frontend/lib/in-memory-rate-limit.ts`). These represent critical security and reliability risks that must be addressed before any feature development.

### Deliverables

- [ ] `SESSION_SECRET` validation on startup
- [ ] TypeScript strict mode enabled, all errors resolved
- [ ] Upstash Redis rate limiting with MongoDB fallback
- [ ] Firebase dependency removed or gated behind feature flag
- [ ] Security headers middleware
- [ ] Penetration test (basic)

---

## 3. Phase 1 — Core Infrastructure (30 Days)

**Timeline**: Days 15–44  
**Theme**: Fill critical infrastructure gaps left by Supabase→MongoDB migration  

```mermaid
flowchart LR
    subgraph Phase1[Phase 1 — Core Infrastructure]
        B1[Billing Server
        Re-implementation]
        B2[Audit Logging
        Framework]
        B3[Rate Limiting
        Distributed]
        B4[Auth
        MFA Enforcement]
    end

    B1 --> C1[Stripe SDK + MongoDB
    pricing_tiers/pricing_features]
    B2 --> C2[all API routes
    auto-logged]
    B3 --> C3[Upstash Redis +
    per-user/per-plan limits]
    B4 --> C4[TOTP enforcement
    for admin roles]
```

### Key Deliverables

| Area | Current State | Target State | Owner |
|---|---|---|---|
| **Billing Server** | Stubs throw "DEAD" errors (`frontend/lib/billing-server.ts`) | Full Stripe integration with MongoDB persistence | Backend |
| **Audit Logging** | Admin audit logs exist at API level only | All user + admin actions logged to `admin_audit_logs` | Full-stack |
| **Rate Limiting** | In-memory only, resets on restart | Upstash Redis + per-plan tiers | Backend |
| **Auth** | Firebase fallback, no MFA | Better Auth primary, TOTP enforcement for admins | Full-stack |
| **Error Handling** | Basic try/catch in routes | Global error boundary with structured JSON errors | Full-stack |

### Billing Server Re-implementation Details

The current `billing-server.ts` has 5 exported functions that all throw errors:

```
ensureDefaultPaymentMethod → throws "Billing helpers were temporarily removed"
getSubscriptionRow → throws "Billing helpers were temporarily removed"
composeSubscriptionResponse → throws "Billing helpers were temporarily removed"
completeCheckout → throws "Billing helpers were temporarily removed"
cancelUserSubscription → throws "Billing helpers were temporarily removed"
```

The re-implementation will:
1. Wire Stripe SDK calls to `billing_orders`, `billing_payments`, `billing_subscriptions` MongoDB collections
2. Support dual payment processors: Stripe (global) + Razorpay (India)
3. Implement subscription lifecycle management (create, update, cancel, expire)
4. Add webhook handlers for both Stripe and Razorpay
5. Create a billing admin dashboard for manual interventions

---

## 4. Phase 2 — Feature Completion (60 Days)

**Timeline**: Days 45–104  
**Theme**: Complete core product features that are currently MVP-quality or missing  

```mermaid
flowchart TD
    subgraph Phase2[Phase 2 — Feature Completion]
        A1[AST-Based
        Code Analyzer]
        A2[CI/CD
        Plugin]
        A3[VS Code
        Extension]
        A4[Bulk Assessment
        Scheduling]
    end

    A1 --> B1[Tree-sitter integration
    → 50+ language grammars
    → 200+ lint rules
    → Semantic analysis]
    A2 --> B2[GitHub Action
    → PR quality gate
    → Auto-review
    → Status check]
    A3 --> B3[Extension
    → Inline scanner
    → AI review
    → Quality badge]
    A4 --> B4[Enterprise feature
    → Bulk candidate invites
    → Time windows
    → Auto-proctoring]
```

### Key Deliverables

| Feature | Current | Target | Effort |
|---|---|---|---|
| **Code Analyzer** | Heuristic (10 rules, no AST) | Tree-sitter AST parsing, 200+ rules | 4 weeks |
| **GitHub CI** | Webhook queue worker only | GitHub Action marketplace listing | 3 weeks |
| **Billing Complete** | Razorpay working, Stripe stubbed | Both processors fully functional | 2 weeks |
| **VS Code Extension** | Not existing | Scanner + AI review inline | 4 weeks |
| **Bulk Assessments** | Per-user invite only | Bulk CSV upload, scheduling engine | 3 weeks |
| **Team Analytics** | Basic team page | DORA metrics, trend charts | 3 weeks |

### Analyzer Upgrade Path

```
Heuristic (current)     → Regex-based, 10 rules, per-line only
    ↓
Tree-sitter (Phase 2)  → AST-based, 200+ rules, multi-file analysis
    ↓
ML Hybrid (Phase 3)    → AST + learned patterns, cross-project insights
    ↓
Continuous (Phase 4)   → Real-time analysis in IDE + CI/CD
```

---

## 5. Phase 3 — AI Enhancement (90 Days)

**Timeline**: Days 105–194  
**Theme**: Move from prompt-based AI to intelligent, retrieval-augmented, fine-tuned AI  

```mermaid
flowchart LR
    subgraph Phase3[Phase 3 — AI Enhancement]
        V1[Vector Search &
        RAG Pipeline]
        V2[Fine-Tuned
        Code Models]
        V3[AI Cost &
        Usage Analytics]
        V4[MCP Server
        Expansion]
    end

    V1 --> W1[MongoDB Atlas Vector Search
    → Problem corpus embeddings
    → Submission error embeddings
    → Documentation embeddings
    → Contextual hints & reviews]

    V2 --> W2[LoRA fine-tunes on code review dataset
    → Specialized for quality assessment
    → Multi-model routing optimizer]

    V3 --> W3[Token usage tracking
    → Per-user cost allocation
    → Model selection optimization
    → Budget alerts]

    V4 --> W4[10+ MCP tools
    → Scan repo, run analysis
    → Generate certification
    → Manage team
    → Trigger workflow]
```

### Key Deliverables

| Feature | Current | Target | Effort |
|---|---|---|---|
| **RAG/Vector Search** | Prompt-only, no embeddings | MongoDB Atlas Vector Search, hybrid search | 4 weeks |
| **Fine-tuned Models** | Off-the-shelf only | LoRA fine-tunes for code review + grading | 6 weeks |
| **AI Usage Analytics** | Not tracked | Per-user cost, model performance dashboards | 3 weeks |
| **MCP Server** | 5 tools | 10+ tools, tool composition | 2 weeks |
| **Difficulty Calibration** | Static (easy/medium/hard) | IRT-based adaptive difficulty | 3 weeks |
| **Agent System** | 5-step linear loop | Stateful agents with tool access | 3 weeks |

### RAG Architecture

```mermaid
graph TD
    subgraph RAG[Retrieval-Augmented Generation Pipeline]
        DOCS[(MongoDB Collections)]
        DOCS -->|problems| EMB1[Embedding Model
        text-embedding-3-small]
        DOCS -->|submissions| EMB2[Embedding Model]
        DOCS -->|code_snippets| EMB3[Embedding Model]

        EMB1 --> VEC[(Atlas Vector Search Index)]
        EMB2 --> VEC
        EMB3 --> VEC

        QUERY[User Query / Code] -->|Vectorize| EMB4[Embedding Model]
        EMB4 --> VEC

        VEC -->|Top-K Similar| CONTEXT[Context Builder]
        CONTEXT -->|Augmented Prompt| LLM[Claude / Gemini]
        LLM --> RESPONSE[Contextual Response]
    end
```

---

## 6. Phase 4 — Enterprise & Scale (120+ Days)

**Timeline**: Days 195–365  
**Theme**: Enterprise readiness, compliance, and horizontal scale  

```mermaid
graph TD
    subgraph Phase4[Phase 4 — Enterprise & Scale]
        E1[SSO / OIDC]
        E2[SOC 2
        Compliance]
        E3[Global CDN
        & Edge]
        E4[Mobile App]
        E5[Horizontal
        Scaling]
    end

    E1 --> F1[SAML 2.0, Google Workspace,
    Microsoft Entra ID, Okta
    → Just-in-time provisioning]
    E2 --> F2[Controls: Access, Change, Ops
    → Evidence collection automation
    → Penetration testing]
    E3 --> F3[Edge functions for scanner
    → Multi-region MongoDB Atlas
    → CDN for static assets]
    E4 --> F4[React Native
    → On-the-go assessments
    → Push notifications
    → QR verification]
    E5 --> F5[MongoDB sharding
    → Read replicas
    → Connection pooling tuning
    → Cache layer (Redis)]
```

### Key Deliverables

| Feature | Current | Target | Effort |
|---|---|---|---|
| **SSO / OIDC** | Not supported | SAML 2.0, Google, Entra, Okta | 6 weeks |
| **SOC 2** | Not prepared | Type II ready (controls in place) | 12 weeks |
| **SCIM** | Not supported | User provisioning/deprovisioning | 4 weeks |
| **CDN** | Not deployed | Edge functions, multi-region | 6 weeks |
| **Webhook System** | Inbound only (GitHub) | Outbound event system, retry logic | 3 weeks |
| **Mobile Apps** | Empty shells | React Native: assessment + scanner | 8 weeks |
| **Horizontal Scale** | Single node | Read replicas, sharding, caching | 6 weeks |

---

## 7. Dependency Map

```mermaid
graph LR
    SEC[Phase 0: Security] --> BILL[Phase 1: Billing Server]
    SEC --> AUDIT[Phase 1: Audit Logging]
    SEC --> RL[Phase 1: Rate Limiting]

    BILL --> SUBSCRIPTIONS[Phase 2: Subscription Mgmt]
    BILL --> TEAM_BILLING[Phase 2: Team Billing]

    ANALYZER[Phase 2: AST Analyzer] --> QUALITY_GATES[Phase 3: ML Quality Gates]
    ANALYZER --> VSCODE[Phase 2: VS Code Extension]

    RAG[Phase 3: Vector Search] --> SMART_HINTS[Phase 3: Contextual Hints]
    RAG --> SMART_REVIEW[Phase 3: Contextual Code Review]

    SSO[Phase 4: SSO] --> ENTERPRISE[Phase 4: Enterprise Sales]
    SOC2[Phase 4: SOC 2] --> ENTERPRISE
    SCALE[Phase 4: Horizontal Scale] --> ENTERPRISE
```

---

## 8. Resource Estimates

| Phase | Duration | Engineering | Design | Ops |
|---|---|---|---|---|
| Phase 0: Security | 2 weeks | 2 engineers | — | 0.25 Ops |
| Phase 1: Core Infrastructure | 4 weeks | 2-3 engineers | 0.25 designer | 0.5 Ops |
| Phase 2: Feature Completion | 8 weeks | 3-4 engineers | 1 designer | 1 Ops |
| Phase 3: AI Enhancement | 12 weeks | 3-4 engineers (1 ML) | 0.5 designer | 1 Ops |
| Phase 4: Enterprise & Scale | 24 weeks | 4-5 engineers | 1 designer | 2 Ops |

---

## 9. Risks & Dependencies

| Risk | Phase | Impact | Mitigation |
|---|---|---|---|
| Stripe SDK integration delays billing | Phase 1 | Blocks subscription revenue | Launch with Razorpay-only initially |
| Fine-tuning ROI unclear | Phase 3 | Potential wasted ML effort | Start with prompt optimization, measure before fine-tuning |
| SOC 2 scope creep | Phase 4 | Delays enterprise readiness | Scope to minimum controls first, expand iteratively |
| Mobile app engineering cost | Phase 4 | High effort for uncertain ROI | Validate with PWA first before native investment |
| MongoDB Atlas vector search costs | Phase 3 | Operating cost increase | Implement tiered embedding strategies (cheap models for indexing) |
