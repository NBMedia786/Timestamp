# Local Testing Checklist

## 🚀 Server Status

The server should be running at: **http://localhost:3000**

---

## ✅ Pre-Test Setup

- [x] `.env` file exists
- [x] `node_modules` installed
- [x] `data/` directory exists
- [x] `shared/` directory exists
- [x] Server started successfully

---

## 📋 Testing Steps

### 1. **Basic Connection Test**
- [ ] Open browser: `http://localhost:3000`
- [ ] Main page loads without errors
- [ ] No console errors in browser DevTools (F12)
- [ ] History panel appears on the left

### 2. **YouTube URL Analysis**
- [ ] Enter a YouTube URL (e.g., `https://youtu.be/KN_C_uhSJV8`)
- [ ] Click "Analyze" button
- [ ] **Verify Connection:**
  - Should see: "Connecting to server (YouTube)..."
  - Should quickly receive: "YouTube URL received. Processing..."
  - Should NOT get stuck on "Connecting..."
- [ ] **Verify Checkpoints:**
  - Upload checkpoint activates (20%)
  - Progress bar moves smoothly
  - Process checkpoint activates (40%)
  - Analyze checkpoint activates (60%)
  - Complete checkpoint activates (80%)
  - Finalize checkpoint activates (100%)
- [ ] Analysis completes successfully
- [ ] Results appear in structured tab
- [ ] Timestamps appear in structured tab
- [ ] Video player shows YouTube embed

### 3. **Local Video Analysis**
- [ ] Click "Browse" or drag-and-drop a video file
- [ ] Select a video file (preferably small for testing, < 100MB)
- [ ] Click "Analyze" button
- [ ] **Verify Connection:**
  - Should see: "Connecting to server (local file)..."
  - Should quickly receive: "Request received. Processing..."
  - Should NOT get stuck on "Connecting..."
- [ ] **Verify Checkpoints:** (Same as YouTube)
  - All checkpoints activate in sequence
  - Progress bar animates smoothly
- [ ] Analysis completes successfully
- [ ] Video loads in local video player
- [ ] Results appear correctly

### 4. **Network Error Retry Test**
- [ ] Stop the server (Ctrl+C in terminal)
- [ ] Try to analyze a video
- [ ] Should show: "Network error. Retrying..."
- [ ] Should retry 3 times automatically
- [ ] Should show clear error after 3 failed attempts
- [ ] Restart server and try again - should work

### 5. **History Features**
- [ ] After analysis completes, check history panel
- [ ] Analysis appears in history list
- [ ] Name appears as pill/tag format
- [ ] Click on history item:
  - [ ] Video loads in player
  - [ ] Results load correctly
- [ ] Hover over history item:
  - [ ] 3-dots menu appears
  - [ ] "Share", "Rename", "Delete" options visible
- [ ] Test "Share" button:
  - [ ] Creates shareable link
  - [ ] Link includes unique ID
- [ ] Test "Delete" button:
  - [ ] Confirmation dialog appears
  - [ ] Item removed from history
  - [ ] Storage bar updates

### 6. **Shareable Link Test**
- [ ] Click "Share" button on completed analysis
- [ ] Copy the shareable link
- [ ] Open link in new tab/incognito window
- [ ] **Verify Share Page:**
  - [ ] Page loads at `/share/{id}` format
  - [ ] Analysis text displays correctly
  - [ ] Structured output shows metadata, timestamps, summary
  - [ ] Video player visible (YouTube or local)
  - [ ] Video player scrolls with page (not sticky)
  - [ ] All CSS/JS loads correctly (no 404 errors)

### 7. **Progress Modal Features**
- [ ] During analysis, verify progress modal:
  - [ ] Spinner animates
  - [ ] Status text updates
  - [ ] Overall progress bar moves (0-100%)
  - [ ] Checkpoint progress bar moves smoothly
  - [ ] Checkpoints highlight in sequence
  - [ ] Console shows animated steps
  - [ ] Steps appear one by one with animation
  - [ ] Final "Success!" message appears
- [ ] After completion:
  - [ ] Modal auto-closes after 3 seconds
  - [ ] OR can manually close with X button
  - [ ] OR can click outside modal to close

### 8. **Edge Cases**
- [ ] Test with very long YouTube video (30+ minutes)
- [ ] Test with large local video (500MB+)
- [ ] Test with invalid YouTube URL (should show error)
- [ ] Test with no video selected (should show validation error)
- [ ] Test with both file AND URL selected (should show error)

---

## 🐛 Known Issues to Watch For

### Connection Issues:
- ❌ **Stuck on "Connecting to server..."**
  - Check server logs for errors
  - Verify port 3000 is not in use
  - Check `.env` file has correct `GEMINI_API_KEY`

### Checkpoint Progress Bar:
- ❌ **Progress bar not moving**
  - Open browser DevTools Console
  - Check for JavaScript errors
  - Verify `checkpointProgressBar` element exists

### YouTube Analysis:
- ❌ **YouTube download fails**
  - Check if `yt-dlp` is installed
  - Check if `ffmpeg` is installed (for video merging)
  - Verify YouTube URL is public (not private/age-restricted)

### Local Video:
- ❌ **Video not loading from history**
  - Check `shared/` directory permissions
  - Verify file was uploaded successfully
  - Check browser console for errors

---

## ✅ Success Criteria

All tests should pass before deploying to VPS:
- ✅ Both YouTube and local videos work
- ✅ Connection is instant (no hanging)
- ✅ Checkpoint progress bar animates smoothly
- ✅ Retry logic works for network errors
- ✅ History saves and loads correctly
- ✅ Shareable links work correctly
- ✅ Progress modal functions properly

---

## 📝 Notes

- **Server Logs:** Watch terminal for server-side errors
- **Browser Console:** Check F12 DevTools for client-side errors
- **Network Tab:** Use F12 Network tab to monitor requests/responses
- **Test Both:** Always test with BOTH YouTube URLs and local files

---

## 🚀 Ready for VPS?

If all tests pass, you're ready to deploy to VPS! See `VPS_DEPLOYMENT.md` for deployment instructions.

