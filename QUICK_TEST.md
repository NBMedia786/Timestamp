# Quick Local Test Guide

## 🚀 Server Started!

Your server should be running at: **http://localhost:3000**

---

## ⚡ Quick Test (2 minutes)

### 1. Open Browser
```
http://localhost:3000
```

### 2. Test YouTube URL (Fastest Test)
1. Paste a YouTube URL: `https://youtu.be/KN_C_uhSJV8`
2. Click "Analyze"
3. **Watch for:**
   - ✅ Connection message appears immediately (NOT stuck)
   - ✅ Checkpoint progress bar moves: Upload → Process → Analyze → Complete → Finalize
   - ✅ Analysis completes successfully

### 3. Test Local Video
1. Click "Browse" and select a small video file (< 50MB)
2. Click "Analyze"
3. **Watch for:**
   - ✅ Connection works immediately
   - ✅ Checkpoints progress smoothly
   - ✅ Video loads in player after completion

### 4. Test Network Retry (Optional)
1. Stop server (Ctrl+C in terminal)
2. Try to analyze → Should auto-retry 3 times
3. Restart server → Should work normally

---

## ✅ What to Look For

### ✅ GOOD Signs:
- Connection happens instantly (< 1 second)
- Progress bar animates smoothly
- Checkpoints light up in sequence
- Steps appear one by one with animation
- Analysis completes successfully
- Results show in structured tab

### ❌ BAD Signs (Report These):
- Stuck on "Connecting to server..." for > 5 seconds
- Progress bar not moving
- Checkpoints not activating
- Console errors in browser (F12)
- Server crashes or errors

---

## 📊 Checkpoints to Verify

Watch the checkpoint progress bar during analysis:

```
Upload (20%) → Process (40%) → Analyze (60%) → Complete (80%) → Finalize (100%)
```

Each checkpoint should:
- ✅ Light up when reached
- ✅ Show checkmark when completed
- ✅ Progress bar should move smoothly between them

---

## 🔍 Detailed Testing

For comprehensive testing, see: **TESTING_CHECKLIST.md**

---

## 🐛 Troubleshooting

**Server not responding?**
- Check terminal for error messages
- Verify `.env` file has `GEMINI_API_KEY`
- Make sure port 3000 is not already in use

**Connection timeout?**
- Check internet connection
- Verify Gemini API key is valid
- Check server logs for API errors

---

## 🎯 Ready for VPS?

If all tests pass locally:
1. ✅ Connection is instant
2. ✅ Checkpoints work smoothly
3. ✅ Both YouTube and local videos work
4. ✅ Shareable links work

→ You're ready! See `VPS_DEPLOYMENT.md` for deployment.

