// pages/record/record.js
import BleManager from '../../utils/ble';
import GpsManager from '../../utils/gps';
import TrackManager from '../../utils/track-manager';
import TrackDataManager from '../../utils/track-data-manager';
import utils from '../../utils/utils';

// GoPro 命令定义
const GoProCommands = {
  START_RECORD: new Uint8Array([0x03, 0x01, 0x01, 0x01]),
  STOP_RECORD: new Uint8Array([0x03, 0x01, 0x01, 0x00]),
  GET_STATUS: new Uint8Array([0x02, 0x13, 0x00])
};

Page({
  data: {
    // 连接状态
    connected: false,
    gpsStatus: false,
    bleStatus: false,

    // 路段信息
    sectionId: null, 
    currentStake: '0+000',
    speed: 0,
    isIncreasing: true,

    // 录制状态
    isRecording: false,
    recordStartTime: null,
    recordDuration: 0,
    pointCount: 0,

    // 显示数据
    showSpeed: '0.0',
    showStake: '0+000',
    showDuration: '00:00:00',
    statusText: '未连接',

    // 新增显示数据
    currentChapter: 1,
    totalDistance: 0,
    lastSaveTime: null,
    accuracy: 0,
    satellites: 0,
    autoSaveEnabled: true,
    mediaId: null,
    
    // GPS状态
    gpsSignalStrength: 0,
    lastGpsUpdate: null,

    // 地图相关数据
    currentLocation: {
      latitude: 0,
      longitude: 0
    },

    locationReady: false , // 标记位置是否就绪。页面初始化时只调用了init(),没有调用startRecord，即使不录制也需要显示位置,应该在init后就开始监听位置变化

    mapCenter: {
      latitude: 39.908692,
      longitude: 116.397477
    },
    mapScale: 16,
    isMapExpanded: false,
    autoCenter: true,
    trackPolyline: [],
    mapMarkers: [],
    // 轨迹颜色配置
    speedColors: {
        low: '#F44336' ,     // 0-20 绿色
        normal: '#FF9800',  // 20-40 蓝色
        medium: '#FFC107',  // 40-60 黄色
        fast: '#2196F3',    // 60-80 橙色
        high: '#4CAF50'   // >80 红色
      },
    
    trackPolylines: [],    // 轨迹分段数组
    batchUpdateTimer: null,    // 批量更新定时器
    pendingUpdates: {},        // 待更新数据
    isDarkMode: true, // 默认使用暗色主题
  },

  onLoad: function(options) {
    if (options && options.id) {
      // 获取路段信息
      const sections = wx.getStorageSync('sections') || [];
      const section = sections[options.id];
      if (section) {
        // 确保 initialStake 存在且格式正确
        const initialStake = section.initialStake ? 
          `${section.initialStake}+000` : 
          '0+000';
        
        this.setData({
          sectionId: options.id,
          currentStake: initialStake,
          showStake: initialStake, // 添加这行确保显示值也被设置
          isIncreasing: section.direction === 'increase'
        });
      }
    } else {
      // 如果没有传入 id，设置默认值
      this.setData({
        currentStake: '0+000',
        showStake: '0+000'
      });
    }

    this.initBluetooth();
    this.initGPS();
    this.trackDataManager = new TrackDataManager();
    this.addSpeedLegend();

    // 监听位置变化更新地图
    GpsManager.addStatusListener(status => {
      if(status.latitude && status.longitude) {
        this.updateMapCenter(status.latitude, status.longitude);
        if(this.data.isRecording) {
          this.updateTrackLine(this.trackDataManager.sampledPoints);
        }
      }
    });

    // 使用节流函数包装更新方法
    this.throttledUpdateStatus = utils.throttle(this.updateStatus.bind(this), 1000);
    this.throttledUpdateMap = utils.throttle(this.updateMap.bind(this), 2000);
    
    // 定时更新状态
    this.statusTimer = setInterval(() => {
      this.updateStatus();
    }, 1000);

    // 获取系统主题
    wx.getSystemInfo({
      success: (res) => {
        const isDark = res.theme === 'dark';
        this.setData({ isDarkMode: isDark });
        if(!isDark) {
          this.toggleTheme();
        }
      }
    });
  },

  // 初始化蓝牙
  initBluetooth: function() {
    const that = this;
    BleManager.initBle()
      .then(success => {
        that.setData({ bleStatus: success });
      })
      .catch(error => {
        console.error('蓝牙初始化失败:', error);
        wx.showToast({
          title: '蓝牙初始化失败',
          icon: 'none'
        });
      });
  },

  // 初始化GPS
  initGPS: function() {
    const that = this;
    GpsManager.init()
      .then(() => {
        that.setData({ gpsStatus: true });
        return GpsManager.getCurrentPosition();
      })
      .then(location => {
        console.log('初始位置:', location);
        // 成功获取位置后立即更新地图
        that.setData({
          locationReady: true,  // 重要：设置位置就绪状态
          currentLocation: {
            latitude: location.latitude,
            longitude: location.longitude
          },
          mapCenter: {
            latitude: location.latitude,
            longitude: location.longitude
          }
        });
      })
      .catch(error => {
        console.error('GPS初始化失败:', error);
        wx.showToast({
          title: '获取位置信息失败',
          icon: 'none'
        });
      });
  },

  // 连接GoPro
  onConnect: function() {
    const that = this;
    if(!this.data.bleStatus) {
      wx.showToast({
        title: '蓝牙未初始化',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '连接中...'
    });

    BleManager.scanForDevice()
      .then(device => {
        console.log('发现设备:', device);
        return BleManager.connectDevice(device.deviceId);
      })
      .then(() => {
        that.setData({
          connected: true,
          statusText: '已连接'
        });
        return that.getRecordingStatus();
      })
      .then(() => {
        wx.showToast({
          title: '连接成功',
          icon: 'success'
        });
      })
      .catch(error => {
        console.error('连接失败:', error);
        that.setData({
          statusText: '连接失败'
        });
        wx.showToast({
          title: error.message || '连接失败',
          icon: 'none'
        });
      })
      .finally(() => {
        wx.hideLoading();
      });
  },

  // 开始/停止录制
  onRecordToggle: function() {
    if(!this.data.connected) {
      wx.showToast({
        title: '请先连接 GoPro',
        icon: 'none' 
      });
      return;
    }

    if(!this.data.gpsStatus) {
      wx.showToast({
        title: '等待GPS就绪',
        icon: 'none'
      });
      return;
    }

    if(!this.data.isRecording) {
      this.startRecording();
    } else {
      this.stopRecording();
    }
  },

  // 开始录制
  startRecording: function() {
    const that = this;
    this.trackDataManager.clear();
    this.setData({ trackPolylines: [] });
    
    // 先移除可能存在的监听器，避免重复
    GpsManager.removeStatusListener(this._handleGpsUpdate);
    
    // 添加新的监听器
    GpsManager.addStatusListener(this._handleGpsUpdate);
    
    GpsManager.startRecord(this.data.currentStake, this.data.isIncreasing)
      .then(() => {
        // 初始化轨迹记录
        TrackManager.startNewTrack(that.data.currentStake, that.data.isIncreasing);
        return BleManager.sendCommand(GoProCommands.START_RECORD);
      })
      .then(response => {
        if(response[2] === 0x00) {
          const trackInfo = TrackManager.currentVideo;
          that.setData({
            isRecording: true,
            recordStartTime: Date.now(),
            statusText: '录制中',
            currentChapter: 1,
            mediaId: trackInfo.mediaId || 'UNKN'
          });
          that.startTimer();
        }
      })
      .catch(error => {
        // 出错时移除监听器
        GpsManager.removeStatusListener(this._handleGpsUpdate);
        console.error('开始录制失败:', error);
        wx.showToast({
          title: '开始录制失败',
          icon: 'none'
        });
      });
  },

  // 停止录制
  stopRecording: function() {
    // 移除GPS监听器
    GpsManager.removeStatusListener(this._handleGpsUpdate);
    const that = this;
    wx.showLoading({
      title: '正在停止录制...'
    });

    // 先尝试停止相机录制
    BleManager.sendCommand(GoProCommands.STOP_RECORD)
      .then(response => {
        // 检查完整的响应
        if (!response || response.length < 3 || response[2] !== 0x00) {
          throw new Error('停止录制失败');
        }
        
        // 确认录制已停止后，再停止GPS记录
        return GpsManager.stopRecord();
      })
      .then(() => {
        // 确保有轨迹数据
        if (!that.trackDataManager.sampledPoints.length) {
          throw new Error('没有轨迹数据');
        }
        
        // 结束轨迹记录并生成字幕
        const trackData = TrackManager.endTrack();
        
        // 设置状态
        that.setData({
          isRecording: false,
          recordStartTime: null,
          recordDuration: 0,
          statusText: '已就绪'
        });
        that.stopTimer();
        
        // 检查字幕内容
        if (!trackData || !trackData.subtitles) {
          throw new Error('生成字幕失败');
        }
        
        // 导出字幕文件
        return that.exportSubtitleFile(trackData.subtitles);
      })
      .then(() => {
        wx.hideLoading();
        // 显示录制完成统计
        that.showRecordingSummary();
      })
      .catch(error => {
        console.error('停止录制失败:', error);
        wx.hideLoading();
        wx.showModal({
          title: '停止录制失败',
          content: error.message || '请重试',
          showCancel: false
        });
        
        // 重置状态
        that.setData({
          isRecording: false,
          statusText: '错误'
        });
        that.stopTimer();
      });
  },

  // 新增：统一处理GPS更新
  _handleGpsUpdate: function(status) {
    if (!status.latitude || !status.longitude) return;
  
    // 添加轨迹点（仅在录制状态下）
    let point = null;
    if (this.data.isRecording) {
      point = TrackManager.addTrackPoint({
        latitude: status.latitude,
        longitude: status.longitude
      }, status.speed || 0);
      
      // 更新轨迹显示和点数（只在采样时更新）
      const isNewSamplePoint = this.trackDataManager.addPoint(point);
      if (isNewSamplePoint) {
        this.throttledUpdateMap();
        this.batchUpdate({
          pointCount: (this.data.pointCount || 0) + 1
        });
      }
    }

    // 格式化精度显示
    const accuracy = status.accuracy || 0;
    const formattedAccuracy = Number(accuracy).toFixed(3);
  
    // 实时更新的数据（不受采样影响）
    const updates = {
      'currentLocation.latitude': status.latitude,
      'currentLocation.longitude': status.longitude,
      showSpeed: ((status.speed || 0) * 3.6).toFixed(1),
      accuracy: formattedAccuracy,
      satellites: status.satellites || 0,
      gpsUpdateTime: Date.now(),
      instantSpeed: (status.speed || 0) * 3.6,
      // 添加总距离更新 - 从最新采样点获取累计距离并转换为千米
      totalDistance: (point?.distance ? (point.distance / 1000).toFixed(2) : '0.0')
    };

    // 只在录制状态下更新桩号显示
    if (this.data.isRecording && point?.stake) {
      updates.showStake = point.stake;
    }
  
    this.batchUpdate(updates);
  },

  // 校正桩号
  onCalibrateStake: function() {
    wx.showModal({
      title: '校准桩号',
      editable: true,
      placeholderText: '请输入新桩号(例如: 12+000)',
      success: (res) => {
        if (res.confirm && res.content) {
          const newStake = res.content;
          
          // 验证桩号格式
          if (!/^\d+\+\d{3}$/.test(newStake)) {
            wx.showToast({
              title: '桩号格式错误',
              icon: 'none'
            });
            return;
          }
          
          // 获取当前位置
          const currentPosition = {
            latitude: this.data.currentLocation.latitude,
            longitude: this.data.currentLocation.longitude
          };
          
          try {
            // 直接使用导入的 TrackManager
            TrackManager.calibrateStake(newStake, currentPosition);
            
            // 更新显示
            this.setData({
              currentStake: newStake,
              showStake: newStake
            });
            
            wx.showToast({
              title: '校准成功',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: error.message || '校准失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 切换桩号方向
  onToggleDirection: function() {
    if(this.data.isRecording) {
      wx.showToast({
        title: '录制中无法切换',
        icon: 'none'
      });
      return;
    }

    this.setData({
      isIncreasing: !this.data.isIncreasing
    });
  },

  // 获取录制状态
  getRecordingStatus: function() {
    const that = this;
    return BleManager.sendCommand(GoProCommands.GET_STATUS)
      .then(response => {
        that.setData({
          isRecording: response[2] === 0x00
        });
      })
      .catch(error => {
        console.error('获取录制状态失败:', error);
      });
  },
  //更新状态
  updateStatus: function() {
    const status = GpsManager.getStatus();
    // 格式化精度显示
    const accuracy = status.accuracy || 0;
    const formattedAccuracy = accuracy.toFixed(3);
    // 1. 检查位置就绪状态
    if(!this.data.locationReady && status.latitude && status.longitude) {
      this.batchUpdate({
        locationReady: true,
        currentLocation: {
          latitude: status.latitude,
          longitude: status.longitude
        },
        mapCenter: {
          latitude: status.latitude,
          longitude: status.longitude
        }
      });
    }
  
    // 2. 录制状态下的更新（只更新需要定期刷新的数据）
    if(this.data.isRecording) {
      this.batchUpdate({
        recordDuration: Math.floor((Date.now() - this.data.recordStartTime) / 1000),
        showDuration: this.formatDuration(Math.floor((Date.now() - this.data.recordStartTime) / 1000)),
        gpsSignalStrength: this.calculateGpsSignalStrength(status)
      });
    }
  },

  // 导出字幕文件
  exportSubtitleFile: function(subtitleContent) {
    const fs = wx.getFileSystemManager();
    const fileName = `subtitle_${this.data.mediaId}.srt`;
    const userPath = wx.env.USER_DATA_PATH;
    const tempFilePath = `${userPath}/${fileName}`;
    
    return new Promise((resolve, reject) => {
      // 保存到用户空间
      fs.writeFile({
        filePath: tempFilePath,
        data: subtitleContent,
        encoding: 'utf8',
        success: () => {
          // 保存文件路径到 data 中，供后续导出使用
          this.setData({
            subtitleFilePath: tempFilePath
          });
          resolve(tempFilePath);
        },
        fail: reject
      });
    });
  },

// 导出轨迹数据
  exportTrackData: async function() {
    if (!this.trackDataManager.sampledPoints.length) {
      wx.showToast({
        title: '没有轨迹数据',
        icon: 'none'
      });
      return;
    }
  
    try {
      wx.showLoading({ title: '正在导出...' });
  
      // 获取轨迹数据
      const trackPoints = this.trackDataManager.sampledPoints;
      const trackInfo = TrackManager.getCurrentInfo();
      const calibrationPoints = trackInfo.calibrations || [];
  
      // 转换为GeoJSON
      const geoJSONContent = utils.convertToGeoJSON(
        trackPoints,
        calibrationPoints
      );
  
      // 生成文件名
      const fileName = utils.formatFileName('track', 'geojson');
  
      // 保存文件
      const filePath = await utils.exportToFile(geoJSONContent, fileName);
      console.log('文件已保存:', filePath);
  
      // 保存路径到data
      this.setData({
        trackFilePath: filePath,
        trackFileName: fileName
      });
  
      wx.hideLoading();
  
      // 显示分享选项
      wx.showModal({
        title: '导出成功',
        content: '轨迹数据已保存，是否立即分享？',
        confirmText: '分享文件',
        cancelText: '稍后分享',
        success: (res) => {
          if (res.confirm) {
            // 由用户操作触发分享
            this.shareTrackFile(filePath, fileName);
          }
        }
      });
  
    } catch (error) {
      console.error('导出过程出错:', error);
      wx.hideLoading();
      wx.showModal({
        title: '导出失败',
        content: `保存文件时发生错误: ${error.errMsg || error.message || '未知错误'}`,
        showCancel: false
      });
    }
  },
  
  // 分享轨迹文件
  shareTrackFile: function(filePath, fileName) {
    console.log('准备分享文件:', filePath);
    wx.shareFileMessage({
      filePath: filePath,
      success: () => {
        console.log('文件分享成功');
        // 如果还有字幕文件需要导出，显示提示
        if (this.data.subtitleFilePath) {
          this.onTrackFileShared();
        }
      },
      fail: (error) => {
        console.error('文件分享失败:', error);
        wx.showModal({
          title: '分享失败',
          content: `文件位置: ${filePath}\n错误信息: ${error.errMsg}`,
          confirmText: '重试',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              // 重试也是由用户点击触发的
              this.shareTrackFile(filePath, fileName);
            }
          }
        });
      }
    });
  },
  
  // 当轨迹文件分享完成后，提示是否继续分享字幕文件
  onTrackFileShared: function() {
    wx.showModal({
      title: '继续导出',
      content: '轨迹文件已分享，是否继续导出字幕文件？',
      success: (res) => {
        if (res.confirm) {
          this.shareSubtitleFile();
        }
      }
    });
  },
  
  // 显示录制完成统计时的处理
  showRecordingSummary: function() {
    const trackInfo = TrackManager.getCurrentInfo();
    wx.showModal({
      title: '录制完成',
      content: `总时长: ${this.formatDuration(trackInfo.duration)}\n` +
               `总距离: ${(trackInfo.totalDistance || 0).toFixed(2)}km\n` +
               `轨迹点数: ${trackInfo.pointCount}\n` +
               `视频分段数: ${trackInfo.currentChapter}`,
      confirmText: '导出数据',
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm) {
          // 显示导出选项
          wx.showActionSheet({
            itemList: ['导出轨迹', '导出字幕', '导出全部文件'],
            success: (res) => {
              switch (res.tapIndex) {
                case 0: // 导出轨迹
                  this.exportTrackData();
                  break;
                case 1: // 导出字幕
                  this.shareSubtitleFile();
                  break;
                case 2: // 导出全部文件
                  wx.showModal({
                    title: '导出全部文件',
                    content: '将依次导出轨迹数据和字幕文件，请在每个文件导出完成后选择分享',
                    success: (res) => {
                      if (res.confirm) {
                        this.exportTrackData();
                      }
                    }
                  });
                  break;
              }
            }
          });
        }
      }
    });
  },

  // 计算GPS信号强度
  calculateGpsSignalStrength: function(status) {
    if(!status.satellites) return 0;
    if(status.satellites < 4) return 1;
    if(status.accuracy > 50) return 2;
    if(status.accuracy > 20) return 3;
    return 4;
  },

  // 格式化时长显示
  formatDuration: function(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  },

  // 开始计时器
  startTimer: function() {
    if(this.recordTimer) {
      clearInterval(this.recordTimer);
    }
    this.recordTimer = setInterval(() => {
      this.updateStatus();
    }, 1000);
  },

  // 停止计时器
  stopTimer: function() {
    if(this.recordTimer) {
      clearInterval(this.recordTimer);
      this.recordTimer = null;
    }
  },

  // 分享字幕文件函数
  shareSubtitleFile: function() {
    if (!this.data.subtitleFilePath) {
      wx.showToast({
        title: '字幕文件不存在',
        icon: 'none'
      });
      return;
    }
  
    wx.shareFileMessage({
      filePath: this.data.subtitleFilePath,
      success: () => {
        wx.showToast({
          title: '导出成功',
          icon: 'success'
        });
      },
      fail: (error) => {
        console.error('导出失败:', error);
        wx.showModal({
          title: '导出失败',
          content: '字幕文件已保存在本地，请稍后重试导出。\n文件路径: ' + this.data.subtitleFilePath,
          showCancel: false
        });
      }
    });
  },

  onUnload: function() {
    if(this.statusTimer) {
      clearInterval(this.statusTimer);
    }
    if(this.recordTimer) {
      clearInterval(this.recordTimer);
    }

    if(this.data.isRecording) {
      this.stopRecording();
    }

    BleManager.disconnect();
    //清理定时器
    if(this.data.batchUpdateTimer) {
        clearTimeout(this.data.batchUpdateTimer);
      }
  },

  // 更新地图
  updateMap: function() {
    const segments = this.trackDataManager.getUnrenderedSegments();
    if (!segments) return;

    // 转换为地图polyline格式
    const newPolylines = segments.map(segment => ({
      points: segment.points.map(p => ({
        latitude: p.latitude,
        longitude: p.longitude
      })),
      color: segment.color,
      width: 4
    }));

    // 更新地图轨迹
    this.setData({
      trackPolylines: [...this.data.trackPolylines, ...newPolylines]
    });
  },

  // 批量更新函数
  batchUpdate: function(updates) {
    Object.assign(this.data.pendingUpdates, updates);
    
    if (!this.data.batchUpdateTimer) {
      this.data.batchUpdateTimer = setTimeout(() => {
        this.setData(this.data.pendingUpdates);
        this.data.pendingUpdates = {};
        this.data.batchUpdateTimer = null;
      }, 100); // 100ms内的更新会被合并
    }
  },
  
  // 更新地图中心点
  updateMapCenter: function(latitude, longitude) {
    if(this.data.autoCenter) {
      this.setData({
        'mapCenter.latitude': latitude,
        'mapCenter.longitude': longitude
      });
    }
  },

  // 根据速度获取颜色
  getSpeedColor: function(speed) {
    const kmh = speed * 3.6; // 转换为km/h
    if(kmh <= 20) return this.data.speedColors.low;
    if(kmh <= 40) return this.data.speedColors.normal;
    if(kmh <= 60) return this.data.speedColors.medium;
    if(kmh <= 80) return this.data.speedColors.fast;
    return this.data.speedColors.high;
  },

// 更新轨迹绘制
  updateTrackLine: function(points) {
    if(!points || points.length < 2) return;
    
    const segments = [];
    let currentSegment = {
      points: [points[0]],
      color: this.getSpeedColor(points[0].speed),
      width: 4
    };
    
    // 根据速度分段
    for(let i = 1; i < points.length; i++) {
      const point = points[i];
      const color = this.getSpeedColor(point.speed);
      
      // 如果颜色改变，创建新段
      if(color !== currentSegment.color) {
        segments.push({...currentSegment});
        currentSegment = {
          points: [points[i-1]], // 包含上一个点保持连续
          color: color,
          width: 4
        };
      }
      
      currentSegment.points.push(point);
    }
    
    // 添加最后一段
    segments.push(currentSegment);
    
    // 处理分段数据，转换为地图polyline格式
    const polylines = segments.map(segment => ({
      points: segment.points.map(p => ({
        latitude: p.latitude,
        longitude: p.longitude
      })),
      color: segment.color,
      width: segment.width,
      arrowLine: false
    }));
    
    this.setData({ trackPolylines: polylines });
  },
  
  // 在地图上显示图例
  addSpeedLegend: function() {
    const legend = [
      { text: '0-20km/h', color: this.data.speedColors.low },
      { text: '20-40km/h', color: this.data.speedColors.normal },
      { text: '40-60km/h', color: this.data.speedColors.medium },
      { text: '60-80km/h', color: this.data.speedColors.fast },
      { text: '>80km/h', color: this.data.speedColors.high }
    ];
    
    this.setData({ speedLegend: legend });
  },
  
  // 更新地图标记
  updateMapMarkers: function(calibrationPoints) {
    const markers = calibrationPoints.map((point, index) => ({
      id: index,
      latitude: point.latitude,
      longitude: point.longitude,
      title: `校准点: ${point.stake}`,
      iconPath: '/images/marker.png', // 需要准备一个标记图标
      width: 30,
      height: 30
    }));
    this.setData({ mapMarkers: markers });
  },
  
  // 切换地图展开/收起
  toggleMapExpand: function() {
    console.log('切换地图展开状态'); // 调试日志
    const newExpanded = !this.data.isMapExpanded;
    this.setData({
      isMapExpanded: newExpanded
    }, () => {
      // 在状态更新后操作地图
      const mapCtx = wx.createMapContext('trackMap');
      if(newExpanded) {
        // 展开时调整视图以显示完整轨迹
        if(this.data.trackPolyline && this.data.trackPolyline[0]?.points.length > 0) {
          mapCtx.includePoints({
            points: this.data.trackPolyline[0].points,
            padding: [50, 50, 50, 50]
          });
        }
      } else {
        // 收起时恢复到默认缩放级别
        this.setData({ mapScale: 16 });
      }
    });
  },  
  
  // 切换自动中心点
  toggleAutoCenter: function() {
    this.setData({
      autoCenter: !this.data.autoCenter
    });
  },
  
  // 地图区域变化事件
  onMapRegionChange: function(e) {
    if(e.type === 'end' && e.causedBy === 'drag') {
      this.setData({ autoCenter: false });
    }
  },

  // 切换主题
  toggleTheme: function() {
    const newMode = !this.data.isDarkMode;
    this.setData({ isDarkMode: newMode });
    
    // 设置全局主题类
    if(newMode) {
      wx.setNavigationBarColor({
        frontColor: '#ffffff',
        backgroundColor: '#202124'
      });
    } else {
      wx.setNavigationBarColor({
        frontColor: '#000000',
        backgroundColor: '#ffffff'
      });
    }
    
    // 更新页面主题类
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    if(currentPage) {
      if(newMode) {
        currentPage.pageClass = '';
      } else {
        currentPage.pageClass = 'light-theme';
      }
    }
  },
});