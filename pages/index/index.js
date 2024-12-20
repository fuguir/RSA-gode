// pages/index/index.js
import SectionManager from '../../utils/section-manager';

Page({
  data: {
    sections: [],          // 当前页的路段数据
    currentPage: 1,        // 当前页码
    totalPages: 1,         // 总页数
    keyword: '',          // 搜索关键词
    showFilter: false,    // 是否显示筛选弹窗
    filter: {             // 筛选条件
      type: '',
      region: ['', '']
    },
    roadTypes: [          // 道路类型选项
      { label: '全部', value: '' },
      { label: '高速公路', value: 'highway' },
      { label: '普通公路', value: 'normal' },
      { label: '城市道路', value: 'urban' },
      { label: '其他', value: 'other' }
    ],
    selectedItems: [], // 用于记录选中的项目
    isAllSelected: false
  },

  onLoad() {
    this.loadSections();
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadSections();
  },

  // 加载路段数据
  async loadSections() {
    try {
      const { currentPage, keyword } = this.data;
      const result = await SectionManager.getSections({
        page: currentPage,
        keyword
      });

      const sections = result.items.map(item => ({
        ...item,
        createTime: this.formatDate(item.createTime)
      }));

      // 更新选中状态
      const selectedItems = this.data.selectedItems.filter(id => 
        sections.some(section => section.id === id)
      );

      this.setData({
        sections,
        totalPages: Math.ceil(result.total / SectionManager.pageSize),
        selectedItems,
        isAllSelected: sections.length > 0 && selectedItems.length === sections.length
      });
    } catch (error) {
      console.error('加载路段数据失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  // 翻页功能
  onPrevPage() {
    if (this.data.currentPage <= 1) return;
    this.setData({
      currentPage: this.data.currentPage - 1
    }, () => {
      this.loadSections();
    });
  },

  onNextPage() {
    if (this.data.currentPage >= this.data.totalPages) return;
    this.setData({
      currentPage: this.data.currentPage + 1
    }, () => {
      this.loadSections();
    });
  },

  // 删除功能
  onDeleteSection(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await SectionManager.deleteSection(id);
            
            // 更新选中项
            this.setData({
              selectedItems: this.data.selectedItems.filter(item => item !== id)
            });

            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });

            this.loadSections();
          } catch (error) {
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 搜索功能
  onSearchInput(e) {
    this.setData({
      keyword: e.detail.value,
      currentPage: 1
    }, () => {
      this.loadSections();
    });
  },

  // 显示筛选弹窗
  showFilter() {
    this.setData({ showFilter: true });
  },

  // 隐藏筛选弹窗
  hideFilter() {
    this.setData({ showFilter: false });
  },

  // 选择道路类型
  onTypeFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      'filter.type': type
    });
  },

  // 选择地区
  onRegionChange(e) {
    this.setData({
      'filter.region': e.detail.value
    });
  },

  // 重置筛选
  resetFilter() {
    this.setData({
      filter: {
        type: '',
        region: ['', '']
      }
    });
  },

  // 应用筛选
  applyFilter() {
    this.setData({
      currentPage: 1,  // 重置到第一页
      showFilter: false
    }, () => {
      this.loadSections();
    });
  },

  // 切换页码
  onPageChange(e) {
    const page = e.currentTarget.dataset.page;
    this.setData({
      currentPage: page
    }, () => {
      this.loadSections();
    });
  },

  // 导出数据
  async onExportData(e) {
    const { id, type } = e.currentTarget.dataset;
    try {
      // TODO: 实现数据导出逻辑
      wx.showToast({
        title: '导出成功',
        icon: 'success'
      });
    } catch (error) {
      console.error('导出数据失败:', error);
      wx.showToast({
        title: '导出失败',
        icon: 'none'
      });
    }
  },

  // 创建新路段
  onCreateSection() {
    wx.navigateTo({
      url: '/pages/create/create'
    });
  },

  // 格式化日期
  formatDate(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  // 切换单个选择
  onToggleSelect(e) {
    const { id } = e.currentTarget.dataset;
    const { selectedItems, sections } = this.data;
    const newSelectedItems = selectedItems.includes(id)
      ? selectedItems.filter(item => item !== id)
      : [...selectedItems, id];
    
    this.setData({
      selectedItems: newSelectedItems,
      isAllSelected: newSelectedItems.length === sections.length
    });
  },

  // 切换全选
  onToggleSelectAll() {
    const { sections, isAllSelected } = this.data;
    const newSelectedItems = isAllSelected ? [] : sections.map(item => item.id);
    
    this.setData({
      selectedItems: newSelectedItems,
      isAllSelected: !isAllSelected
    });
  },

  // 批量删除
  async onBatchDelete() {
    const { selectedItems } = this.data;
    if (!selectedItems.length) return;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除选中的 ${selectedItems.length} 条记录吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await Promise.all(selectedItems.map(id => SectionManager.deleteSection(id)));
            
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });

            this.setData({
              selectedItems: [],
              isAllSelected: false,
              currentPage: 1
            }, () => {
              this.loadSections();
            });
          } catch (error) {
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  }
});