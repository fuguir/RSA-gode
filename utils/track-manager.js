// utils/track-manager.js

class TrackManager {
    // 最小更新距离(米)和最小速度(km/h)
    static MIN_UPDATE_DISTANCE = 50;
    static MIN_SPEED = 2;

    constructor() {
      // 当前录制状态
      this.recording = false;
      
      // 视频信息
      this.currentVideo = {
        mediaId: null,    
        chapter: 1,       
        startTime: null,  
      };
      
      // 轨迹数据
      this.trackPoints = [];
      this.calibrations = [];
      
      // 距离和方向控制
      this.accumulatedDistance = 0;  // 累计行驶距离(米)
      this.lastValidPoint = null;    // 上一个有效点
      this.direction = 1;            // 桩号方向(1:递增,-1:递减)
      this.initialStake = null;      // 初始桩号
      
      // 新增: 速度处理相关属性
      this._speedSmoothingFactor = 0.3;  // 速度平滑因子
      this._maxAcceleration = 2.78;      // 最大加速度 (10 km/h per second)
      this._lastSpeed = 0;
      this._lastSpeedTimestamp = 0;
    }
    
    // 开始新的记录
    startNewTrack(initialStake, isIncreasing) {
        this.recording = true;
        this.currentVideo = {
          mediaId: this._generateMediaId(),
          chapter: 1,
          startTime: Date.now()
        };
        
        // 初始化轨迹数据
        this.trackPoints = [];
        this.calibrations = [];
        this.accumulatedDistance = 0;
        this.lastValidPoint = null;
        
        // 设置方向和初始桩号
        this.direction = isIncreasing ? 1 : -1;
        this.initialStake = initialStake;
        
        // 记录初始状态
        this._addCalibrationPoint(initialStake);
      }
    
    // 添加轨迹点
    addTrackPoint(position, speed) {
        if (!this.recording) return null;
        
        const now = Date.now();
        
        // 速度有效性检查和平滑处理
        speed = this._processSpeed(speed, now);
          
        let updatedDistance = 0;
        if (speed > 0 && this.lastValidPoint && position && position.latitude) {
          // 计算与上一个点的距离
          const distance = this._calculateDistance(
            this.lastValidPoint.latitude,
            this.lastValidPoint.longitude,
            position.latitude,
            position.longitude
          );
          
          // 基于速度和时间的距离合理性检查
          const timeSpan = (now - this._lastSpeedTimestamp) / 1000;
          const theoreticalDistance = this._lastSpeed * timeSpan;
          const distanceRatio = distance / theoreticalDistance;
          
          // 只有移动距离在合理范围内才更新累计距离
          if (distance >= this.MIN_UPDATE_DISTANCE && 
              distanceRatio >= 0.5 && distanceRatio <= 1.5) {
            this.accumulatedDistance += distance;
            updatedDistance = distance;
            this.lastValidPoint = position;
          }
        } else if (!this.lastValidPoint && position && position.latitude) {
          this.lastValidPoint = position;
        }

        // 更新速度状态
        this._lastSpeed = speed;
        this._lastSpeedTimestamp = now;

        // 获取当前桩号
        let currentStake;
        // 如果有最近的校准点，使用校准点的桩号
        const lastCalibration = this.calibrations[this.calibrations.length - 1];
        if (lastCalibration && 
            now - lastCalibration.timestamp < 2000) { // 校准后2秒内使用校准值
            currentStake = lastCalibration.stake;
        } else {
            currentStake = this._calculateStake(updatedDistance);
        }
          
        const point = {
          timestamp: now,
          latitude: position.latitude || 0,
          longitude: position.longitude || 0,
          speed: speed || 0,
          videoTime: this._calculateVideoTime(),
          chapter: this.currentVideo.chapter,
          stake: currentStake,
          distance: this.accumulatedDistance
        };
          
        this.trackPoints.push(point);
        return point;
    }
    
