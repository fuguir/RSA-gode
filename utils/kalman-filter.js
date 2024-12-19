class KalmanFilter {
  constructor() {
    // 状态向量: [位置x, 位置y, 速度x, 速度y]
    this.state = [0, 0, 0, 0];
    
    // 状态协方差矩阵
    this.P = [
      [1, 0, 0, 0],
      [0, 1, 0, 0], 
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];

    // 过程噪声
    this.Q = [
      [0.1, 0, 0, 0],
      [0, 0.1, 0, 0],
      [0, 0, 0.1, 0], 
      [0, 0, 0, 0.1]
    ];

    // 测量噪声
    this.R = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];

    this.lastTimestamp = 0;
  }

  predict(timestamp) {
    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
      return;
    }

    const dt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    // 更新状态
    this.state[0] += this.state[2] * dt;
    this.state[1] += this.state[3] * dt;

    // 更新协方差
    this.P[0][0] += dt * this.P[2][0];
    this.P[0][2] += dt * this.P[2][2];
    this.P[2][0] += dt * this.P[0][0];
    this.P[2][2] += dt * this.P[2][2];

    // 添加过程噪声
    for (let i = 0; i < 4; i++) {
      this.P[i][i] += this.Q[i][i];
    }
  }

  update(measurement) {
    // 计算卡尔曼增益
    const K = this._calculateKalmanGain();

    // 更新状态
    const innovation = this._calculateInnovation(measurement);
    for (let i = 0; i < 4; i++) {
      this.state[i] += K[i] * innovation[i];
    }

    // 更新协方差
    this._updateCovariance(K);
  }

  _calculateKalmanGain() {
    // 简化的卡尔曼增益计算
    const gain = [];
    for (let i = 0; i < 4; i++) {
      gain[i] = this.P[i][i] / (this.P[i][i] + this.R[i][i]);
    }
    return gain;
  }

  _calculateInnovation(measurement) {
    return measurement.map((m, i) => m - this.state[i]);
  }

  _updateCovariance(K) {
    for (let i = 0; i < 4; i++) {
      this.P[i][i] *= (1 - K[i]);
    }
  }

  getState() {
    return {
      position: {
        latitude: this.state[0],
        longitude: this.state[1]
      },
      velocity: {
        x: this.state[2],
        y: this.state[3]
      },
      speed: Math.sqrt(this.state[2] * this.state[2] + this.state[3] * this.state[3])
    };
  }
}

export default KalmanFilter; 