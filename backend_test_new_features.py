#!/usr/bin/env python3
"""
Backend API Test Suite for Command Cockpit - NEW FEATURES
Tests ONLY the two new capabilities:
1. AI poster-label suggestion (gpt-4o vision)
2. Multi-scene Reels render (ffmpeg xfade)
"""

import requests
import json
import sys
import time
import base64
from datetime import datetime
from io import BytesIO
from PIL import Image, ImageDraw

# Base URL from .env
BASE_URL = "https://audit-hub-154.preview.emergentagent.com/api"

def log_test(test_name, status, details=""):
    """Log test results"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status_icon = "✅" if status == "PASS" else "❌"
    print(f"\n{status_icon} [{timestamp}] {test_name}")
    if details:
        print(f"   {details}")

def generate_test_png(width=200, height=200, color=(100, 150, 200), text="TEST"):
    """Generate a small test PNG image with some visual content"""
    img = Image.new('RGB', (width, height), color=color)
    draw = ImageDraw.Draw(img)
    
    # Draw some shapes to make it look like a product image
    draw.rectangle([20, 20, width-20, height-20], outline=(255, 255, 255), width=3)
    draw.ellipse([width//4, height//4, 3*width//4, 3*height//4], fill=(200, 100, 50))
    draw.rectangle([width//3, height//3, 2*width//3, 2*height//3], fill=(50, 100, 200))
    
    # Convert to base64
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.read()).decode('utf-8')
    return f"data:image/png;base64,{img_base64}"

def test_suggest_labels_valid():
    """Test 1: POST /api/studio/suggest-labels with valid image -> 200 JSON with title, badges, features, cta"""
    try:
        # Generate a real small PNG
        image_data = generate_test_png(150, 150, (120, 80, 150), "PRODUCT")
        
        payload = {
            "image": image_data
        }
        
        response = requests.post(f"{BASE_URL}/studio/suggest-labels", json=payload, timeout=30)
        
        if response.status_code != 200:
            log_test("POST /api/studio/suggest-labels (valid image)", "FAIL", 
                    f"Expected 200, got {response.status_code}. Response: {response.text[:200]}")
            return False
        
        data = response.json()
        
        # Check required keys
        required_keys = ["title", "badges", "features", "cta"]
        for key in required_keys:
            if key not in data:
                log_test("POST /api/studio/suggest-labels (valid image)", "FAIL", 
                        f"Missing required key: {key}. Response: {json.dumps(data)}")
                return False
        
        # Verify types
        if not isinstance(data["title"], str):
            log_test("POST /api/studio/suggest-labels (valid image)", "FAIL", 
                    f"title should be string, got {type(data['title'])}")
            return False
        
        if not isinstance(data["badges"], list):
            log_test("POST /api/studio/suggest-labels (valid image)", "FAIL", 
                    f"badges should be array, got {type(data['badges'])}")
            return False
        
        if not isinstance(data["features"], list):
            log_test("POST /api/studio/suggest-labels (valid image)", "FAIL", 
                    f"features should be array, got {type(data['features'])}")
            return False
        
        if not isinstance(data["cta"], str):
            log_test("POST /api/studio/suggest-labels (valid image)", "FAIL", 
                    f"cta should be string, got {type(data['cta'])}")
            return False
        
        log_test("POST /api/studio/suggest-labels (valid image)", "PASS", 
                f"Returned structured JSON: title='{data['title'][:50]}', "
                f"badges={len(data['badges'])} items, features={len(data['features'])} items, "
                f"cta='{data['cta'][:30]}'")
        return True
        
    except Exception as e:
        log_test("POST /api/studio/suggest-labels (valid image)", "FAIL", f"Exception: {str(e)}")
        return False

def test_suggest_labels_empty():
    """Test 2: POST /api/studio/suggest-labels {} -> EXPECTED clean 400"""
    try:
        payload = {}
        
        response = requests.post(f"{BASE_URL}/studio/suggest-labels", json=payload, timeout=10)
        
        # Should return 400 error
        if response.status_code != 400:
            log_test("POST /api/studio/suggest-labels (empty body)", "FAIL", 
                    f"Expected 400 error, got {response.status_code}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("POST /api/studio/suggest-labels (empty body)", "FAIL", 
                    "Response is not valid JSON (crashed)")
            return False
        
        # Should have error field
        if "error" not in data:
            log_test("POST /api/studio/suggest-labels (empty body)", "FAIL", 
                    "Response missing 'error' field")
            return False
        
        log_test("POST /api/studio/suggest-labels (empty body)", "PASS", 
                f"Clean 400 JSON error as expected: '{data['error']}'")
        return True
        
    except Exception as e:
        log_test("POST /api/studio/suggest-labels (empty body)", "FAIL", f"Exception: {str(e)}")
        return False

def test_multi_scene_render_fade():
    """Test 3: POST /api/studio/render with 2 scenes + fade transition -> produces real MP4"""
    try:
        # Generate two different PNGs
        png_a = generate_test_png(300, 300, (200, 50, 50), "SCENE A")
        png_b = generate_test_png(300, 300, (50, 200, 50), "SCENE B")
        
        payload = {
            "scenes": [
                {"posterDataUrl": png_a, "duration": 2},
                {"posterDataUrl": png_b, "duration": 2}
            ],
            "transition": "fade",
            "transitionDur": 0.7,
            "audioMode": "preset",
            "presetId": "tekno"
        }
        
        response = requests.post(f"{BASE_URL}/studio/render", json=payload, timeout=10)
        
        if response.status_code != 200:
            log_test("POST /api/studio/render (multi-scene fade)", "FAIL", 
                    f"Expected 200, got {response.status_code}. Response: {response.text[:200]}")
            return False
        
        data = response.json()
        
        # Check response structure
        if "jobId" not in data:
            log_test("POST /api/studio/render (multi-scene fade)", "FAIL", "Missing jobId")
            return False
        
        if data.get("status") != "RENDERING":
            log_test("POST /api/studio/render (multi-scene fade)", "FAIL", 
                    f"Expected status='RENDERING', got '{data.get('status')}'")
            return False
        
        if data.get("sceneCount") != 2:
            log_test("POST /api/studio/render (multi-scene fade)", "FAIL", 
                    f"Expected sceneCount=2, got {data.get('sceneCount')}")
            return False
        
        job_id = data["jobId"]
        
        # Poll for completion (up to 60 seconds)
        max_wait = 60
        poll_interval = 2
        elapsed = 0
        final_status = None
        
        print(f"   Polling render job {job_id}...")
        
        while elapsed < max_wait:
            time.sleep(poll_interval)
            elapsed += poll_interval
            
            poll_response = requests.get(f"{BASE_URL}/studio/render/{job_id}", timeout=10)
            
            if poll_response.status_code != 200:
                log_test("POST /api/studio/render (multi-scene fade)", "FAIL", 
                        f"Poll failed with status {poll_response.status_code}")
                return False
            
            poll_data = poll_response.json()
            status = poll_data.get("status")
            
            print(f"   [{elapsed}s] Status: {status}")
            
            if status == "DONE":
                final_status = poll_data
                break
            elif status == "FAILED":
                log_test("POST /api/studio/render (multi-scene fade)", "FAIL", 
                        f"Render FAILED: {poll_data.get('error')}")
                return False
        
        if not final_status or final_status.get("status") != "DONE":
            log_test("POST /api/studio/render (multi-scene fade)", "FAIL", 
                    f"Render did not complete within {max_wait}s")
            return False
        
        # Verify render doc
        if final_status.get("sceneCount") != 2:
            log_test("POST /api/studio/render (multi-scene fade)", "FAIL", 
                    f"Final render doc sceneCount should be 2, got {final_status.get('sceneCount')}")
            return False
        
        if "videoUrl" not in final_status:
            log_test("POST /api/studio/render (multi-scene fade)", "FAIL", 
                    "Final render doc missing videoUrl")
            return False
        
        video_url = final_status["videoUrl"]
        
        # Download and verify MP4
        video_response = requests.get(f"{BASE_URL.replace('/api', '')}{video_url}", timeout=30)
        
        if video_response.status_code != 200:
            log_test("POST /api/studio/render (multi-scene fade)", "FAIL", 
                    f"Video download failed with status {video_response.status_code}")
            return False
        
        content_type = video_response.headers.get("Content-Type", "")
        if "video/mp4" not in content_type:
            log_test("POST /api/studio/render (multi-scene fade)", "FAIL", 
                    f"Expected Content-Type video/mp4, got {content_type}")
            return False
        
        video_size = len(video_response.content)
        if video_size == 0:
            log_test("POST /api/studio/render (multi-scene fade)", "FAIL", 
                    "Video file is empty")
            return False
        
        log_test("POST /api/studio/render (multi-scene fade)", "PASS", 
                f"Render completed in {elapsed}s. Video: {video_size} bytes, sceneCount=2, "
                f"duration={final_status.get('duration')}s, transition=fade")
        return True
        
    except Exception as e:
        log_test("POST /api/studio/render (multi-scene fade)", "FAIL", f"Exception: {str(e)}")
        return False

def test_multi_scene_render_wipeleft():
    """Test 4: POST /api/studio/render with 2 scenes + wipeleft transition -> produces real MP4"""
    try:
        # Generate two different PNGs
        png_a = generate_test_png(300, 300, (50, 50, 200), "WIPE A")
        png_b = generate_test_png(300, 300, (200, 200, 50), "WIPE B")
        
        payload = {
            "scenes": [
                {"posterDataUrl": png_a, "duration": 2},
                {"posterDataUrl": png_b, "duration": 2}
            ],
            "transition": "wipeleft",
            "transitionDur": 0.7,
            "audioMode": "preset",
            "presetId": "tekno"
        }
        
        response = requests.post(f"{BASE_URL}/studio/render", json=payload, timeout=10)
        
        if response.status_code != 200:
            log_test("POST /api/studio/render (multi-scene wipeleft)", "FAIL", 
                    f"Expected 200, got {response.status_code}. Response: {response.text[:200]}")
            return False
        
        data = response.json()
        
        if "jobId" not in data or data.get("status") != "RENDERING" or data.get("sceneCount") != 2:
            log_test("POST /api/studio/render (multi-scene wipeleft)", "FAIL", 
                    f"Invalid response structure: {json.dumps(data)}")
            return False
        
        job_id = data["jobId"]
        
        # Poll for completion
        max_wait = 60
        poll_interval = 2
        elapsed = 0
        final_status = None
        
        print(f"   Polling render job {job_id}...")
        
        while elapsed < max_wait:
            time.sleep(poll_interval)
            elapsed += poll_interval
            
            poll_response = requests.get(f"{BASE_URL}/studio/render/{job_id}", timeout=10)
            
            if poll_response.status_code != 200:
                log_test("POST /api/studio/render (multi-scene wipeleft)", "FAIL", 
                        f"Poll failed with status {poll_response.status_code}")
                return False
            
            poll_data = poll_response.json()
            status = poll_data.get("status")
            
            print(f"   [{elapsed}s] Status: {status}")
            
            if status == "DONE":
                final_status = poll_data
                break
            elif status == "FAILED":
                log_test("POST /api/studio/render (multi-scene wipeleft)", "FAIL", 
                        f"Render FAILED: {poll_data.get('error')}")
                return False
        
        if not final_status or final_status.get("status") != "DONE":
            log_test("POST /api/studio/render (multi-scene wipeleft)", "FAIL", 
                    f"Render did not complete within {max_wait}s")
            return False
        
        # Verify video
        video_url = final_status.get("videoUrl")
        if not video_url:
            log_test("POST /api/studio/render (multi-scene wipeleft)", "FAIL", 
                    "Missing videoUrl in final render doc")
            return False
        
        video_response = requests.get(f"{BASE_URL.replace('/api', '')}{video_url}", timeout=30)
        
        if video_response.status_code != 200:
            log_test("POST /api/studio/render (multi-scene wipeleft)", "FAIL", 
                    f"Video download failed with status {video_response.status_code}")
            return False
        
        content_type = video_response.headers.get("Content-Type", "")
        if "video/mp4" not in content_type:
            log_test("POST /api/studio/render (multi-scene wipeleft)", "FAIL", 
                    f"Expected Content-Type video/mp4, got {content_type}")
            return False
        
        video_size = len(video_response.content)
        if video_size == 0:
            log_test("POST /api/studio/render (multi-scene wipeleft)", "FAIL", 
                    "Video file is empty")
            return False
        
        log_test("POST /api/studio/render (multi-scene wipeleft)", "PASS", 
                f"Render completed in {elapsed}s. Video: {video_size} bytes, sceneCount=2, "
                f"transition=wipeleft")
        return True
        
    except Exception as e:
        log_test("POST /api/studio/render (multi-scene wipeleft)", "FAIL", f"Exception: {str(e)}")
        return False

def test_single_scene_backward_compat():
    """Test 5: POST /api/studio/render with single posterDataUrl (backward compatibility) -> produces MP4"""
    try:
        # Generate single PNG
        png = generate_test_png(300, 300, (100, 100, 100), "SINGLE")
        
        payload = {
            "posterDataUrl": png,
            "audioMode": "silent"
        }
        
        response = requests.post(f"{BASE_URL}/studio/render", json=payload, timeout=10)
        
        if response.status_code != 200:
            log_test("POST /api/studio/render (single-scene backward compat)", "FAIL", 
                    f"Expected 200, got {response.status_code}. Response: {response.text[:200]}")
            return False
        
        data = response.json()
        
        if "jobId" not in data or data.get("status") != "RENDERING":
            log_test("POST /api/studio/render (single-scene backward compat)", "FAIL", 
                    f"Invalid response structure: {json.dumps(data)}")
            return False
        
        job_id = data["jobId"]
        
        # Poll for completion
        max_wait = 60
        poll_interval = 2
        elapsed = 0
        final_status = None
        
        print(f"   Polling render job {job_id}...")
        
        while elapsed < max_wait:
            time.sleep(poll_interval)
            elapsed += poll_interval
            
            poll_response = requests.get(f"{BASE_URL}/studio/render/{job_id}", timeout=10)
            
            if poll_response.status_code != 200:
                log_test("POST /api/studio/render (single-scene backward compat)", "FAIL", 
                        f"Poll failed with status {poll_response.status_code}")
                return False
            
            poll_data = poll_response.json()
            status = poll_data.get("status")
            
            print(f"   [{elapsed}s] Status: {status}")
            
            if status == "DONE":
                final_status = poll_data
                break
            elif status == "FAILED":
                log_test("POST /api/studio/render (single-scene backward compat)", "FAIL", 
                        f"Render FAILED: {poll_data.get('error')}")
                return False
        
        if not final_status or final_status.get("status") != "DONE":
            log_test("POST /api/studio/render (single-scene backward compat)", "FAIL", 
                    f"Render did not complete within {max_wait}s")
            return False
        
        # Verify video
        video_url = final_status.get("videoUrl")
        if not video_url:
            log_test("POST /api/studio/render (single-scene backward compat)", "FAIL", 
                    "Missing videoUrl in final render doc")
            return False
        
        video_response = requests.get(f"{BASE_URL.replace('/api', '')}{video_url}", timeout=30)
        
        if video_response.status_code != 200:
            log_test("POST /api/studio/render (single-scene backward compat)", "FAIL", 
                    f"Video download failed with status {video_response.status_code}")
            return False
        
        content_type = video_response.headers.get("Content-Type", "")
        if "video/mp4" not in content_type:
            log_test("POST /api/studio/render (single-scene backward compat)", "FAIL", 
                    f"Expected Content-Type video/mp4, got {content_type}")
            return False
        
        video_size = len(video_response.content)
        if video_size == 0:
            log_test("POST /api/studio/render (single-scene backward compat)", "FAIL", 
                    "Video file is empty")
            return False
        
        log_test("POST /api/studio/render (single-scene backward compat)", "PASS", 
                f"Render completed in {elapsed}s. Video: {video_size} bytes, audioMode=silent. "
                f"Backward compatibility VERIFIED.")
        return True
        
    except Exception as e:
        log_test("POST /api/studio/render (single-scene backward compat)", "FAIL", f"Exception: {str(e)}")
        return False

def main():
    """Run all new feature tests"""
    print("=" * 80)
    print("BACKEND TEST SUITE - NEW FEATURES")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    print("\nTesting TWO NEW capabilities:")
    print("1. AI poster-label suggestion (gpt-4o vision)")
    print("2. Multi-scene Reels render (ffmpeg xfade)")
    print("=" * 80)
    
    tests = [
        ("AI Suggest Labels - Valid Image", test_suggest_labels_valid),
        ("AI Suggest Labels - Empty Body (400)", test_suggest_labels_empty),
        ("Multi-Scene Render - Fade Transition", test_multi_scene_render_fade),
        ("Multi-Scene Render - Wipeleft Transition", test_multi_scene_render_wipeleft),
        ("Single-Scene Render - Backward Compatibility", test_single_scene_backward_compat),
    ]
    
    results = []
    for test_name, test_func in tests:
        result = test_func()
        results.append((test_name, result))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print("=" * 80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("=" * 80)
    
    # Exit with appropriate code
    sys.exit(0 if passed == total else 1)

if __name__ == "__main__":
    main()
