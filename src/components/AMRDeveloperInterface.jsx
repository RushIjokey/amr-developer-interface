import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Square, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight,
  Battery,
  Camera,
  MapPin,
  Activity,
  Map,
  Home,
  Play,
  Pause,
  RotateCw,
  RotateCcw,
  Wifi,
  WifiOff,
  Trash2
} from 'lucide-react';

// 從全局變量獲取 ROSLIB
const ROSLIB = window.ROSLIB || (() => {
  console.warn('ROSLIB 未加載，使用模擬模式');
  return {
    Ros: class {
      constructor() {
        this.isConnected = false;
      }
      connect() {
        console.log('模擬 ROS 連接');
        setTimeout(() => {
          this.isConnected = true;
          if (this.onConnection) this.onConnection();
        }, 1000);
      }
      close() {
        this.isConnected = false;
      }
      on() {}
    },
    Topic: class {
      publish() {}
      subscribe() {}
    },
    Service: class {
      callService() {}
    },
    Message: class {
      constructor(data) {
        Object.assign(this, data);
      }
    }
  };
})();

const TurtleBotInterface = () => {
  // ROS 連接狀態
  const [rosConnected, setRosConnected] = useState(false);
  const [rosUrl, setRosUrl] = useState('ws://127.0.0.1:9090');
  
  // 機器人狀態
  const [robotStatus, setRobotStatus] = useState('未連接');
  const [batteryLevel, setBatteryLevel] = useState(85);
  const [currentPose, setCurrentPose] = useState({ x: 0, y: 0, theta: 0 });
  const [linearVel, setLinearVel] = useState(0);
  const [angularVel, setAngularVel] = useState(0);
  const [speed, setSpeed] = useState(0.2);
  const [angularSpeed, setAngularSpeed] = useState(0.5);
  
  // 地圖和導航
  const [currentMode, setCurrentMode] = useState('teleop');
  const [mapData, setMapData] = useState(null);
  const [stations, setStations] = useState([
    { id: 1, name: '充電站', x: 50, y: 50, type: 'charging', color: 'bg-green-500' },
    { id: 2, name: '工作站A', x: 300, y: 80, type: 'work', color: 'bg-blue-500' },
    { id: 3, name: '工作站B', x: 350, y: 200, type: 'work', color: 'bg-blue-500' }
  ]);
  const [waypoints, setWaypoints] = useState([
    { id: 1, x: 100, y: 75, order: 1 },
    { id: 2, x: 250, y: 120, order: 2 },
    { id: 3, x: 320, y: 180, order: 3 }
  ]);
  const [goalPose, setGoalPose] = useState(null);
  const [isMappingActive, setIsMappingActive] = useState(false);
  const [isPatrolling, setIsPatrolling] = useState(false);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);
  
  // 地圖縮放和拖拽狀態
  const [mapZoom, setMapZoom] = useState(1.0);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [newStationName, setNewStationName] = useState('');
  
  // UI 狀態
  const [logs, setLogs] = useState([
    { time: new Date().toLocaleTimeString(), type: 'info', message: 'TurtleBot3 界面啟動' }
  ]);
  
  const mapCanvasRef = useRef(null);
  const cmdVelRef = useRef(null);
  const mapSubRef = useRef(null);
  const odomSubRef = useRef(null);
  const rosRef = useRef(null);

  const addLog = useCallback((type, message) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-9), { time, type, message }]);
    
    // 同時廣播到其他窗口
    try {
      localStorage.setItem('amr_log_broadcast', JSON.stringify({
        time, type, message, timestamp: Date.now()
      }));
    } catch (e) {
      console.log('無法廣播日誌');
    }
  }, []);

  // 廣播機器人狀態到其他窗口
  const broadcastRobotState = useCallback(() => {
    try {
      const robotState = {
        pose: currentPose,
        battery: batteryLevel,
        status: robotStatus,
        velocities: { linear: linearVel, angular: angularVel },
        connected: rosConnected,
        timestamp: Date.now()
      };
      localStorage.setItem('amr_robot_state', JSON.stringify(robotState));
    } catch (e) {
      console.log('無法廣播機器人狀態');
    }
  }, [currentPose, batteryLevel, robotStatus, linearVel, angularVel, rosConnected]);

  // 廣播日誌到其他窗口
  const broadcastLogs = useCallback(() => {
    try {
      localStorage.setItem('amr_logs_state', JSON.stringify({
        logs: logs,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.log('無法廣播日誌狀態');
    }
  }, [logs]);

  // 當狀態變化時廣播
  useEffect(() => {
    broadcastRobotState();
  }, [broadcastRobotState]);

  useEffect(() => {
    broadcastLogs();
  }, [broadcastLogs]);

  // 繪製地圖
  const drawMap = useCallback((mapMessage) => {
    const canvas = mapCanvasRef.current;
    if (!canvas || !mapMessage) return;

    const ctx = canvas.getContext('2d');
    const { width, height, resolution, origin } = mapMessage.info;
    const { data } = mapMessage;
    
    if (!data || data.length === 0) return;

    const displayWidth = canvas.clientWidth || 800;
    const displayHeight = canvas.clientHeight || 400;
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    
    ctx.fillStyle = '#374151';
    ctx.fillRect(0, 0, displayWidth, displayHeight);
    
    const baseScaleX = displayWidth / width;
    const baseScaleY = displayHeight / height;
    const baseScale = Math.min(baseScaleX, baseScaleY) * 0.8;
    const finalScale = baseScale * mapZoom;
    
    const centerX = displayWidth / 2;
    const centerY = displayHeight / 2;
    const offsetX = centerX - (width * finalScale) / 2 + mapOffset.x;
    const offsetY = centerY - (height * finalScale) / 2 + mapOffset.y;
    
    // 繪製地圖數據
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const dataIndex = y * width + x;
        const value = data[dataIndex];
        
        if (value === -1) continue;
        
        let color;
        if (value >= 0 && value < 25) {
          color = '#ffffff';
        } else if (value >= 65) {
          color = '#000000';
        } else {
          color = '#d1d5db';
        }
        
        const pixelX = offsetX + x * finalScale;
        const pixelY = offsetY + y * finalScale;
        
        if (pixelX >= 0 && pixelX < displayWidth && pixelY >= 0 && pixelY < displayHeight) {
          ctx.fillStyle = color;
          ctx.fillRect(pixelX, pixelY, Math.ceil(finalScale * 2), Math.ceil(finalScale * 2));
        }
      }
    }
    
    // 繪製站點
    stations.forEach(station => {
      const stationX = offsetX + station.x * finalScale;
      const stationY = offsetY + station.y * finalScale;
      
      ctx.fillStyle = station.type === 'charging' ? '#22c55e' : '#3b82f6';
      ctx.beginPath();
      ctx.arc(stationX, stationY, 8 * mapZoom, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // 繪製航點和路徑
    if (waypoints.length > 1) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      
      for (let i = 0; i < waypoints.length; i++) {
        const current = waypoints[i];
        const next = waypoints[(i + 1) % waypoints.length];
        
        const currentX = offsetX + current.x * finalScale;
        const currentY = offsetY + current.y * finalScale;
        const nextX = offsetX + next.x * finalScale;
        const nextY = offsetY + next.y * finalScale;
        
        ctx.beginPath();
        ctx.moveTo(currentX, currentY);
        ctx.lineTo(nextX, nextY);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    
    waypoints.forEach((waypoint, index) => {
      const wpX = offsetX + waypoint.x * finalScale;
      const wpY = offsetY + waypoint.y * finalScale;
      
      ctx.fillStyle = index === currentWaypointIndex && isPatrolling ? '#fbbf24' : '#10b981';
      ctx.beginPath();
      ctx.arc(wpX, wpY, 6 * mapZoom, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.font = `${10 * mapZoom}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText(waypoint.order.toString(), wpX, wpY + 3);
    });
    
    // 繪製機器人
    if (currentPose && currentPose.x !== undefined) {
      const robotWorldX = parseFloat(currentPose.x);
      const robotWorldY = parseFloat(currentPose.y);
      
      const robotMapX = (robotWorldX - origin.position.x) / resolution;
      const robotMapY = height - (robotWorldY - origin.position.y) / resolution;
      
      const robotDisplayX = offsetX + robotMapX * finalScale;
      const robotDisplayY = offsetY + robotMapY * finalScale;
      
      if (robotDisplayX >= -50 && robotDisplayX <= displayWidth + 50 && 
          robotDisplayY >= -50 && robotDisplayY <= displayHeight + 50) {
        
        ctx.fillStyle = '#3b82f6';
        ctx.strokeStyle = '#1e40af';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(robotDisplayX, robotDisplayY, 8 * mapZoom, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        
        const theta = parseFloat(currentPose.theta) * Math.PI / 180;
        const arrowLength = 20 * mapZoom;
        const arrowX = robotDisplayX + Math.cos(theta) * arrowLength;
        const arrowY = robotDisplayY - Math.sin(theta) * arrowLength;
        
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(robotDisplayX, robotDisplayY);
        ctx.lineTo(arrowX, arrowY);
        ctx.stroke();
        
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(robotDisplayX, robotDisplayY, 40 * mapZoom, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    
    // 繪製目標位置
    if (goalPose) {
      const goalMapX = (goalPose.x - origin.position.x) / resolution;
      const goalMapY = height - (goalPose.y - origin.position.y) / resolution;
      
      const goalDisplayX = offsetX + goalMapX * finalScale;
      const goalDisplayY = offsetY + goalMapY * finalScale;
      
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(goalDisplayX, goalDisplayY, 6 * mapZoom, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [currentPose, goalPose, mapZoom, mapOffset, stations, waypoints, currentWaypointIndex, isPatrolling]);

  // ROS 設定
  const setupRosTopics = useCallback((rosInstance) => {
    try {
      cmdVelRef.current = new ROSLIB.Topic({
        ros: rosInstance,
        name: '/cmd_vel',
        messageType: 'geometry_msgs/Twist'
      });

      odomSubRef.current = new ROSLIB.Topic({
        ros: rosInstance,
        name: '/odom',
        messageType: 'nav_msgs/Odometry'
      });

      odomSubRef.current.subscribe((message) => {
        const { position, orientation } = message.pose.pose;
        const { linear, angular } = message.twist.twist;
        
        const theta = 2 * Math.atan2(orientation.z, orientation.w);
        
        setCurrentPose({
          x: parseFloat(position.x.toFixed(3)),
          y: parseFloat(position.y.toFixed(3)),
          theta: (theta * 180 / Math.PI).toFixed(1)
        });
        
        setLinearVel(linear.x.toFixed(2));
        setAngularVel(angular.z.toFixed(2));
      });

      mapSubRef.current = new ROSLIB.Topic({
        ros: rosInstance,
        name: '/map',
        messageType: 'nav_msgs/OccupancyGrid'
      });

      addLog('info', '正在訂閱地圖話題 /map...');
      
      mapSubRef.current.subscribe((message) => {
        console.log('🗺️ 收到地圖數據!', {
          width: message.info.width,
          height: message.info.height,
          resolution: message.info.resolution,
          dataLength: message.data ? message.data.length : 0
        });
        
        if (message.data && message.data.length > 0) {
          setMapData(message);
          setTimeout(() => drawMap(message), 100);
          addLog('success', `地圖更新: ${message.info.width}x${message.info.height}`);
        }
      });

      const batterySimulation = setInterval(() => {
        setBatteryLevel(prev => Math.max(20, prev - 0.1));
      }, 10000);

      rosInstance.batterySimulation = batterySimulation;
      addLog('success', 'ROS 話題設置完成');
    } catch (error) {
      addLog('error', `話題設置失敗: ${error.message}`);
    }
  }, [addLog, drawMap]);

  // ROS 初始化 - 修復無限循環問題
  useEffect(() => {
    if (window.ROSLIB) {
      addLog('success', 'ROSLIB 已成功加載');
      console.log('✅ ROSLIB 已成功加載');
    } else {
      addLog('warning', 'ROSLIB 未加載，使用模擬模式');
      console.log('❌ ROSLIB 未加載');
      return; // 如果沒有 ROSLIB 就不繼續
    }
    
    let reconnectTimer = null;
    let connectionAttempted = false; // 防止重複連接
    
    const initAndSetupROS = () => {
      if (connectionAttempted) {
        console.log('⚠️ 已嘗試過連接，跳過重複嘗試');
        return;
      }
      
      try {
        connectionAttempted = true;
        console.log('🔄 開始初始化 ROS 連接...');
        
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        
        if (rosRef.current) {
          try {
            rosRef.current.close();
            console.log('🔒 關閉舊連接');
          } catch (e) {
            console.log('關閉舊連接時發生錯誤:', e);
          }
        }
        
        console.log('🌐 創建新的 ROS 實例:', rosUrl);
        const rosInstance = new ROSLIB.Ros({ 
          url: rosUrl
        });

        // 設置連接超時
        const timeoutId = setTimeout(() => {
          console.log('⏰ 連接超時 (10秒)');
          setRosConnected(false);
          setRobotStatus('連接超時');
          addLog('error', '連接超時，請檢查 rosbridge 是否運行');
          connectionAttempted = false; // 允許重新嘗試
        }, 10000);

        // 設置事件監聽器
        rosInstance.on('connection', function() {
          clearTimeout(timeoutId);
          console.log('✅ ROS 連接成功!');
          setRosConnected(true);
          setRobotStatus('已連接');
          addLog('success', 'ROS 連接成功');
          
          setTimeout(() => {
            console.log('🔧 開始設置 ROS 話題...');
            setupRosTopics(rosInstance);
          }, 1000);
        });

        rosInstance.on('error', function(error) {
          clearTimeout(timeoutId);
          console.error('❌ ROS 連接錯誤:', error);
          setRosConnected(false);
          setRobotStatus('連接錯誤');
          addLog('error', 'ROS 連接錯誤');
          connectionAttempted = false; // 允許重新嘗試
        });

        rosInstance.on('close', function() {
          clearTimeout(timeoutId);
          console.log('⚠️ ROS 連接關閉');
          setRosConnected(false);
          setRobotStatus('連接斷開');
          addLog('warning', 'ROS 連接斷開');
          connectionAttempted = false; // 允許重新嘗試
        });

        console.log('🔌 開始嘗試連接...');
        rosRef.current = rosInstance;
        console.log('📝 ROS 實例已保存到 ref');
        
      } catch (error) {
        console.error('💥 初始化失敗:', error);
        addLog('error', `初始化失敗: ${error.message}`);
        connectionAttempted = false; // 允許重新嘗試
      }
    };

    console.log('🚀 啟動 ROS 初始化...');
    initAndSetupROS();
    
    return () => {
      console.log('🧹 清理 ROS 連接...');
      connectionAttempted = true; // 防止清理後再次嘗試
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (rosRef.current) {
        try {
          rosRef.current.close();
        } catch (e) {
          console.log('清理連接時發生錯誤:', e);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 故意忽略依賴，只在組件首次載入時執行

  // 控制函數
  const publishCmdVel = useCallback((linear, angular) => {
    if (!rosConnected || !cmdVelRef.current) return;

    const twist = new ROSLIB.Message({
      linear: { x: linear, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: angular }
    });

    cmdVelRef.current.publish(twist);
  }, [rosConnected]);

  const stopRobot = useCallback(() => {
    publishCmdVel(0, 0);
    setIsPatrolling(false);
    addLog('warning', '機器人停止');
  }, [publishCmdVel, addLog]);

  const moveRobot = useCallback((direction) => {
    if (!rosConnected) {
      addLog('error', '請先連接 ROS');
      return;
    }

    let linear = 0, angular = 0;

    switch (direction) {
      case 'forward':
        linear = speed;
        break;
      case 'backward':
        linear = -speed;
        break;
      case 'left':
        angular = angularSpeed;
        break;
      case 'right':
        angular = -angularSpeed;
        break;
      case 'rotate_left':
        angular = angularSpeed;
        break;
      case 'rotate_right':
        angular = -angularSpeed;
        break;
      default:
        break;
    }

    publishCmdVel(linear, angular);
    addLog('info', `移動指令: 線速度=${linear.toFixed(2)}, 角速度=${angular.toFixed(2)}`);
  }, [rosConnected, speed, angularSpeed, publishCmdVel, addLog]);

  // 地圖交互
  const handleMapWheel = (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.5, Math.min(5.0, mapZoom * delta));
    setMapZoom(newZoom);
    
    if (mapData) setTimeout(() => drawMap(mapData), 10);
  };

  const handleMapMouseDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
    setLastMousePos({ x: event.clientX, y: event.clientY });
  };

  const handleMapMouseMove = (event) => {
    if (!isDragging) return;
    
    const deltaX = event.clientX - lastMousePos.x;
    const deltaY = event.clientY - lastMousePos.y;
    
    setMapOffset(prev => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }));
    
    setLastMousePos({ x: event.clientX, y: event.clientY });
    
    if (mapData) drawMap(mapData);
  };

  const handleMapMouseUp = () => {
    setIsDragging(false);
  };

  const resetMapView = () => {
    setMapZoom(1.0);
    setMapOffset({ x: 0, y: 0 });
    if (mapData) setTimeout(() => drawMap(mapData), 10);
  };

  // 地圖點擊處理
  const handleMapClick = (event) => {
    if (!mapData) return;

    const canvas = mapCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (currentMode === 'mapping') {
      if (newStationName.trim()) {
        const newStation = {
          id: Date.now(),
          name: newStationName,
          x: x,
          y: y,
          type: 'work',
          color: 'bg-blue-500'
        };
        setStations(prev => [...prev, newStation]);
        setNewStationName('');
        addLog('success', `新增站點: ${newStation.name}`);
      }
    } else if (currentMode === 'waypoints') {
      const newWaypoint = {
        id: Date.now(),
        x: x,
        y: y,
        order: waypoints.length + 1
      };
      setWaypoints(prev => [...prev, newWaypoint]);
      addLog('success', `新增航點 ${newWaypoint.order}`);
    } else if (currentMode === 'navigation') {
      const worldX = x * mapData.info.resolution + mapData.info.origin.position.x;
      const worldY = (canvas.height - y) * mapData.info.resolution + mapData.info.origin.position.y;
      setGoalPose({ x: worldX, y: worldY });
      addLog('info', `設置導航目標: (${worldX.toFixed(2)}, ${worldY.toFixed(2)})`);
    }
  };

  const initROS = () => {
    console.log('👆 用戶手動重新連接，URL:', rosUrl);
    addLog('info', `嘗試連接到: ${rosUrl}`);
    
    // 重置連接狀態
    setRosConnected(false);
    setRobotStatus('正在連接...');
    
    // 關閉現有連接
    if (rosRef.current) {
      try {
        rosRef.current.close();
        console.log('🔒 關閉現有連接');
      } catch (e) {
        console.log('關閉現有連接時發生錯誤:', e);
      }
    }
    
    // 首先測試簡單的 WebSocket 連接
    console.log('🧪 測試基本 WebSocket 連接...');
    const testWS = new WebSocket(rosUrl);
    
    const testTimeout = setTimeout(() => {
      console.log('❌ WebSocket 基本測試超時');
      addLog('error', 'WebSocket 基本連接測試失敗');
      testWS.close();
      setRobotStatus('WebSocket 測試失敗');
    }, 5000);
    
    testWS.onopen = function() {
      clearTimeout(testTimeout);
      console.log('✅ WebSocket 基本測試成功！');
      addLog('success', 'WebSocket 基本連接成功');
      testWS.close();
      
      // 基本測試成功，現在嘗試 ROS 連接
      attemptROSConnection();
    };
    
    testWS.onerror = function(error) {
      clearTimeout(testTimeout);
      console.error('❌ WebSocket 基本測試失敗:', error);
      addLog('error', 'WebSocket 基本連接失敗 - 請檢查 rosbridge');
      setRobotStatus('WebSocket 連接失敗');
    };
    
    const attemptROSConnection = () => {
      try {
        console.log('🔄 開始 ROS 連接嘗試...');
        setRobotStatus('建立 ROS 連接...');
        
        const rosInstance = new ROSLIB.Ros({ 
          url: rosUrl
        });

        const rosTimeout = setTimeout(() => {
          console.log('⏰ ROS 連接超時');
          setRosConnected(false);
          setRobotStatus('ROS 連接超時');
          addLog('error', 'ROS 連接超時 - 請檢查 rosbridge 和 roscore');
        }, 15000); // 增加到 15 秒

        rosInstance.on('connection', function() {
          clearTimeout(rosTimeout);
          console.log('✅ ROS 連接成功!');
          console.log('🔧 ROS 實例狀態:', rosInstance.isConnected);
          setRosConnected(true);
          setRobotStatus('已連接');
          addLog('success', 'ROS 連接成功');
          
          // 立即嘗試設置話題
          setTimeout(() => {
            console.log('🔧 設置 ROS 話題...');
            setupRosTopics(rosInstance);
          }, 500);
        });

        rosInstance.on('error', function(error) {
          clearTimeout(rosTimeout);
          console.error('❌ ROS 連接錯誤:', error);
          console.log('錯誤類型:', typeof error);
          console.log('錯誤內容:', error.toString());
          setRosConnected(false);
          setRobotStatus('ROS 連接錯誤');
          addLog('error', `ROS 連接錯誤: ${error.toString()}`);
        });

        rosInstance.on('close', function() {
          clearTimeout(rosTimeout);
          console.log('⚠️ ROS 連接關閉');
          setRosConnected(false);
          setRobotStatus('連接斷開');
          addLog('warning', 'ROS 連接已斷開');
        });

        // 添加調試信息
        console.log('📊 監聽事件已設置');
        console.log('🔗 ROS 實例已創建:', !!rosInstance);
        
        // 嘗試手動檢查連接狀態
        setTimeout(() => {
          console.log('🕐 5秒後檢查連接狀態...');
          console.log('連接狀態:', rosInstance.isConnected);
          if (rosInstance.isConnected) {
            console.log('✅ 連接確實成功，手動觸發成功事件');
            clearTimeout(rosTimeout);
            setRosConnected(true);
            setRobotStatus('已連接');
            addLog('success', 'ROS 連接確認成功');
            setupRosTopics(rosInstance);
          }
        }, 5000);

        rosRef.current = rosInstance;
        
      } catch (error) {
        console.error('💥 ROS 連接異常:', error);
        setRosConnected(false);
        setRobotStatus('連接異常');
        addLog('error', `ROS 連接異常: ${error.message}`);
      }
    };
  };

  const getBatteryColor = () => {
    if (batteryLevel > 60) return 'text-green-400';
    if (batteryLevel > 30) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getStatusColor = () => {
    if (robotStatus.includes('移動') || robotStatus.includes('導航') || robotStatus.includes('巡邏')) return 'text-blue-400';
    if (robotStatus.includes('已到達') || robotStatus.includes('已連接')) return 'text-green-400';
    if (robotStatus.includes('停止') || robotStatus.includes('錯誤')) return 'text-red-400';
    if (robotStatus.includes('建圖')) return 'text-purple-400';
    return 'text-gray-400';
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6 overflow-hidden">
      <div className="h-full max-w-7xl mx-auto flex flex-col">
        {/* 標題 */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-white mb-2">AMR 智能導航系統</h1>
          <p className="text-gray-300">建圖 · 導航 · 巡邏控制台</p>
        </div>

        {/* ROS 連接設定 */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 mb-6 border border-white/20">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">ROS Bridge URL</label>
              <input
                type="text"
                value={rosUrl}
                onChange={(e) => setRosUrl(e.target.value)}
                className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-400"
                placeholder="ws://localhost:9090"
              />
            </div>
            <button
              onClick={initROS}
              disabled={rosConnected}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded-lg transition-all"
            >
              {rosConnected ? '已連接' : '連接 ROS'}
            </button>
            <button
              onClick={() => window.open('/monitor', '_blank')}
              className="px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-all"
            >
              開啟監控頁面
            </button>
          </div>
        </div>

        {/* 模式切換 */}
        <div className="flex justify-center gap-2 mb-6">
          <button
            onClick={() => setCurrentMode('teleop')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              currentMode === 'teleop' ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-300'
            }`}
          >
            遙控模式
          </button>
          <button
            onClick={() => setCurrentMode('mapping')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              currentMode === 'mapping' ? 'bg-purple-500 text-white' : 'bg-white/10 text-gray-300'
            }`}
          >
            建圖模式
          </button>
          <button
            onClick={() => setCurrentMode('waypoints')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              currentMode === 'waypoints' ? 'bg-green-500 text-white' : 'bg-white/10 text-gray-300'
            }`}
          >
            航點模式
          </button>
          <button
            onClick={() => setCurrentMode('navigation')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              currentMode === 'navigation' ? 'bg-orange-500 text-white' : 'bg-white/10 text-gray-300'
            }`}
          >
            導航模式
          </button>
        </div>

        {/* 狀態概覽 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-3">
              {rosConnected ? <Wifi className="w-8 h-8 text-green-400" /> : <WifiOff className="w-8 h-8 text-red-400" />}
              <div>
                <p className="text-sm text-gray-300">ROS 狀態</p>
                <p className={`font-semibold ${getStatusColor()}`}>{robotStatus}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-3">
              <Battery className={`w-8 h-8 ${getBatteryColor()}`} />
              <div>
                <p className="text-sm text-gray-300">電量</p>
                <p className={`font-semibold ${getBatteryColor()}`}>{batteryLevel.toFixed(1)}%</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-3">
              <MapPin className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-sm text-gray-300">位置</p>
                <p className="font-semibold text-purple-400">
                  ({currentPose.x}, {currentPose.y})
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-3">
              <Activity className="w-8 h-8 text-orange-400" />
              <div>
                <p className="text-sm text-gray-300">航點數量</p>
                <p className="font-semibold text-orange-400">{waypoints.length} 個</p>
              </div>
            </div>
          </div>
        </div>

        {/* 主要內容區域 */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
          {/* 地圖區域 */}
          <div className="lg:col-span-2 flex flex-col min-h-0">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 flex-1 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Map className="w-5 h-5" />
                  智能地圖
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={resetMapView}
                    className="px-3 py-1 bg-blue-500/80 hover:bg-blue-600/80 text-white rounded text-sm transition-all"
                    title="重置視圖"
                  >
                    🔄 重置
                  </button>
                  <div className="px-3 py-1 bg-black/60 text-white rounded text-sm">
                    {(mapZoom * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              
              <div className="flex-1 bg-black/30 rounded-lg p-4 relative min-h-0">
                <canvas
                  ref={mapCanvasRef}
                  onClick={handleMapClick}
                  onWheel={handleMapWheel}
                  onMouseDown={handleMapMouseDown}
                  onMouseMove={handleMapMouseMove}
                  onMouseUp={handleMapMouseUp}
                  onMouseLeave={handleMapMouseUp}
                  className="w-full h-full bg-gray-800 rounded cursor-move select-none"
                  style={{ touchAction: 'none' }}
                />
                
                {!mapData && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-gray-400 text-center">
                      <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-lg mb-2">等待地圖數據...</p>
                      <p className="text-sm">請確保 SLAM 節點正在運行</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-between text-xs text-gray-400 mt-2">
                <span>🔵 機器人 🔴 目標 🟢 航點 🏠 充電站 🚩 工作站</span>
                <span>滾輪縮放 · 拖拽移動</span>
              </div>
            </div>
          </div>

          {/* 控制面板 */}
          <div className="space-y-6 overflow-y-auto">
            {/* 遙控模式 */}
            {currentMode === 'teleop' && (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4">鍵盤控制</h2>
                
                <div className="grid grid-cols-3 gap-2 max-w-48 mx-auto mb-4">
                  <div></div>
                  <button 
                    onMouseDown={() => moveRobot('forward')}
                    onMouseUp={stopRobot}
                    disabled={!rosConnected}
                    className="p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded-lg transition-all"
                  >
                    <ArrowUp className="w-6 h-6 mx-auto" />
                  </button>
                  <div></div>
                  
                  <button 
                    onMouseDown={() => moveRobot('left')}
                    onMouseUp={stopRobot}
                    disabled={!rosConnected}
                    className="p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded-lg transition-all"
                  >
                    <ArrowLeft className="w-6 h-6 mx-auto" />
                  </button>
                  <button 
                    onClick={stopRobot}
                    className="p-3 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
                  >
                    <Square className="w-6 h-6 mx-auto" />
                  </button>
                  <button 
                    onMouseDown={() => moveRobot('right')}
                    onMouseUp={stopRobot}
                    disabled={!rosConnected}
                    className="p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded-lg transition-all"
                  >
                    <ArrowRight className="w-6 h-6 mx-auto" />
                  </button>
                  
                  <div></div>
                  <button 
                    onMouseDown={() => moveRobot('backward')}
                    onMouseUp={stopRobot}
                    disabled={!rosConnected}
                    className="p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded-lg transition-all"
                  >
                    <ArrowDown className="w-6 h-6 mx-auto" />
                  </button>
                  <div></div>
                </div>
                
                <div className="flex gap-2 mb-4">
                  <button 
                    onMouseDown={() => moveRobot('rotate_left')}
                    onMouseUp={stopRobot}
                    disabled={!rosConnected}
                    className="flex-1 flex items-center justify-center gap-2 p-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white rounded-lg text-sm transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    左轉
                  </button>
                  <button 
                    onMouseDown={() => moveRobot('rotate_right')}
                    onMouseUp={stopRobot}
                    disabled={!rosConnected}
                    className="flex-1 flex items-center justify-center gap-2 p-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white rounded-lg text-sm transition-all"
                  >
                    <RotateCw className="w-4 h-4" />
                    右轉
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      線速度: {speed.toFixed(1)} m/s
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.1"
                      value={speed}
                      onChange={(e) => setSpeed(parseFloat(e.target.value))}
                      className="w-full h-2 bg-white/20 rounded-lg appearance-none"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      角速度: {angularSpeed.toFixed(1)} rad/s
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.1"
                      value={angularSpeed}
                      onChange={(e) => setAngularSpeed(parseFloat(e.target.value))}
                      className="w-full h-2 bg-white/20 rounded-lg appearance-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 建圖模式 */}
            {currentMode === 'mapping' && (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4">建圖工具</h2>
                
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="輸入站點名稱"
                    value={newStationName}
                    onChange={(e) => setNewStationName(e.target.value)}
                    className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-sm text-gray-300">點擊地圖新增站點</p>
                  
                  <button
                    onClick={() => setIsMappingActive(!isMappingActive)}
                    disabled={!rosConnected}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 ${
                      isMappingActive ? 'bg-red-500 hover:bg-red-600' : 'bg-purple-500 hover:bg-purple-600'
                    } disabled:bg-gray-600 text-white rounded-lg font-medium transition-all`}
                  >
                    <Map className="w-5 h-5" />
                    {isMappingActive ? '停止建圖' : '開始建圖'}
                  </button>
                </div>
              </div>
            )}

            {/* 航點模式 */}
            {currentMode === 'waypoints' && (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4">航點管理</h2>
                
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      if (waypoints.length === 0) {
                        addLog('error', '沒有設定航點，無法開始巡邏');
                        return;
                      }
                      setIsPatrolling(!isPatrolling);
                      if (!isPatrolling) {
                        setCurrentWaypointIndex(0);
                        addLog('info', '開始自動巡邏');
                      } else {
                        addLog('info', '停止巡邏');
                      }
                    }}
                    disabled={waypoints.length === 0 || !rosConnected}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white rounded-lg font-medium transition-all"
                  >
                    {isPatrolling ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    {isPatrolling ? '停止巡邏' : '開始巡邏'}
                  </button>
                  <p className="text-sm text-gray-300">點擊地圖新增航點</p>
                </div>
              </div>
            )}

            {/* 導航模式 */}
            {currentMode === 'navigation' && (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4">自主導航</h2>
                
                <div className="space-y-4">
                  {goalPose && (
                    <div className="bg-black/20 rounded-lg p-3">
                      <p className="text-sm text-gray-300">目標位置:</p>
                      <p className="text-white">({goalPose.x.toFixed(2)}, {goalPose.y.toFixed(2)})</p>
                    </div>
                  )}
                  
                  <button
                    onClick={stopRobot}
                    disabled={!rosConnected}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 text-white rounded-lg font-medium transition-all"
                  >
                    <Square className="w-5 h-5" />
                    停止導航
                  </button>
                  
                  <p className="text-sm text-gray-300">
                    點擊地圖設置導航目標點
                  </p>
                </div>
              </div>
            )}

            {/* 站點列表 */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <h2 className="text-xl font-semibold text-white mb-4">站點管理</h2>
              
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {stations.map(station => (
                  <div key={station.id} className="flex items-center justify-between p-2 bg-white/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 ${station.color} rounded`}></div>
                      <span className="text-white text-sm">{station.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        disabled={!rosConnected}
                        className="p-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded text-xs transition-all"
                      >
                        前往
                      </button>
                      <button
                        onClick={() => setStations(prev => prev.filter(s => s.id !== station.id))}
                        className="p-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 快速動作 */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <h2 className="text-xl font-semibold text-white mb-4">快速動作</h2>
              
              <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={() => {
                    const chargingStation = stations.find(s => s.type === 'charging');
                    if (chargingStation) {
                      const worldX = chargingStation.x;
                      const worldY = chargingStation.y;
                      setGoalPose({ x: worldX, y: worldY });
                      addLog('info', '導航至充電站');
                    }
                  }}
                  disabled={!rosConnected || !stations.find(s => s.type === 'charging')}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white rounded-lg text-sm transition-all"
                >
                  <Home className="w-4 h-4" />
                  回充電站
                </button>
                <button 
                  onClick={stopRobot}
                  disabled={!rosConnected}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 text-white rounded-lg text-sm transition-all"
                >
                  <Square className="w-4 h-4" />
                  緊急停止
                </button>
                <button 
                  onClick={() => window.open('http://localhost:8080', '_blank')}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm transition-all"
                >
                  <Camera className="w-4 h-4" />
                  攝影機視圖
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TurtleBotInterface;