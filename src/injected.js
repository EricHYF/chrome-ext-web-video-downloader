// 注入脚本 - 在页面上下文中运行
(function() {
  'use strict';

  // 存储检测到的视频URL
  const detectedVideos = new Set();

  // 重写XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    // 检测视频相关的请求
    if (isVideoRequest(url)) {
      reportVideoUrl(url, 'xhr');
    }
    
    return originalXHROpen.apply(this, arguments);
  };

  // 重写fetch
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : input.url;
    
    if (isVideoRequest(url)) {
      reportVideoUrl(url, 'fetch');
    }
    
    return originalFetch.apply(this, arguments);
  };

  // 监听媒体元素事件
  function interceptMediaEvents() {
    document.addEventListener('loadstart', function(e) {
      if (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO') {
        const src = e.target.src || e.target.currentSrc;
        if (src) {
          // 检测blob URL和普通视频URL
          if (src.startsWith('blob:') || isVideoRequest(src)) {
            reportVideoUrl(src, 'media_element', {
              element: e.target,
              isBlob: src.startsWith('blob:')
            });
          }
        }
      }
    }, true);

    document.addEventListener('canplay', function(e) {
      if (e.target.tagName === 'VIDEO') {
        const src = e.target.src || e.target.currentSrc;
        if (src) {
          const metadata = {
            duration: e.target.duration,
            width: e.target.videoWidth,
            height: e.target.videoHeight,
            isBlob: src.startsWith('blob:')
          };
          
          if (src.startsWith('blob:') || isVideoRequest(src)) {
            reportVideoUrl(src, 'video_ready', metadata);
          }
        }
      }
    }, true);
  }

  // 拦截WebRTC和MSE (Media Source Extensions)
  function interceptMediaSources() {
    // 拦截MediaSource
    const originalMediaSource = window.MediaSource;
    if (originalMediaSource) {
      window.MediaSource = function() {
        const mediaSource = new originalMediaSource();
        
        // 监听sourceopen事件
        mediaSource.addEventListener('sourceopen', function() {
          console.log('MediaSource opened');
          // 尝试获取关联的视频元素
          setTimeout(() => {
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
              if (video.src && video.src.startsWith('blob:')) {
                reportVideoUrl(video.src, 'media_source', {
                  mediaSource: mediaSource,
                  videoElement: video
                });
              }
            });
          }, 100);
        });

        return mediaSource;
      };
      Object.setPrototypeOf(window.MediaSource, originalMediaSource);
      window.MediaSource.prototype = originalMediaSource.prototype;
    }

    // 拦截URL.createObjectURL
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = function(object) {
      const url = originalCreateObjectURL.apply(this, arguments);
      
      if (object instanceof MediaSource || object instanceof Blob) {
        reportVideoUrl(url, 'blob_url', {
          objectType: object.constructor.name,
          blobSize: object instanceof Blob ? object.size : undefined
        });
      }
      
      return url;
    };

    // 拦截Blob构造函数
    const originalBlob = window.Blob;
    window.Blob = function(blobParts, options) {
      const blob = new originalBlob(blobParts, options);
      
      // 如果包含视频数据，记录
      if (options && options.type && options.type.startsWith('video/')) {
        console.log('Video blob created:', options.type, blob.size);
      }
      
      return blob;
    };
    window.Blob.prototype = originalBlob.prototype;
  }

  // 检查是否为视频请求
  function isVideoRequest(url) {
    if (!url || typeof url !== 'string') return false;
    
    // blob URL总是被认为是潜在的视频源
    if (url.startsWith('blob:')) return true;
    
    const videoPatterns = [
      /\.m3u8(\?.*)?$/i,
      /\.mp4(\?.*)?$/i,
      /\.avi(\?.*)?$/i,
      /\.mov(\?.*)?$/i,
      /\.wmv(\?.*)?$/i,
      /\.flv(\?.*)?$/i,
      /\.webm(\?.*)?$/i,
      /\.mkv(\?.*)?$/i,
      /\.ts(\?.*)?$/i,
      /\/video\//i,
      /\/stream\//i,
      /\/media\//i,
      /\/hls\//i,
      /\/dash\//i,
      /qiqiuyun\.net/i,  // 特定平台
      /service-cdn/i     // CDN服务
    ];

    return videoPatterns.some(pattern => pattern.test(url));
  }

  // 报告检测到的视频URL
  function reportVideoUrl(url, source, metadata = {}) {
    // 避免重复报告
    const key = `${url}_${source}`;
    if (detectedVideos.has(key)) return;
    detectedVideos.add(key);

    // 发送消息到content script
    window.postMessage({
      type: 'VIDEO_DETECTED_INJECTED',
      data: {
        url: url,
        source: source,
        metadata: metadata,
        timestamp: Date.now(),
        pageUrl: window.location.href,
        pageTitle: document.title
      }
    }, '*');

    console.log(`检测到视频 [${source}]:`, url);
  }

  // 监听特定的JavaScript API调用
  function interceptVideoAPIs() {
    // 拦截video.play()
    const originalPlay = HTMLVideoElement.prototype.play;
    HTMLVideoElement.prototype.play = function() {
      const src = this.src || this.currentSrc;
      if (src) {
        reportVideoUrl(src, 'video_play');
      }
      return originalPlay.apply(this, arguments);
    };

    // 拦截video.load()
    const originalLoad = HTMLVideoElement.prototype.load;
    HTMLVideoElement.prototype.load = function() {
      const src = this.src || this.currentSrc;
      if (src) {
        reportVideoUrl(src, 'video_load');
      }
      return originalLoad.apply(this, arguments);
    };
  }

  // 扫描页面中已存在的视频
  function scanExistingVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      const src = video.src || video.currentSrc;
      if (src) {
        reportVideoUrl(src, 'existing_video');
      }

      // 检查source元素
      const sources = video.querySelectorAll('source');
      sources.forEach(source => {
        if (source.src) {
          reportVideoUrl(source.src, 'video_source');
        }
      });
    });
  }

  // 监听DOM变化
  function observeVideoElements() {
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'VIDEO') {
              const src = node.src || node.currentSrc;
              if (src) {
                reportVideoUrl(src, 'dynamic_video');
              }
            }
            
            // 查找子元素中的video
            const videos = node.querySelectorAll && node.querySelectorAll('video');
            if (videos) {
              videos.forEach(video => {
                const src = video.src || video.currentSrc;
                if (src) {
                  reportVideoUrl(src, 'nested_video');
                }
              });
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 初始化所有拦截器
  function init() {
    interceptMediaEvents();
    interceptMediaSources();
    interceptVideoAPIs();
    interceptVideoJSPlayers();
    
    // 延迟扫描，等待页面加载
    setTimeout(() => {
      scanExistingVideos();
      observeVideoElements();
      scanVideoJSPlayers();
    }, 1000);
  }

  // 专门处理Video.js播放器
  function interceptVideoJSPlayers() {
    // 监听Video.js特有的事件
    document.addEventListener('DOMContentLoaded', function() {
      // 等待Video.js初始化
      setTimeout(() => {
        if (window.videojs) {
          console.log('检测到Video.js播放器');
          
          // Hook into Video.js
          const originalVideojs = window.videojs;
          window.videojs = function(id, options, ready) {
            const player = originalVideojs.apply(this, arguments);
            
            // 监听播放器事件
            player.ready(() => {
              const tech = player.tech();
              if (tech && tech.el() && tech.el().src) {
                reportVideoUrl(tech.el().src, 'videojs_player', {
                  playerId: id,
                  options: options
                });
              }
            });
            
            return player;
          };
        }
      }, 2000);
    });
  }

  // 扫描现有的Video.js播放器
  function scanVideoJSPlayers() {
    // 查找Video.js播放器的常见类名
    const vjsSelectors = [
      '.vjs-tech',
      '.video-js',
      '.vjs-default-skin',
      '.vjs-fluid'
    ];
    
    vjsSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (element.tagName === 'VIDEO' && element.src) {
          reportVideoUrl(element.src, 'videojs_existing', {
            className: element.className,
            id: element.id
          });
        }
      });
    });
  }

  // 如果页面已加载完成，立即初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();