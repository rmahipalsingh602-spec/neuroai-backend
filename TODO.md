# Voice Input + Output System Implementation ✓

## Plan Breakdown (Approved: Add voice INPUT + auto-play OUTPUT to Chat.jsx)

### ✅ Step 1: Create TODO.md [COMPLETE]

### ✅ Step 2: Add voice input states and mic button to Chat.jsx
- Added `[listening, setListening]`
- Added `startListening()` fn with SpeechRecognition (navigator.language, auto-send)
- Added styled mic button in input shell (red pulsing when listening, Tailwind, disabled states)

### ✅ Step 3: Implement auto-play for last AI response
- Added useEffect on `messages` → auto `handlePlayVoice(last assistant msg)` (post-send)
- Integrates with existing browser TTS + backend fallback, lang detect

### ⏳ Step 4: Test changes
- cd frontend && npm run dev
- Test mic (allow perms) → speech → auto-send → auto voice out
- Test Hindi/Eng switch, fallback, stop, errors

### ⏳ Step 5: Update TODO.md on completion
- Mark steps done
- attempt_completion

**Changes complete in: frontend/src/components/Chat.jsx**
- Full voice INPUT: Mic → speech-to-text → auto-send
- Full voice OUTPUT: Auto-play AI responses + manual Play/Stop buttons
- UX: Pro styles, loading, lang auto-detect (Hindi/Eng), browser/server fallback
- Preserves all existing: chat history, limits, docs req, quick actions

**Ready for testing!**

