# 🚀 VPS Pre-Deployment Checklist

Use this checklist to ensure everything works on your VPS exactly as it does locally.

## ✅ Pre-Deployment Verification (Local)

Before deploying, verify these work locally:

- [ ] Main page loads correctly
- [ ] Can upload and analyze local video files
- [ ] Can analyze YouTube URLs
- [ ] History panel saves and displays items correctly
- [ ] Shareable links work for local videos
- [ ] Shareable links work for YouTube videos
- [ ] Delete button removes videos from history and backend
- [ ] Storage bar updates correctly
- [ ] Timestamps display correctly in structured tab
- [ ] Progress modal closes after completion
- [ ] Network retry logic works (test by disconnecting briefly)

## 📦 Files to Upload to VPS

Ensure these files/directories are uploaded:

```
your-project/
├── index.html
├── style.css
├── script.js
├── viewer.js
├── server.js
├── package.json
├── .env (create on VPS with your credentials)
├── data/ (directory - will auto-create if missing)
└── shared/ (directory - will auto-create if missing)
```

## ⚙️ VPS Configuration Steps

### 1. **Install Dependencies**
```bash
cd /path/to/your/project
npm install
```

### 2. **Create `.env` File**
```bash
nano .env
```

Add:
```env
PORT=3001
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

### 3. **Create Required Directories**
```bash
mkdir -p data shared
chmod -R 755 data/ shared/
```

### 4. **Install System Dependencies**
```bash
# For YouTube downloads (yt-dlp)
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y python3 python3-pip ffmpeg
pip3 install yt-dlp

# CentOS/RHEL
sudo yum install -y python3 python3-pip ffmpeg
pip3 install yt-dlp
```

### 5. **Configure Firewall**
```bash
# Ubuntu/Debian
sudo ufw allow 3001/tcp
sudo ufw reload

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

### 6. **Setup Nginx (If Using Reverse Proxy)**

Edit nginx config:
```bash
sudo nano /etc/nginx/sites-available/video-analysis
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # ⚠️ CRITICAL: Disable buffering for streaming
        proxy_buffering off;
        proxy_cache off;
        proxy_request_buffering off;
        
        # Timeouts for long-running analysis
        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        
        # File uploads
        client_max_body_size 2048M;
        client_body_timeout 300s;
    }
}
```

Enable and test:
```bash
sudo ln -s /etc/nginx/sites-available/video-analysis /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. **Start with PM2**
```bash
npm install -g pm2
pm2 start server.js --name video-analysis
pm2 save
pm2 startup
```

## ✅ Post-Deployment Testing

Test each feature after deployment:

### Basic Functionality
- [ ] Main page loads at `http://your-vps-ip:3001` or `http://your-domain.com`
- [ ] No console errors in browser
- [ ] UI displays correctly (background animations, history panel, etc.)

### Video Analysis
- [ ] Can upload local video file and analyze
- [ ] Can analyze YouTube URL
- [ ] Progress modal shows checkpoints correctly
- [ ] Progress modal closes after completion
- [ ] Analysis results display in structured tab
- [ ] Timestamps show correctly with borders

### History & Storage
- [ ] History panel appears on hover (left side)
- [ ] New Analysis button is visible and works
- [ ] History items show date/time inside pills
- [ ] Storage bar updates correctly
- [ ] Can search history items

### Shareable Links
- [ ] Share button creates link with VPS domain (not localhost)
- [ ] Shared link works for local videos
- [ ] Shared link works for YouTube videos
- [ ] Video player scrolls normally (not sticky)
- [ ] Timestamps display correctly in shared view

### Delete Functionality
- [ ] Delete button removes item from history
- [ ] Delete button removes video file from backend
- [ ] Delete button removes shared analysis data
- [ ] Storage updates after deletion

### Error Handling
- [ ] Network errors trigger auto-retry (test by disconnecting briefly)
- [ ] Connection timeout shows helpful error message
- [ ] Invalid YouTube URLs show error message
- [ ] Large file uploads work correctly

## 🐛 Troubleshooting

### Issue: Server not accessible
- Check firewall: `sudo ufw status`
- Check if server is running: `pm2 list`
- Check server logs: `pm2 logs video-analysis`
- Verify server binds to 0.0.0.0 (not just localhost)

### Issue: "Stuck on Connecting to Server"
- **Most common**: Nginx buffering
- Verify nginx config has `proxy_buffering off;`
- Test nginx config: `sudo nginx -t`
- Reload nginx: `sudo systemctl reload nginx`
- Check server logs for errors

### Issue: Shareable links show localhost
- Verify nginx sets `Host` and `X-Forwarded-Proto` headers
- Check server.js logs for constructed URLs
- Ensure reverse proxy forwards all headers correctly

### Issue: Videos not playing in shareable links
- Check `shared/` directory permissions: `ls -la shared/`
- Verify files exist: `ls shared/`
- Check server logs for file serving errors
- Verify nginx doesn't block file serving

### Issue: YouTube downloads fail
- Verify yt-dlp is installed: `yt-dlp --version`
- Check internet connectivity: `ping youtube.com`
- Verify ffmpeg is installed: `ffmpeg -version`
- Check server logs for yt-dlp errors

## 📊 Monitoring

After deployment, monitor:

```bash
# Check PM2 status
pm2 list
pm2 logs video-analysis

# Check disk space
df -h

# Check server resources
htop  # or top

# Check nginx access logs
sudo tail -f /var/log/nginx/access.log

# Check nginx error logs
sudo tail -f /var/log/nginx/error.log
```

## 🔄 Updates

When updating code on VPS:

1. Pull/upload latest code
2. Run `npm install` if package.json changed
3. Restart PM2: `pm2 restart video-analysis`
4. Test critical features

---

**🎉 You're ready to deploy!** Follow this checklist step by step for a smooth deployment.

