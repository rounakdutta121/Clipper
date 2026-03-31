export default async function handler(req, res) {
  console.log('Function started:', new Date().toISOString());
  console.log('Method:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }
  
  try {
    const body = req.body || {};
    const videoUrl = body.videoUrl || body.video_url || '';
    
    console.log('Request body:', body);
    
    if (!videoUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: videoUrl',
      });
    }
    
    const { v2: cloudinary } = await import('cloudinary');
    
    cloudinary.config({
      cloud_name: process.env.CLOUD_NAME,
      api_key: process.env.API_KEY,
      api_secret: process.env.API_SECRET,
      secure: true,
    });
    
    console.log('Cloudinary configured');
    
    const urlObj = new URL(videoUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const uploadIndex = pathParts.indexOf('upload');
    
    if (uploadIndex === -1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Cloudinary URL: missing /upload/ segment',
      });
    }
    
    let publicId = pathParts.slice(uploadIndex + 1);
    const versionIndex = publicId.findIndex(part => /^v\d+$/.test(part));
    if (versionIndex !== -1) publicId.splice(versionIndex, 1);
    publicId = publicId.join('/').replace(/\.[^/.]+$/, '');
    
    console.log('Public ID:', publicId);
    
    const clips = [
      { index: 1, startOffset: 0, endOffset: 15 },
      { index: 2, startOffset: 15, endOffset: 30 },
      { index: 3, startOffset: 30, endOffset: 45 },
    ].map(clip => ({
      ...clip,
      url: cloudinary.url(`${publicId}.mp4`, {
        resource_type: 'video',
        transformation: [
          { start_offset: clip.startOffset },
          { end_offset: clip.endOffset },
        ],
        fetch_format: 'mp4',
      }),
    }));
    
    console.log('Generated clips:', clips.length);
    
    return res.status(200).json({
      success: true,
      clips: clips.map(c => c.url),
      metadata: clips,
    });
    
  } catch (error) {
    console.error('Error:', error.message, error.stack);
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
