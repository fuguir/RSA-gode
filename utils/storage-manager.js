// utils/storage-manager.js

class StorageManager {
    constructor() {
      this.fs = wx.getFileSystemManager();
      this.USER_DATA_PATH = wx.env.USER_DATA_PATH;
      this.TRACKS_DIR = `${this.USER_DATA_PATH}/tracks`;
      this._ensureDirectoryExists();
    }
  
    // 确保目录存在
    _ensureDirectoryExists() {
      try {
        this.fs.accessSync(this.TRACKS_DIR);
      } catch (error) {
        this.fs.mkdirSync(this.TRACKS_DIR, true);
      }
    }
  
    // 保存轨迹数据
    saveTrackData(mediaId, trackData) {
      return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `track_${mediaId}_${timestamp}.json`;
        const filePath = `${this.TRACKS_DIR}/${fileName}`;
  
        this.fs.writeFile({
          filePath: filePath,
          data: JSON.stringify(trackData),
          encoding: 'utf8',
          success: () => {
            console.log('轨迹数据已保存:', filePath);
            resolve(filePath);
          },
          fail: reject
        });
      });
    }
  
    // 获取所有轨迹文件列表
    getTrackFiles() {
      return new Promise((resolve, reject) => {
        this.fs.readdir({
          dirPath: this.TRACKS_DIR,
          success: (res) => {
            const files = res.files
              .filter(file => file.endsWith('.json'))
              .map(file => ({
                name: file,
                filePath: `${this.TRACKS_DIR}/${file}`,
                ...this._parseFileName(file)
              }))
              .sort((a, b) => b.timestamp - a.timestamp);
            resolve(files);
          },
          fail: reject
        });
      });
    }
  
    // 读取单个轨迹文件
    readTrackFile(filePath) {
      return new Promise((resolve, reject) => {
        this.fs.readFile({
          filePath: filePath,
          encoding: 'utf8',
          success: (res) => {
            try {
              const data = JSON.parse(res.data);
              resolve(data);
            } catch (error) {
              reject(new Error('文件格式错误'));
            }
          },
          fail: reject
        });
      });
    }
  
    // 导出文件到手机存储
    exportTrackFile(filePath) {
      return new Promise((resolve, reject) => {
        wx.shareFileMessage({
          filePath: filePath,
          success: resolve,
          fail: reject
        });
      });
    }
  
    // 删除轨迹文件
    deleteTrackFile(filePath) {
      return new Promise((resolve, reject) => {
        this.fs.unlink({
          filePath: filePath,
          success: resolve,
          fail: reject
        });
      });
    }
  
    // 解析文件名信息
    _parseFileName(fileName) {
      // 文件名格式：track_mediaId_timestamp.json
      const parts = fileName.replace('.json', '').split('_');
      return {
        mediaId: parts[1],
        timestamp: new Date(parts[2].replace(/-/g, ':')).getTime()
      };
    }
  }
  
  export default new StorageManager();