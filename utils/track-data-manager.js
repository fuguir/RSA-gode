// utils/track-data-manager.js

import utils from './utils';

class TrackDataManager {
  constructor() {
    this.rawPoints = [];       // 原始轨迹点
    this.sampledPoints = [];   // 采样后的轨迹点
    this.renderedPoints = [];  // 已渲染的轨迹点
    this.lastRenderIndex = 0;  // 上次渲染的索引
    this.minSamplingDistance = 5; // 最小采样距离（米）
  }

  // 添加新的轨迹点
  addPoint(point) {
    this.rawPoints.push(point);
    
    // 采样判断
    if (utils.shouldKeepPoint(
      point, 
      this.sampledPoints[this.sampledPoints.length - 1],
      this.minSamplingDistance
    )) {
      this.sampledPoints.push(point);
      return true;
    }
    return false;
  }

  // 获取待渲染的轨迹段
  getUnrenderedSegments() {
    const newPoints = this.sampledPoints.slice(this.lastRenderIndex);
    if (newPoints.length < 2) return null;

    const segments = [];
    let currentSegment = {
      points: [newPoints[0]],
      color: null
    };

    for (let i = 1; i < newPoints.length; i++) {
      const point = newPoints[i];
      const color = this.getSpeedColor(point.speed);

      if (color !== currentSegment.color && currentSegment.points.length > 0) {
        currentSegment.color = this.getSpeedColor(currentSegment.points[0].speed);
        segments.push(currentSegment);
        currentSegment = {
          points: [newPoints[i-1]],
          color: null
        };
      }
      
      currentSegment.points.push(point);
    }

    if (currentSegment.points.length > 0) {
      currentSegment.color = this.getSpeedColor(currentSegment.points[0].speed);
      segments.push(currentSegment);
    }

    this.lastRenderIndex = this.sampledPoints.length;
    return segments;
  }

  // 根据速度获取颜色
  getSpeedColor(speed) {
    const kmh = speed * 3.6;
    if (kmh <= 20) return '#4CAF50';
    if (kmh <= 40) return '#2196F3';
    if (kmh <= 60) return '#FFC107';
    if (kmh <= 80) return '#FF9800';
    return '#F44336';
  }

  // 清除数据
  clear() {
    this.rawPoints = [];
    this.sampledPoints = [];
    this.renderedPoints = [];
    this.lastRenderIndex = 0;
  }
}

export default TrackDataManager;