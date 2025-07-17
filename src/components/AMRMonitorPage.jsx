import React, { useState, useEffect } from 'react';
import { 
  Battery,
  MapPin,
  Activity,
  Zap,
  AlertTriangle,
  CheckCircle,
  Clock,
  Wifi,
  WifiOff,
  RotateCw
} from 'lucide-react';

const AMRMonitorPage = () => {
  // 機器人狀態
  const [robotState, setRobotState] = useState({
    pose: { x: 0, y: 0, theta: 0 },
    battery: 85,
    status: '未連接',
    velocities: { linear: 0, angular: 0 },
    connected: false,
    timestamp: 0
  });
  
  // 系統日誌
  const [logs, setLogs] = useState([
    { time: new Date().toLocaleTimeString(), type: 'info', message: '監控頁面啟動' }
  ]);

  // 監聽來自主頁面的廣播
  useEffect(() => {
    const handleStorageChange = (e) => {
      try {
        // 監聽機器人狀態更新
        if (e.key === 'amr_robot_state' && e.newValue) {
          const newState = JSON.parse(e.newValue);
          setRobotState(newState);
        }
        
        // 監聽日誌更新
        if (e.key === 'amr_logs_state' && e.newValue) {
          const logsData = JSON.parse(e.newValue);
          setLogs(logsData.logs || []);
        }
        
        // 監聽單個日誌廣播
        if (e.key === 'amr_log_broadcast' && e.newValue) {
          const logEntry = JSON.parse(e.newValue);
          setLogs(prev => [...prev.slice(-9), logEntry]);
        }
      } catch (error) {
        console.log('解析廣播數據失敗:', error);
      }
    };

    // 添加事件監聽器
    window.addEventListener('storage', handleStorageChange);

    // 定期檢查本地存儲中的最新數據
    const checkInterval = setInterval(() => {
      try {
        const robotData = localStorage.getItem('amr_robot_state');
        const logsData = localStorage.getItem('amr_logs_state');
        
        if (robotData) {
          const parsedRobotData = JSON.parse(robotData);
          setRobotState(parsedRobotData);
        }
        
        if (logsData) {
          const parsedLogsData = JSON.parse(logsData);
          setLogs(parsedLogsData.logs || []);
        }
      } catch (error) {
        console.log('讀取本地數據失敗:', error);
      }
    }, 1000);

    // 清理函數
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(checkInterval);
    };
  }, []);

  const getBatteryColor = () => {
    if (robotState.battery > 60) return 'text-green-400';
    if (robotState.battery > 30) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getStatusColor = () => {
    if (robotState.status.includes('移動') || robotState.status.includes('導航') || robotState.status.includes('巡邏')) return 'text-blue-400';
    if (robotState.status.includes('已到達') || robotState.status.includes('已連接')) return 'text-green-400';
    if (robotState.status.includes('停止') || robotState.status.includes('錯誤')) return 'text-red-400';
    if (robotState.status.includes('建圖')) return 'text-purple-400';
    return 'text-gray-400';
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '未知';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6 overflow-hidden">
      <div className="h-full max-w-6xl mx-auto flex flex-col">
        {/* 標題 */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-white mb-2">AMR 系統監控</h1>
          <p className="text-gray-300">即時狀態監控 · 系統日誌</p>
        </div>

        {/* 連接狀態指示器 */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 mb-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {robotState.connected ? (
                <Wifi className="w-6 h-6 text-green-400" />
              ) : (
                <WifiOff className="w-6 h-6 text-red-400" />
              )}
              <span className="text-white font-medium">
                {robotState.connected ? 'ROS 已連接' : 'ROS 未連接'}
              </span>
            </div>
            <div className="text-sm text-gray-300">
              最後更新: {formatTimestamp(robotState.timestamp)}
            </div>
          </div>
        </div>

        {/* 主要監控區域 */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
          {/* 機器人資訊 */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-2">
              <Activity className="w-6 h-6" />
              機器人資訊
            </h2>
            
            {/* 狀態卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-black/20 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <Activity className={`w-8 h-8 ${getStatusColor()}`} />
                  <div>
                    <p className="text-sm text-gray-300">系統狀態</p>
                    <p className={`font-bold text-lg ${getStatusColor()}`}>{robotState.status}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-black/20 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <Battery className={`w-8 h-8 ${getBatteryColor()}`} />
                  <div>
                    <p className="text-sm text-gray-300">電池電量</p>
                    <p className={`font-bold text-lg ${getBatteryColor()}`}>
                      {robotState.battery.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 詳細資訊 */}
            <div className="space-y-4">
              <div className="bg-black/20 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-purple-400" />
                  位置資訊
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-300">位置 X</p>
                    <p className="font-mono text-xl text-white">{robotState.pose.x} m</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-300">位置 Y</p>
                    <p className="font-mono text-xl text-white">{robotState.pose.y} m</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-300">方向角</p>
                    <p className="font-mono text-xl text-white">{robotState.pose.theta}°</p>
                  </div>
                </div>
              </div>

              <div className="bg-black/20 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <RotateCw className="w-5 h-5 text-orange-400" />
                  速度資訊
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-300">線速度</p>
                    <p className="font-mono text-xl text-white">{robotState.velocities.linear} m/s</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-300">角速度</p>
                    <p className="font-mono text-xl text-white">{robotState.velocities.angular} rad/s</p>
                  </div>
                </div>
              </div>

              {/* 電池狀態條 */}
              <div className="bg-black/20 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-white mb-3">電池狀態</h3>
                <div className="w-full bg-gray-700 rounded-full h-4 mb-2">
                  <div 
                    className={`h-4 rounded-full transition-all duration-500 ${
                      robotState.battery > 60 ? 'bg-green-500' :
                      robotState.battery > 30 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, robotState.battery))}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-300">0%</span>
                  <span className={getBatteryColor()}>{robotState.battery.toFixed(1)}%</span>
                  <span className="text-gray-300">100%</span>
                </div>
              </div>
            </div>
          </div>

          {/* 系統日誌 */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 flex flex-col min-h-0">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-2">
              <Clock className="w-6 h-6" />
              系統日誌
            </h2>
            
            <div className="flex-1 bg-black/20 rounded-xl p-4 overflow-hidden">
              <div className="h-full overflow-y-auto space-y-3">
                {logs.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>等待日誌數據...</p>
                    <p className="text-sm mt-2">請確保主控制頁面已開啟</p>
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-all">
                      <span className="text-gray-400 font-mono text-xs whitespace-nowrap mt-1">
                        {log.time}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {log.type === 'success' && <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />}
                        {log.type === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />}
                        {log.type === 'info' && <Zap className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                        {log.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                      </div>
                      <span className="text-gray-200 text-sm flex-1 leading-relaxed">
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {/* 日誌統計 */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-sm text-gray-300">總計</p>
                  <p className="text-lg font-bold text-white">{logs.length}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-300">成功</p>
                  <p className="text-lg font-bold text-green-400">
                    {logs.filter(log => log.type === 'success').length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-300">警告</p>
                  <p className="text-lg font-bold text-yellow-400">
                    {logs.filter(log => log.type === 'warning').length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-300">錯誤</p>
                  <p className="text-lg font-bold text-red-400">
                    {logs.filter(log => log.type === 'error').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作區 */}
        <div className="mt-6 bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${robotState.connected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></div>
                <span className="text-white text-sm">
                  {robotState.connected ? '系統正常運行' : '等待連接'}
                </span>
              </div>
              <div className="text-gray-300 text-sm">
                監控頁面 · 即時更新
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setLogs([]);
                  localStorage.removeItem('amr_logs_state');
                }}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-all border border-red-500/30"
              >
                清除日誌
              </button>
              <button
                onClick={() => window.close()}
                className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 rounded-lg text-sm transition-all border border-gray-500/30"
              >
                關閉視窗
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AMRMonitorPage;