// utils/ble.js

const BleManager = {
    // GoPro BLE 服务和特征值 UUID
    GOPRO_BASE_UUID: "b5f9%s-aa8d-11e3-9046-0002a5d5c51b",
    COMMAND_REQ_UUID: "b5f90072-aa8d-11e3-9046-0002a5d5c51b",
    COMMAND_RSP_UUID: "b5f90073-aa8d-11e3-9046-0002a5d5c51b",
    SETTINGS_REQ_UUID: "b5f90074-aa8d-11e3-9046-0002a5d5c51b", 
    SETTINGS_RSP_UUID: "b5f90075-aa8d-11e3-9046-0002a5d5c51b",
  
    // 连接状态
    isConnected: false,
    deviceId: null,
    serviceId: null,
    commandCharId: null,
    responseCharId: null,
    
    // 初始化蓝牙模块
    async initBle() {
      try {
        await wx.openBluetoothAdapter();
        console.log('蓝牙初始化成功');
        return true;
      } catch (error) {
        console.error('蓝牙初始化失败', error);
        wx.showToast({
          title: '请打开蓝牙',
          icon: 'none'
        });
        return false;
      }
    },
  
    // 扫描 GoPro 设备
    async scanForDevice() {
      try {
        // 停止之前的扫描
        await wx.stopBluetoothDevicesDiscovery();
        
        // 开始新的扫描
        await wx.startBluetoothDevicesDiscovery({
          allowDuplicatesKey: false
        });
        
        return new Promise((resolve, reject) => {
          // 监听扫描结果
          wx.onBluetoothDeviceFound((res) => {
            console.log('发现设备:', res.devices);
            const devices = res.devices;
            for (let device of devices) {
              if (device.name && device.name.includes('GoPro')) {
                wx.stopBluetoothDevicesDiscovery();
                resolve(device);
                return;
              }
            }
          });
  
          // 30秒超时
          setTimeout(() => {
            wx.stopBluetoothDevicesDiscovery();
            reject(new Error('未找到 GoPro 设备'));
          }, 30000);
        });
      } catch (error) {
        console.error('扫描失败', error);
        throw error;
      }
    },
  
    // 准备特征值
    async prepareCharacteristics() {
      try {
        // 获取所有服务
        const services = await wx.getBLEDeviceServices({
          deviceId: this.deviceId
        });
        console.log('所有服务:', services);
  
        // 遍历所有服务查找特征值
        const gopro_services = services.services || [];
        for (let service of gopro_services) {
          console.log('检查服务:', service.uuid);
          
          // 获取每个服务的特征值
          const chars = await wx.getBLEDeviceCharacteristics({
            deviceId: this.deviceId,
            serviceId: service.uuid
          });
          console.log(`服务 ${service.uuid} 的特征值:`, chars);
  
          // 遍历特征值
          const characteristics = chars.characteristics || [];
          for (let char of characteristics) {
            const uuid = char.uuid.toLowerCase();
            console.log('特征值:', uuid);
  
            // 查找命令和响应特征值
            if (uuid.includes('b5f90072')) {
              this.commandCharId = char.uuid;
              this.serviceId = service.uuid;
              console.log('找到命令特征值:', char.uuid);
            } 
            else if (uuid.includes('b5f90073')) {
              this.responseCharId = char.uuid;
              this.serviceId = service.uuid;
              console.log('找到响应特征值:', char.uuid);
            }
          }
  
          // 如果在当前服务中找到了所需的特征值，就不需要继续查找其他服务
          if (this.commandCharId && this.responseCharId) {
            break;
          }
        }
  
        if (!this.serviceId) {
          throw new Error('未找到主服务');
        }
  
        if (!this.commandCharId || !this.responseCharId) {
          throw new Error('未找到命令或响应特征值');
        }
  
        // 等待1秒以确保服务准备完成
        await new Promise(resolve => setTimeout(resolve, 1000));
  
        // 启用通知
        await wx.notifyBLECharacteristicValueChange({
          deviceId: this.deviceId,
          serviceId: this.serviceId,
          characteristicId: this.responseCharId,
          state: true
        });
  
        console.log('特征值准备完成:', {
          serviceId: this.serviceId,
          commandCharId: this.commandCharId,
          responseCharId: this.responseCharId
        });
  
      } catch (error) {
        console.error('准备特征值失败:', error);
        throw error;
      }
    },
  
    // 连接设备
    async connectDevice(deviceId) {
      try {
        // 先断开已有连接
        try {
          await this.disconnect();
        } catch (e) {
          // 忽略断开连接时的错误
        }
  
        // 等待一下再建立新连接
        await new Promise(resolve => setTimeout(resolve, 1000));
  
        // 建立新连接
        await wx.createBLEConnection({
          deviceId: deviceId,
          timeout: 10000
        });
  
        // 等待连接稳定
        await new Promise(resolve => setTimeout(resolve, 1000));
  
        this.deviceId = deviceId;
        this.isConnected = true;
  
        // 初始化特征值
        await this.prepareCharacteristics();
        
        console.log('GoPro 连接成功');
        return true;
      } catch (error) {
        console.error('连接失败', error);
        this.isConnected = false;
        throw error;
      }
    },
  
    // 发送命令前检查服务和特征值
    async ensureServicesReady() {
      if (!this.serviceId || !this.commandCharId || !this.responseCharId) {
        await this.prepareCharacteristics();
      }
    },
  
    // 发送命令
    async sendCommand(command, maxRetries = 3) {
      if (!this.isConnected || !this.deviceId) {
        throw new Error('设备未连接');
      }
  
      // 确保服务已准备
      await this.ensureServicesReady();
  
      try {
        // 配置响应监听
        const responsePromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            wx.offBLECharacteristicValueChange();
            reject(new Error('命令超时'));
          }, 5000);
  
          wx.onBLECharacteristicValueChange((result) => {
            if (result.characteristicId === this.responseCharId) {
              clearTimeout(timeout);
              wx.offBLECharacteristicValueChange();
              resolve(new Uint8Array(result.value));
            }
          });
        });
  
        // 尝试发送命令
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
          try {
            await wx.writeBLECharacteristicValue({
              deviceId: this.deviceId,
              serviceId: this.serviceId,
              characteristicId: this.commandCharId,
              value: command.buffer
            });
            
            // 等待响应
            const response = await responsePromise;
            return response;
          } catch (error) {
            lastError = error;
            console.error('发送命令失败:', error);
            if (i < maxRetries - 1) {
              console.error(`第 ${i + 1} 次重试失败:`, error);
              await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
            }
          }
        }
        throw lastError;
      } catch (error) {
        throw error;
      }
    },
  
    // 断开连接
    async disconnect() {
      try {
        if (this.deviceId) {
          await wx.closeBLEConnection({
            deviceId: this.deviceId
          });
        }
      } catch (error) {
        console.error('断开连接失败:', error);
      } finally {
        this.isConnected = false;
        this.deviceId = null;
        this.serviceId = null;
        this.commandCharId = null; 
        this.responseCharId = null;
      }
    },
  
    // 获取连接状态
    getConnectionState() {
      return {
        isConnected: this.isConnected,
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        commandCharId: this.commandCharId,
        responseCharId: this.responseCharId
      };
    }
  };
  
  export default BleManager;