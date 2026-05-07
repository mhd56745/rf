// ============================================
// MBC2 Stream Proxy - Deno Deploy Version
// ============================================

const CONFIG = {
  MPD_URL: 'https://ev-fuj-dxb-cdn-edge2.aws.playco.com/live/eds/MBC_2HD/DASH/MBC_2HD.mpd',
  KEY_HEX: '864e981865940ef26cde333a1a8be344',
  SEGMENT_DURATION: 2,
  MAX_SEGMENTS: 100
};

// استراتيجيات متعددة لتجاوز 403
const FETCH_STRATEGIES = [
  {
    name: 'Chrome Desktop',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/dash+xml,application/xml,text/xml,*/*',
      'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
      'Origin': 'https://www.mbc.net',
      'Referer': 'https://www.mbc.net/'
    }
  },
  {
    name: 'Mobile Safari',
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept': '*/*',
      'Origin': 'https://shahid.mbc.net',
      'Referer': 'https://shahid.mbc.net/'
    }
  }
];

// ============================================
// معالج الطلبات الرئيسي
// ============================================
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': '*'
  };

  // OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // الصفحة الرئيسية
    if (path === '/' || path === '/player') {
      return servePlayerPage(corsHeaders);
    }

    // قائمة HLS
    if (path === '/live.m3u8') {
      return await generateHLSPlaylist(corsHeaders);
    }

    // ملف init
    if (path === '/init.mp4') {
      return await fetchInitSegment(corsHeaders);
    }

    // مقاطع الفيديو
    const segMatch = path.match(/^\/segment_(\d+)\.m4s$/);
    if (segMatch) {
      return await fetchAndDecryptSegment(parseInt(segMatch[1]), corsHeaders);
    }

    // معلومات debug
    if (path === '/debug') {
      return await debugInfo(corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Not Found', path }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ============================================
// واجهة المستخدم
// ============================================
function servePlayerPage(headers: Record<string, string>): Response {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MBC2 Stream Proxy - بث مباشر</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; color: white; padding: 20px; margin-bottom: 20px; }
        .header h1 {
            font-size: 2rem;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .header p { color: #a0a0a0; }
        .video-container {
            background: #000;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            margin-bottom: 20px;
        }
        video { width: 100%; height: 500px; background: black; }
        .info-panel {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 20px;
            color: white;
        }
        .status {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            border-radius: 8px;
            margin-bottom: 15px;
        }
        .status.loading { background: rgba(255,193,7,0.2); color: #ffc107; }
        .status.playing { background: rgba(40,167,69,0.2); color: #28a745; }
        .status.error { background: rgba(220,53,69,0.2); color: #dc3545; }
        .share-buttons {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            justify-content: center;
            margin-bottom: 15px;
        }
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s ease;
        }
        .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        .btn-primary:hover { transform: translateY(-2px); }
        .btn-secondary { background: rgba(255,255,255,0.2); color: white; }
        .btn-danger { background: rgba(220,53,69,0.8); color: white; }
        .url-box {
            background: rgba(0,0,0,0.5);
            padding: 15px;
            border-radius: 8px;
            word-break: break-all;
            font-family: monospace;
            font-size: 12px;
        }
        .toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            animation: slideIn 0.3s ease;
            z-index: 1000;
        }
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @media (max-width: 768px) {
            video { height: 300px; }
            .btn { padding: 8px 16px; font-size: 12px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎬 MBC2 Stream Proxy</h1>
            <p>بث مباشر مفكوك التشفير - قابل للمشاركة</p>
        </div>
        
        <div class="video-container">
            <video id="video" controls autoplay></video>
        </div>
        
        <div class="info-panel">
            <div id="status" class="status loading">
                <span>🔄</span>
                <span id="statusText">جاري تحميل البث...</span>
            </div>
            
            <div class="share-buttons">
                <button class="btn btn-primary" onclick="copyStreamLink()">📋 نسخ الرابط</button>
                <button class="btn btn-secondary" onclick="shareWhatsApp()">💬 واتساب</button>
                <button class="btn btn-secondary" onclick="shareTelegram()">✈️ تليجرام</button>
                <button class="btn btn-danger" onclick="reloadStream()">🔄 إعادة تحميل</button>
            </div>
            
            <div class="url-box">
                <small>رابط البث المباشر:</small><br>
                <span id="streamUrl">جاري التحميل...</span>
            </div>
        </div>
    </div>
    
    <script>
        const STREAM_URL = window.location.origin + '/live.m3u8';
        const video = document.getElementById('video');
        
        function updateStatus(type, text) {
            const statusDiv = document.getElementById('status');
            const statusText = document.getElementById('statusText');
            statusDiv.className = 'status ' + type;
            statusText.innerText = text;
        }
        
        function initPlayer() {
            updateStatus('loading', 'جاري الاتصال بالبث...');
            document.getElementById('streamUrl').innerText = STREAM_URL;
            
            video.src = STREAM_URL;
            video.load();
            
            video.addEventListener('canplay', () => {
                updateStatus('playing', '✅ البث يعمل الآن');
            });
            
            video.addEventListener('error', () => {
                updateStatus('error', '⚠️ خطأ في التشغيل - جاري المحاولة مرة أخرى');
                setTimeout(() => reloadStream(), 3000);
            });
        }
        
        function copyStreamLink() {
            navigator.clipboard.writeText(STREAM_URL).then(() => {
                showToast('✅ تم نسخ الرابط بنجاح!');
            });
        }
        
        function shareWhatsApp() {
            window.open('https://wa.me/?text=' + encodeURIComponent(STREAM_URL), '_blank');
        }
        
        function shareTelegram() {
            window.open('https://t.me/share/url?url=' + encodeURIComponent(STREAM_URL), '_blank');
        }
        
        function reloadStream() {
            updateStatus('loading', '🔄 جاري إعادة تحميل البث...');
            video.src = STREAM_URL;
            video.load();
        }
        
        function showToast(message) {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerText = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
        
        initPlayer();
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: { ...headers, 'Content-Type': 'text/html' }
  });
}

// ============================================
// إنشاء قائمة HLS
// ============================================
async function generateHLSPlaylist(headers: Record<string, string>): Promise<Response> {
  try {
    const mpdContent = await fetchMPD();

    let playlist = '#EXTM3U\n';
    playlist += '#EXT-X-VERSION:7\n';
    playlist += '#EXT-X-TARGETDURATION:4\n';
    playlist += '#EXT-X-MEDIA-SEQUENCE:0\n';
    playlist += '#EXT-X-MAP:URI="/init.mp4"\n\n';

    for (let i = 0; i < CONFIG.MAX_SEGMENTS; i++) {
      playlist += `#EXTINF:${CONFIG.SEGMENT_DURATION},\n`;
      playlist += `/segment_${i}.m4s\n`;
    }

    playlist += '#EXT-X-ENDLIST\n';

    return new Response(playlist, {
      headers: { ...headers, 'Content-Type': 'application/vnd.apple.mpegurl' }
    });

  } catch (error) {
    console.error('Playlist error:', error);
    throw error;
  }
}

// ============================================
// جلب Init Segment
// ============================================
async function fetchInitSegment(headers: Record<string, string>): Promise<Response> {
  const mpdContent = await fetchMPD();
  const initUrl = extractInitUrl(mpdContent);

  if (!initUrl) {
    throw new Error('Cannot extract init URL');
  }

  console.log('Init URL:', initUrl);

  const response = await fetchWithStrategy(initUrl);
  const data = await response.arrayBuffer();

  return new Response(data, {
    headers: { ...headers, 'Content-Type': 'video/mp4' }
  });
}

// ============================================
// جلب وفك تشفير المقطع
// ============================================
async function fetchAndDecryptSegment(index: number, headers: Record<string, string>): Promise<Response> {
  const mpdContent = await fetchMPD();
  const segmentUrl = extractSegmentUrl(mpdContent, index);

  if (!segmentUrl) {
    throw new Error(`Cannot find segment ${index}`);
  }

  console.log(`Segment ${index}:`, segmentUrl);

  const response = await fetchWithStrategy(segmentUrl);
  const encryptedData = await response.arrayBuffer();

  // فك التشفير
  let decryptedData = encryptedData;
  try {
    decryptedData = await decryptSegment(encryptedData, CONFIG.KEY_HEX);
  } catch (error) {
    console.error('Decryption failed:', error);
  }

  return new Response(decryptedData, {
    headers: { ...headers, 'Content-Type': 'video/mp4' }
  });
}

// ============================================
// فك التشفير باستخدام AES-CTR
// ============================================
async function decryptSegment(encryptedBuffer: ArrayBuffer, keyHex: string): Promise<ArrayBuffer> {
  // استخراج IV
  const iv = extractIV(encryptedBuffer);
  if (!iv) {
    console.warn('No IV found');
    return encryptedBuffer;
  }

  // البحث عن mdat box
  const mdatInfo = findMdatBox(encryptedBuffer);
  if (mdatInfo.offset === -1) {
    console.warn('No mdat box found');
    return encryptedBuffer;
  }

  const encryptedStart = mdatInfo.offset + 8;
  const encryptedSize = mdatInfo.size - 8;
  const encryptedData = encryptedBuffer.slice(encryptedStart, encryptedStart + encryptedSize);

  // إعداد المفتاح
  const keyBytes = hexToBytes(keyHex);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CTR' },
    false,
    ['decrypt']
  );

  // عداد AES-CTR
  const counter = new Uint8Array(16);
  counter.set(iv, 0);

  // فك التشفير
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: counter, length: 64 },
    key,
    encryptedData
  );

  // إعادة بناء الملف
  const result = new Uint8Array(encryptedBuffer.byteLength);
  result.set(new Uint8Array(encryptedBuffer, 0, encryptedStart), 0);
  result.set(new Uint8Array(decrypted), encryptedStart);

  // إضافة البيانات المتبقية إن وجدت
  const remainingStart = encryptedStart + encryptedSize;
  const remainingSize = encryptedBuffer.byteLength - remainingStart;
  if (remainingSize > 0) {
    result.set(new Uint8Array(encryptedBuffer, remainingStart, remainingSize), encryptedStart + decrypted.byteLength);
  }

  return result.buffer;
}

// ============================================
// استخراج IV من ملف MP4
// ============================================
function extractIV(buffer: ArrayBuffer): Uint8Array | null {
  const view = new DataView(buffer);
  let offset = 0;

  while (offset < buffer.byteLength - 8) {
    const size = view.getUint32(offset);
    if (size === 0) break;

    const type = getBoxType(view, offset + 4);

    if (type === 'moof') {
      let moofOffset = offset + 8;
      const moofEnd = offset + size;

      while (moofOffset < moofEnd - 8) {
        const childSize = view.getUint32(moofOffset);
        const childType = getBoxType(view, moofOffset + 4);

        if (childType === 'senc') {
          const sampleCount = view.getUint32(moofOffset + 12);
          if (sampleCount > 0) {
            return new Uint8Array(buffer, moofOffset + 16, 8);
          }
        }

        moofOffset += childSize;
      }
    }

    offset += size;
  }

  return null;
}

// ============================================
// البحث عن mdat box
// ============================================
function findMdatBox(buffer: ArrayBuffer): { offset: number; size: number } {
  const view = new DataView(buffer);
  let offset = 0;

  while (offset < buffer.byteLength - 8) {
    const size = view.getUint32(offset);
    if (size === 0) break;

    const type = getBoxType(view, offset + 4);

    if (type === 'mdat') {
      return { offset, size };
    }

    offset += size;
  }

  return { offset: -1, size: 0 };
}

// ============================================
// جلب MPD مع استراتيجيات متعددة
// ============================================
async function fetchMPD(): Promise<string> {
  for (const strategy of FETCH_STRATEGIES) {
    try {
      console.log(`Trying ${strategy.name}...`);
      const response = await fetch(CONFIG.MPD_URL, {
        headers: strategy.headers
      });

      if (response.ok) {
        console.log(`✅ ${strategy.name} succeeded`);
        return await response.text();
      }
    } catch (error) {
      console.log(`❌ ${strategy.name} failed:`, error.message);
    }
  }

  throw new Error('All fetch strategies failed for MPD');
}

// ============================================
// جلب مع استراتيجية
// ============================================
async function fetchWithStrategy(url: string): Promise<Response> {
  for (const strategy of FETCH_STRATEGIES) {
    try {
      const response = await fetch(url, {
        headers: strategy.headers
      });

      if (response.ok) {
        return response;
      }
    } catch (error) {
      // continue
    }
  }

  throw new Error(`Failed to fetch ${url}`);
}

// ============================================
// استخراج Init URL من MPD
// ============================================
function extractInitUrl(mpdText: string): string | null {
  const initMatch = mpdText.match(/initialization="([^"]+)"/i);
  if (!initMatch) return null;

  let initPath = initMatch[1];

  const repMatch = mpdText.match(/<Representation[^>]*id="([^"]+)"/i);
  if (repMatch && initPath.includes('$RepresentationID$')) {
    initPath = initPath.replace(/\$RepresentationID\$/g, repMatch[1]);
  }

  if (initPath.startsWith('http')) {
    return initPath;
  }

  const baseMatch = mpdText.match(/<BaseURL>(.*?)<\/BaseURL>/i);
  const baseUrl = baseMatch ? baseMatch[1].trim() : '';
  const mpdBaseUrl = CONFIG.MPD_URL.substring(0, CONFIG.MPD_URL.lastIndexOf('/') + 1);

  return mpdBaseUrl + baseUrl + initPath;
}