    // 校准桩号
    calibrateStake(newStake, position) {
        // 验证桩号格式
        if (!this._isValidStake(newStake)) {
          throw new Error('无效的桩号格式');
        }

        const calibration = {
          timestamp: Date.now(),
          stake: newStake,
          latitude: position.latitude,
          longitude: position.longitude,
          videoTime: this._calculateVideoTime(),
          chapter: this.currentVideo.chapter
        };
        
        this.calibrations.push(calibration);
        this.initialStake = newStake;  // 更新初始桩号
        this.accumulatedDistance = 0;   // 重置累计距离
        this.lastValidPoint = position; // 更新最后有效点
        
        // 保存状态
        this._saveState();
    }
    
    // 处理视频分段
    handleVideoChapter() {
      this.currentVideo.chapter++;
    }
    
    // 结束记录
    endTrack() {
      this.recording = false;
      
      // 生成字幕文件内容
      const subtitles = this.generateSubtitles();
      
      // 返回录制数据和字幕
      return {
        videoInfo: {
          mediaId: this.currentVideo.mediaId,
          totalChapters: this.currentVideo.chapter,
          duration: this._calculateVideoTime()
        },
        trackPoints: this.trackPoints,
        calibrations: this.calibrations,
        subtitles: subtitles
      };
    }
    
    // 导出轨迹数据
    exportTrackData() {
      const trackData = {
        version: "1.0",
        recordTime: new Date().toISOString(),
        videoInfo: {
          mediaId: this.currentVideo.mediaId,
          totalChapters: this.currentVideo.chapter
        },
        track: {
          points: this.trackPoints,
          calibrations: this.calibrations
        }
      };
      
      return JSON.stringify(trackData);
    }
  
    // 生成字幕文件
    generateSubtitles() {
      let srtContent = '';
      let subtitleIndex = 1;
  
      // 按章节组织轨迹点
      const chapterPoints = {};
      this.trackPoints.forEach(point => {
        if (!chapterPoints[point.chapter]) {
          chapterPoints[point.chapter] = [];
        }
        chapterPoints[point.chapter].push(point);
      });
  
      // 为每个章节生成字幕
      Object.keys(chapterPoints).forEach(chapter => {
        const points = chapterPoints[chapter];
        points.forEach((point, index) => {
          const startTime = this.formatSrtTime(point.videoTime / 1000); // 转换为秒
          const endTime = this.formatSrtTime((point.videoTime + 1000) / 1000);
          
          srtContent += `${subtitleIndex}\n`;
          srtContent += `${startTime} --> ${endTime}\n`;
          srtContent += `桩号: K${point.stake} 速度: ${(point.speed * 3.6).toFixed(1)}km/h\n\n`;
          
          subtitleIndex++;
        });
      });
  
      return srtContent;
    }
  
    // 格式化SRT时间
    formatSrtTime(seconds) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
  
