// pages/tracks/tracks.js
import StorageManager from '../../utils/storage-manager';

Page({
  data: {
    tracks: [],
    loading: false
  },

  onLoad: function() {
    this.loadTrackFiles();
  },

  onShow: function() {
    this.loadTrackFiles(); // 每次显示页面时刷新列表
  },

  // 加载轨迹文件列表
  loadTrackFiles: function() {
    this.setData({ loading: true });
    
    StorageManager.getTrackFiles()
      .then(files => {
        this.setData({
          tracks: files.map(file => ({
            ...file,
            date: new Date(file.timestamp).toLocaleString()
          }))
        });
      })
      .catch(error => {
        console.error('加载轨迹文件失败:', error);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  // 导出文件
  onExportTrack: function(e) {
    const { filepath } = e.currentTarget.dataset;
    
    StorageManager.exportTrackFile(filepath)
      .then(() => {
        wx.showToast({
          title: '导出成功',
          icon: 'success'
        });
      })
      .catch(error => {
        console.error('导出文件失败:', error);
        wx.showToast({
          title: '导出失败',
          icon: 'none'
        });
      });
  },

  // 删除文件
  onDeleteTrack: function(e) {
    const { filepath } = e.currentTarget.dataset;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      success: (res) => {
        if (res.confirm) {
          StorageManager.deleteTrackFile(filepath)
            .then(() => {
              this.loadTrackFiles(); // 重新加载列表
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
            })
            .catch(error => {
              console.error('删除文件失败:', error);
              wx.showToast({
                title: '删除失败',
                icon: 'none'
              });
            });
        }
      }
    });
  }
});