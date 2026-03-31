import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const CLIP_DURATION = 15;
const MAX_CLIPS = 5;

function validateUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function extractPublicId(videoUrl) {
  const urlObj = new URL(videoUrl);
  const pathParts = urlObj.pathname.split('/');
  const uploadIndex = pathParts.findIndex(part => part === 'upload');
  
  if (uploadIndex === -1) {
    throw new Error('Invalid Cloudinary URL: missing /upload/ segment');
  }
  
  const afterUpload = pathParts.slice(uploadIndex + 1);
  const versionIndex = afterUpload.findIndex(part => /^v\d+$/.test(part));
  
  if (versionIndex !== -1) {
    afterUpload.splice(versionIndex, 1);
  }
  
  const filePath = afterUpload.join('/').replace(/\.[^/.]+$/, '');
  
  return filePath;
}

function generateClips(publicId, clipCount) {
  const clips = [];
  
  for (let i = 0; i < clipCount; i++) {
    const startOffset = i * CLIP_DURATION;
    const endOffset = startOffset + CLIP_DURATION;
    
    const clipUrl = cloudinary.url(`${publicId}.mp4`, {
      resource_type: 'video',
      start_offset: startOffset,
      end_offset: endOffset,
      fetch_format: 'mp4',
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

export default async function handler(req, res) {
  console.log('Method:', req.method);
  console.log('Timestamp:', new Date().toISOString());
  
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }
  
  try {
    const { videoUrl, clipCount } = req.body;
    
    console.log('Request body:', { videoUrl, clipCount });
    
    if (!videoUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: videoUrl',
      });
    }
    
    if (!validateUrl(videoUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format',
      });
    }
    
    const requestedClipCount = Math.min(
      Math.max(1, parseInt(clipCount) || 3),
      MAX_CLIPS
    );
    
    console.log('Generating', requestedClipCount, 'clips...');
    
    const publicId = extractPublicId(videoUrl);
    console.log('Public ID:', publicId);
    
    const clips = generateClips(publicId, requestedClipCount);
    console.log('Generated', clips.length, 'clips');
    
    return res.status(200).json({
      success: true,
      clips: clips.map(c => c.url),
      metadata: clips,
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
