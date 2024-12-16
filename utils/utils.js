// utils/utils.js

const utils = {
  // 节流函数
  throttle: function(fn, wait) {
    let lastTime = 0;
    return function(...args) {
      const now = Date.now();
      if (now - lastTime >= wait) {
        fn.apply(this, args);
        lastTime = now;
      }
    }
  },
  
  // 计算两点距离
  calculateDistance: function(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
  
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
    return R * c;
  },
  
  // 数据采样
  shouldKeepPoint: function(newPoint, lastPoint, minDistance) {
    if (!lastPoint) return true;
      
    const distance = this.calculateDistance(
      lastPoint.latitude,
      lastPoint.longitude,
      newPoint.latitude,
      newPoint.longitude
    );
  
  // 速度越快，采样距离越大
    const speed = newPoint.speed || 0;
    const speedFactor = Math.max(1, speed * 3.6 / 20); // 每20km/h增加一倍采样距离
      
    return distance >= (minDistance * speedFactor);
  },

  // 确保目录存在
  ensureDirectory: function(dirPath) {
    const fs = wx.getFileSystemManager();
    try {
      fs.accessSync(dirPath);
    } catch (e) {
      fs.mkdirSync(dirPath, true);
    }
  },

  // 格式化文件名
  formatFileName: function(prefix, extension) {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:-]/g, '')
      .replace(/[T\.].*$/, '')
      .replace(/[^a-zA-Z0-9]/g, ''); // 移除所有特殊字符
    return `${prefix}_${timestamp}.${extension}`;
  },

  // 导出文件
  exportToFile: function(content, fileName) {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager();
      // 创建tracks目录
      const baseDir = `${wx.env.USER_DATA_PATH}/tracks`;
      this.ensureDirectory(baseDir);
      
      const filePath = `${baseDir}/${fileName}`;
      
      // 检查内容格式
      if (typeof content !== 'string') {
        content = JSON.stringify(content, null, 2);
      }

      fs.writeFile({
        filePath,
        data: content,
        encoding: 'utf8',
        success: () => {
          console.log('文件保存成功:', filePath);
          resolve(filePath);
        },
        fail: (error) => {
          console.error('文件保存失败:', error);
          reject(error);
        }
      });
    });
  },
};

// 转换为GeoJSON格式
const convertToGeoJSON = function(trackPoints, calibrationPoints) {
  // 创建GeoJSON对象
  const geoJSON = {
    "type": "FeatureCollection",
    "features": [
      // 轨迹线
      {
        "type": "Feature",
        "geometry": {
          "type": "LineString",
          "coordinates": trackPoints.map(point => [
            point.longitude,
            point.latitude
          ])
        },
        "properties": {
          "type": "track",
          "points": trackPoints.map(point => ({
            "time": point.timestamp,
            "speed": point.speed,
            "stake": point.stake,
            "chapter": point.chapter
          }))
        }
      }
    ]
  };
  
  // 添加校准点
  if (calibrationPoints && calibrationPoints.length) {
    calibrationPoints.forEach(point => {
      geoJSON.features.push({
        "type": "Feature",
        "geometry": {
          "type": "Point",
          "coordinates": [point.longitude, point.latitude]
        },
        "properties": {
          "type": "calibration",
          "stake": point.stake,
          "time": point.timestamp
        }
      });
    });
  }
  
  return JSON.stringify(geoJSON, null, 2);
};
  
// 格式化文件名
const formatFileName = function(prefix, extension) {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:-]/g, '')
      .replace(/[T\.].*$/, '');
    return `${prefix}_${timestamp}.${extension}`;
  };
  
// 将对象导出为文件
const exportToFile = function(content, fileName) {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
      
      fs.writeFile({
        filePath,
        data: content,
        encoding: 'utf8',
        success: () => resolve(filePath),
        fail: reject
      });
    });
  };
  
// 添加到utils对象
Object.assign(utils, {
    convertToGeoJSON,
    formatFileName,
    exportToFile
  });
  
export default utils;