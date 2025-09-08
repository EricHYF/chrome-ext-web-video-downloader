// Blob视频下载器 - 专门处理blob URL视频
class BlobDownloader {
  constructor() {
    this.blobCache = new Map();
    this.downloadQueue = new Map();
    this.init();
  }

  init() {
    // 监听blob URL的创建
    this.interceptBlobCreation();
    // 监听video元素的blob URL赋值
    this.monitorBlobAssignment();
  }

  interceptBlobCreation() {
    // 保存原始的URL.createObjectURL
    const originalCreateObjectURL = URL.createObjectURL;
    const self = this;

    URL.createObjectURL = function(object) {
      const blobUrl = originalCreateObjectURL.apply(this, arguments);
      
      // 如果是视频相关的blob，缓存它
      if (object instanceof Blob || object instanceof MediaSource) {
        self.cacheBlobObject(blobUrl, object);
      }
      
      return blobUrl;
    };
  }

  cacheBlobObject(blobUrl, object) {
    const cacheInfo = {
      url: blobUrl,
      object: object,
      timestamp: Date.now(),
      type: object.constructor.name,
      size: object instanceof Blob ? object.size : 0
    };

    this.blobCache.set(blobUrl, cacheInfo);
    console.log('缓存blob对象:', cacheInfo);
  }

