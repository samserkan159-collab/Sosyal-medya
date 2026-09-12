#!/usr/bin/env python3
"""
Backend API Test Suite for Command Cockpit - YouTube Endpoints
Tests ONLY the newly added YouTube endpoints
"""

import requests
import json
import sys
from datetime import datetime

# Base URL from .env
BASE_URL = "https://audit-hub-154.preview.emergentagent.com/api"

def log_test(test_name, status, details=""):
    """Log test results"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status_icon = "✅" if status == "PASS" else "❌"
    print(f"\n{status_icon} [{timestamp}] {test_name}")
    if details:
        print(f"   {details}")

def test_config_youtube_integration():
    """Test 1: GET /api/config -> integrations includes youtube, youtubeReply, youtubeChannelId, permissions"""
    try:
        response = requests.get(f"{BASE_URL}/config", timeout=10)
        
        if response.status_code != 200:
            log_test("GET /api/config", "FAIL", f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check integrations object exists
        if "integrations" not in data:
            log_test("GET /api/config", "FAIL", "Missing 'integrations' object")
            return False
        
        integrations = data["integrations"]
        
        # Check youtube fields
        if "youtube" not in integrations:
            log_test("GET /api/config", "FAIL", "Missing 'youtube' field in integrations")
            return False
        
        if "youtubeReply" not in integrations:
            log_test("GET /api/config", "FAIL", "Missing 'youtubeReply' field in integrations")
            return False
        
        if "youtubeChannelId" not in integrations:
            log_test("GET /api/config", "FAIL", "Missing 'youtubeChannelId' field in integrations")
            return False
        
        # Check permissions array
        if "permissions" not in data:
            log_test("GET /api/config", "FAIL", "Missing 'permissions' array")
            return False
        
        if not isinstance(data["permissions"], list):
            log_test("GET /api/config", "FAIL", "permissions is not an array")
            return False
        
        # Verify values (should be false since keys are empty)
        if integrations["youtube"] != False:
            log_test("GET /api/config", "FAIL", f"Expected youtube:false, got {integrations['youtube']}")
            return False
        
        if integrations["youtubeReply"] != False:
            log_test("GET /api/config", "FAIL", f"Expected youtubeReply:false, got {integrations['youtubeReply']}")
            return False
        
        log_test("GET /api/config", "PASS", 
                f"integrations.youtube={integrations['youtube']}, youtubeReply={integrations['youtubeReply']}, "
                f"youtubeChannelId='{integrations['youtubeChannelId']}', permissions={len(data['permissions'])} items")
        return True
        
    except Exception as e:
        log_test("GET /api/config", "FAIL", f"Exception: {str(e)}")
        return False

def test_youtube_status():
    """Test 2: GET /api/youtube/status -> {configured:false, replyEnabled:false, channelId:"", capturedLeads:<number>}"""
    try:
        response = requests.get(f"{BASE_URL}/youtube/status", timeout=10)
        
        if response.status_code != 200:
            log_test("GET /api/youtube/status", "FAIL", f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check required fields
        required_fields = ["configured", "replyEnabled", "channelId", "capturedLeads"]
        for field in required_fields:
            if field not in data:
                log_test("GET /api/youtube/status", "FAIL", f"Missing required field: {field}")
                return False
        
        # Verify values
        if data["configured"] != False:
            log_test("GET /api/youtube/status", "FAIL", f"Expected configured:false, got {data['configured']}")
            return False
        
        if data["replyEnabled"] != False:
            log_test("GET /api/youtube/status", "FAIL", f"Expected replyEnabled:false, got {data['replyEnabled']}")
            return False
        
        if data["channelId"] != "":
            log_test("GET /api/youtube/status", "FAIL", f"Expected channelId:'', got '{data['channelId']}'")
            return False
        
        if not isinstance(data["capturedLeads"], int):
            log_test("GET /api/youtube/status", "FAIL", f"capturedLeads should be a number, got {type(data['capturedLeads'])}")
            return False
        
        log_test("GET /api/youtube/status", "PASS", 
                f"configured={data['configured']}, replyEnabled={data['replyEnabled']}, "
                f"channelId='{data['channelId']}', capturedLeads={data['capturedLeads']}")
        return True
        
    except Exception as e:
        log_test("GET /api/youtube/status", "FAIL", f"Exception: {str(e)}")
        return False

def test_youtube_simulate_price_inquiry():
    """Test 3: POST /api/youtube/simulate with price inquiry -> creates Lead with YOUTUBE_COMMENT platform"""
    try:
        payload = {
            "message": "Bu urunun fiyati ne kadar, nerede satiyorsunuz?",
            "userName": "YT Test"
        }
        
        response = requests.post(f"{BASE_URL}/youtube/simulate", json=payload, timeout=10)
        
        if response.status_code != 200:
            log_test("POST /api/youtube/simulate (price inquiry)", "FAIL", 
                    f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check response structure
        if not data.get("ok"):
            log_test("POST /api/youtube/simulate (price inquiry)", "FAIL", "Response ok is not true")
            return False
        
        if not data.get("simulated"):
            log_test("POST /api/youtube/simulate (price inquiry)", "FAIL", "Response simulated is not true")
            return False
        
        if "processed" not in data or not isinstance(data["processed"], list) or len(data["processed"]) == 0:
            log_test("POST /api/youtube/simulate (price inquiry)", "FAIL", "Missing or empty processed array")
            return False
        
        processed = data["processed"][0]
        
        # Verify sentiment
        if processed.get("sentiment") != "PRICE_INQUIRY":
            log_test("POST /api/youtube/simulate (price inquiry)", "FAIL", 
                    f"Expected sentiment='PRICE_INQUIRY', got '{processed.get('sentiment')}'")
            return False
        
        # Verify matched
        if processed.get("matched") != True:
            log_test("POST /api/youtube/simulate (price inquiry)", "FAIL", 
                    f"Expected matched=true, got {processed.get('matched')}")
            return False
        
        # Verify replySent is false (OAuth missing)
        if processed.get("replySent") != False:
            log_test("POST /api/youtube/simulate (price inquiry)", "FAIL", 
                    f"Expected replySent=false (OAuth missing), got {processed.get('replySent')}")
            return False
        
        log_test("POST /api/youtube/simulate (price inquiry)", "PASS", 
                f"sentiment={processed['sentiment']}, matched={processed['matched']}, "
                f"replySent={processed['replySent']}, user={processed.get('user')}")
        return True
        
    except Exception as e:
        log_test("POST /api/youtube/simulate (price inquiry)", "FAIL", f"Exception: {str(e)}")
        return False

def test_youtube_simulate_general():
    """Test 4: POST /api/youtube/simulate with general message -> matched false, sentiment GENERAL"""
    try:
        payload = {
            "message": "Cok guzel video olmus",
            "userName": "YT General User"
        }
        
        response = requests.post(f"{BASE_URL}/youtube/simulate", json=payload, timeout=10)
        
        if response.status_code != 200:
            log_test("POST /api/youtube/simulate (general)", "FAIL", 
                    f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if not data.get("ok") or not data.get("simulated"):
            log_test("POST /api/youtube/simulate (general)", "FAIL", "Response ok/simulated not true")
            return False
        
        if "processed" not in data or len(data["processed"]) == 0:
            log_test("POST /api/youtube/simulate (general)", "FAIL", "Missing or empty processed array")
            return False
        
        processed = data["processed"][0]
        
        # Verify sentiment
        if processed.get("sentiment") != "GENERAL":
            log_test("POST /api/youtube/simulate (general)", "FAIL", 
                    f"Expected sentiment='GENERAL', got '{processed.get('sentiment')}'")
            return False
        
        # Verify matched is false
        if processed.get("matched") != False:
            log_test("POST /api/youtube/simulate (general)", "FAIL", 
                    f"Expected matched=false, got {processed.get('matched')}")
            return False
        
        log_test("POST /api/youtube/simulate (general)", "PASS", 
                f"sentiment={processed['sentiment']}, matched={processed['matched']}, "
                f"user={processed.get('user')}")
        return True
        
    except Exception as e:
        log_test("POST /api/youtube/simulate (general)", "FAIL", f"Exception: {str(e)}")
        return False

def test_leads_include_youtube():
    """Test 5: GET /api/leads -> includes at least one lead with platform === "YOUTUBE_COMMENT" """
    try:
        response = requests.get(f"{BASE_URL}/leads", timeout=10)
        
        if response.status_code != 200:
            log_test("GET /api/leads (YouTube leads)", "FAIL", f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if not isinstance(data, list):
            log_test("GET /api/leads (YouTube leads)", "FAIL", "Response is not an array")
            return False
        
        # Find YouTube leads
        youtube_leads = [lead for lead in data if lead.get("platform") == "YOUTUBE_COMMENT"]
        
        if len(youtube_leads) == 0:
            log_test("GET /api/leads (YouTube leads)", "FAIL", 
                    "No leads with platform='YOUTUBE_COMMENT' found")
            return False
        
        # Verify the first YouTube lead has required fields
        yt_lead = youtube_leads[0]
        required_fields = ["userName", "userMessage", "sentiment", "platform"]
        for field in required_fields:
            if field not in yt_lead:
                log_test("GET /api/leads (YouTube leads)", "FAIL", 
                        f"YouTube lead missing required field: {field}")
                return False
        
        log_test("GET /api/leads (YouTube leads)", "PASS", 
                f"Found {len(youtube_leads)} YouTube leads. First lead: userName='{yt_lead['userName']}', "
                f"sentiment={yt_lead['sentiment']}, message='{yt_lead['userMessage'][:50]}...'")
        return True
        
    except Exception as e:
        log_test("GET /api/leads (YouTube leads)", "FAIL", f"Exception: {str(e)}")
        return False

def test_stats_youtube_leads():
    """Test 6: GET /api/stats -> includes youtubeLeads count >= 1"""
    try:
        response = requests.get(f"{BASE_URL}/stats", timeout=10)
        
        if response.status_code != 200:
            log_test("GET /api/stats (youtubeLeads)", "FAIL", f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if "youtubeLeads" not in data:
            log_test("GET /api/stats (youtubeLeads)", "FAIL", "Missing 'youtubeLeads' field")
            return False
        
        if not isinstance(data["youtubeLeads"], int):
            log_test("GET /api/stats (youtubeLeads)", "FAIL", 
                    f"youtubeLeads should be a number, got {type(data['youtubeLeads'])}")
            return False
        
        if data["youtubeLeads"] < 1:
            log_test("GET /api/stats (youtubeLeads)", "FAIL", 
                    f"Expected youtubeLeads >= 1, got {data['youtubeLeads']}")
            return False
        
        log_test("GET /api/stats (youtubeLeads)", "PASS", 
                f"youtubeLeads={data['youtubeLeads']}, totalLeads={data.get('totalLeads')}")
        return True
        
    except Exception as e:
        log_test("GET /api/stats (youtubeLeads)", "FAIL", f"Exception: {str(e)}")
        return False

def test_youtube_scan_expected_error():
    """Test 7: POST /api/youtube/scan {} -> EXPECTED clean 400 JSON error (not a crash)"""
    try:
        response = requests.post(f"{BASE_URL}/youtube/scan", json={}, timeout=10)
        
        # Should return 400 error
        if response.status_code != 400:
            log_test("POST /api/youtube/scan (expected error)", "FAIL", 
                    f"Expected 400 error, got {response.status_code}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("POST /api/youtube/scan (expected error)", "FAIL", 
                    "Response is not valid JSON (crashed)")
            return False
        
        # Should have error field
        if "error" not in data:
            log_test("POST /api/youtube/scan (expected error)", "FAIL", 
                    "Response missing 'error' field")
            return False
        
        # Check error message mentions YOUTUBE_API_KEY
        error_msg = data["error"]
        if "YOUTUBE_API_KEY" not in error_msg:
            log_test("POST /api/youtube/scan (expected error)", "FAIL", 
                    f"Error message should mention YOUTUBE_API_KEY, got: {error_msg}")
            return False
        
        log_test("POST /api/youtube/scan (expected error)", "PASS", 
                f"Clean 400 JSON error as expected: '{error_msg}'")
        return True
        
    except Exception as e:
        log_test("POST /api/youtube/scan (expected error)", "FAIL", f"Exception: {str(e)}")
        return False

def test_youtube_publish_expected_error():
    """Test 8: POST /api/youtube/publish {} -> EXPECTED clean 501 JSON with OAUTH_REQUIRED (not a crash)"""
    try:
        response = requests.post(f"{BASE_URL}/youtube/publish", json={}, timeout=10)
        
        # Should return 501 error
        if response.status_code != 501:
            log_test("POST /api/youtube/publish (expected error)", "FAIL", 
                    f"Expected 501 error, got {response.status_code}")
            return False
        
        # Should be valid JSON
        try:
            data = response.json()
        except:
            log_test("POST /api/youtube/publish (expected error)", "FAIL", 
                    "Response is not valid JSON (crashed)")
            return False
        
        # Should have error field with OAUTH_REQUIRED
        if "error" not in data:
            log_test("POST /api/youtube/publish (expected error)", "FAIL", 
                    "Response missing 'error' field")
            return False
        
        if data["error"] != "OAUTH_REQUIRED":
            log_test("POST /api/youtube/publish (expected error)", "FAIL", 
                    f"Expected error='OAUTH_REQUIRED', got '{data['error']}'")
            return False
        
        # Should have Turkish message
        if "message" not in data:
            log_test("POST /api/youtube/publish (expected error)", "FAIL", 
                    "Response missing 'message' field")
            return False
        
        log_test("POST /api/youtube/publish (expected error)", "PASS", 
                f"Clean 501 JSON error as expected: error='{data['error']}', message='{data['message'][:80]}...'")
        return True
        
    except Exception as e:
        log_test("POST /api/youtube/publish (expected error)", "FAIL", f"Exception: {str(e)}")
        return False

def main():
    """Run all YouTube endpoint tests"""
    print("=" * 80)
    print("BACKEND TEST SUITE - YouTube Endpoints")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    tests = [
        ("Config YouTube Integration", test_config_youtube_integration),
        ("YouTube Status", test_youtube_status),
        ("YouTube Simulate Price Inquiry", test_youtube_simulate_price_inquiry),
        ("YouTube Simulate General", test_youtube_simulate_general),
        ("Leads Include YouTube", test_leads_include_youtube),
        ("Stats YouTube Leads", test_stats_youtube_leads),
        ("YouTube Scan Expected Error", test_youtube_scan_expected_error),
        ("YouTube Publish Expected Error", test_youtube_publish_expected_error),
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
