# NeuroAI Platform Task TODO - Onboarding/UI Improvements
## Approved Plan: Prioritize onboarding popup + DB flag, then UI cards/empty state. No specifics noted (simple animations, English).

### Steps (Breakdown):
1. **[x]** Update backend/models.py: Add `has_seen_onboarding` to User.
2. **[x]** Update backend/schemas.py: Add field to UserSummary.
3. **[x]** Update backend/routers/auth.py: Return field in /me, add POST /onboarding-seen.
4. **[x]** Add startup schema compatibility patch so older DBs get `has_seen_onboarding` automatically.
5. **[x]** Update frontend/src/lib/api.js: Add markOnboardingSeen.
6. **[x]** Update frontend/src/components/Dashboard.jsx: Add onboarding modal (steps), How to Use/Pro cards, empty state.
7. **[PENDING]** Optional: add a real Alembic revision for production-style deployments.
8. **[PENDING]** Test new user flow, empty state, PRO features.

**Status: Frontend complete. Backend schema compatibility patch added for existing DBs. Features implemented:**
- First-time popup with 4 steps, Next/Skip/Got it! → marks seen via API.
- Empty docs state with welcome + upload trigger.
- Persistent "How to Use" panel.
- PRO features card with tips.


