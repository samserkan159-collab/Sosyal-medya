#!/usr/bin/env python3
"""
Backend API Test Suite for Command Cockpit - Instagram Reels + Schedule Endpoints
Tests ONLY the newly added Instagram Reels publish + Scheduled publishing endpoints
"""

import os
import requests
import json
import sys
import time
import base64
from datetime import datetime, timedelta

BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:3000/api").rstrip("/")
ORIGIN = BASE_URL[:-4] if BASE_URL.endswith("/api") else BASE_URL

def log_test(test_name, status, details=""):
    """Log test results"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status_icon = "✅" if status == "PASS" else "❌"
    print(f"\n{status_icon} [{timestamp}] {test_name}")
    if details:
        print(f"   {details}")

def create_small_png_base64():
    """Create a small valid PNG base64 data URL for testing"""
    # 1x1 red pixel PNG
    png_bytes = base64.b64decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
    )
    return f"data:image/png;base64,{base64.b64encode(png_bytes).decode()}"

def create_render_job():
    """Create a render job and wait for it to complete. Returns jobId or None."""
    try:
        print("\n🔧 SETUP: Creating render job...")
        
        # Create render job
        payload = {
            "posterDataUrl": create_small_png_base64(),
            "audioMode": "silent"
        }
        
        response = requests.post(f"{BASE_URL}/studio/render", json=payload, timeout=30)
        
        if response.status_code != 200:
            print(f"   ❌ Failed to create render job: {response.status_code}")
            return None
        
        data = response.json()
        job_id = data.get("jobId")
        
        if not job_id:
            print(f"   ❌ No jobId in response: {data}")
            return None
        
        print(f"   ✅ Render job created: {job_id}")
        print(f"   ⏳ Polling for completion...")
        
        # Poll for completion (max 60 seconds)
        max_attempts = 30
        for attempt in range(max_attempts):
            time.sleep(2)
            
            poll_response = requests.get(f"{BASE_URL}/studio/render/{job_id}", timeout=10)
            
            if poll_response.status_code != 200:
                print(f"   ❌ Poll failed: {poll_response.status_code}")
                return None
            
            poll_data = poll_response.json()
            status = poll_data.get("status")
            
            print(f"   ... Attempt {attempt + 1}/{max_attempts}: status={status}")
            
            if status == "DONE":
                print(f"   ✅ Render completed successfully!")
                return job_id
            elif status == "ERROR":
                print(f"   ❌ Render failed with ERROR status")
                return None
        
        print(f"   ❌ Render timed out after {max_attempts * 2} seconds")
        return None
        
    except Exception as e:
        print(f"   ❌ Exception during render setup: {str(e)}")
        return None

def test_1_publish_ig_expected_501():
    """Test 1: POST /api/reels/publish-ig {jobId} -> EXPECTED clean 501 (IG_USER_ID missing)"""
    try:
        job_id = create_render_job()
        
        if not job_id:
            log_test("POST /api/reels/publish-ig (expected 501)", "FAIL", 
                    "Could not create render job for testing")
            return False
        
        payload = {
            "jobId": job_id,
            "caption": "Test Instagram Reel"
        }
        
        response = requests.post(f"{BASE_URL}/reels/publish-ig", json=payload, timeout=10)
        
        # Should return 501 error (IG_USER_ID not configured)
        if response.status_code != 501:
            log_test("POST /api/reels/publish-ig (expected 501)", "FAIL", 
                    f"Expected 501 error, got {response.status_code}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("POST /api/reels/publish-ig (expected 501)", "FAIL", 
                    "Response is not valid JSON (crashed)")
            return False
        
        # Should have error field
        if "error" not in data:
            log_test("POST /api/reels/publish-ig (expected 501)", "FAIL", 
                    "Response missing 'error' field")
            return False
        
        # Check error message mentions IG_USER_ID
        error_msg = data["error"]
        if "IG_USER_ID" not in error_msg:
            log_test("POST /api/reels/publish-ig (expected 501)", "FAIL", 
                    f"Error message should mention IG_USER_ID, got: {error_msg}")
            return False
        
        log_test("POST /api/reels/publish-ig (expected 501)", "PASS", 
                f"Clean 501 JSON error as expected: '{error_msg}'")
        return True
        
    except Exception as e:
        log_test("POST /api/reels/publish-ig (expected 501)", "FAIL", f"Exception: {str(e)}")
        return False

def test_2_get_schedule_empty():
    """Test 2: GET /api/schedule -> 200 JSON array"""
    try:
        response = requests.get(f"{BASE_URL}/schedule", timeout=10)
        
        if response.status_code != 200:
            log_test("GET /api/schedule (initial)", "FAIL", f"Expected 200, got {response.status_code}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("GET /api/schedule (initial)", "FAIL", "Response is not valid JSON")
            return False
        
        # Should be an array
        if not isinstance(data, list):
            log_test("GET /api/schedule (initial)", "FAIL", f"Expected array, got {type(data)}")
            return False
        
        log_test("GET /api/schedule (initial)", "PASS", 
                f"Returns array with {len(data)} items")
        return True
        
    except Exception as e:
        log_test("GET /api/schedule (initial)", "FAIL", f"Exception: {str(e)}")
        return False

def test_3_create_schedule():
    """Test 3: POST /api/schedule {jobId, platforms, caption, scheduledAt} -> 200 with status PENDING"""
    try:
        job_id = create_render_job()
        
        if not job_id:
            log_test("POST /api/schedule (create)", "FAIL", 
                    "Could not create render job for testing")
            return False
        
        # Schedule for 2 minutes in the future
        scheduled_time = datetime.utcnow() + timedelta(minutes=2)
        scheduled_iso = scheduled_time.isoformat() + "Z"
        
        payload = {
            "jobId": job_id,
            "platforms": ["facebook", "instagram"],
            "caption": "Test scheduled post",
            "scheduledAt": scheduled_iso
        }
        
        response = requests.post(f"{BASE_URL}/schedule", json=payload, timeout=10)
        
        if response.status_code != 200:
            log_test("POST /api/schedule (create)", "FAIL", 
                    f"Expected 200, got {response.status_code}. Response: {response.text[:200]}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("POST /api/schedule (create)", "FAIL", "Response is not valid JSON")
            return False
        
        # Check required fields
        required_fields = ["id", "jobId", "platforms", "caption", "scheduledAt", "status"]
        for field in required_fields:
            if field not in data:
                log_test("POST /api/schedule (create)", "FAIL", f"Missing required field: {field}")
                return False
        
        # Verify status is PENDING
        if data["status"] != "PENDING":
            log_test("POST /api/schedule (create)", "FAIL", 
                    f"Expected status='PENDING', got '{data['status']}'")
            return False
        
        # Verify platforms
        if not isinstance(data["platforms"], list) or len(data["platforms"]) != 2:
            log_test("POST /api/schedule (create)", "FAIL", 
                    f"Expected platforms array with 2 items, got {data['platforms']}")
            return False
        
        # Store schedule_id for later tests
        global SCHEDULE_ID
        SCHEDULE_ID = data["id"]
        
        log_test("POST /api/schedule (create)", "PASS", 
                f"Created schedule id={data['id']}, status={data['status']}, "
                f"platforms={data['platforms']}, scheduledAt={data['scheduledAt']}")
        return True
        
    except Exception as e:
        log_test("POST /api/schedule (create)", "FAIL", f"Exception: {str(e)}")
        return False

def test_4_get_schedule_includes_new():
    """Test 4: GET /api/schedule -> array includes the newly created item with status PENDING"""
    try:
        if not SCHEDULE_ID:
            log_test("GET /api/schedule (verify new item)", "FAIL", 
                    "No SCHEDULE_ID from previous test")
            return False
        
        response = requests.get(f"{BASE_URL}/schedule", timeout=10)
        
        if response.status_code != 200:
            log_test("GET /api/schedule (verify new item)", "FAIL", 
                    f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if not isinstance(data, list):
            log_test("GET /api/schedule (verify new item)", "FAIL", "Response is not an array")
            return False
        
        # Find the schedule we created
        found = None
        for item in data:
            if item.get("id") == SCHEDULE_ID:
                found = item
                break
        
        if not found:
            log_test("GET /api/schedule (verify new item)", "FAIL", 
                    f"Schedule id={SCHEDULE_ID} not found in list")
            return False
        
        # Verify status is still PENDING
        if found["status"] != "PENDING":
            log_test("GET /api/schedule (verify new item)", "FAIL", 
                    f"Expected status='PENDING', got '{found['status']}'")
            return False
        
        log_test("GET /api/schedule (verify new item)", "PASS", 
                f"Found schedule id={SCHEDULE_ID} with status={found['status']}")
        return True
        
    except Exception as e:
        log_test("GET /api/schedule (verify new item)", "FAIL", f"Exception: {str(e)}")
        return False

def test_5_publish_now_expected_failed():
    """Test 5: POST /api/schedule/<id>/publish-now -> status FAILED (no real tokens) with results object"""
    try:
        if not SCHEDULE_ID:
            log_test("POST /api/schedule/<id>/publish-now (expected FAILED)", "FAIL", 
                    "No SCHEDULE_ID from previous test")
            return False
        
        response = requests.post(f"{BASE_URL}/schedule/{SCHEDULE_ID}/publish-now", json={}, timeout=30)
        
        if response.status_code != 200:
            log_test("POST /api/schedule/<id>/publish-now (expected FAILED)", "FAIL", 
                    f"Expected 200, got {response.status_code}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("POST /api/schedule/<id>/publish-now (expected FAILED)", "FAIL", 
                    "Response is not valid JSON (crashed)")
            return False
        
        # Check status field
        if "status" not in data:
            log_test("POST /api/schedule/<id>/publish-now (expected FAILED)", "FAIL", 
                    "Response missing 'status' field")
            return False
        
        # Status should be FAILED (since no real tokens)
        # Note: Could also be PUBLISHED if tokens existed, but they don't
        if data["status"] not in ["FAILED", "PUBLISHED"]:
            log_test("POST /api/schedule/<id>/publish-now (expected FAILED)", "FAIL", 
                    f"Expected status='FAILED' or 'PUBLISHED', got '{data['status']}'")
            return False
        
        # If FAILED, should have results object with error messages
        if data["status"] == "FAILED":
            if "results" not in data:
                log_test("POST /api/schedule/<id>/publish-now (expected FAILED)", "FAIL", 
                        "Status is FAILED but missing 'results' field")
                return False
            
            results = data["results"]
            
            # Results should contain per-platform error strings
            if not isinstance(results, dict):
                log_test("POST /api/schedule/<id>/publish-now (expected FAILED)", "FAIL", 
                        f"Expected results to be object, got {type(results)}")
                return False
            
            # Should have facebook and/or instagram keys with error messages
            has_errors = False
            for platform in ["facebook", "instagram"]:
                if platform in results and isinstance(results[platform], str) and "HATA" in results[platform]:
                    has_errors = True
            
            if not has_errors:
                log_test("POST /api/schedule/<id>/publish-now (expected FAILED)", "FAIL", 
                        f"Expected error messages in results, got: {results}")
                return False
            
            log_test("POST /api/schedule/<id>/publish-now (expected FAILED)", "PASS", 
                    f"Clean JSON response with status={data['status']}, results contain per-platform errors (EXPECTED behavior)")
        else:
            # If PUBLISHED, that would mean tokens exist (unexpected but not a crash)
            log_test("POST /api/schedule/<id>/publish-now (expected FAILED)", "PASS", 
                    f"Status={data['status']} (tokens may exist, not a crash)")
        
        return True
        
    except Exception as e:
        log_test("POST /api/schedule/<id>/publish-now (expected FAILED)", "FAIL", f"Exception: {str(e)}")
        return False

def test_6_create_schedule_nonexistent_job():
    """Test 6: POST /api/schedule {jobId: 'nonexistent-xyz'} -> EXPECTED clean 400 'Render bulunamadi'"""
    try:
        # Schedule for future
        scheduled_time = datetime.utcnow() + timedelta(minutes=2)
        scheduled_iso = scheduled_time.isoformat() + "Z"
        
        payload = {
            "jobId": "nonexistent-xyz-12345",
            "platforms": ["facebook"],
            "caption": "Test",
            "scheduledAt": scheduled_iso
        }
        
        response = requests.post(f"{BASE_URL}/schedule", json=payload, timeout=10)
        
        # Should return 400 error
        if response.status_code != 400:
            log_test("POST /api/schedule (nonexistent job)", "FAIL", 
                    f"Expected 400 error, got {response.status_code}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("POST /api/schedule (nonexistent job)", "FAIL", 
                    "Response is not valid JSON (crashed)")
            return False
        
        # Should have error field
        if "error" not in data:
            log_test("POST /api/schedule (nonexistent job)", "FAIL", 
                    "Response missing 'error' field")
            return False
        
        # Check error message mentions render not found
        error_msg = data["error"]
        if "bulunamadi" not in error_msg.lower():
            log_test("POST /api/schedule (nonexistent job)", "FAIL", 
                    f"Error message should mention 'bulunamadi', got: {error_msg}")
            return False
        
        log_test("POST /api/schedule (nonexistent job)", "PASS", 
                f"Clean 400 JSON error as expected: '{error_msg}'")
        return True
        
    except Exception as e:
        log_test("POST /api/schedule (nonexistent job)", "FAIL", f"Exception: {str(e)}")
        return False

def test_7_delete_schedule():
    """Test 7: DELETE /api/schedule/<id> -> {ok:true}, then GET /api/schedule no longer contains it"""
    try:
        if not SCHEDULE_ID:
            log_test("DELETE /api/schedule/<id>", "FAIL", 
                    "No SCHEDULE_ID from previous test")
            return False
        
        # Delete the schedule
        response = requests.delete(f"{BASE_URL}/schedule/{SCHEDULE_ID}", timeout=10)
        
        if response.status_code != 200:
            log_test("DELETE /api/schedule/<id>", "FAIL", 
                    f"Expected 200, got {response.status_code}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("DELETE /api/schedule/<id>", "FAIL", "Response is not valid JSON")
            return False
        
        # Should have ok: true
        if not data.get("ok"):
            log_test("DELETE /api/schedule/<id>", "FAIL", 
                    f"Expected ok:true, got {data}")
            return False
        
        # Verify it's gone from the list
        time.sleep(1)  # Brief pause
        
        get_response = requests.get(f"{BASE_URL}/schedule", timeout=10)
        
        if get_response.status_code != 200:
            log_test("DELETE /api/schedule/<id>", "FAIL", 
                    f"GET after delete failed: {get_response.status_code}")
            return False
        
        schedules = get_response.json()
        
        # Check that our schedule is not in the list
        found = any(item.get("id") == SCHEDULE_ID for item in schedules)
        
        if found:
            log_test("DELETE /api/schedule/<id>", "FAIL", 
                    f"Schedule id={SCHEDULE_ID} still exists after delete")
            return False
        
        log_test("DELETE /api/schedule/<id>", "PASS", 
                f"Deleted schedule id={SCHEDULE_ID} and verified removal")
        return True
        
    except Exception as e:
        log_test("DELETE /api/schedule/<id>", "FAIL", f"Exception: {str(e)}")
        return False

def test_8_config_instagram_integration():
    """Test 8: GET /api/config -> integrations.instagram === false"""
    try:
        response = requests.get(f"{BASE_URL}/config", timeout=10)
        
        if response.status_code != 200:
            log_test("GET /api/config (instagram)", "FAIL", f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check integrations object exists
        if "integrations" not in data:
            log_test("GET /api/config (instagram)", "FAIL", "Missing 'integrations' object")
            return False
        
        integrations = data["integrations"]
        
        # Check instagram field
        if "instagram" not in integrations:
            log_test("GET /api/config (instagram)", "FAIL", "Missing 'instagram' field in integrations")
            return False
        
        # Verify value is false (since IG_USER_ID is empty)
        if integrations["instagram"] != False:
            log_test("GET /api/config (instagram)", "FAIL", 
                    f"Expected instagram:false, got {integrations['instagram']}")
            return False
        
        log_test("GET /api/config (instagram)", "PASS", 
                f"integrations.instagram={integrations['instagram']} (correct)")
        return True
        
    except Exception as e:
        log_test("GET /api/config (instagram)", "FAIL", f"Exception: {str(e)}")
        return False

# Global variable to store schedule ID between tests
SCHEDULE_ID = None

def main():
    """Run all Instagram Reels + Schedule endpoint tests"""
    print("=" * 80)
    print("BACKEND TEST SUITE - Instagram Reels + Schedule Endpoints")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    print("\nCONTEXT: IG_USER_ID, Facebook page tokens, and Google OAuth creds are")
    print("intentionally EMPTY placeholders. Endpoints returning clean 501/502 errors")
    print("or schedules ending in status FAILED due to missing tokens are EXPECTED")
    print("behavior and MUST NOT be reported as failures.")
    print("=" * 80)
    
    tests = [
        ("POST /api/reels/publish-ig (expected 501)", test_1_publish_ig_expected_501),
        ("GET /api/schedule (initial)", test_2_get_schedule_empty),
        ("POST /api/schedule (create)", test_3_create_schedule),
        ("GET /api/schedule (verify new item)", test_4_get_schedule_includes_new),
        ("POST /api/schedule/<id>/publish-now (expected FAILED)", test_5_publish_now_expected_failed),
        ("POST /api/schedule (nonexistent job)", test_6_create_schedule_nonexistent_job),
        ("DELETE /api/schedule/<id>", test_7_delete_schedule),
        ("GET /api/config (instagram)", test_8_config_instagram_integration),
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
