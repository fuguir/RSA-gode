// pages/index/index.js
Page({
    data: {
      gpsStatus: false,
      speed: 0
    },
  
    onLoad: function() {
      this.initGPS();
    },
  
    initGPS: async function() {
      try {
        // 先获取用户授权
        const setting = await wx.getSetting();
        if (!setting.authSetting['scope.userLocation']) {
          const res = await wx.authorize({
            scope: 'scope.userLocation'
          });
        }
  
        // 获取位置
        const location = await wx.getLocation({
          type: 'gcj02'
        });
        
        this.setData({
          gpsStatus: true
        });
  
        // 开始位置监听
        this.startLocationWatch();
      } catch (error) {
        console.error('GPS初始化失败：', error);
        
        // 如果是权限拒绝,引导用户开启
        if (error.errno === 103) {
          wx.showModal({
            title: '需要位置权限',
            content: '请在设置中开启位置权限，以便计算速度和桩号',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting();
              }
            }
          });
        } else {
          wx.showToast({
            title: '获取位置失败',
            icon: 'none'
          });
        }
      }
    },
  
    startLocationWatch: function() {
      wx.startLocationUpdate({
        success: (res) => {
          wx.onLocationChange((res) => {
            // 计算速度（m/s转换为km/h）
            const speed = (res.speed || 0) * 3.6;
            this.setData({
              speed: speed.toFixed(1)
            });
          });
        },
        fail: (err) => {
          console.error('开启位置更新失败：', err);
          if (err.errno === 103) {
            wx.showModal({
              title: '需要位置权限',
              content: '请在设置中开启位置权限，以便计算速度和桩号',
              confirmText: '去设置',
              success: (res) => {
                if (res.confirm) {
                  wx.openSetting();
                }
              }
            });
          }
        }
      });
    },

    onCreateSection: function() {
        wx.navigateTo({
          url: '/pages/create/create'
        });
      },
  
    onUnload: function() {
      wx.stopLocationUpdate();
    }
  });