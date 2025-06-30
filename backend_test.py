#!/usr/bin/env python3
import requests
import json
import time
import uuid
from datetime import datetime
import os
import sys

# Get the backend URL from the frontend .env file
with open('/app/frontend/.env', 'r') as f:
    for line in f:
        if line.startswith('REACT_APP_BACKEND_URL='):
            BACKEND_URL = line.strip().split('=')[1].strip('"\'')
            break

# Ensure we have a valid backend URL
if not BACKEND_URL:
    print("Error: Could not find REACT_APP_BACKEND_URL in frontend/.env")
    sys.exit(1)

# Append /api to the backend URL
API_URL = f"{BACKEND_URL}/api"
print(f"Using API URL: {API_URL}")

# Test data
test_shape = {
    "shape_type": "cube",
    "position": {"x": 1.5, "y": 2.0, "z": -0.5},
    "rotation": {"x": 0, "y": 45, "z": 0},
    "scale": {"x": 1, "y": 1, "z": 1},
    "material": {"color": "#00ffff", "opacity": 0.8}
}

test_project = {
    "name": "Test Project",
    "description": "A test project for Astris 3D"
}

test_gesture = {
    "pinch_strength": 75.5,
    "grab_strength": 45.2,
    "hand_present": True,
    "confidence": 87.3,
    "hand_landmarks": [
        {"x": 0.1, "y": 0.2, "z": 0.3},
        {"x": 0.4, "y": 0.5, "z": 0.6}
    ]
}

# Helper function to print test results
def print_test_result(test_name, success, response=None, error=None):
    if success:
        print(f"✅ {test_name}: PASSED")
        if response:
            print(f"   Response: {response}")
    else:
        print(f"❌ {test_name}: FAILED")
        if error:
            print(f"   Error: {error}")
        if response:
            print(f"   Response: {response}")
    print("-" * 80)

# Helper function to make API requests with error handling
def make_request(method, endpoint, data=None, params=None):
    url = f"{API_URL}{endpoint}"
    try:
        if method == "GET":
            response = requests.get(url, params=params)
        elif method == "POST":
            response = requests.post(url, json=data)
        elif method == "PUT":
            response = requests.put(url, json=data)
        elif method == "DELETE":
            response = requests.delete(url)
        
        response.raise_for_status()
        return True, response.json() if response.text else None
    except requests.exceptions.RequestException as e:
        return False, str(e)

# 1. Test Basic Health Check
def test_root_endpoint():
    success, response = make_request("GET", "/")
    print_test_result("Root Endpoint", success, response)
    return success

def test_health_endpoint():
    success, response = make_request("GET", "/health")
    print_test_result("Health Endpoint", success, response)
    return success

# 2. Test 3D Shapes CRUD Operations
def test_create_shape():
    success, response = make_request("POST", "/shapes", test_shape)
    if success:
        global created_shape_id
        created_shape_id = response["id"]
    print_test_result("Create Shape", success, response)
    return success

def test_get_all_shapes():
    success, response = make_request("GET", "/shapes")
    print_test_result("Get All Shapes", success, response)
    return success

def test_get_specific_shape():
    if not hasattr(sys.modules[__name__], 'created_shape_id'):
        print_test_result("Get Specific Shape", False, error="No shape ID available. Create shape test must run first.")
        return False
    
    success, response = make_request("GET", f"/shapes/{created_shape_id}")
    print_test_result("Get Specific Shape", success, response)
    return success

def test_update_shape():
    if not hasattr(sys.modules[__name__], 'created_shape_id'):
        print_test_result("Update Shape", False, error="No shape ID available. Create shape test must run first.")
        return False
    
    update_data = {
        "position": {"x": 2.5, "y": 3.0, "z": -1.5},
        "rotation": {"x": 15, "y": 30, "z": 45}
    }
    
    success, response = make_request("PUT", f"/shapes/{created_shape_id}", update_data)
    print_test_result("Update Shape", success, response)
    return success

def test_delete_shape():
    if not hasattr(sys.modules[__name__], 'created_shape_id'):
        print_test_result("Delete Shape", False, error="No shape ID available. Create shape test must run first.")
        return False
    
    success, response = make_request("DELETE", f"/shapes/{created_shape_id}")
    print_test_result("Delete Shape", success, response)
    return success

# 3. Test Gesture Tracking
def test_save_gesture():
    success, response = make_request("POST", "/gestures", test_gesture)
    print_test_result("Save Gesture", success, response)
    return success

