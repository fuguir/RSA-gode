// pages/create/create.js
import SectionManager from '../../utils/section-manager';

Page({
  data: {
    formData: {
      name: '',
      region: ['', ''],
      type: '',
      direction: ''
    },
    roadTypes: [
      { label: '高速公路', value: 'highway' },
      { label: '普通公路', value: 'normal' },
      { label: '城市道路', value: 'urban' },
      { label: '其他', value: 'other' }
    ],
    isFormValid: false,
    selectedDirection: '', // 'increase' 或 'decrease'
  },

  // 表单输入处理
  onNameInput(e) {
    this.setData({
      'formData.name': e.detail.value
    }, this.validateForm);
  },

  onRegionChange(e) {
    this.setData({
      'formData.region': e.detail.value
    }, this.validateForm);
  },

  onTypeSelect(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      'formData.type': type
    }, this.validateForm);
  },

  // 添加方向选择处理
  onDirectionSelect(e) {
    const direction = e.currentTarget.dataset.direction;
    this.setData({
      'formData.direction': direction
    }, this.validateForm);
  },

  // 表单验证
  validateForm() {
    const { name, region, type, direction } = this.data.formData;
    const isValid = name.trim().length > 0 
                   && region[0] && region[1]
                   && type
                   && direction;
    
    this.setData({ isFormValid: isValid });
  },

  // 取消按钮处理
  onCancel() {
    wx.navigateBack();
  },

  // 确认按钮处理
  async onConfirm() {
    if (!this.data.isFormValid) return;

    try {
      const sectionData = {
        name: this.data.formData.name,
        province: this.data.formData.region[0],
        city: this.data.formData.region[1],
        type: this.data.formData.type,
        direction: this.data.formData.direction
      };

      const sectionId = await SectionManager.createSection(sectionData);
      
      // 创建成功后直接跳转到录制页面
      wx.navigateTo({
        url: `/pages/record/record?id=${sectionId}&direction=${sectionData.direction}`
      });

    } catch (error) {
      console.error('创建路段失败:', error);
      wx.showToast({
        title: error.message || '创建失败',
        icon: 'none'
      });
    }
  }
});