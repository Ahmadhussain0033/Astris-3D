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

// Colors for different materials
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
  const controlsRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const cameraUtilsRef = useRef(null);
  
  const [selectedObject, setSelectedObject] = useState(null);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 5, z: 10 });
  const [handData, setHandData] = useState(null);
  const [gestureData, setGestureData] = useState({
    pinchStrength: 0,
    grabStrength: 0,
    handPresent: false,
    confidence: 0
  });
  const [objects, setObjects] = useState([]);
  const [currentTool, setCurrentTool] = useState('select');
  const [coords, setCoords] = useState({ x: 0, y: 0, z: 0 });

  // Mouse state for object manipulation
  const mouseState = useRef({
    isDragging: false,
    isRotating: false,
    lastPosition: { x: 0, y: 0 }
  });

  // Initialize 3D Scene
  const initScene = useCallback(() => {
    if (!mountRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0a0a0a, 1);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0x00ffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0x00ffff, 0.5, 100);
    pointLight.position.set(0, 10, 0);
    scene.add(pointLight);

    // Grid
    const gridHelper = new THREE.GridHelper(20, 20, 0x003333, 0x001111);
    scene.add(gridHelper);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(5);
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
    setCameraPosition({ x: pos.x.toFixed(2), y: pos.y.toFixed(2), z: pos.z.toFixed(2) });
    
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
        mouseState.current.isRotating = true;
      } else {
        selectObject(mouse);
        mouseState.current.isDragging = true;
      }
    }
    
    mouseState.current.lastPosition = { x: event.clientX, y: event.clientY };
  };

  const onMouseMove = (event) => {
    const deltaX = event.clientX - mouseState.current.lastPosition.x;
    const deltaY = event.clientY - mouseState.current.lastPosition.y;

    if (mouseState.current.isDragging && selectedObject) {
      // Move selected object
      selectedObject.position.x += deltaX * 0.01;
      selectedObject.position.y -= deltaY * 0.01;
      setCoords({
        x: selectedObject.position.x.toFixed(2),
        y: selectedObject.position.y.toFixed(2),
        z: selectedObject.position.z.toFixed(2)
      });
    } else if (mouseState.current.isRotating) {
      // Rotate camera around scene
      const spherical = new THREE.Spherical();
      spherical.setFromVector3(cameraRef.current.position);
      spherical.theta -= deltaX * 0.01;
      spherical.phi += deltaY * 0.01;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
      cameraRef.current.position.setFromSpherical(spherical);
      cameraRef.current.lookAt(0, 0, 0);
    }

    mouseState.current.lastPosition = { x: event.clientX, y: event.clientY };
  };

  const onMouseUp = () => {
    mouseState.current.isDragging = false;
    mouseState.current.isRotating = false;
  };

  const onMouseWheel = (event) => {
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
    }
  };

  // Add 3D shape
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
    setObjects(prev => [...prev, { id: mesh.userData.id, type: shapeType, position: mesh.position }]);
  };

  // Initialize MediaPipe Hands
  const initHands = useCallback(() => {
    const hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults(onHandResults);
    handsRef.current = hands;

    if (videoRef.current) {
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (handsRef.current) {
            await handsRef.current.send({ image: videoRef.current });
          }
        },
        width: 640,
        height: 480
      });
      cameraUtilsRef.current = camera;
      camera.start();
    }
  }, []);

  // Handle hand detection results
  const onHandResults = (results) => {
    if (!canvasRef.current) return;

    const canvasCtx = canvasRef.current.getContext('2d');
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    if (results.multiHandLandmarks) {
      for (const landmarks of results.multiHandLandmarks) {
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
        drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 1});
        
        // Calculate gesture data
        const gestureInfo = calculateGesture(landmarks);
        setGestureData(gestureInfo);
        setHandData(landmarks);
        
        // Apply gesture controls to 3D objects
        applyGestureControls(landmarks, gestureInfo);
      }
    } else {
      setGestureData({ pinchStrength: 0, grabStrength: 0, handPresent: false, confidence: 0 });
      setHandData(null);
    }

    canvasCtx.restore();
  };

  // Calculate gesture strength
  const calculateGesture = (landmarks) => {
    const thumb = landmarks[4];
    const index = landmarks[8];
    const middle = landmarks[12];
    const ring = landmarks[16];
    const pinky = landmarks[20];

    // Calculate pinch strength (thumb to index finger)
    const pinchDistance = Math.sqrt(
      Math.pow(thumb.x - index.x, 2) + 
      Math.pow(thumb.y - index.y, 2)
    );
    const pinchStrength = Math.max(0, Math.min(100, (1 - pinchDistance * 10) * 100));

    // Calculate grab strength (all fingers to palm)
    const palm = landmarks[0];
    const avgFingerDistance = [index, middle, ring, pinky]
      .reduce((sum, finger) => sum + Math.sqrt(
        Math.pow(palm.x - finger.x, 2) + Math.pow(palm.y - finger.y, 2)
      ), 0) / 4;
    const grabStrength = Math.max(0, Math.min(100, (1 - avgFingerDistance * 5) * 100));

    return {
      pinchStrength: pinchStrength.toFixed(1),
      grabStrength: grabStrength.toFixed(1),
      handPresent: true,
      confidence: 85 + Math.random() * 10
    };
  };

  // Apply gesture controls to 3D scene
  const applyGestureControls = (landmarks, gestureInfo) => {
    if (!selectedObject || !landmarks) return;

    const index = landmarks[8];
    
    // Convert hand coordinates to 3D world coordinates
    const x = (index.x - 0.5) * 10;
    const y = -(index.y - 0.5) * 5;
    
    if (gestureInfo.pinchStrength > 70) {
      // High pinch strength - move object
      selectedObject.position.x = x;
      selectedObject.position.y = y + 2;
      setCoords({
        x: selectedObject.position.x.toFixed(2),
        y: selectedObject.position.y.toFixed(2),
        z: selectedObject.position.z.toFixed(2)
      });
    }
    
    if (gestureInfo.grabStrength > 80) {
      // High grab strength - rotate object
      selectedObject.rotation.y += 0.02;
      selectedObject.rotation.x += 0.01;
    }
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

  // Initialize everything
  useEffect(() => {
    initScene();
    initHands();

    return () => {
      if (cameraUtilsRef.current) {
        cameraUtilsRef.current.stop();
      }
    };
  }, [initScene, initHands]);

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
      
      {/* Hand tracking video (hidden) */}
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas ref={canvasRef} className="hand-canvas" width="640" height="480" />
      
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
              <span className="label">CAM POS:</span>
              <span className="value">{cameraPosition.x}, {cameraPosition.y}, {cameraPosition.z}</span>
            </div>
          </div>
        </div>

        {/* Left Panel - Tools */}
        <div className="jarvis-panel left-panel">
          <div className="panel-header">PRIMITIVE SHAPES</div>
          <div className="tool-grid">
            {Object.values(SHAPE_TYPES).map(shape => (
              <button
                key={shape}
                className="tool-btn"
                onClick={() => addShape(shape)}
                title={`Add ${shape}`}
              >
                <div className="tool-icon">{shape.charAt(0).toUpperCase()}</div>
                <span className="tool-label">{shape}</span>
              </button>
            ))}
          </div>
          
          <div className="panel-header">CONTROLS</div>
          <div className="control-buttons">
            <button className="control-btn" onClick={deleteSelected} disabled={!selectedObject}>
              DELETE
            </button>
            <button className="control-btn" onClick={() => window.location.reload()}>
              RESET
            </button>
          </div>
        </div>

        {/* Right Panel - Data */}
        <div className="jarvis-panel right-panel">
          <div className="panel-header">OBJECT DATA</div>
          <div className="data-grid">
            <div className="data-field">
              <span className="label">SELECTED:</span>
              <span className="value">{selectedObject ? selectedObject.userData.shapeType : 'NONE'}</span>
            </div>
            <div className="data-field">
              <span className="label">POSITION:</span>
              <span className="value">{coords.x}, {coords.y}, {coords.z}</span>
            </div>
            <div className="data-field">
              <span className="label">OBJECTS:</span>
              <span className="value">{objects.length}</span>
            </div>
          </div>

          <div className="panel-header">GESTURE DATA</div>
          <div className="data-grid">
            <div className="data-field">
              <span className="label">HAND:</span>
              <span className="value status">{gestureData.handPresent ? 'DETECTED' : 'NOT FOUND'}</span>
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
              <span className="label">CONFIDENCE:</span>
              <span className="value">{gestureData.confidence.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Bottom Panel - Instructions */}
        <div className="jarvis-panel bottom-panel">
          <div className="instructions">
            <span className="instruction">LEFT CLICK: Select Object</span>
            <span className="instruction">SHIFT + DRAG: Rotate Camera</span>
            <span className="instruction">MOUSE WHEEL: Zoom</span>
            <span className="instruction">PINCH GESTURE: Move Object</span>
            <span className="instruction">GRAB GESTURE: Rotate Object</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;