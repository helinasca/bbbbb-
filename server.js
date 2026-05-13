const express = require('express');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
app.use(express.json({ limit: '500mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let activeStreams = {};

// Check ffmpeg
function checkFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

app.get('/api/check-ffmpeg', (req, res) => {
  res.json({ available: checkFFmpeg() });
});

app.post('/api/start-stream', async (req, res) => {
  const { keys, mediaPath, mediaType } = req.body;

  if (!checkFFmpeg()) {
    return res.status(500).json({ error: 'FFmpeg bulunamadı! Lütfen ffmpeg kurun.' });
  }

  if (!keys || keys.length === 0) {
    return res.status(400).json({ error: 'En az 1 stream key gerekli.' });
  }

  if (!mediaPath || !fs.existsSync(mediaPath)) {
    return res.status(400).json({ error: 'Medya dosyası bulunamadı.' });
  }

  const results = [];

  for (const keyObj of keys) {
    if (!keyObj.url || !keyObj.key) continue;

    const rtmpUrl = `${keyObj.url}/${keyObj.key}`;
    const id = `${keyObj.platform}_${Date.now()}`;

    let ffmpegArgs;

    if (mediaType === 'image') {
      ffmpegArgs = [
        '-loop', '1',
        '-i', mediaPath,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'stillimage',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-b:v', '2500k',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        '-f', 'flv',
        rtmpUrl
      ];
    } else {
      ffmpegArgs = [
        '-stream_loop', '-1',
        '-i', mediaPath,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-b:v', '2500k',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        '-f', 'flv',
        rtmpUrl
      ];
    }

    const proc = spawn('ffmpeg', ffmpegArgs);
    activeStreams[id] = { proc, platform: keyObj.platform, url: rtmpUrl };

    proc.on('close', (code) => {
      delete activeStreams[id];
    });

    results.push({ id, platform: keyObj.platform, status: 'started' });
  }

  res.json({ success: true, streams: results });
});

app.post('/api/stop-all', (req, res) => {
  for (const id in activeStreams) {
    try {
      activeStreams[id].proc.kill('SIGKILL');
    } catch (e) {}
  }
  activeStreams = {};
  res.json({ success: true });
});

app.get('/api/status', (req, res) => {
  const streams = Object.entries(activeStreams).map(([id, s]) => ({
    id,
    platform: s.platform
  }));
  res.json({ active: streams.length, streams });
});

// Save uploaded file to temp
app.post('/api/save-file', express.raw({ limit: '500mb', type: '*/*' }), (req, res) => {
  const filename = req.headers['x-filename'] || 'media_file';
  const tmpPath = path.join(os.tmpdir(), `stream_${Date.now()}_${filename}`);
  fs.writeFileSync(tmpPath, req.body);
  res.json({ path: tmpPath });
});

app.listen(3721, () => {
  console.log('\n🎬 Stream Uygulaması Başladı!');
  console.log('👉 Tarayıcıda aç: http://localhost:3721\n');
});
