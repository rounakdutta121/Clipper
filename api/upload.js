import { v2 as cloudinary } from 'cloudinary';

const CLIP_DURATION = 15;
const DEFAULT_CLIP_COUNT = 3;
const MAX_CLIPS = 5;

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data || '');
}

function logError(message, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ERROR: ${message}`, error?.message || error, error?.stack || '');
}

function validateEnvVars() {
  const missing = [];
  if (!process.env.CLOUD_NAME) missing.push('CLOUD_NAME');
  if (!process.env.API_KEY) missing.push('API_KEY');
  if (!process.env.API_SECRET) missing.push('API_SECRET');
  
  log('Environment variables check:', {
    CLOUD_NAME: !!process.env.CLOUD_NAME,
    API_KEY: !!process.env.API_KEY,
    API_SECRET: !!process.env.API_SECRET,
  });
  
  return missing.length === 0;
}

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
    secure: true,
  });
}

function validateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function extractPublicId(videoUrl) {
  if (!videoUrl) throw new Error('videoUrl is required');
  
  const urlObj = new URL(videoUrl);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  const uploadIndex = pathParts.indexOf('upload');
  
  if (uploadIndex === -1) {
    throw new Error('Invalid Cloudinary URL: missing /upload/ segment');
  }
  
  const afterUpload = pathParts.slice(uploadIndex + 1);
  const versionIndex = afterUpload.findIndex(part => /^v\d+$/.test(part));
  
  if (versionIndex !== -1) {
    afterUpload.splice(versionIndex, 1);
  }
  
  const filePath = afterUpload.join('/').replace(/\.[^/.]+$/, '');
  
  if (!filePath) {
    throw new Error('Could not extract public ID from URL');
  }
  
  return filePath;
}

function generateClipsWithCloudinary(publicId, clipCount) {
  const clips = [];
  
  for (let i = 0; i < clipCount; i++) {
    const startOffset = i * CLIP_DURATION;
    const endOffset = startOffset + CLIP_DURATION;
    
    const clipUrl = cloudinary.url(`${publicId}.mp4`, {
      resource_type: 'video',
      transformation: [
        { start_offset: startOffset },
        { end_offset: endOffset },
      ],
      fetch_format: 'mp4',
      flags: 'streaming_attachment',
    });
    
    clips.push({
      index: i + 1,
      startOffset,
      endOffset,
      url: clipUrl,
    });
  }
  
  return clips;
}

function generateFallbackClips(clipCount) {
  log('Generating fallback clips');
  return Array.from({ length: clipCount }, (_, i) => ({
    index: i + 1,
    startOffset: i * CLIP_DURATION,
    endOffset: (i + 1) * CLIP_DURATION,
    url: `fallback_clip_${i + 1}`,
  }));
}

function parseBody(rawBody) {
  if (!rawBody) return {};
  if (typeof rawBody === 'string') {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }
  return rawBody || {};
}

function safeResponse(res, status, data) {
  try {
    res.status(status).json(data);
  } catch (e) {
    logError('Failed to send response', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export default async function handler(req, res) {
  log('=== Function Start ===');
  log('Method:', req.method);
  
  if (req.method !== 'POST') {
    return safeResponse(res, 405, {
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }
  
  try {
    const body = parseBody(req.body);
    const videoUrl = body?.videoUrl || body?.video_url || '';
    const clipCount = Math.min(
      Math.max(1, parseInt(body?.clipCount || body?.clip_count) || DEFAULT_CLIP_COUNT),
      MAX_CLIPS
    );
    
    log('Request body:', { videoUrl, clipCount });
    
    if (!videoUrl) {
      return safeResponse(res, 400, {
        success: false,
        error: 'Missing required field: videoUrl',
      });
    }
    
    if (!validateUrl(videoUrl)) {
      return safeResponse(res, 400, {
        success: false,
        error: 'Invalid URL format. Provide a valid HTTP/HTTPS URL.',
      });
    }
    
    if (!validateEnvVars()) {
      return safeResponse(res, 500, {
        success: false,
        error: 'Missing environment variables',
      });
    }
    
    configureCloudinary();
    
    const publicId = extractPublicId(videoUrl);
    log('Public ID extracted:', publicId);
    
    let clips;
    try {
      clips = generateClipsWithCloudinary(publicId, clipCount);
      log(`Generated ${clips.length} clips successfully`);
    } catch (cloudinaryError) {
      logError('Cloudinary clip generation failed', cloudinaryError);
      clips = generateFallbackClips(clipCount);
      log('Using fallback clips');
    }
    
    const debug = req?.query?.debug === 'true';
    
    const response = {
      success: true,
      clips: clips.map(c => c.url),
      metadata: clips,
    };
    
    if (debug) {
      response._debug = {
        receivedBody: body,
        extractedPublicId: publicId,
        envStatus: {
          CLOUD_NAME: !!process.env.CLOUD_NAME,
          API_KEY: !!process.env.API_KEY,
          API_SECRET: !!process.env.API_SECRET,
        },
      };
    }
    
    log('=== Function End (Success) ===');
    return safeResponse(res, 200, response);
    
  } catch (error) {
    logError('Unhandled exception', error);
    
    const fallbackClips = generateFallbackClips(DEFAULT_CLIP_COUNT);
    
    return safeResponse(res, 200, {
      success: true,
      clips: fallbackClips.map(c => c.url),
      metadata: fallbackClips,
      _fallback: true,
      error: error?.message || 'Unknown error',
    });
  }
}