  monitorBlobAssignment() {
    // 使用MutationObserver监控video元素的src属性变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
          const video = mutation.target;
          if (video.tagName === 'VIDEO' && video.src.startsWith('blob:')) {
            this.handleBlobVideo(video);
          }
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['src']
    });

    // 也监控现有的video元素
    setInterval(() => {
      this.scanExistingBlobVideos();
    }, 2000);
  }

  scanExistingBlobVideos() {
    const videos = document.querySelectorAll('video[src^="blob:"]');
    videos.forEach(video => {
      if (!video.dataset.blobProcessed) {
        this.handleBlobVideo(video);
        video.dataset.blobProcessed = 'true';
      }
    });
  }

  handleBlobVideo(video) {
    const blobUrl = video.src;
    const videoInfo = {
      element: video,
      blobUrl: blobUrl,
      title: this.extractVideoTitle(video),
      duration: video.duration,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      className: video.className,
      id: video.id
    };

    console.log('处理blob视频:', videoInfo);

    // 尝试获取blob数据
    this.processBlobVideo(videoInfo);
  }

  async processBlobVideo(videoInfo) {
    const { blobUrl, element } = videoInfo;

    try {
      // 方法1: 尝试直接fetch blob URL
      const response = await fetch(blobUrl);
      if (response.ok) {
        const blob = await response.blob();
        videoInfo.blob = blob;
        videoInfo.size = blob.size;
        videoInfo.type = blob.type || 'video/mp4';
        
        this.reportBlobVideo(videoInfo);
        return;
      }
    } catch (error) {
      console.log('直接fetch blob失败:', error);
    }

    // 方法2: 通过canvas捕获视频帧（作为预览）
    try {
      await this.captureVideoFrames(videoInfo);
    } catch (error) {
      console.log('canvas捕获失败:', error);
    }

    // 方法3: 监控MediaSource buffer
    this.monitorMediaSource(videoInfo);
  }

  async captureVideoFrames(videoInfo) {
    const { element } = videoInfo;
    
    if (element.readyState >= 2) { // HAVE_CURRENT_DATA
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = element.videoWidth || 640;
      canvas.height = element.videoHeight || 360;
      
      // 捕获当前帧
      ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
      
      // 转换为blob
      canvas.toBlob((blob) => {
        videoInfo.thumbnail = blob;
        this.reportBlobVideo(videoInfo);
      }, 'image/jpeg', 0.8);
    }
  }

  monitorMediaSource(videoInfo) {
    const { element } = videoInfo;
    
    // 尝试从元素的内部属性获取MediaSource
    if (element.srcObject && element.srcObject instanceof MediaSource) {
      const mediaSource = element.srcObject;
      this.extractFromMediaSource(mediaSource, videoInfo);
    }

    // 检查是否有缓存的blob信息
    const cached = this.blobCache.get(videoInfo.blobUrl);
    if (cached) {
      videoInfo.cachedInfo = cached;
      this.reportBlobVideo(videoInfo);
    }
  }

  extractFromMediaSource(mediaSource, videoInfo) {
    try {
      const sourceBuffers = mediaSource.sourceBuffers;
      for (let i = 0; i < sourceBuffers.length; i++) {
        const sourceBuffer = sourceBuffers[i];
        
        // 监听updateend事件来获取数据
        sourceBuffer.addEventListener('updateend', () => {
          console.log('SourceBuffer更新完成:', sourceBuffer);
          // 这里可以尝试获取buffer中的数据
        });
      }
    } catch (error) {
      console.log('MediaSource处理失败:', error);
    }
  }

  reportBlobVideo(videoInfo) {
    // 发送到content script
    window.postMessage({
      type: 'BLOB_VIDEO_DETECTED',
      data: {
        url: videoInfo.blobUrl,
        title: videoInfo.title,
        size: videoInfo.size,
        type: videoInfo.type || 'video/mp4',
        duration: videoInfo.duration,
        width: videoInfo.videoWidth,
        height: videoInfo.videoHeight,
        hasBlob: !!videoInfo.blob,
        hasThumbnail: !!videoInfo.thumbnail,
        cachedInfo: videoInfo.cachedInfo
      }
    }, '*');
  }

  extractVideoTitle(video) {
    // 尝试从多个来源提取标题
    const sources = [
      video.getAttribute('title'),
      video.getAttribute('data-title'),
      video.closest('.video-js')?.getAttribute('data-title'),
      document.querySelector('h1')?.textContent,
      document.querySelector('.lesson-title')?.textContent,
      document.querySelector('.video-title')?.textContent,
      document.title
    ];

    for (const source of sources) {
      if (source && source.trim()) {
        return source.trim();
      }
    }

    return '未知视频标题';
  }

  // 下载blob视频
  async downloadBlobVideo(blobUrl, title) {
    try {
      // 尝试从缓存获取blob数据
      const cached = this.blobCache.get(blobUrl);
      if (cached && cached.object instanceof Blob) {
        await this.downloadBlob(cached.object, title);
        return { success: true, message: '从缓存下载成功' };
      }

      // 尝试直接fetch
      const response = await fetch(blobUrl);
      if (response.ok) {
        const blob = await response.blob();
        await this.downloadBlob(blob, title);
        return { success: true, message: '直接下载成功' };
      }

      throw new Error('无法获取blob数据');

    } catch (error) {
      console.error('Blob下载失败:', error);
      return { success: false, message: error.message };
    }
  }

  async downloadBlob(blob, title) {
    return new Promise((resolve, reject) => {
      try {
        const url = URL.createObjectURL(blob);
        const filename = this.sanitizeFilename(title) + '.mp4';
        
        // 创建下载链接
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // 清理URL
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  sanitizeFilename(filename) {
    return filename.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
  }

  // 获取blob缓存信息
  getBlobCache() {
    return Array.from(this.blobCache.entries()).map(([url, info]) => ({
      url,
      ...info
    }));
  }

  // 清理过期的缓存
  cleanupCache() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30分钟

    for (const [url, info] of this.blobCache.entries()) {
      if (now - info.timestamp > maxAge) {
        this.blobCache.delete(url);
      }
    }
  }
}

// 创建全局实例
const blobDownloader = new BlobDownloader();

// 定期清理缓存
setInterval(() => {
  blobDownloader.cleanupCache();
}, 5 * 60 * 1000); // 每5分钟清理一次

// 导出给其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BlobDownloader;
}