// pages/create/create.js
Page({
    data: {
      sectionName: '',
      initialStake: '',
      direction: 'increase',
      latitude: '',
      longitude: '',
    },
  
    onLoad: function() {
      this.startLocationUpdate();
    },
  
    startLocationUpdate: async function() {
      try {
        // 确保有位置权限
        const setting = await wx.getSetting();
        if (!setting.authSetting['scope.userLocation']) {
          await wx.authorize({
            scope: 'scope.userLocation'
          });
        }
  
        // 开启位置更新
        await wx.startLocationUpdate();
        
        // 监听位置变化
        wx.onLocationChange((res) => {
          this.setData({
            latitude: res.latitude.toFixed(6),
            longitude: res.longitude.toFixed(6)
          });
        });
      } catch (err) {
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
        } else {
          wx.showToast({
            title: '获取位置失败',
            icon: 'none'
          });
        }
      }
    },
  
    onNameInput: function(e) {
      this.setData({
        sectionName: e.detail.value
      });
    },
  
    onStakeInput: function(e) {
      this.setData({
        initialStake: e.detail.value
      });
    },
  
    onDirectionChange: function(e) {
      this.setData({
        direction: e.detail.value
      });
    },
  
    validateForm: function() {
      if (!this.data.sectionName.trim()) {
        wx.showToast({
          title: '请输入路段名称',
          icon: 'none'
        });
        return false;
      }
  
      if (!this.data.initialStake) {
        wx.showToast({
          title: '请输入初始桩号',
          icon: 'none'
        });
        return false;
      }
  
      const stake = parseFloat(this.data.initialStake);
      if (isNaN(stake) || stake < 0) {
        wx.showToast({
          title: '请输入有效的桩号',
          icon: 'none'
        });
        return false;
      }
  
      return true;
    },
  
    onConfirm: function() {
      if (!this.validateForm()) return;
  
      // 准备路段数据
      const sectionData = {
        name: this.data.sectionName,
        initialStake: parseFloat(this.data.initialStake),
        direction: this.data.direction,
        startLatitude: this.data.latitude,
        startLongitude: this.data.longitude,
        createTime: new Date().getTime()
      };
  
      // 保存路段信息到本地存储
      try {
        const sections = wx.getStorageSync('sections') || [];
        sections.push(sectionData);
        wx.setStorageSync('sections', sections);
  
        // 跳转到录制页面
        wx.navigateTo({
          url: '/pages/record/record?id=' + (sections.length - 1)
        });
      } catch (e) {
        console.error('保存路段信息失败：', e);
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      }
    },
  
    onCancel: function() {
      wx.navigateBack();
    },
  
    onUnload: function() {
      // 页面卸载时停止位置更新
      wx.stopLocationUpdate();
    }
  });