def test_get_recent_gestures():
    success, response = make_request("GET", "/gestures/recent", params={"limit": 10})
    print_test_result("Get Recent Gestures", success, response)
    return success

def test_get_gesture_stats():
    success, response = make_request("GET", "/gestures/stats")
    print_test_result("Get Gesture Statistics", success, response)
    return success

# 4. Test Scene Management
def test_get_scene_objects():
    success, response = make_request("GET", "/scene/objects")
    print_test_result("Get Scene Objects", success, response)
    return success

def test_clear_scene():
    # First create a few shapes to ensure there's something to clear
    for i in range(3):
        shape = test_shape.copy()
        shape["position"] = {"x": i, "y": i, "z": i}
        make_request("POST", "/shapes", shape)
    
    success, response = make_request("DELETE", "/scene/clear")
    print_test_result("Clear Scene", success, response)
    return success

# 5. Test Projects
def test_create_project():
    success, response = make_request("POST", "/projects", test_project)
    if success:
        global created_project_id
        created_project_id = response["id"]
    print_test_result("Create Project", success, response)
    return success

def test_get_all_projects():
    success, response = make_request("GET", "/projects")
    print_test_result("Get All Projects", success, response)
    return success

def test_get_specific_project():
    if not hasattr(sys.modules[__name__], 'created_project_id'):
        print_test_result("Get Specific Project", False, error="No project ID available. Create project test must run first.")
        return False
    
    success, response = make_request("GET", f"/projects/{created_project_id}")
    print_test_result("Get Specific Project", success, response)
    return success

def test_delete_project():
    if not hasattr(sys.modules[__name__], 'created_project_id'):
        print_test_result("Delete Project", False, error="No project ID available. Create project test must run first.")
        return False
    
    success, response = make_request("DELETE", f"/projects/{created_project_id}")
    print_test_result("Delete Project", success, response)
    return success

# 6. Test Analytics
def test_get_usage_analytics():
    success, response = make_request("GET", "/analytics/usage")
    print_test_result("Get Usage Analytics", success, response)
    return success

# Run all tests
def run_all_tests():
    print("\n" + "=" * 80)
    print("ASTRIS 3D BACKEND API TESTS")
    print("=" * 80 + "\n")
    
    # Track test results
    total_tests = 0
    passed_tests = 0
    
    # 1. Basic Health Check
    print("\n--- Basic Health Check ---\n")
    if test_root_endpoint(): passed_tests += 1
    total_tests += 1
    
    if test_health_endpoint(): passed_tests += 1
    total_tests += 1
    
    # 2. 3D Shapes CRUD Operations
    print("\n--- 3D Shapes CRUD Operations ---\n")
    if test_create_shape(): passed_tests += 1
    total_tests += 1
    
    if test_get_all_shapes(): passed_tests += 1
    total_tests += 1
    
    if test_get_specific_shape(): passed_tests += 1
    total_tests += 1
    
    if test_update_shape(): passed_tests += 1
    total_tests += 1
    
    if test_delete_shape(): passed_tests += 1
    total_tests += 1
    
    # 3. Gesture Tracking
    print("\n--- Gesture Tracking ---\n")
    if test_save_gesture(): passed_tests += 1
    total_tests += 1
    
    if test_get_recent_gestures(): passed_tests += 1
    total_tests += 1
    
    if test_get_gesture_stats(): passed_tests += 1
    total_tests += 1
    
    # 4. Scene Management
    print("\n--- Scene Management ---\n")
    if test_get_scene_objects(): passed_tests += 1
    total_tests += 1
    
    if test_clear_scene(): passed_tests += 1
    total_tests += 1
    
    # 5. Projects
    print("\n--- Projects ---\n")
    if test_create_project(): passed_tests += 1
    total_tests += 1
    
    if test_get_all_projects(): passed_tests += 1
    total_tests += 1
    
    if test_get_specific_project(): passed_tests += 1
    total_tests += 1
    
    if test_delete_project(): passed_tests += 1
    total_tests += 1
    
    # 6. Analytics
    print("\n--- Analytics ---\n")
    if test_get_usage_analytics(): passed_tests += 1
    total_tests += 1
    
    # Print summary
    print("\n" + "=" * 80)
    print(f"TEST SUMMARY: {passed_tests}/{total_tests} tests passed ({passed_tests/total_tests*100:.1f}%)")
    print("=" * 80 + "\n")
    
    return passed_tests == total_tests

if __name__ == "__main__":
    run_all_tests()