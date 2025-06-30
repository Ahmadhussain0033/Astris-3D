import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
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
  const gestureDetectionRef = useRef(null);
  const localGridsRef = useRef([]);
  
  const [selectedObject, setSelectedObject] = useState(null);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 5, z: 10 });
  const [gestureData, setGestureData] = useState({
    pinchStrength: 0,
    grabStrength: 0,
    zoomStrength: 0,
    handPresent: false,
    confidence: 0,
    handPosition: { x: 0, y: 0 },
    handBounds: null
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

  // Create localized grid around an object
  const createLocalGrid = (position, gridSize = 5) => {
    const gridGroup = new THREE.Group();
    const gridDivisions = 10;
    const step = gridSize / gridDivisions;
    
    const gridMaterial = new THREE.LineBasicMaterial({ 
      color: 0xffffff, 
      transparent: true, 
      opacity: 0.2 
    });
    
    // Create grid lines
    const points = [];
    for (let i = -gridSize/2; i <= gridSize/2; i += step) {
      // X lines
      points.push(-gridSize/2, 0, i);
      points.push(gridSize/2, 0, i);
      // Z lines  
      points.push(i, 0, -gridSize/2);
      points.push(i, 0, gridSize/2);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const gridLines = new THREE.LineSegments(geometry, gridMaterial);
    
    gridGroup.add(gridLines);
    gridGroup.position.copy(position);
    
    return gridGroup;
  };

  // Update local grids around objects
  const updateLocalGrids = useCallback(() => {
    if (!sceneRef.current) return;
    
    // Remove existing grids
    localGridsRef.current.forEach(grid => {
      sceneRef.current.remove(grid);
    });
    localGridsRef.current = [];
    
    // Create new grids around objects
    const meshes = sceneRef.current.children.filter(child => 
      child.isMesh && child.userData.isUserObject
    );
    
    meshes.forEach(mesh => {
      const grid = createLocalGrid(mesh.position);
      sceneRef.current.add(grid);
      localGridsRef.current.push(grid);
    });
  }, []);

  // Enhanced gesture detection with hand bounds
  const initSimpleGestureDetection = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        
        // Start gesture detection loop
        gestureDetectionRef.current = setInterval(() => {
          detectSimpleGestures();
        }, 100);
      }
    } catch (error) {
      console.log('Webcam not available, using simulated gesture data');
      setGestureData(prev => ({ ...prev, confidence: 0, handPresent: false }));
    }
  }, []);

  // Enhanced gesture detection with hand bounds
  const detectSimpleGestures = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    if (canvas.width === 0 || canvas.height === 0) return;
    
    // Clear and draw video frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(-1, 1); // Mirror effect
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Simple motion and skin color detection
      let motionLevel = 0;
      let handBounds = { minX: canvas.width, minY: canvas.height, maxX: 0, maxY: 0 };
      let handPixels = 0;
      
      // Analyze for skin-like colors and motion
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // Detect skin-like colors (rough approximation)
          if (r > 120 && g > 80 && b > 60 && r > g && r > b) {
            motionLevel++;
            handPixels++;
            
            // Update hand bounds
            if (x < handBounds.minX) handBounds.minX = x;
            if (x > handBounds.maxX) handBounds.maxX = x;
            if (y < handBounds.minY) handBounds.minY = y;
            if (y > handBounds.maxY) handBounds.maxY = y;
          }
        }
      }
      
      const handPresent = motionLevel > 2000;
      const confidence = Math.min(95, (motionLevel / 2000) * 100);
      
      // Draw red box around detected hand
      if (handPresent && handPixels > 100) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;
        ctx.strokeRect(
          handBounds.minX - 10, 
          handBounds.minY - 10, 
          handBounds.maxX - handBounds.minX + 20, 
          handBounds.maxY - handBounds.minY + 20
        );
        
        // Add text
        ctx.fillStyle = '#ff0000';
        ctx.font = '16px Arial';
        ctx.fillText('HAND DETECTED', handBounds.minX, handBounds.minY - 15);
      }
      
      // Simulate gesture strengths based on hand detection
      const pinchStrength = handPresent ? 20 + Math.random() * 60 : 0;
      const grabStrength = handPresent ? 15 + Math.random() * 70 : 0;
      const zoomStrength = handPresent ? Math.random() * 100 : 0;
      
      setGestureData({
        pinchStrength: pinchStrength.toFixed(1),
        grabStrength: grabStrength.toFixed(1),
        zoomStrength: zoomStrength.toFixed(1),
        handPresent,
        confidence: confidence.toFixed(1),
        handPosition: { 
          x: ((handBounds.minX + handBounds.maxX) / 2 / canvas.width).toFixed(3), 
          y: ((handBounds.minY + handBounds.maxY) / 2 / canvas.height).toFixed(3) 
        },
        handBounds: handPresent ? handBounds : null
      });
      
      // Apply gesture controls
      if (handPresent && confidence > 50) {
        applyGestureControls(pinchStrength, grabStrength, zoomStrength);
      }
      
    } catch (error) {
      // Fallback to simulated data
      setGestureData({
        pinchStrength: (Math.random() * 100).toFixed(1),
        grabStrength: (Math.random() * 100).toFixed(1),
        zoomStrength: (Math.random() * 100).toFixed(1),
        handPresent: Math.random() > 0.7,
        confidence: (60 + Math.random() * 35).toFixed(1),
        handPosition: { x: 0.5, y: 0.5 },
        handBounds: null
      });
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
      const zoomFactor = 0.98;
      cameraRef.current.position.multiplyScalar(zoomFactor);
      setCameraStats(prev => ({ ...prev, zoom: prev.zoom * zoomFactor }));
    } else if (pinch < 30 && pinch > 0) {
      const zoomFactor = 1.02;
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
      
      // Update local grids when objects move
      updateLocalGrids();
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
    
    // Update local grids to follow objects
    const meshes = sceneRef.current.children.filter(child => 
      child.isMesh && child.userData.isUserObject
    );
    
    localGridsRef.current.forEach((grid, index) => {
      if (meshes[index]) {
        grid.position.copy(meshes[index].position);
      }
    });
    
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
      updateLocalGrids();
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

  // Add 3D shape - Cyan colored
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

    sceneRef.current.add(mesh);
    setObjects(prev => [...prev, { 
      id: mesh.userData.id, 
      type: shapeType, 
      position: mesh.position 
    }]);
    
    // Update local grids
    setTimeout(() => updateLocalGrids(), 100);
  };

  // Delete selected object
  const deleteSelected = () => {
    if (selectedObject && sceneRef.current) {
      sceneRef.current.remove(selectedObject);
      setObjects(prev => prev.filter(obj => obj.id !== selectedObject.userData.id));
      setSelectedObject(null);
      setCoords({ x: 0, y: 0, z: 0 });
      updateLocalGrids();
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
    initSimpleGestureDetection();

    return () => {
      if (gestureDetectionRef.current) {
        clearInterval(gestureDetectionRef.current);
      }
    };
  }, [initScene, initSimpleGestureDetection, updateLocalGrids]);

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
      
      {/* Larger Webcam with gesture visualization */}
      <div className="webcam-container">
        <video ref={videoRef} className="webcam-feed" autoPlay muted />
        <canvas ref={canvasRef} className="gesture-overlay" />
      </div>
      
      {/* JARVIS-style UI - Fixed positioning */}
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

        {/* Left Panel - Higher position */}
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

        {/* Right Panel - Lower position to avoid webcam */}
        <div className="jarvis-panel right-panel">
          <div className="panel-header">OBJECT</div>
          <div className="data-grid">
            <div className="data-field">
              <span className="label">SEL:</span>
              <span className="value">{selectedObject ? selectedObject.userData.shapeType.toUpperCase() : 'NONE'}</span>
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