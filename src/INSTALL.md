# 网页视频下载器 - 安装指南

## 🎯 快速开始

### 第一步：准备图标文件

由于Chrome扩展需要PNG格式图标，请先转换SVG图标：

**选项1：使用在线工具**
1. 访问在线SVG转PNG工具（如 https://convertio.co/svg-png/）
2. 上传 `icons/icon.svg` 文件
3. 分别生成 16x16、48x48、128x128 像素的PNG文件
4. 将文件保存为：
   - `icons/icon16.png`
   - `icons/icon48.png` 
   - `icons/icon128.png`

**选项2：使用命令行工具**
```bash
# 使用ImageMagick（需要先安装）
convert icons/icon.svg -resize 16x16 icons/icon16.png
convert icons/icon.svg -resize 48x48 icons/icon48.png
convert icons/icon.svg -resize 128x128 icons/icon128.png

# 或使用Inkscape
inkscape icons/icon.svg -w 16 -h 16 -e icons/icon16.png
inkscape icons/icon.svg -w 48 -h 48 -e icons/icon48.png
inkscape icons/icon.svg -w 128 -h 128 -e icons/icon128.png
```

### 第二步：安装扩展到Chrome

1. **打开Chrome扩展管理页面**
   - 在地址栏输入：`chrome://extensions/`
   - 或点击菜单：⋮ → 更多工具 → 扩展程序

2. **启用开发者模式**
   - 点击页面右上角的"开发者模式"开关
   - 确保开关处于开启状态

3. **加载扩展**
   - 点击"加载已解压的扩展程序"按钮
   - 选择整个 `chrome-extension` 文件夹
   - 点击"选择文件夹"

4. **验证安装**
   - 扩展应该出现在扩展列表中
   - 浏览器工具栏应该显示扩展图标
   - 确保扩展状态为"已启用"

## 🔧 详细配置

### 检查文件结构

确保您的文件夹结构如下：

```
chrome-extension/
├── manifest.json
├── background.js
├── content.js
├── injected.js
├── hls-downloader.js
├── popup.html
├── popup.css
├── popup.js
├── README.md
├── INSTALL.md
└── icons/
    ├── icon.svg
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 权限设置

扩展需要以下权限（已在manifest.json中配置）：

- **activeTab**: 访问当前标签页内容
- **storage**: 保存用户设置
- **downloads**: 下载文件到本地
- **webRequest**: 监控网络请求

Chrome会在安装时自动请求这些权限。

### 故障排除

**问题：扩展加载失败**
- 检查所有文件是否都在正确位置
- 确保manifest.json语法正确
- 查看Chrome扩展页面的错误信息

**问题：图标不显示**
- 确保PNG图标文件存在且命名正确
- 检查图标文件大小是否合适（16x16, 48x48, 128x128）

**问题：功能不工作**
- 打开开发者工具（F12）查看控制台错误
- 在扩展管理页面查看错误日志
- 确保网站允许扩展运行

## 🧪 测试扩展

### 基础测试

1. **访问测试网站**
   ```
   推荐测试网站：
   - YouTube.com（HTML5视频）
   - 在线教育平台
   - 新闻网站的视频内容
   ```

2. **测试检测功能**
   - 点击扩展图标
   - 查看是否检测到视频
   - 尝试刷新扫描

3. **测试下载功能**
   - 点击单个视频的下载按钮
   - 检查Chrome下载管理器
   - 验证下载的文件能否正常播放

### 高级测试

**HLS流测试**
- 访问包含HLS视频的网站
- 查看扩展是否检测到.m3u8格式
- 测试分段下载和合并功能

**批量下载测试**
- 在有多个视频的页面测试
- 使用"下载全部"功能
- 检查所有文件是否正确下载

## 📋 使用前检查清单

- [ ] 已安装必要的图标文件（PNG格式）
- [ ] Chrome开发者模式已启用
- [ ] 扩展已成功加载到Chrome
- [ ] 扩展图标显示在工具栏
- [ ] 在测试网页上能检测到视频
- [ ] 下载功能正常工作
- [ ] 弹出窗口界面正确显示

## 🚀 高级使用技巧

### 自定义设置

1. **配置下载路径**
   - 点击扩展图标
   - 选择"设置"
   - 设置自定义下载文件夹

2. **调整文件命名**
   - 使用文件名模板功能
   - 可用变量：{title}, {timestamp}, {index}

3. **质量选择**
   - 在设置中选择视频质量偏好
   - 自动选择最高可用质量

### 调试模式

开启调试信息：
1. 打开Chrome开发者工具（F12）
2. 切换到Console标签
3. 查看扩展的日志输出

## ⚠️ 重要提醒

### 法律合规
- 仅下载您有权限的内容
- 遵守网站使用条款
- 尊重版权保护

### 性能注意
- 大文件下载可能影响浏览器性能
- 建议分批下载大量视频
- 定期清理下载缓存

### 安全建议
- 从可信来源下载扩展
- 定期检查扩展权限
- 不要在敏感网站使用

## 📞 获取帮助

如果遇到问题，请：

1. 查看README.md中的故障排除部分
2. 检查Chrome控制台的错误信息
3. 确认网站是否支持扩展运行
4. 尝试重新安装扩展

---

安装完成后，您就可以开始使用这个强大的视频下载工具了！