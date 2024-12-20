// utils/section-manager.js

class SectionManager {
    constructor() {
      this.storageKey = 'sections';  // 用于LocalStorage的key
      this.pageSize = 6;             // 每页显示的路段数量
    }
  
    /**
     * 创建新路段
     * @param {Object} sectionData 路段数据
     * @param {string} sectionData.name - 路段名称(限8字)
     * @param {string} sectionData.province - 省份
     * @param {string} sectionData.city - 城市
     * @param {string} sectionData.type - 道路类型(highway|normal|urban|other)
     * @returns {Promise<string>} 返回路段ID
     */
    async createSection(sectionData) {
      try {
        // 1. 验证数据
        this._validateSectionData(sectionData);
  
        // 2. 构建完整的路段对象
        const section = {
          id: this._generateId(),
          ...sectionData,
          createTime: Date.now(),
          length: 0,
          directions: {
            increase: { recorded: false },
            decrease: { recorded: false }
          }
        };
  
        // 3. 保存到存储
        const sections = await this._getSections();
        sections.unshift(section);  // 新路段添加到开头
        await this._saveSections(sections);
  
        return section.id;
      } catch (error) {
        console.error('创建路段失败:', error);
        throw error;
      }
    }
  
    /**
     * 分页获取路段列表
     * @param {Object} options 查询选项
     * @param {number} options.page - 页码(从1开始)
     * @param {string} options.keyword - 搜索关键词
     * @param {string} options.province - 按省份筛选
     * @param {string} options.type - 按类型筛选
     * @returns {Promise<{total: number, items: Array}>}
     */
    async getSections(options = {}) {
      try {
        const { page = 1, keyword, province, type } = options;
        let sections = await this._getSections();
  
        // 1. 应用筛选
        if (keyword || province || type) {
          sections = sections.filter(section => {
            return (!keyword || section.name.includes(keyword)) &&
                   (!province || section.province === province) &&
                   (!type || section.type === type);
          });
        }
  
        // 2. 计算分页
        const start = (page - 1) * this.pageSize;
        const items = sections.slice(start, start + this.pageSize);
        
        return {
          total: sections.length,
          items: items
        };
      } catch (error) {
        console.error('获取路段列表失败:', error);
        throw error;
      }
    }
  
    /**
     * 更新路段录制状态和文件信息
     * @param {string} sectionId 路段ID
     * @param {string} direction 方向(increase|decrease)
     * @param {Object} files 文件信息
     */
    async updateSectionFiles(sectionId, direction, files) {
      try {
        const sections = await this._getSections();
        const index = sections.findIndex(s => s.id === sectionId);
        if (index === -1) throw new Error('路段不存在');
  
        sections[index].directions[direction] = {
          recorded: true,
          trackFile: files.trackFile,
          subtitleFile: files.subtitleFile
        };
  
        await this._saveSections(sections);
      } catch (error) {
        console.error('更新路段文件失败:', error);
        throw error;
      }
    }
  
    /**
     * 删除路段
     * @param {string} sectionId 路段ID
     * @returns {Promise<void>}
     */
    async deleteSection(sectionId) {
      try {
        const sections = await this._getSections();
        const index = sections.findIndex(s => s.id === sectionId);
        if (index === -1) throw new Error('路段不存在');
  
        // 获取要删除的路段数据
        const section = sections[index];
  
        // 删除相关文件
        if (section.directions.increase.recorded) {
          await this._deleteFiles(section.directions.increase);
        }
        if (section.directions.decrease.recorded) {
          await this._deleteFiles(section.directions.decrease);
        }
  
        // 从列表中移除
        sections.splice(index, 1);
        await this._saveSections(sections);
      } catch (error) {
        console.error('删除路段失败:', error);
        throw error;
      }
    }
  
    /**
     * 删除文件
     * @param {Object} direction 方向对象
     * @returns {Promise<void>}
     */
    async _deleteFiles(direction) {
      try {
        if (direction.trackFile) {
          await wx.removeSavedFile({
            filePath: direction.trackFile
          });
        }
        if (direction.subtitleFile) {
          await wx.removeSavedFile({
            filePath: direction.subtitleFile
          });
        }
      } catch (error) {
        console.error('删除文件失败:', error);
      }
    }
  
    // 私有方法
    
    async _getSections() {
      return wx.getStorageSync(this.storageKey) || [];
    }
  
    async _saveSections(sections) {
      return wx.setStorageSync(this.storageKey, sections);
    }
  
    _validateSectionData(data) {
      if (!data.name || data.name.length > 8) {
        throw new Error('路段名称不能为空且不能超过8个字符');
      }
      // 过滤特殊字符
      if (/[<>:"/\\|?*\x00-\x1F]/.test(data.name)) {
        throw new Error('路段名称包含非法字符');
      }
      if (!data.province || !data.city) {
        throw new Error('请选择省市');
      }
      if (!['highway', 'normal', 'urban', 'other'].includes(data.type)) {
        throw new Error('请选择正确的道路类型');
      }
    }
  
    _generateId() {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
  }
  
  export default new SectionManager();