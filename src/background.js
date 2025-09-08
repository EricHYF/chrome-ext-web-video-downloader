// 后台服务脚本
class VideoDetector {
  constructor() {
    this.detectedVideos = new Map();
    this.init();
  }

  init() {
    // 监听来自content script的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // 保持消息通道开放
    });

    // 监听网络请求以检测视频流
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => this.detectVideoInRequest(details),
      {
        urls: [
          "*://*/*.m3u8*",
          "*://*/*.mp4*", 
          "*://*/*.mkv*",
          "*://*/*.avi*",
          "*://*/*.mov*",
          "*://*/*.wmv*",
          "*://*/*.flv*",
          "*://*/*.webm*",
          "*://*/video/*",
          "*://*/stream/*"
        ]
      },
      ["requestBody"]
    );
  }

  handleMessage(message, sender, sendResponse) {
    console.log('收到消息:', message.type, 'sender:', sender);
    
    switch (message.type) {
      case 'GET_VIDEOS':
        if (message.tabId) {
          // 来自popup的请求，使用指定的tabId
          this.getVideosForTab(message.tabId, sendResponse);
        } else if (sender.tab && sender.tab.id) {
          // 来自content script的请求
          this.getVideosForTab(sender.tab.id, sendResponse);
        } else {
          console.error('无法确定标签页ID');
          sendResponse({videos: [], error: '无法确定标签页ID'});
        }
        break;
      case 'DOWNLOAD_VIDEO':
        this.downloadVideo(message.data, sendResponse);
        break;
      case 'VIDEO_DETECTED':
        if (sender.tab && sender.tab.id) {
          this.addDetectedVideo(sender.tab.id, message.data);
          sendResponse({success: true});
        } else {
          console.error('无法确定标签页ID用于视频检测');
          sendResponse({success: false, error: '无法确定标签页ID'});
        }
        break;
      case 'GET_PAGE_TITLE':
        if (message.tabId) {
          this.getPageTitle(message.tabId, sendResponse);
        } else if (sender.tab && sender.tab.id) {
          this.getPageTitle(sender.tab.id, sendResponse);
        } else {
          sendResponse({title: '未知标题'});
        }
        break;
      case 'BLOB_DOWNLOAD_REQUEST':
        this.handleBlobDownloadRequest(message.data, sendResponse);
        break;
    }
  }

  detectVideoInRequest(details) {
    const url = details.url;
    const tabId = details.tabId;

    // 检测各种视频格式
    const videoInfo = {
      url: url,
      type: this.getVideoType(url),
      timestamp: Date.now(),
      tabId: tabId
    };

    // 如果检测到HLS流(.m3u8)
    if (url.includes('.m3u8')) {
      videoInfo.type = 'hls';
      videoInfo.isStream = true;
    }

    this.addDetectedVideo(tabId, videoInfo);
  }

  getVideoType(url) {
    const extension = url.split('.').pop().split('?')[0].toLowerCase();
    const typeMap = {
      'm3u8': 'hls',
      'mp4': 'mp4',
      'mkv': 'mkv',
      'avi': 'avi',
      'mov': 'mov',
      'wmv': 'wmv',
      'flv': 'flv',
      'webm': 'webm'
    };
    return typeMap[extension] || 'unknown';
  }

  addDetectedVideo(tabId, videoInfo) {
    if (!this.detectedVideos.has(tabId)) {
      this.detectedVideos.set(tabId, []);
    }
    
    const videos = this.detectedVideos.get(tabId);
    // 避免重复添加相同的视频
    const exists = videos.some(v => v.url === videoInfo.url);
    if (!exists) {
      videos.push(videoInfo);
      console.log('检测到视频:', videoInfo);
    }
  }

  getVideosForTab(tabId, sendResponse) {
    if (!tabId) {
      console.error('getVideosForTab: tabId为空');
      sendResponse({videos: [], error: 'tabId为空'});
      return;
    }
    
    const videos = this.detectedVideos.get(tabId) || [];
    console.log(`获取标签页 ${tabId} 的视频列表:`, videos.length, '个视频');
    sendResponse({videos: videos});
  }

  async getPageTitle(tabId, sendResponse) {
    if (!tabId) {
      console.error('getPageTitle: tabId为空');
      sendResponse({title: '未知标题'});
      return;
    }
    
    try {
      const tab = await chrome.tabs.get(tabId);
      sendResponse({title: tab.title});
    } catch (error) {
      console.error('获取页面标题失败:', error);
      sendResponse({title: '未知标题'});
    }
  }

  async downloadVideo(videoData, sendResponse) {
    try {
      const {url, title, type, isBlob} = videoData;
      
      if (type === 'hls' || url.includes('.m3u8')) {
        // 对于HLS流，需要特殊处理
        await this.downloadHLSStream(url, title);
      } else if (isBlob || url.startsWith('blob:')) {
        // 对于blob URL，需要特殊处理
        await this.downloadBlobVideo(url, title);
      } else {
        // 直接下载普通视频文件
        await this.downloadDirectVideo(url, title);
      }
      
      sendResponse({success: true, message: '开始下载视频'});
    } catch (error) {
      console.error('下载失败:', error);
      sendResponse({success: false, message: '下载失败: ' + error.message});
    }
  }

  async downloadBlobVideo(blobUrl, title) {
    // 对于blob URL，需要通过content script来处理
    const message = {
      type: 'DOWNLOAD_BLOB',
      data: {
        blobUrl: blobUrl,
        title: title
      }
    };

    // 发送消息到当前活动标签页
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, message);
    }
  }

  async downloadDirectVideo(url, title) {
    const filename = `${this.sanitizeFilename(title)}.mp4`;
    
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });
  }

  async downloadHLSStream(m3u8Url, title) {
    // 对于HLS流，我们需要下载所有片段并合并
    // 这里创建一个下载任务，实际的合并逻辑在content script中处理
    const message = {
      type: 'DOWNLOAD_HLS',
      data: {
        m3u8Url: m3u8Url,
        title: title
      }
    };

    // 发送消息到当前活动标签页
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, message);
    }
  }

  sanitizeFilename(filename) {
    return filename.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
  }

  async handleBlobDownloadRequest(data, sendResponse) {
    try {
      // blob视频的下载通过content script处理
      // 这里主要是记录和协调
      console.log('处理blob下载请求:', data);
      sendResponse({success: true, message: 'blob下载请求已处理'});
    } catch (error) {
      console.error('blob下载处理失败:', error);
      sendResponse({success: false, message: error.message});
    }
  }
}

// 初始化视频检测器
const videoDetector = new VideoDetector();