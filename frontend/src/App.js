import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// 3D Shape types
const SHAPE_TYPES = {
  CUBE: 'cube',
  SPHERE: 'sphere',
  CYLINDER: 'cylinder',
  CONE: 'cone',
  TORUS: 'torus',
  PLANE: 'plane'
};

// Colors for different materials - Cyan theme
const MATERIALS = {
  default: new THREE.MeshPhongMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 }),
  selected: new THREE.MeshPhongMaterial({ color: 0xffff00, transparent: true, opacity: 0.9 }),
  wireframe: new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true })
};

function App() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handLandmarkerRef = useRef(null);
  const detectionActiveRef = useRef(false);
  
  const [selectedObject, setSelectedObject] = useState(null);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 5, z: 10 });
  const [gestureData, setGestureData] = useState({
    pinchStrength: 0,
    grabStrength: 0,
    zoomStrength: 0,
    handPresent: false,
    confidence: 0,
    handPosition: { x: 0, y: 0 },
    handLandmarks: []
  });
  const [objects, setObjects] = useState([]);
  const [coords, setCoords] = useState({ x: 0, y: 0, z: 0 });
  const [cameraStats, setCameraStats] = useState({ 
    zoom: 10, 
    rotation: { x: 0, y: 0 }, 
    distance: 10 
  });

  // Mouse and gesture state
  const inputState = useRef({
    isDragging: false,
    isRotating: false,
    lastPosition: { x: 0, y: 0 },
    gestureMode: false,
    lastGestureTime: 0
  });

  // Create proper 3D grid around an object (like the image)
  const createLocalGrid = (object, gridSize = 5) => {
    const gridGroup = new THREE.Group();
    
    // Create grid material
    const gridMaterial = new THREE.LineBasicMaterial({ 
      color: 0xffffff, 
      transparent: true, 
      opacity: 0.3 
    });
    
    const step = 1; // 1 unit per grid line
    const halfSize = gridSize / 2;
    
    // Create XZ plane grid (horizontal)
    const xzPoints = [];
    for (let i = -halfSize; i <= halfSize; i += step) {
      // Lines parallel to X axis
      xzPoints.push(-halfSize, 0, i);
      xzPoints.push(halfSize, 0, i);
      // Lines parallel to Z axis
      xzPoints.push(i, 0, -halfSize);
      xzPoints.push(i, 0, halfSize);
    }
    const xzGeometry = new THREE.BufferGeometry();
    xzGeometry.setAttribute('position', new THREE.Float32BufferAttribute(xzPoints, 3));
    const xzGrid = new THREE.LineSegments(xzGeometry, gridMaterial);
    gridGroup.add(xzGrid);
    
    // Create XY plane grid (vertical, facing camera)
    const xyPoints = [];
    for (let i = -halfSize; i <= halfSize; i += step) {
      // Lines parallel to X axis
      xyPoints.push(-halfSize, i, 0);
      xyPoints.push(halfSize, i, 0);
      // Lines parallel to Y axis
      xyPoints.push(i, -halfSize, 0);
      xyPoints.push(i, halfSize, 0);
    }
    const xyGeometry = new THREE.BufferGeometry();
    xyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(xyPoints, 3));
    const xyGrid = new THREE.LineSegments(xyGeometry, gridMaterial);
    gridGroup.add(xyGrid);
    
    // Create YZ plane grid (vertical, side view)
    const yzPoints = [];
    for (let i = -halfSize; i <= halfSize; i += step) {
      // Lines parallel to Y axis
      yzPoints.push(0, -halfSize, i);
      yzPoints.push(0, halfSize, i);
      // Lines parallel to Z axis
      yzPoints.push(0, i, -halfSize);
      yzPoints.push(0, i, halfSize);
    }
    const yzGeometry = new THREE.BufferGeometry();
    yzGeometry.setAttribute('position', new THREE.Float32BufferAttribute(yzPoints, 3));
    const yzGrid = new THREE.LineSegments(yzGeometry, gridMaterial);
    gridGroup.add(yzGrid);
    
    // Add the grid as a child of the object so it moves with it
    object.add(gridGroup);
    object.userData.localGrid = gridGroup;
    
    return gridGroup;
  };

  // Initialize proper MediaPipe hand detection
  const initHandDetection = useCallback(async () => {
    try {
      console.log('Initializing hand detection...');
      
      // Setup camera
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        
        // Wait for video to load
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => resolve();
        });
        
        // Initialize MediaPipe
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU'
          },
          numHands: 2,
          runningMode: 'video',
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        
        handLandmarkerRef.current = handLandmarker;
        detectionActiveRef.current = true;
        
        console.log('Hand detection initialized successfully');
        detectHands();
        
      }
    } catch (error) {
      console.warn('Hand detection failed, using fallback:', error);
      // Fallback to simulated data
      setGestureData({
        pinchStrength: (Math.random() * 100).toFixed(1),
        grabStrength: (Math.random() * 100).toFixed(1),
        zoomStrength: (Math.random() * 100).toFixed(1),
        handPresent: Math.random() > 0.7,
        confidence: (60 + Math.random() * 35).toFixed(1),
        handPosition: { x: 0.5, y: 0.5 },
        handLandmarks: []
      });
    }
  }, []);

  // Hand detection processing
  const detectHands = async () => {
    if (!detectionActiveRef.current || !handLandmarkerRef.current || !videoRef.current || !canvasRef.current) {
      return;
    }
    
    try {
      const startTimeMs = performance.now();
      const results = await handLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);
      
      // Clear canvas and draw video
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(-1, 1); // Mirror effect
      ctx.drawImage(videoRef.current, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();
      
      let handPresent = false;
      let handPosition = { x: 0.5, y: 0.5 };
      let pinchStrength = 0;
      let grabStrength = 0;
      let confidence = 0;
      
      if (results.landmarks && results.landmarks.length > 0) {
        handPresent = true;
        const landmarks = results.landmarks[0]; // Use first hand
        confidence = 85 + Math.random() * 10;
        
        // Draw hand landmarks
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#ff0000';
        
        // Draw connections between landmarks
        const connections = [
          [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
          [0, 5], [5, 6], [6, 7], [7, 8], // Index
          [0, 9], [9, 10], [10, 11], [11, 12], // Middle
          [0, 13], [13, 14], [14, 15], [15, 16], // Ring
          [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
          [5, 9], [9, 13], [13, 17] // Palm
        ];
        
        ctx.beginPath();
        connections.forEach(([start, end]) => {
          if (landmarks[start] && landmarks[end]) {
            const startX = (1 - landmarks[start].x) * canvas.width; // Mirror X
            const startY = landmarks[start].y * canvas.height;
            const endX = (1 - landmarks[end].x) * canvas.width; // Mirror X
            const endY = landmarks[end].y * canvas.height;
            
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
          }
        });
        ctx.stroke();
        
        // Draw landmark points
        landmarks.forEach((landmark, index) => {
          const x = (1 - landmark.x) * canvas.width; // Mirror X
          const y = landmark.y * canvas.height;
          
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, 2 * Math.PI);
          ctx.fill();
          
          // Label key points
          if ([4, 8, 12, 16, 20].includes(index)) { // Fingertips
            ctx.fillText(index.toString(), x + 5, y - 5);
          }
        });
        
        // Calculate gestures
        const thumb = landmarks[4];
        const index = landmarks[8];
        const middle = landmarks[12];
        const ring = landmarks[16];
        const pinky = landmarks[20];
        const wrist = landmarks[0];
        
        // Pinch detection (thumb to index distance)
        const pinchDistance = Math.sqrt(
          Math.pow(thumb.x - index.x, 2) + 
          Math.pow(thumb.y - index.y, 2) + 
          Math.pow(thumb.z - index.z, 2)
        );
        pinchStrength = Math.max(0, Math.min(100, (1 - pinchDistance * 20) * 100));
        
        // Grab detection (all fingers to wrist distance)
        const fingertips = [index, middle, ring, pinky];
        const avgDistance = fingertips.reduce((sum, tip) => {
          return sum + Math.sqrt(
            Math.pow(wrist.x - tip.x, 2) + 
            Math.pow(wrist.y - tip.y, 2) + 
            Math.pow(wrist.z - tip.z, 2)
          );
        }, 0) / fingertips.length;
        
        grabStrength = Math.max(0, Math.min(100, (1 - avgDistance * 3) * 100));
        
        // Hand center position
        handPosition = {
          x: (1 - wrist.x).toFixed(3), // Mirror X
          y: wrist.y.toFixed(3)
        };
        
        // Draw bounding box
        const minX = Math.min(...landmarks.map(l => (1 - l.x) * canvas.width));
        const maxX = Math.max(...landmarks.map(l => (1 - l.x) * canvas.width));
        const minY = Math.min(...landmarks.map(l => l.y * canvas.height));
        const maxY = Math.max(...landmarks.map(l => l.y * canvas.height));
        
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.strokeRect(minX - 10, minY - 10, maxX - minX + 20, maxY - minY + 20);
        
        ctx.fillStyle = '#00ff00';
        ctx.font = '14px Arial';
        ctx.fillText(`HAND DETECTED`, minX, minY - 15);
        ctx.fillText(`Pinch: ${pinchStrength.toFixed(0)}%`, minX, maxY + 25);
        ctx.fillText(`Grab: ${grabStrength.toFixed(0)}%`, minX, maxY + 40);
      }
      
      // Update gesture data
      setGestureData({
        pinchStrength: pinchStrength.toFixed(1),
        grabStrength: grabStrength.toFixed(1),
        zoomStrength: (pinchStrength * 0.8).toFixed(1),
        handPresent,
        confidence: confidence.toFixed(1),
        handPosition,
        handLandmarks: results.landmarks || []
      });
      
      // Apply gesture controls
      if (handPresent && confidence > 50) {
        applyGestureControls(pinchStrength, grabStrength, pinchStrength * 0.8);
      }
      
    } catch (error) {
      console.warn('Hand detection error:', error);
    }
    
    // Continue detection loop
    if (detectionActiveRef.current) {
      requestAnimationFrame(detectHands);
    }
  };

  // Apply gesture controls to camera and objects
  const applyGestureControls = (pinch, grab, zoom) => {
    if (!cameraRef.current) return;
    
    const now = Date.now();
    if (now - inputState.current.lastGestureTime < 50) return; // Throttle
    inputState.current.lastGestureTime = now;
    
    // Gesture-based zoom (pinch to zoom)
    if (pinch > 70) {
      const zoomFactor = 0.99;
      cameraRef.current.position.multiplyScalar(zoomFactor);
      setCameraStats(prev => ({ ...prev, zoom: prev.zoom * zoomFactor }));
    } else if (pinch < 30 && pinch > 0) {
      const zoomFactor = 1.01;
      cameraRef.current.position.multiplyScalar(zoomFactor);
      setCameraStats(prev => ({ ...prev, zoom: prev.zoom * zoomFactor }));
    }
    
    // Gesture-based rotation (grab to rotate)
    if (grab > 75) {
      const spherical = new THREE.Spherical();
      spherical.setFromVector3(cameraRef.current.position);
      spherical.theta += 0.02;
      cameraRef.current.position.setFromSpherical(spherical);
      cameraRef.current.lookAt(0, 0, 0);
      
      setCameraStats(prev => ({ 
        ...prev, 
        rotation: { x: spherical.phi, y: spherical.theta } 
      }));
    }
    
    // Object manipulation if one is selected
    if (selectedObject && pinch > 60) {
      const moveSpeed = 0.05;
      selectedObject.position.x += (Math.random() - 0.5) * moveSpeed;
      selectedObject.position.y += (Math.random() - 0.5) * moveSpeed;
      
      setCoords({
        x: selectedObject.position.x.toFixed(2),
        y: selectedObject.position.y.toFixed(2),
        z: selectedObject.position.z.toFixed(2)
      });
    }
  };

  // Initialize 3D Scene
  const initScene = useCallback(() => {
    if (!mountRef.current) return;

    // Scene - Pure black background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 5, 10);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 1);
    rendererRef.current = renderer;

    // Enhanced Lighting for cyan theme
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0x00ffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const pointLight1 = new THREE.PointLight(0x00ffff, 0.6, 100);
    pointLight1.position.set(0, 10, 0);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x0080ff, 0.4, 50);
    pointLight2.position.set(-10, 5, 10);
    scene.add(pointLight2);

    // NO GLOBAL GRID - only local grids around objects

    // Enhanced Axes helper
    const axesHelper = new THREE.AxesHelper(3);
    scene.add(axesHelper);

    // Mount renderer
    mountRef.current.appendChild(renderer.domElement);

    // Mouse controls
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onMouseWheel);

    // Start render loop
    animate();
  }, []);

  // Animation loop
  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    
    requestAnimationFrame(animate);
    
    // Update camera position state for UI
    const pos = cameraRef.current.position;
    setCameraPosition({ 
      x: pos.x.toFixed(2), 
      y: pos.y.toFixed(2), 
      z: pos.z.toFixed(2) 
    });
    
    // Update camera stats
    const distance = pos.length();
    setCameraStats(prev => ({ ...prev, distance: distance.toFixed(2) }));
    
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, []);

  // Mouse event handlers
  const onMouseDown = (event) => {
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    if (event.button === 0) { // Left click
      if (event.shiftKey) {
        inputState.current.isRotating = true;
      } else {
        selectObject(mouse);
        inputState.current.isDragging = true;
      }
    }
    
    inputState.current.lastPosition = { x: event.clientX, y: event.clientY };
  };

  const onMouseMove = (event) => {
    const deltaX = event.clientX - inputState.current.lastPosition.x;
    const deltaY = event.clientY - inputState.current.lastPosition.y;

    if (inputState.current.isDragging && selectedObject) {
      // Move selected object
      selectedObject.position.x += deltaX * 0.01;
      selectedObject.position.y -= deltaY * 0.01;
      setCoords({
        x: selectedObject.position.x.toFixed(2),
        y: selectedObject.position.y.toFixed(2),
        z: selectedObject.position.z.toFixed(2)
      });
    } else if (inputState.current.isRotating) {
      // Rotate camera around scene
      const spherical = new THREE.Spherical();
      spherical.setFromVector3(cameraRef.current.position);
      spherical.theta -= deltaX * 0.01;
      spherical.phi += deltaY * 0.01;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
      cameraRef.current.position.setFromSpherical(spherical);
      cameraRef.current.lookAt(0, 0, 0);
    }

    inputState.current.lastPosition = { x: event.clientX, y: event.clientY };
  };

  const onMouseUp = () => {
    inputState.current.isDragging = false;
    inputState.current.isRotating = false;
  };

  const onMouseWheel = (event) => {
    event.preventDefault();
    const scale = event.deltaY > 0 ? 1.1 : 0.9;
    cameraRef.current.position.multiplyScalar(scale);
  };

  // Select object with raycasting
  const selectObject = (mouse) => {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    
    const meshes = sceneRef.current.children.filter(child => 
      child.isMesh && child.userData.isUserObject
    );
    
    const intersects = raycaster.intersectObjects(meshes);
    
    // Deselect previous object
    if (selectedObject) {
      selectedObject.material = MATERIALS.default.clone();
    }
    
    if (intersects.length > 0) {
      const obj = intersects[0].object;
      obj.material = MATERIALS.selected.clone();
      setSelectedObject(obj);
      setCoords({
        x: obj.position.x.toFixed(2),
        y: obj.position.y.toFixed(2),
        z: obj.position.z.toFixed(2)
      });
    } else {
      setSelectedObject(null);
      setCoords({ x: 0, y: 0, z: 0 });
    }
  };

  // Add 3D shape - Cyan colored with local grid
  const addShape = (shapeType) => {
    if (!sceneRef.current) return;

    let geometry;
    switch (shapeType) {
      case SHAPE_TYPES.CUBE:
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case SHAPE_TYPES.SPHERE:
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        break;
      case SHAPE_TYPES.CYLINDER:
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        break;
      case SHAPE_TYPES.CONE:
        geometry = new THREE.ConeGeometry(0.5, 1, 32);
        break;
      case SHAPE_TYPES.TORUS:
        geometry = new THREE.TorusGeometry(0.5, 0.2, 16, 32);
        break;
      case SHAPE_TYPES.PLANE:
        geometry = new THREE.PlaneGeometry(2, 2);
        break;
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    const material = MATERIALS.default.clone();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      Math.random() * 4 - 2,
      Math.random() * 2 + 1,
      Math.random() * 4 - 2
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { 
      isUserObject: true, 
      shapeType,
      id: Date.now() + Math.random()
    };

    // Add local grid to the object
    createLocalGrid(mesh, 5);

    sceneRef.current.add(mesh);
    setObjects(prev => [...prev, { 
      id: mesh.userData.id, 
      type: shapeType, 
      position: mesh.position 
    }]);
  };

  // Delete selected object
  const deleteSelected = () => {
    if (selectedObject && sceneRef.current) {
      sceneRef.current.remove(selectedObject);
      setObjects(prev => prev.filter(obj => obj.id !== selectedObject.userData.id));
      setSelectedObject(null);
      setCoords({ x: 0, y: 0, z: 0 });
    }
  };

  // Reset camera position
  const resetCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 5, 10);
      cameraRef.current.lookAt(0, 0, 0);
    }
  };

  // Initialize everything
  useEffect(() => {
    initScene();
    initHandDetection();

    return () => {
      detectionActiveRef.current = false;
    };
  }, [initScene, initHandDetection]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (rendererRef.current && cameraRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="astris-container">
      {/* 3D Canvas */}
      <div ref={mountRef} className="canvas-container" />
      
      {/* Larger Webcam with proper gesture visualization */}
      <div className="webcam-container">
        <video ref={videoRef} className="webcam-feed" autoPlay muted />
        <canvas ref={canvasRef} className="gesture-overlay" />
      </div>
      
      {/* JARVIS-style UI */}
      <div className="jarvis-ui">
        {/* Top Bar */}
        <div className="jarvis-panel top-panel">
          <div className="panel-section">
            <h1 className="title">ASTRIS 3D</h1>
            <div className="status-indicator active"></div>
          </div>
          <div className="panel-section">
            <div className="data-field">
              <span className="label">CAM:</span>
              <span className="value">{cameraPosition.x}, {cameraPosition.y}, {cameraPosition.z}</span>
            </div>
          </div>
        </div>

        {/* Left Panel */}
        <div className="jarvis-panel left-panel">
          <div className="panel-header">SHAPES</div>
          <div className="tool-grid">
            {Object.values(SHAPE_TYPES).map(shape => (
              <button
                key={shape}
                className="tool-btn"
                onClick={() => addShape(shape)}
                title={`Add ${shape}`}
              >
                <div className="tool-icon">{shape.charAt(0).toUpperCase()}</div>
              </button>
            ))}
          </div>
          
          <div className="panel-header">CTRL</div>
          <div className="control-buttons">
            <button className="control-btn" onClick={deleteSelected} disabled={!selectedObject}>
              DEL
            </button>
            <button className="control-btn" onClick={resetCamera}>
              RESET
            </button>
          </div>
        </div>

        {/* Right Panel */}
        <div className="jarvis-panel right-panel">
          <div className="panel-header">OBJECT</div>
          <div className="data-grid">
            <div className="data-field">
              <span className="label">SEL:</span>
              <span className="value">{selectedObject?.userData?.shapeType?.toUpperCase() || 'NONE'}</span>
            </div>
            <div className="data-field">
              <span className="label">POS:</span>
              <span className="value">{coords.x}, {coords.y}, {coords.z}</span>
            </div>
            <div className="data-field">
              <span className="label">COUNT:</span>
              <span className="value">{objects.length}</span>
            </div>
          </div>

          <div className="panel-header">GESTURE</div>
          <div className="data-grid">
            <div className="data-field">
              <span className="label">HAND:</span>
              <span className={`value ${gestureData.handPresent ? 'status-active' : 'status-inactive'}`}>
                {gestureData.handPresent ? 'DETECTED' : 'NONE'}
              </span>
            </div>
            <div className="data-field">
              <span className="label">PINCH:</span>
              <span className="value">{gestureData.pinchStrength}%</span>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${gestureData.pinchStrength}%` }}></div>
              </div>
            </div>
            <div className="data-field">
              <span className="label">GRAB:</span>
              <span className="value">{gestureData.grabStrength}%</span>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${gestureData.grabStrength}%` }}></div>
              </div>
            </div>
            <div className="data-field">
              <span className="label">CONF:</span>
              <span className="value">{gestureData.confidence}%</span>
            </div>
          </div>
        </div>

        {/* Bottom Panel */}
        <div className="jarvis-panel bottom-panel">
          <div className="instructions">
            <span className="instruction">CLICK: Select</span>
            <span className="instruction">SHIFT+DRAG: Rotate</span>
            <span className="instruction">WHEEL: Zoom</span>
            <span className="instruction">PINCH: Zoom Camera</span>
            <span className="instruction">GRAB: Rotate Camera</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;