#!/usr/bin/env python3
"""
Backend API Test Suite for Command Cockpit - Reels Studio + Google OAuth + Cron
Tests ONLY the newly added endpoints for the Reels Studio module
"""

import requests
import json
import sys
import time
import base64
from datetime import datetime
from io import BytesIO
from PIL import Image

# Base URL from .env
BASE_URL = "https://audit-hub-154.preview.emergentagent.com/api"

def log_test(test_name, status, details=""):
    """Log test results"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status_icon = "✅" if status == "PASS" else "❌"
    print(f"\n{status_icon} [{timestamp}] {test_name}")
    if details:
        print(f"   {details}")

def generate_small_png_base64(width=300, height=533):
    """Generate a small PNG image as base64 data URL"""
    # Create a simple gradient image
    img = Image.new('RGB', (width, height), color='white')
    pixels = img.load()
    for y in range(height):
        for x in range(width):
            # Create a simple gradient
            r = int((x / width) * 255)
            g = int((y / height) * 255)
            b = 128
            pixels[x, y] = (r, g, b)
    
    # Convert to base64
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    img_bytes = buffer.getvalue()
    b64 = base64.b64encode(img_bytes).decode('utf-8')
    return f"data:image/png;base64,{b64}"

def test_studio_presets():
    """Test 1: GET /api/studio/presets -> 200 array with 4 items"""
    try:
        response = requests.get(f"{BASE_URL}/studio/presets", timeout=10)
        
        if response.status_code != 200:
            log_test("GET /api/studio/presets", "FAIL", f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if not isinstance(data, list):
            log_test("GET /api/studio/presets", "FAIL", "Response is not an array")
            return False
        
        if len(data) != 4:
            log_test("GET /api/studio/presets", "FAIL", f"Expected 4 presets, got {len(data)}")
            return False
        
        # Check required fields
        required_ids = ['enerjik', 'tekno', 'sakin', 'kurumsal']
        preset_ids = [p.get('id') for p in data]
        
        for req_id in required_ids:
            if req_id not in preset_ids:
                log_test("GET /api/studio/presets", "FAIL", f"Missing preset id: {req_id}")
                return False
        
        # Check each preset has required fields
        for preset in data:
            if 'id' not in preset or 'name' not in preset or 'url' not in preset:
                log_test("GET /api/studio/presets", "FAIL", f"Preset missing required fields: {preset}")
                return False
        
        log_test("GET /api/studio/presets", "PASS", 
                f"4 presets returned: {', '.join([p['id'] for p in data])}")
        return True
        
    except Exception as e:
        log_test("GET /api/studio/presets", "FAIL", f"Exception: {str(e)}")
        return False

def test_media_music_file():
    """Test 2: GET /api/media?dir=music&file=enerjik.mp3 -> 200 audio/mpeg non-empty"""
    try:
        response = requests.get(f"{BASE_URL}/media?dir=music&file=enerjik.mp3", timeout=10)
        
        if response.status_code != 200:
            log_test("GET /api/media (music file)", "FAIL", f"Expected 200, got {response.status_code}")
            return False
        
        content_type = response.headers.get('Content-Type', '')
        if 'audio/mpeg' not in content_type:
            log_test("GET /api/media (music file)", "FAIL", 
                    f"Expected Content-Type audio/mpeg, got {content_type}")
            return False
        
        if len(response.content) == 0:
            log_test("GET /api/media (music file)", "FAIL", "Response body is empty")
            return False
        
        log_test("GET /api/media (music file)", "PASS", 
                f"Audio file retrieved: {len(response.content)} bytes, Content-Type: {content_type}")
        return True
        
    except Exception as e:
        log_test("GET /api/media (music file)", "FAIL", f"Exception: {str(e)}")
        return False

def test_render_with_preset(preset_id="enerjik"):
    """Test 3: POST /api/studio/render with preset -> poll until DONE -> verify MP4"""
    try:
        # Generate a small PNG
        poster_data_url = generate_small_png_base64(300, 533)
        
        payload = {
            "posterDataUrl": poster_data_url,
            "audioMode": "preset",
            "presetId": preset_id
        }
        
        response = requests.post(f"{BASE_URL}/studio/render", json=payload, timeout=15)
        
        if response.status_code != 200:
            log_test(f"POST /api/studio/render (preset={preset_id})", "FAIL", 
                    f"Expected 200, got {response.status_code}: {response.text[:200]}")
            return False, None
        
        data = response.json()
        
        if 'jobId' not in data:
            log_test(f"POST /api/studio/render (preset={preset_id})", "FAIL", "Missing jobId in response")
            return False, None
        
        if data.get('status') != 'RENDERING':
            log_test(f"POST /api/studio/render (preset={preset_id})", "FAIL", 
                    f"Expected status=RENDERING, got {data.get('status')}")
            return False, None
        
        job_id = data['jobId']
        log_test(f"POST /api/studio/render (preset={preset_id})", "PASS", 
                f"Render started: jobId={job_id}, status=RENDERING")
        
        # Poll for completion
        max_attempts = 25  # 50 seconds (2 seconds * 25)
        attempt = 0
        final_status = None
        video_url = None
        
        print(f"   Polling for render completion (max 50 seconds)...")
        
        while attempt < max_attempts:
            time.sleep(2)
            attempt += 1
            
            poll_response = requests.get(f"{BASE_URL}/studio/render/{job_id}", timeout=10)
            
            if poll_response.status_code != 200:
                log_test(f"GET /api/studio/render/{job_id} (poll)", "FAIL", 
                        f"Expected 200, got {poll_response.status_code}")
                return False, None
            
            poll_data = poll_response.json()
            final_status = poll_data.get('status')
            video_url = poll_data.get('videoUrl')
            
            print(f"   Attempt {attempt}: status={final_status}")
            
            if final_status == 'DONE':
                if not video_url:
                    log_test(f"Render polling (preset={preset_id})", "FAIL", 
                            "Status is DONE but videoUrl is missing")
                    return False, None
                
                log_test(f"Render polling (preset={preset_id})", "PASS", 
                        f"Render completed in {attempt * 2} seconds. videoUrl={video_url}")
                
                # Now verify the video file
                video_response = requests.get(f"{BASE_URL.replace('/api', '')}{video_url}", timeout=10)
                
                if video_response.status_code != 200:
                    log_test(f"GET {video_url} (video file)", "FAIL", 
                            f"Expected 200, got {video_response.status_code}")
                    return False, job_id
                
                content_type = video_response.headers.get('Content-Type', '')
                if 'video/mp4' not in content_type:
                    log_test(f"GET {video_url} (video file)", "FAIL", 
                            f"Expected Content-Type video/mp4, got {content_type}")
                    return False, job_id
                
                if len(video_response.content) == 0:
                    log_test(f"GET {video_url} (video file)", "FAIL", "Video file is empty")
                    return False, job_id
                
                log_test(f"GET {video_url} (video file)", "PASS", 
                        f"Real MP4 produced: {len(video_response.content)} bytes, Content-Type: {content_type}")
                return True, job_id
            
            elif final_status == 'FAILED':
                error_msg = poll_data.get('error', 'Unknown error')
                log_test(f"Render polling (preset={preset_id})", "FAIL", 
                        f"Render FAILED: {error_msg}")
                return False, None
        
        # Timeout
        log_test(f"Render polling (preset={preset_id})", "FAIL", 
                f"Timeout after {max_attempts * 2} seconds. Final status: {final_status}")
        return False, None
        
    except Exception as e:
        log_test(f"POST /api/studio/render (preset={preset_id})", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_render_silent():
    """Test 4: POST /api/studio/render with audioMode=silent -> verify MP4"""
    try:
        poster_data_url = generate_small_png_base64(300, 533)
        
        payload = {
            "posterDataUrl": poster_data_url,
            "audioMode": "silent"
        }
        
        response = requests.post(f"{BASE_URL}/studio/render", json=payload, timeout=15)
        
        if response.status_code != 200:
            log_test("POST /api/studio/render (silent)", "FAIL", 
                    f"Expected 200, got {response.status_code}: {response.text[:200]}")
            return False, None
        
        data = response.json()
        
        if 'jobId' not in data or data.get('status') != 'RENDERING':
            log_test("POST /api/studio/render (silent)", "FAIL", 
                    f"Invalid response: {data}")
            return False, None
        
        job_id = data['jobId']
        log_test("POST /api/studio/render (silent)", "PASS", 
                f"Render started: jobId={job_id}, status=RENDERING")
        
        # Poll for completion
        max_attempts = 25
        attempt = 0
        
        print(f"   Polling for silent render completion (max 50 seconds)...")
        
        while attempt < max_attempts:
            time.sleep(2)
            attempt += 1
            
            poll_response = requests.get(f"{BASE_URL}/studio/render/{job_id}", timeout=10)
            
            if poll_response.status_code != 200:
                log_test(f"GET /api/studio/render/{job_id} (silent poll)", "FAIL", 
                        f"Expected 200, got {poll_response.status_code}")
                return False, None
            
            poll_data = poll_response.json()
            final_status = poll_data.get('status')
            video_url = poll_data.get('videoUrl')
            
            print(f"   Attempt {attempt}: status={final_status}")
            
            if final_status == 'DONE':
                if not video_url:
                    log_test("Render polling (silent)", "FAIL", 
                            "Status is DONE but videoUrl is missing")
                    return False, None
                
                log_test("Render polling (silent)", "PASS", 
                        f"Silent render completed in {attempt * 2} seconds. videoUrl={video_url}")
                
                # Verify the video file
                video_response = requests.get(f"{BASE_URL.replace('/api', '')}{video_url}", timeout=10)
                
                if video_response.status_code != 200:
                    log_test(f"GET {video_url} (silent video)", "FAIL", 
                            f"Expected 200, got {video_response.status_code}")
                    return False, job_id
                
                content_type = video_response.headers.get('Content-Type', '')
                if 'video/mp4' not in content_type:
                    log_test(f"GET {video_url} (silent video)", "FAIL", 
                            f"Expected Content-Type video/mp4, got {content_type}")
                    return False, job_id
                
                if len(video_response.content) == 0:
                    log_test(f"GET {video_url} (silent video)", "FAIL", "Video file is empty")
                    return False, job_id
                
                log_test(f"GET {video_url} (silent video)", "PASS", 
                        f"Real silent MP4 produced: {len(video_response.content)} bytes")
                return True, job_id
            
            elif final_status == 'FAILED':
                error_msg = poll_data.get('error', 'Unknown error')
                log_test("Render polling (silent)", "FAIL", f"Render FAILED: {error_msg}")
                return False, None
        
        log_test("Render polling (silent)", "FAIL", 
                f"Timeout after {max_attempts * 2} seconds")
        return False, None
        
    except Exception as e:
        log_test("POST /api/studio/render (silent)", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_remove_bg_expected_error():
    """Test 5: POST /api/studio/remove-bg -> EXPECTED clean 503 JSON (missing API key)"""
    try:
        # Generate a tiny PNG
        img = Image.new('RGB', (50, 50), color='red')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        img_bytes = buffer.getvalue()
        b64 = base64.b64encode(img_bytes).decode('utf-8')
        data_url = f"data:image/png;base64,{b64}"
        
        payload = {"image": data_url}
        
        response = requests.post(f"{BASE_URL}/studio/remove-bg", json=payload, timeout=10)
        
        # Should return 503 error
        if response.status_code != 503:
            log_test("POST /api/studio/remove-bg (expected error)", "FAIL", 
                    f"Expected 503 error, got {response.status_code}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("POST /api/studio/remove-bg (expected error)", "FAIL", 
                    "Response is not valid JSON (crashed)")
            return False
        
        # Should have error field
        if "error" not in data:
            log_test("POST /api/studio/remove-bg (expected error)", "FAIL", 
                    "Response missing 'error' field")
            return False
        
        # Check error message mentions API key
        error_msg = data["error"]
        if "API_KEY" not in error_msg.upper():
            log_test("POST /api/studio/remove-bg (expected error)", "FAIL", 
                    f"Error message should mention API_KEY, got: {error_msg}")
            return False
        
        log_test("POST /api/studio/remove-bg (expected error)", "PASS", 
                f"Clean 503 JSON error as expected: '{error_msg}'")
        return True
        
    except Exception as e:
        log_test("POST /api/studio/remove-bg (expected error)", "FAIL", f"Exception: {str(e)}")
        return False

def test_google_oauth_status():
    """Test 6: GET /api/oauth/google/status -> {connected:false, configured:false}"""
    try:
        response = requests.get(f"{BASE_URL}/oauth/google/status", timeout=10)
        
        if response.status_code != 200:
            log_test("GET /api/oauth/google/status", "FAIL", f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check required fields
        if 'connected' not in data or 'configured' not in data:
            log_test("GET /api/oauth/google/status", "FAIL", 
                    f"Missing required fields. Got: {data}")
            return False
        
        # Should be false since credentials are empty
        if data['connected'] != False:
            log_test("GET /api/oauth/google/status", "FAIL", 
                    f"Expected connected=false, got {data['connected']}")
            return False
        
        if data['configured'] != False:
            log_test("GET /api/oauth/google/status", "FAIL", 
                    f"Expected configured=false, got {data['configured']}")
            return False
        
        log_test("GET /api/oauth/google/status", "PASS", 
                f"connected={data['connected']}, configured={data['configured']}")
        return True
        
    except Exception as e:
        log_test("GET /api/oauth/google/status", "FAIL", f"Exception: {str(e)}")
        return False

def test_google_oauth_url_expected_error():
    """Test 7: GET /api/oauth/google/url -> EXPECTED clean 503 JSON (missing credentials)"""
    try:
        response = requests.get(f"{BASE_URL}/oauth/google/url", timeout=10)
        
        # Should return 503 error
        if response.status_code != 503:
            log_test("GET /api/oauth/google/url (expected error)", "FAIL", 
                    f"Expected 503 error, got {response.status_code}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("GET /api/oauth/google/url (expected error)", "FAIL", 
                    "Response is not valid JSON (crashed)")
            return False
        
        # Should have error field
        if "error" not in data:
            log_test("GET /api/oauth/google/url (expected error)", "FAIL", 
                    "Response missing 'error' field")
            return False
        
        error_msg = data["error"]
        if "GOOGLE_CLIENT" not in error_msg.upper():
            log_test("GET /api/oauth/google/url (expected error)", "FAIL", 
                    f"Error message should mention GOOGLE_CLIENT, got: {error_msg}")
            return False
        
        log_test("GET /api/oauth/google/url (expected error)", "PASS", 
                f"Clean 503 JSON error as expected: '{error_msg}'")
        return True
        
    except Exception as e:
        log_test("GET /api/oauth/google/url (expected error)", "FAIL", f"Exception: {str(e)}")
        return False

def test_youtube_upload_short_expected_error(job_id=None):
    """Test 8: POST /api/youtube/upload-short -> EXPECTED clean 501 JSON with OAUTH_REQUIRED"""
    try:
        payload = {}
        if job_id:
            payload["jobId"] = job_id
        else:
            payload["file"] = "test.mp4"
        
        response = requests.post(f"{BASE_URL}/youtube/upload-short", json=payload, timeout=10)
        
        # Should return 501 error
        if response.status_code != 501:
            log_test("POST /api/youtube/upload-short (expected error)", "FAIL", 
                    f"Expected 501 error, got {response.status_code}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("POST /api/youtube/upload-short (expected error)", "FAIL", 
                    "Response is not valid JSON (crashed)")
            return False
        
        # Should have error field with OAUTH_REQUIRED
        if "error" not in data:
            log_test("POST /api/youtube/upload-short (expected error)", "FAIL", 
                    "Response missing 'error' field")
            return False
        
        if data["error"] != "OAUTH_REQUIRED":
            log_test("POST /api/youtube/upload-short (expected error)", "FAIL", 
                    f"Expected error='OAUTH_REQUIRED', got '{data['error']}'")
            return False
        
        log_test("POST /api/youtube/upload-short (expected error)", "PASS", 
                f"Clean 501 JSON error as expected: error='{data['error']}'")
        return True
        
    except Exception as e:
        log_test("POST /api/youtube/upload-short (expected error)", "FAIL", f"Exception: {str(e)}")
        return False

def test_reels_publish_fb_expected_error(job_id=None):
    """Test 9: POST /api/reels/publish-fb -> EXPECTED clean 501 JSON (no page token)"""
    try:
        payload = {}
        if job_id:
            payload["jobId"] = job_id
        else:
            payload["file"] = "test.mp4"
        
        response = requests.post(f"{BASE_URL}/reels/publish-fb", json=payload, timeout=10)
        
        # Should return 501 error
        if response.status_code != 501:
            log_test("POST /api/reels/publish-fb (expected error)", "FAIL", 
                    f"Expected 501 error, got {response.status_code}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("POST /api/reels/publish-fb (expected error)", "FAIL", 
                    "Response is not valid JSON (crashed)")
            return False
        
        # Should have error field
        if "error" not in data:
            log_test("POST /api/reels/publish-fb (expected error)", "FAIL", 
                    "Response missing 'error' field")
            return False
        
        error_msg = data["error"]
        # Check for PAGE_ID or PAGE_ACCESS_TOKEN mention
        if "PAGE" not in error_msg.upper():
            log_test("POST /api/reels/publish-fb (expected error)", "FAIL", 
                    f"Error message should mention PAGE, got: {error_msg}")
            return False
        
        log_test("POST /api/reels/publish-fb (expected error)", "PASS", 
                f"Clean 501 JSON error as expected: '{error_msg}'")
        return True
        
    except Exception as e:
        log_test("POST /api/reels/publish-fb (expected error)", "FAIL", f"Exception: {str(e)}")
        return False

def test_cron_endpoints():
    """Test 10: Cron endpoints - status, toggle, run"""
    try:
        # Test GET /api/cron/status
        response = requests.get(f"{BASE_URL}/cron/status", timeout=10)
        
        if response.status_code != 200:
            log_test("GET /api/cron/status", "FAIL", f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if 'enabled' not in data or 'schedule' not in data:
            log_test("GET /api/cron/status", "FAIL", f"Missing required fields. Got: {data}")
            return False
        
        if data['schedule'] != '*/15 * * * *':
            log_test("GET /api/cron/status", "FAIL", 
                    f"Expected schedule='*/15 * * * *', got '{data['schedule']}'")
            return False
        
        log_test("GET /api/cron/status", "PASS", 
                f"enabled={data['enabled']}, schedule='{data['schedule']}'")
        
        # Test POST /api/cron/toggle (enable)
        response = requests.post(f"{BASE_URL}/cron/toggle", json={"enabled": True}, timeout=10)
        
        if response.status_code != 200:
            log_test("POST /api/cron/toggle (enable)", "FAIL", 
                    f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if not data.get('ok'):
            log_test("POST /api/cron/toggle (enable)", "FAIL", "Response ok is not true")
            return False
        
        if data.get('enabled') != True:
            log_test("POST /api/cron/toggle (enable)", "FAIL", 
                    f"Expected enabled=true, got {data.get('enabled')}")
            return False
        
        if data.get('running') != True:
            log_test("POST /api/cron/toggle (enable)", "FAIL", 
                    f"Expected running=true, got {data.get('running')}")
            return False
        
        log_test("POST /api/cron/toggle (enable)", "PASS", 
                f"ok={data['ok']}, enabled={data['enabled']}, running={data['running']}")
        
        # Test POST /api/cron/run
        response = requests.post(f"{BASE_URL}/cron/run", json={}, timeout=15)
        
        if response.status_code != 200:
            log_test("POST /api/cron/run", "FAIL", f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if not data.get('ok'):
            log_test("POST /api/cron/run", "FAIL", "Response ok is not true")
            return False
        
        if 'result' not in data:
            log_test("POST /api/cron/run", "FAIL", "Missing 'result' field")
            return False
        
        result = data['result']
        if 'facebook' not in result or 'youtube' not in result:
            log_test("POST /api/cron/run", "FAIL", 
                    f"Result missing facebook/youtube counts. Got: {result}")
            return False
        
        log_test("POST /api/cron/run", "PASS", 
                f"ok={data['ok']}, result={{facebook:{result['facebook']}, youtube:{result['youtube']}}}")
        
        # Test POST /api/cron/toggle (disable)
        response = requests.post(f"{BASE_URL}/cron/toggle", json={"enabled": False}, timeout=10)
        
        if response.status_code != 200:
            log_test("POST /api/cron/toggle (disable)", "FAIL", 
                    f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('enabled') != False:
            log_test("POST /api/cron/toggle (disable)", "FAIL", 
                    f"Expected enabled=false, got {data.get('enabled')}")
            return False
        
        if data.get('running') != False:
            log_test("POST /api/cron/toggle (disable)", "FAIL", 
                    f"Expected running=false, got {data.get('running')}")
            return False
        
        log_test("POST /api/cron/toggle (disable)", "PASS", 
                f"ok={data['ok']}, enabled={data['enabled']}, running={data['running']}")
        
        return True
        
    except Exception as e:
        log_test("Cron endpoints", "FAIL", f"Exception: {str(e)}")
        return False

def main():
    """Run all Reels Studio + Google OAuth + Cron tests"""
    print("=" * 80)
    print("BACKEND TEST SUITE - Reels Studio + Google OAuth + Cron")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    results = []
    done_job_id = None
    
    # Test 1: Studio presets
    result = test_studio_presets()
    results.append(("Studio Presets", result))
    
    # Test 2: Media music file
    result = test_media_music_file()
    results.append(("Media Music File", result))
    
    # Test 3: Render with preset (CRITICAL - ffmpeg)
    result, job_id = test_render_with_preset("enerjik")
    results.append(("Render with Preset (enerjik)", result))
    if result and job_id:
        done_job_id = job_id
    
    # Test 4: Render silent (CRITICAL - ffmpeg)
    result, job_id = test_render_silent()
    results.append(("Render Silent", result))
    if result and job_id and not done_job_id:
        done_job_id = job_id
    
    # Test 5: Remove-bg expected error
    result = test_remove_bg_expected_error()
    results.append(("Remove-bg Expected Error", result))
    
    # Test 6: Google OAuth status
    result = test_google_oauth_status()
    results.append(("Google OAuth Status", result))
    
    # Test 7: Google OAuth URL expected error
    result = test_google_oauth_url_expected_error()
    results.append(("Google OAuth URL Expected Error", result))
    
    # Test 8: YouTube upload-short expected error
    result = test_youtube_upload_short_expected_error(done_job_id)
    results.append(("YouTube Upload-Short Expected Error", result))
    
    # Test 9: Facebook Reels publish expected error
    result = test_reels_publish_fb_expected_error(done_job_id)
    results.append(("Facebook Reels Publish Expected Error", result))
    
    # Test 10: Cron endpoints
    result = test_cron_endpoints()
    results.append(("Cron Endpoints", result))
    
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
