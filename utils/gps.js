// utils/gps.js

class GpsManager {
    static MIN_SPEED = 0.55; // 最小速度阈值 2km/h ≈ 0.55m/s
    static POSITION_THRESHOLD = 2; // 位置变化阈值(米)
    
    constructor() {
      this.watchId = null;
      this.lastPosition = null;
      this.lastValidSpeed = 0;  // 保存上一个有效速度
      this.positionBuffer = []; // 用于平滑处理的位置缓冲
      this.statusCallbacks = [];
      this.status = {
        accuracy: 0,
        satellites: 0,
        speed: 0,
        currentStake: null
      };
    }
  
    // 获取当前状态（同步方法）
    getStatus() {
      return this.status;
    }
  
    // 添加状态监听器
    addStatusListener(callback) {
      if (typeof callback === 'function') {
        this.statusCallbacks.push(callback);
      }
    }
  
    // 移除状态监听器
    removeStatusListener(callback) {
      const index = this.statusCallbacks.indexOf(callback);
      if (index > -1) {
        this.statusCallbacks.splice(index, 1);
      }
    }
  
    // 初始化
    init() {
      return new Promise((resolve, reject) => {
        wx.getSetting({
          success: (res) => {
            if (!res.authSetting['scope.userLocation']) {
              wx.authorize({
                scope: 'scope.userLocation',
                success: () => resolve(true),
                fail: reject
              });
            } else {
              resolve(true);
            }
          },
          fail: reject
        });
      });
    }
  
    // 开始记录
    startRecord(initialStake, isIncreasing) {
      return new Promise((resolve, reject) => {
        if (this.watchId) {
          this.stopRecord();
        }
  
        // 更新初始状态
        this.status.currentStake = initialStake;
        this.status.direction = isIncreasing ? 1 : -1;
  
        wx.startLocationUpdate({
          type: 'gcj02',
          success: () => {
            this.watchId = true;  // 标记已开启监听
            wx.onLocationChange(this._handleLocationChange.bind(this));
            resolve();
          },
          fail: reject
        });
      });
    }
  
    // 停止记录
    stopRecord() {
      return new Promise((resolve, reject) => {
        if (this.watchId) {
          wx.offLocationChange(this._handleLocationChange.bind(this));
          this.watchId = null;
          wx.stopLocationUpdate({
            success: resolve,
            fail: reject
          });
        } else {
          resolve();
        }
      });
    }
  
    // 获取当前位置
    getCurrentPosition() {
      return new Promise((resolve, reject) => {
        wx.getLocation({
          type: 'gcj02',
          isHighAccuracy: true,
          success: resolve,
          fail: reject
        });
      });
    }
  
    // 内部方法：处理位置更新
    _handleLocationChange(res) {
        // 1. 计算位置变化
        let distance = 0;
        if (this.lastPosition) {
          distance = this._calculateDistance(
            this.lastPosition.latitude,
            this.lastPosition.longitude,
            res.latitude,
            res.longitude
          );
        }
  
        // 2. 更新位置缓冲
        this.positionBuffer.push({
          position: res,
          distance: distance,
          timestamp: Date.now()
        });
        
        // 只保留最近的3个点
        if (this.positionBuffer.length > 3) {
          this.positionBuffer.shift();
        }
  
        // 3. 计算平滑速度
        let speed = 0;
        if (this.positionBuffer.length >= 2) {
          const timeSpan = (this.positionBuffer[this.positionBuffer.length - 1].timestamp - 
                           this.positionBuffer[0].timestamp) / 1000; // 转换为秒
          const totalDistance = this.positionBuffer
            .slice(1)
            .reduce((sum, point) => sum + point.distance, 0);
          
          if (timeSpan > 0) {
            speed = totalDistance / timeSpan;
          }
        }
  
        // 4. 静止状态判断
        if (distance < GpsManager.POSITION_THRESHOLD || speed < GpsManager.MIN_SPEED) {
          speed = 0;
        }
  
        this.lastPosition = res;
        this.lastValidSpeed = speed > 0 ? speed : this.lastValidSpeed;
  
        this.status = {
          accuracy: res.accuracy || 0,
          satellites: res.satellites || 0,
          speed: speed,
          currentStake: this._calculateStake(res),
          latitude: res.latitude,
          longitude: res.longitude,
          direction: this.status.direction
        };
  
        // 通知所有监听器
        this.statusCallbacks.forEach(callback => {
          try {
            callback(this.status);
          } catch (error) {
            console.error('状态通知回调执行失败:', error);
          }
        });
      }
  
    // 内部方法：计算桩号
    _calculateStake(position) {
      if (!this.lastPosition || !this.status.currentStake) {
        return this.status.currentStake;
      }
  
      // 计算距离增量
      const distance = this._calculateDistance(
        this.lastPosition.latitude,
        this.lastPosition.longitude,
        position.latitude,
        position.longitude
      );
  
      // 根据方向更新桩号
      const distanceKm = distance / 1000;
      const currentStake = this._parseStake(this.status.currentStake);
      const newMeters = currentStake.meters + (distanceKm * 1000 * this.status.direction);
      
      return this._formatStake(newMeters);
    }
  
    // 内部方法：解析桩号
    _parseStake(stake) {
      const [km, m] = stake.split('+').map(Number);
      return {
        meters: km * 1000 + Number(m)
      };
    }
  
    // 内部方法：格式化桩号
    _formatStake(totalMeters) {
      const km = Math.floor(totalMeters / 1000);
      const m = Math.floor(totalMeters % 1000);
      return `${km}+${m.toString().padStart(3, '0')}`;
    }
  
    // 内部方法：计算两点间距离（米）
    _calculateDistance(lat1, lon1, lat2, lon2) {
      const R = 6371e3; // 地球半径（米）
      const φ1 = lat1 * Math.PI / 180;
      const φ2 = lat2 * Math.PI / 180;
      const Δφ = (lat2 - lat1) * Math.PI / 180;
      const Δλ = (lon2 - lon1) * Math.PI / 180;
  
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
               Math.cos(φ1) * Math.cos(φ2) *
               Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
      return R * c;
    }
  
    calibrateStake(newStake) {
      this.status.currentStake = newStake;
      // 重置距离计算基准点
      this.lastPosition = {
        latitude: this.status.latitude,
        longitude: this.status.longitude
      };
    }
  }
  
  export default new GpsManager();