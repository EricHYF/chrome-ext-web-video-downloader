// HLS视频下载和合并工具
class HLSDownloader {
  constructor() {
    this.downloads = new Map();
    this.ffmpegLoaded = false;
  }

  async downloadHLSVideo(m3u8Url, title, options = {}) {
    const downloadId = Date.now().toString();
    
    try {
      // 解析M3U8文件
      const playlist = await this.parseM3U8(m3u8Url);
      
      if (playlist.isError) {
        throw new Error(playlist.error);
      }

      // 创建下载任务
      const downloadTask = {
        id: downloadId,
        title: title,
        m3u8Url: m3u8Url,
        segments: playlist.segments,
        totalSegments: playlist.segments.length,
        downloadedSegments: 0,
        status: 'preparing',
        chunks: [],
        options: options
      };

      this.downloads.set(downloadId, downloadTask);

      // 开始下载片段
      await this.downloadSegments(downloadTask);

      return downloadId;

    } catch (error) {
      console.error('HLS下载失败:', error);
      this.updateDownloadStatus(downloadId, 'error', error.message);
      throw error;
    }
  }

  async parseM3U8(m3u8Url) {
    try {
      const response = await fetch(m3u8Url);
      const content = await response.text();
      
      const lines = content.split('\n').map(line => line.trim()).filter(line => line);
      const segments = [];
      const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

      let currentSegment = {};
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('#EXT-X-VERSION:')) {
          continue;
        } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
          continue;
        } else if (line.startsWith('#EXTINF:')) {
          // 解析片段时长
          const match = line.match(/#EXTINF:([\d.]+)/);
          if (match) {
            currentSegment.duration = parseFloat(match[1]);
          }
        } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
          // 解析字节范围
          const match = line.match(/#EXT-X-BYTERANGE:(\d+)@?(\d+)?/);
          if (match) {
            currentSegment.byteRange = {
              length: parseInt(match[1]),
              offset: match[2] ? parseInt(match[2]) : 0
            };
          }
        } else if (line.startsWith('#EXT-X-KEY:')) {
          // 解析加密信息
          const keyMatch = line.match(/URI="([^"]+)"/);
          if (keyMatch) {
            currentSegment.keyUri = keyMatch[1].startsWith('http') ? 
              keyMatch[1] : baseUrl + keyMatch[1];
          }
        } else if (line.startsWith('#EXT-X-ENDLIST')) {
          break;
        } else if (!line.startsWith('#')) {
          // 这是一个片段URL
          const segmentUrl = line.startsWith('http') ? line : baseUrl + line;
          currentSegment.url = segmentUrl;
          currentSegment.index = segments.length;
          segments.push({ ...currentSegment });
          currentSegment = {};
        }
      }

      return {
        segments: segments,
        totalDuration: segments.reduce((sum, seg) => sum + (seg.duration || 0), 0)
      };

    } catch (error) {
      return {
        isError: true,
        error: error.message
      };
    }
  }

  async downloadSegments(downloadTask) {
    const { segments, id } = downloadTask;
    const maxConcurrent = 3; // 最大并发下载数
    const chunkSize = Math.ceil(segments.length / maxConcurrent);

    // 分块并发下载
    const downloadPromises = [];
    
    for (let i = 0; i < segments.length; i += chunkSize) {
      const chunk = segments.slice(i, i + chunkSize);
      downloadPromises.push(this.downloadChunk(downloadTask, chunk));
    }

    try {
      await Promise.all(downloadPromises);
      
      // 所有片段下载完成，开始合并
      await this.mergeSegments(downloadTask);
      
    } catch (error) {
      console.error('下载片段失败:', error);
      this.updateDownloadStatus(id, 'error', error.message);
      throw error;
    }
  }

  async downloadChunk(downloadTask, chunk) {
    for (const segment of chunk) {
      try {
        // 下载加密密钥（如果需要）
        if (segment.keyUri && !downloadTask.encryptionKey) {
          const keyResponse = await fetch(segment.keyUri);
          downloadTask.encryptionKey = await keyResponse.arrayBuffer();
        }

        // 下载片段
        const response = await fetch(segment.url);
        
        if (!response.ok) {
          throw new Error(`片段下载失败: ${response.status}`);
        }

        let segmentData = await response.arrayBuffer();

        // 如果有加密，解密片段
        if (downloadTask.encryptionKey && segment.keyUri) {
          segmentData = await this.decryptSegment(segmentData, downloadTask.encryptionKey, segment.index);
        }

        // 存储片段数据
        downloadTask.chunks[segment.index] = new Uint8Array(segmentData);
        downloadTask.downloadedSegments++;

        // 更新进度
        const progress = Math.round((downloadTask.downloadedSegments / downloadTask.totalSegments) * 100);
        this.updateDownloadProgress(downloadTask.id, progress);

      } catch (error) {
        console.error(`下载片段 ${segment.index} 失败:`, error);
        throw error;
      }
    }
  }

  async decryptSegment(segmentData, key, iv) {
    try {
      // 使用Web Crypto API解密AES-128-CBC
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'AES-CBC' },
        false,
        ['decrypt']
      );

      // 初始化向量
      const initVector = new Uint8Array(16);
      const dataView = new DataView(initVector.buffer);
      dataView.setUint32(12, iv, false); // 大端序

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: initVector },
        cryptoKey,
        segmentData
      );

      return decrypted;

    } catch (error) {
      console.warn('解密失败，返回原始数据:', error);
      return segmentData;
    }
  }

  async mergeSegments(downloadTask) {
    try {
      this.updateDownloadStatus(downloadTask.id, 'merging', '正在合并视频片段...');

      // 计算总大小
      const totalSize = downloadTask.chunks.reduce((sum, chunk) => {
        return sum + (chunk ? chunk.length : 0);
      }, 0);

      // 创建合并后的数组
      const mergedData = new Uint8Array(totalSize);
      let offset = 0;

      // 按顺序合并所有片段
      for (let i = 0; i < downloadTask.chunks.length; i++) {
        const chunk = downloadTask.chunks[i];
        if (chunk) {
          mergedData.set(chunk, offset);
          offset += chunk.length;
        }
      }

      // 创建Blob并下载
      const blob = new Blob([mergedData], { type: 'video/mp2t' });
      await this.downloadBlob(blob, downloadTask.title + '.ts');

      this.updateDownloadStatus(downloadTask.id, 'completed', '下载完成');

      // 如果需要转换为MP4
      if (downloadTask.options.convertToMp4) {
        await this.convertToMp4(blob, downloadTask.title);
      }

    } catch (error) {
      console.error('合并失败:', error);
      this.updateDownloadStatus(downloadTask.id, 'error', '合并失败: ' + error.message);
      throw error;
    }
  }

  async downloadBlob(blob, filename) {
    return new Promise((resolve, reject) => {
      try {
        const url = URL.createObjectURL(blob);
        
        // 使用Chrome扩展API下载
        chrome.downloads.download({
          url: url,
          filename: filename,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            // 清理URL
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            resolve(downloadId);
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  async convertToMp4(tsBlob, title) {
    // 注意：在浏览器环境中直接转换视频格式是有限的
    // 这里提供一个基础的实现，实际使用中可能需要服务器端支持
    
    try {
      this.updateDownloadStatus(downloadTask.id, 'converting', '正在转换为MP4...');

      // 如果支持，可以使用FFmpeg.js进行转换
      if (this.ffmpegLoaded) {
        const mp4Blob = await this.convertWithFFmpeg(tsBlob);
        await this.downloadBlob(mp4Blob, title + '.mp4');
      } else {
        // 否则只能下载TS文件
        console.warn('无法转换为MP4，下载TS文件');
      }

    } catch (error) {
      console.error('转换失败:', error);
    }
  }

  async convertWithFFmpeg(tsBlob) {
    // 这里需要集成FFmpeg.js或类似的库
    // 由于体积较大，在实际项目中需要异步加载
    throw new Error('FFmpeg转换功能需要额外的库支持');
  }

  updateDownloadProgress(downloadId, progress) {
    // 发送进度更新消息
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_PROGRESS',
      data: {
        downloadId: downloadId,
        progress: progress,
        status: '下载中...'
      }
    });
  }

  updateDownloadStatus(downloadId, status, message) {
    // 发送状态更新消息
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_STATUS',
      data: {
        downloadId: downloadId,
        status: status,
        message: message
      }
    });
  }

  // 获取下载任务信息
  getDownloadInfo(downloadId) {
    return this.downloads.get(downloadId);
  }

  // 暂停下载
  pauseDownload(downloadId) {
    const task = this.downloads.get(downloadId);
    if (task) {
      task.status = 'paused';
      this.updateDownloadStatus(downloadId, 'paused', '已暂停');
    }
  }

  // 取消下载
  cancelDownload(downloadId) {
    const task = this.downloads.get(downloadId);
    if (task) {
      task.status = 'cancelled';
      this.downloads.delete(downloadId);
      this.updateDownloadStatus(downloadId, 'cancelled', '已取消');
    }
  }
}

// 创建全局实例
const hlsDownloader = new HLSDownloader();

// 导出给其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HLSDownloader;
}