// ============================================
// استخراج Segment URL من MPD
// ============================================
function extractSegmentUrl(mpdText: string, index: number): string | null {
  const mediaMatch = mpdText.match(/media="([^"]+)"/i);
  const startMatch = mpdText.match(/startNumber="(\d+)"/i);

  if (!mediaMatch) return null;

  let mediaPath = mediaMatch[1];
  const startNumber = startMatch ? parseInt(startMatch[1]) : 0;
  const segmentNum = startNumber + index;

  // استبدال $Number$
  mediaPath = mediaPath.replace(/\$Number(%0(\d+)d)?\$/g, (match, p1, p2) => {
    if (p2) {
      return segmentNum.toString().padStart(parseInt(p2), '0');
    }
    return segmentNum.toString();
  });

  // استبدال $RepresentationID$
  const repMatch = mpdText.match(/<Representation[^>]*id="([^"]+)"/i);
  if (repMatch && mediaPath.includes('$RepresentationID$')) {
    mediaPath = mediaPath.replace(/\$RepresentationID\$/g, repMatch[1]);
  }

  if (mediaPath.startsWith('http')) {
    return mediaPath;
  }

  const baseMatch = mpdText.match(/<BaseURL>(.*?)<\/BaseURL>/i);
  const baseUrl = baseMatch ? baseMatch[1].trim() : '';
  const mpdBaseUrl = CONFIG.MPD_URL.substring(0, CONFIG.MPD_URL.lastIndexOf('/') + 1);

  return mpdBaseUrl + baseUrl + mediaPath;
}

// ============================================
// معلومات Debug
// ============================================
async function debugInfo(headers: Record<string, string>): Promise<Response> {
  const info = {
    timestamp: new Date().toISOString(),
    runtime: 'Deno Deploy',
    config: {
      mpdUrl: CONFIG.MPD_URL,
      maxSegments: CONFIG.MAX_SEGMENTS,
      keyProvided: !!CONFIG.KEY_HEX
    }
  };

  try {
    const mpdText = await fetchMPD();
    Object.assign(info, {
      mpdLength: mpdText.length,
      initUrl: extractInitUrl(mpdText),
      firstSegment: extractSegmentUrl(mpdText, 0),
      status: 'success'
    });
  } catch (error) {
    Object.assign(info, {
      status: 'error',
      error: error.message
    });
  }

  return new Response(JSON.stringify(info, null, 2), {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

// ============================================
// دوال مساعدة
// ============================================
function getBoxType(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// نقطة الدخول - Deno Deploy
Deno.serve({ port: 8000 }, handleRequest);
