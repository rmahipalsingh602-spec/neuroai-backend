# NeuroAI Platform Local Dev Setup - Fix API Error

**Status: Proxy updated, backend deps ready, attempting backend start**

## Steps:
**Status: Step 1 complete**

## Steps:

1. ✅ **Create this TODO.md**

2. **Install backend deps**  
   `cd backend && pip install -r requirements.txt`

3. **Start Postgres**  
   `docker-compose up -d postgres`

4. **Setup .env config**  
   - Read backend/config.py  
   - Create backend/.env (DB_URL, keys)

5. **Update Vite proxy**  
   Edit frontend/vite.config.js → proxy target: 'http://localhost:8000'

6. **Start backend**  
   `cd backend && uvicorn main:app --reload --port 8000 --host 0.0.0.0`

7. **Frontend dev** (if needed)  
   `cd frontend && npm run dev`

8. **Test** localhost:5173 dashboard/login

9. ✅ **Mark complete**

## Goal
Fix API error by running local backend, bypass Render sleeping issue.

Updated: [current time]
# NeuroAI Platform Local Dev Setup - Fix API Error
