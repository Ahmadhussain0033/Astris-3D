from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Astris 3D API", description="Next-Generation Holographic 3D Design Platform API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class Shape3D(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    shape_type: str  # cube, sphere, cylinder, etc.
    position: Dict[str, float]  # {x, y, z}
    rotation: Dict[str, float]  # {x, y, z}
    scale: Dict[str, float]  # {x, y, z}
    material: Dict[str, Any]  # material properties
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Shape3DCreate(BaseModel):
    shape_type: str
    position: Dict[str, float]
    rotation: Optional[Dict[str, float]] = {"x": 0, "y": 0, "z": 0}
    scale: Optional[Dict[str, float]] = {"x": 1, "y": 1, "z": 1}
    material: Optional[Dict[str, Any]] = {"color": "#00ffff", "opacity": 0.8}

class Shape3DUpdate(BaseModel):
    position: Optional[Dict[str, float]] = None
    rotation: Optional[Dict[str, float]] = None
    scale: Optional[Dict[str, float]] = None
    material: Optional[Dict[str, Any]] = None

class Project3D(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    shapes: List[str] = []  # List of shape IDs
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Project3DCreate(BaseModel):
    name: str
    description: Optional[str] = None

class GestureData(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pinch_strength: float
    grab_strength: float
    hand_present: bool
    confidence: float
    hand_landmarks: Optional[List[Dict[str, float]]] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class GestureDataCreate(BaseModel):
    pinch_strength: float
    grab_strength: float
    hand_present: bool
    confidence: float
    hand_landmarks: Optional[List[Dict[str, float]]] = None

# Basic routes
@api_router.get("/")
async def root():
    return {"message": "Astris 3D API - Next-Generation Holographic 3D Design Platform", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

# Status check routes (existing)
@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# 3D Shapes CRUD
@api_router.post("/shapes", response_model=Shape3D)
async def create_shape(shape_data: Shape3DCreate):
    """Create a new 3D shape"""
    shape_dict = shape_data.dict()
    shape_obj = Shape3D(**shape_dict)
    await db.shapes.insert_one(shape_obj.dict())
    return shape_obj

@api_router.get("/shapes", response_model=List[Shape3D])
async def get_shapes():
    """Get all 3D shapes"""
    shapes = await db.shapes.find().to_list(1000)
    return [Shape3D(**shape) for shape in shapes]

@api_router.get("/shapes/{shape_id}", response_model=Shape3D)
async def get_shape(shape_id: str):
    """Get a specific 3D shape by ID"""
    shape = await db.shapes.find_one({"id": shape_id})
    if not shape:
        raise HTTPException(status_code=404, detail="Shape not found")
    return Shape3D(**shape)

@api_router.put("/shapes/{shape_id}", response_model=Shape3D)
async def update_shape(shape_id: str, shape_update: Shape3DUpdate):
    """Update a 3D shape"""
    shape = await db.shapes.find_one({"id": shape_id})
    if not shape:
        raise HTTPException(status_code=404, detail="Shape not found")
    
    update_data = shape_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    
    await db.shapes.update_one({"id": shape_id}, {"$set": update_data})
    
    updated_shape = await db.shapes.find_one({"id": shape_id})
    return Shape3D(**updated_shape)

@api_router.delete("/shapes/{shape_id}")
async def delete_shape(shape_id: str):
    """Delete a 3D shape"""
    result = await db.shapes.delete_one({"id": shape_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Shape not found")
    return {"message": "Shape deleted successfully"}

# Projects CRUD
@api_router.post("/projects", response_model=Project3D)
async def create_project(project_data: Project3DCreate):
    """Create a new 3D project"""
    project_dict = project_data.dict()
    project_obj = Project3D(**project_dict)
    await db.projects.insert_one(project_obj.dict())
    return project_obj

@api_router.get("/projects", response_model=List[Project3D])
async def get_projects():
    """Get all 3D projects"""
    projects = await db.projects.find().to_list(1000)
    return [Project3D(**project) for project in projects]

@api_router.get("/projects/{project_id}", response_model=Project3D)
async def get_project(project_id: str):
    """Get a specific project by ID"""
    project = await db.projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return Project3D(**project)

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project"""
    result = await db.projects.delete_one({"id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"message": "Project deleted successfully"}

# Gesture tracking
@api_router.post("/gestures", response_model=GestureData)
async def save_gesture_data(gesture_data: GestureDataCreate):
    """Save gesture tracking data"""
    gesture_dict = gesture_data.dict()
    gesture_obj = GestureData(**gesture_dict)
    await db.gestures.insert_one(gesture_obj.dict())
    return gesture_obj

@api_router.get("/gestures/recent")
async def get_recent_gestures(limit: int = 100):
    """Get recent gesture data"""
    gestures = await db.gestures.find().sort("timestamp", -1).limit(limit).to_list(limit)
    return [GestureData(**gesture) for gesture in gestures]

@api_router.get("/gestures/stats")
async def get_gesture_stats():
    """Get gesture usage statistics"""
    total_gestures = await db.gestures.count_documents({})
    
    # Get average gesture strengths
    pipeline = [
        {
            "$group": {
                "_id": None,
                "avg_pinch": {"$avg": "$pinch_strength"},
                "avg_grab": {"$avg": "$grab_strength"},
                "total_sessions": {"$sum": 1}
            }
        }
    ]
    
    stats = await db.gestures.aggregate(pipeline).to_list(1)
    
    if stats:
        return {
            "total_gestures": total_gestures,
            "average_pinch_strength": round(stats[0]["avg_pinch"], 2),
            "average_grab_strength": round(stats[0]["avg_grab"], 2),
            "total_sessions": stats[0]["total_sessions"]
        }
    else:
        return {
            "total_gestures": total_gestures,
            "average_pinch_strength": 0,
            "average_grab_strength": 0,
            "total_sessions": 0
        }

# Scene management
@api_router.get("/scene/objects")
async def get_scene_objects():
    """Get all objects in the current scene"""
    shapes = await db.shapes.find().to_list(1000)
    return {
        "objects": [Shape3D(**shape) for shape in shapes],
        "count": len(shapes),
        "timestamp": datetime.utcnow()
    }

@api_router.delete("/scene/clear")
async def clear_scene():
    """Clear all objects from the scene"""
    result = await db.shapes.delete_many({})
    return {
        "message": f"Scene cleared. Deleted {result.deleted_count} objects.",
        "deleted_count": result.deleted_count
    }

# Analytics
@api_router.get("/analytics/usage")
async def get_usage_analytics():
    """Get usage analytics"""
    shapes_count = await db.shapes.count_documents({})
    projects_count = await db.projects.count_documents({})
    gestures_count = await db.gestures.count_documents({})
    
    # Get shape type distribution
    shape_types_pipeline = [
        {"$group": {"_id": "$shape_type", "count": {"$sum": 1}}}
    ]
    shape_types = await db.shapes.aggregate(shape_types_pipeline).to_list(100)
    
    return {
        "total_shapes": shapes_count,
        "total_projects": projects_count,
        "total_gestures": gestures_count,
        "shape_distribution": {item["_id"]: item["count"] for item in shape_types},
        "timestamp": datetime.utcnow()
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    logger.info("Astris 3D API starting up...")
    logger.info("Connected to MongoDB")

@app.on_event("shutdown")
async def shutdown_db_client():
    logger.info("Shutting down Astris 3D API...")
    client.close()