      return `${String(hours).padStart(2, '0')}:${
        String(minutes).padStart(2, '0')}:${
        String(secs).padStart(2, '0')},${
        String(ms).padStart(3, '0')}`;
    }
  
    // 获取当前轨迹信息
    getCurrentInfo() {
      const lastPoint = this.trackPoints[this.trackPoints.length - 1];
      return {
        pointCount: this.trackPoints.length,
        currentChapter: this.currentVideo.chapter,
        duration: lastPoint ? (lastPoint.videoTime / 1000) : 0,
        lastStake: lastPoint ? lastPoint.stake : null,
        lastSpeed: lastPoint ? lastPoint.speed : 0
      };
    }
    
    // 内部方法：生成媒体ID
    _generateMediaId() {
      return Math.floor(1000 + Math.random() * 9000).toString();
    }
    
    // 内部方法：计算视频时间（毫秒）
    _calculateVideoTime() {
      return Date.now() - this.currentVideo.startTime;
    }
    
    // 内部方法：添加校准点
    _addCalibrationPoint(stake) {
        this.calibrations.push({
          timestamp: Date.now(),
          stake: stake,
          videoTime: 0,
          chapter: 1,
          isInitial: true,
          direction: this.direction,
          latitude: 0,  // 将在第一个GPS点更新
          longitude: 0
        });
      }
    
    // 内部方法：计算桩号
    _calculateStake(updatedDistance) {
        if (!this.initialStake) {
            return '0+000';
        }
        
        if (updatedDistance === 0) {
            return this.trackPoints.length > 0 ? 
                this.trackPoints[this.trackPoints.length - 1].stake : 
                this.initialStake;
        }
        
        try {
            const distanceKm = this.accumulatedDistance / 1000;
            const offset = distanceKm * this.direction;
            return this._formatStake(this._addStakeOffset(this.initialStake, offset));
        } catch(error) {
            console.error('桩号计算错误:', error);
            return this.initialStake || '0+000';
        }
    }
    
    // 内部方法：重新计算校准点之后的桩号
    _recalculateStakes(calibration) {
      const calibrationIndex = this.trackPoints.findIndex(
        point => point.timestamp >= calibration.timestamp
      );
      
      if (calibrationIndex === -1) return;
      
      // 重置累计距离
      this.accumulatedDistance = 0;
      
      // 更新校准点之后的所有点
      for (let i = calibrationIndex; i < this.trackPoints.length; i++) {
        const point = this.trackPoints[i];
        
        // 如果不是第一个点，计算与前一点的距离
        if (i > calibrationIndex) {
          const prevPoint = this.trackPoints[i - 1];
          const distance = this._calculateDistance(
            prevPoint.latitude,
            prevPoint.longitude,
            point.latitude,
            point.longitude
          );
          this.accumulatedDistance += distance;
        }
        
        // 使用累计距离计算新桩号
        point.stake = this._calculateStake(this.accumulatedDistance);
      }
    }
    
    // 内部方法：计算两点间距离（米）
    _calculateDistance(lat1, lon1, lat2, lon2) {
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
    }
    
    // 内部方法：格式化桩号
    _formatStake(stake) {
      const [km, m] = stake.split('+');
      return `${km}+${m.padStart(3, '0')}`;
    }
    
    // 内部方法：桩号加减运算
    _addStakeOffset(stake, offsetKm) {
        if (!stake || typeof stake !== 'string') {
            return '0+000';
        }
        
        try {
            const [km, m] = stake.split('+').map(Number);
            if (isNaN(km) || isNaN(m)) {
                return '0+000';
            }
            
            const totalM = km * 1000 + Number(m);
            const newTotalM = totalM + offsetKm * 1000;
            
            const newKm = Math.floor(newTotalM / 1000);
            const newM = Math.floor(newTotalM % 1000);
            
            return `${newKm}+${newM.toString().padStart(3, '0')}`;
        } catch (error) {
            console.error('桩号偏移计算错误:', error);
            return '0+000';
        }
    }
    
    // 新增：验证桩号格式
    _isValidStake(stake) {
        if (!stake || typeof stake !== 'string') {
            return false;
        }
        return /^\d+\+\d{3}$/.test(stake);
    }
    
    // 新增：保存状态
    _saveState() {
        try {
            wx.setStorageSync('track_state', {
                initialStake: this.initialStake,
                calibrations: this.calibrations,
                accumulatedDistance: this.accumulatedDistance,
                direction: this.direction
            });
        } catch (e) {
            console.error('保存轨迹状态失败:', e);
        }
    }
    
    // 新增: 速度处理方法
    _processSpeed(speed, timestamp) {
        // 1. 基础速度检查
        if (speed < 0 || !Number.isFinite(speed)) {
            return 0;
        }

        // 2. 加速度检查
        if (this._lastSpeedTimestamp) {
            const timeSpan = (timestamp - this._lastSpeedTimestamp) / 1000;
            const acceleration = Math.abs(speed - this._lastSpeed) / timeSpan;
            
            if (acceleration > this._maxAcceleration) {
                // 使用最大允许加速度限制速度变化
                const maxSpeedChange = this._maxAcceleration * timeSpan;
                speed = this._lastSpeed + 
                       Math.sign(speed - this._lastSpeed) * maxSpeedChange;
            }
        }

        // 3. 速度平滑处理
        if (this._lastSpeed !== null) {
            speed = this._lastSpeed * (1 - this._speedSmoothingFactor) + 
                   speed * this._speedSmoothingFactor;
        }

        // 4. 最小速度阈值检查
        const speedKmh = speed * 3.6;
        if (speedKmh < this.MIN_SPEED) {
            return 0;
        }

        return speed;
    }
  }
  
  export default new TrackManager();