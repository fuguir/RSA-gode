// utils/gps.js
import KalmanFilter from './kalman-filter';

class GpsManager {
    static MIN_SPEED = 0.5; // 最小速度阈值 1km/h ≈ 0.28m/s
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
      this.kalmanFilter = new KalmanFilter();
      this.speedBuffer = [];
      this.SPEED_BUFFER_SIZE = 5;
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
      const timestamp = Date.now();
      
      // 1. 卡尔曼滤波预测
      this.kalmanFilter.predict(timestamp);
      
      // 2. 更新滤波器测量值
      const measurement = [
        res.latitude,
        res.longitude,
        res.speed * Math.cos(res.heading || 0),  // 分解速度到 x 方向
        res.speed * Math.sin(res.heading || 0)   // 分解速度到 y 方向
      ];
      this.kalmanFilter.update(measurement);
      
      // 3. 获取滤波后的状态
      const filteredState = this.kalmanFilter.getState();
      
      // 4. 计算平滑速度
      const smoothedSpeed = this._smoothSpeed(filteredState.speed);
      
      // 5. 更新位置缓冲区 - 保持原有逻辑
      let distance = 0;
      if (this.lastPosition) {
        distance = this._calculateDistance(
          this.lastPosition.latitude,
          this.lastPosition.longitude,
          filteredState.position.latitude,
          filteredState.position.longitude
        );
      }

      this.positionBuffer.push({
        position: filteredState.position,
        distance: distance,
        timestamp: timestamp,
        speed: smoothedSpeed
      });
      
      if (this.positionBuffer.length > 5) {
        this.positionBuffer.shift();
      }

      // 6. 速度有效性检查和更新
      if (!this._isValidSpeed(smoothedSpeed) || distance < this.POSITION_THRESHOLD) {
        smoothedSpeed = 0;
      }

      this.lastPosition = filteredState.position;
      this.lastValidSpeed = smoothedSpeed;

      // 7. 构造返回结果 - 保持原有数据结构
      return {
        ...res,
        latitude: filteredState.position.latitude,
        longitude: filteredState.position.longitude,
        speed: smoothedSpeed,
        accuracy: res.accuracy,
        satellites: res.satellites
      };
    }
  
    // 新增: 速度平滑处理
    _smoothSpeed(speed) {
      this.speedBuffer.push(speed);
      if (this.speedBuffer.length > this.SPEED_BUFFER_SIZE) {
        this.speedBuffer.shift();
      }

      // 使用加权移动平均
      const weights = [0.1, 0.15, 0.2, 0.25, 0.3]; // 权重之和为1
      let smoothedSpeed = 0;
      const bufferLength = this.speedBuffer.length;
      
      for (let i = 0; i < bufferLength; i++) {
        smoothedSpeed += this.speedBuffer[i] * weights[i + (weights.length - bufferLength)];
      }

      return smoothedSpeed;
    }
  
    // 新增: 速度有效性检查
    _isValidSpeed(speed) {
      // 基础检查
      if (speed < 0 || !Number.isFinite(speed)) return false;
      
      // 突变检查
      if (this.lastValidSpeed && Math.abs(speed - this.lastValidSpeed) > 5) {
        return false;
      }
      
      // 合理范围检查 (0-200km/h)
      const speedKmh = speed * 3.6;
      if (speedKmh > 200) return false;
      
      return true;
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