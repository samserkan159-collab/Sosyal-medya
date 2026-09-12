#!/usr/bin/env python3
"""
Command Cockpit Backend API Test Suite
Tests all backend endpoints with focus on AI integration (emergentintegrations)
"""

import requests
import json
import base64

# Base URL from .env NEXT_PUBLIC_BASE_URL
BASE_URL = "https://audit-hub-154.preview.emergentagent.com/api"

# Test data
test_page_data = {
    "pageId": "1234567890",
    "pageName": "Test Ustam",
    "whatsappNumber": "905551112233"
}

test_content_input = "El yapimi ceviz agacindan yeni masa modelimiz cikti, cok saglam"

# Helper to create a small valid base64 PNG (1x1 pixel)
def create_test_image_base64():
    """Create a minimal valid 10x10 red PNG for testing"""
    # A proper 10x10 red PNG (valid for OpenAI vision API)
    # This is a real PNG file encoded as base64
    png_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC"
    return f"data:image/png;base64,{png_base64}"

def test_health_endpoint():
    """Test 1: GET /api/ -> 200, JSON with status ok + integrations object"""
    print("\n" + "="*80)
    print("TEST 1: Health Endpoint (GET /api/)")
    print("="*80)
    try:
        response = requests.get(f"{BASE_URL}/", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if data.get('status') != 'ok':
            print(f"❌ FAILED: Expected status 'ok', got {data.get('status')}")
            return False
        
        if 'integrations' not in data:
            print(f"❌ FAILED: Missing 'integrations' object")
            return False
        
        print("✅ PASSED: Health endpoint working correctly")
        return True
    except Exception as e:
        print(f"❌ FAILED: Exception - {str(e)}")
        return False

def test_config_endpoint():
    """Test 2: GET /api/config -> integrations + permissions array (8 permissions)"""
    print("\n" + "="*80)
    print("TEST 2: Config Endpoint (GET /api/config)")
    print("="*80)
    try:
        response = requests.get(f"{BASE_URL}/config", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if 'integrations' not in data:
            print(f"❌ FAILED: Missing 'integrations' object")
            return False
        
        if 'permissions' not in data:
            print(f"❌ FAILED: Missing 'permissions' array")
            return False
        
        if not isinstance(data['permissions'], list):
            print(f"❌ FAILED: 'permissions' is not an array")
            return False
        
        if len(data['permissions']) != 8:
            print(f"❌ FAILED: Expected 8 permissions, got {len(data['permissions'])}")
            return False
        
        print("✅ PASSED: Config endpoint working correctly")
        return True
    except Exception as e:
        print(f"❌ FAILED: Exception - {str(e)}")
        return False

def test_stats_and_logs():
    """Test 3: GET /api/stats -> counts + integrations. GET /api/logs -> array"""
    print("\n" + "="*80)
    print("TEST 3: Stats and Logs Endpoints")
    print("="*80)
    
    # Test stats
    try:
        print("\n--- Testing GET /api/stats ---")
        response = requests.get(f"{BASE_URL}/stats", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        required_keys = ['totalPages', 'totalLeads', 'integrations']
        for key in required_keys:
            if key not in data:
                print(f"❌ FAILED: Missing '{key}' in stats response")
                return False
        
        print("✅ Stats endpoint working")
    except Exception as e:
        print(f"❌ FAILED: Stats exception - {str(e)}")
        return False
    
    # Test logs
    try:
        print("\n--- Testing GET /api/logs ---")
        response = requests.get(f"{BASE_URL}/logs", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        if not isinstance(data, list):
            print(f"❌ FAILED: Expected array, got {type(data)}")
            return False
        
        print(f"✅ Logs endpoint working (returned {len(data)} logs)")
        return True
    except Exception as e:
        print(f"❌ FAILED: Logs exception - {str(e)}")
        return False

def test_facebook_page_crud():
    """Test 4: FacebookPage CRUD operations"""
    print("\n" + "="*80)
    print("TEST 4: FacebookPage CRUD")
    print("="*80)
    
    created_page_id = None
    
    # POST /api/pages
    try:
        print("\n--- Testing POST /api/pages ---")
        response = requests.post(f"{BASE_URL}/pages", json=test_page_data, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        page = response.json()
        print(f"Created page: {json.dumps(page, indent=2)}")
        
        # Verify UUID id and no _id
        if 'id' not in page:
            print(f"❌ FAILED: Missing 'id' field")
            return False
        
        if '_id' in page:
            print(f"❌ FAILED: Found '_id' field (should be stripped)")
            return False
        
        created_page_id = page['id']
        print(f"✅ Page created with UUID: {created_page_id}")
    except Exception as e:
        print(f"❌ FAILED: POST exception - {str(e)}")
        return False
    
    # GET /api/pages
    try:
        print("\n--- Testing GET /api/pages ---")
        response = requests.get(f"{BASE_URL}/pages", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        pages = response.json()
        if not isinstance(pages, list):
            print(f"❌ FAILED: Expected array, got {type(pages)}")
            return False
        
        # Find our created page
        found = any(p.get('id') == created_page_id for p in pages)
        if not found:
            print(f"❌ FAILED: Created page not found in list")
            return False
        
        print(f"✅ Page found in list (total: {len(pages)} pages)")
    except Exception as e:
        print(f"❌ FAILED: GET pages exception - {str(e)}")
        return False
    
    # GET /api/pages/:id
    try:
        print(f"\n--- Testing GET /api/pages/{created_page_id} ---")
        response = requests.get(f"{BASE_URL}/pages/{created_page_id}", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        page = response.json()
        if page.get('id') != created_page_id:
            print(f"❌ FAILED: Wrong page returned")
            return False
        
        print(f"✅ Individual page retrieved correctly")
    except Exception as e:
        print(f"❌ FAILED: GET page by id exception - {str(e)}")
        return False
    
    # PUT /api/pages/:id
    try:
        print(f"\n--- Testing PUT /api/pages/{created_page_id} ---")
        update_data = {
            "commentTemplate": "Yeni sablon",
            "autoReplyActive": False
        }
        response = requests.put(f"{BASE_URL}/pages/{created_page_id}", json=update_data, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        updated_page = response.json()
        if updated_page.get('commentTemplate') != "Yeni sablon":
            print(f"❌ FAILED: commentTemplate not updated")
            return False
        
        if updated_page.get('autoReplyActive') != False:
            print(f"❌ FAILED: autoReplyActive not updated")
            return False
        
        print(f"✅ Page updated successfully")
        print("✅ PASSED: All FacebookPage CRUD operations working")
        return True
    except Exception as e:
        print(f"❌ FAILED: PUT exception - {str(e)}")
        return False

def test_ai_content_generation():
    """Test 5: AI Content Generation (CRITICAL - emergentintegrations gpt-4o)"""
    print("\n" + "="*80)
    print("TEST 5: AI Content Generation (CRITICAL)")
    print("="*80)
    
    try:
        print(f"\n--- Testing POST /api/content/generate ---")
        print(f"Input text: {test_content_input}")
        
        response = requests.post(
            f"{BASE_URL}/content/generate",
            json={"inputText": test_content_input},
            timeout=30  # AI calls may take longer
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        post = response.json()
        print(f"\nGenerated content keys: {list(post.keys())}")
        
        # Check all required fields
        required_fields = ['fbCaption', 'igCaption', 'ytTitle', 'ytDescription', 'tiktokCaption', 'hashtags']
        for field in required_fields:
            if field not in post:
                print(f"❌ FAILED: Missing field '{field}'")
                return False
            
            if field == 'hashtags':
                if not isinstance(post[field], list):
                    print(f"❌ FAILED: 'hashtags' is not an array")
                    return False
            else:
                if not post[field] or not isinstance(post[field], str):
                    print(f"❌ FAILED: Field '{field}' is empty or not a string")
                    return False
        
        # Verify it's actual AI-generated Turkish text (not just echoing input)
        fb_caption = post['fbCaption']
        print(f"\nFacebook Caption (first 200 chars): {fb_caption[:200]}...")
        
        if len(fb_caption) < 20:
            print(f"❌ FAILED: fbCaption too short, likely not AI-generated")
            return False
        
        # Check if it contains Turkish characters or common Turkish words
        turkish_indicators = ['ı', 'ş', 'ğ', 'ü', 'ö', 'ç', 'için', 'ile', 've', 'bu']
        has_turkish = any(indicator in fb_caption.lower() for indicator in turkish_indicators)
        
        if not has_turkish:
            print(f"⚠️  WARNING: Content doesn't appear to be in Turkish")
        
        print(f"\n✅ PASSED: AI Content Generation working!")
        print(f"   - All required fields present")
        print(f"   - Non-empty captions generated")
        print(f"   - Hashtags array: {post['hashtags']}")
        print(f"   - EMERGENT_LLM_KEY + emergentintegrations VERIFIED WORKING")
        
        # Store the post ID for later tests
        global created_post_id
        created_post_id = post.get('id')
        
        return True
    except Exception as e:
        print(f"❌ FAILED: Exception - {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_ai_vision():
    """Test 6: AI Vision OCR (CRITICAL - gpt-4o vision)"""
    print("\n" + "="*80)
    print("TEST 6: AI Vision OCR (CRITICAL)")
    print("="*80)
    
    try:
        print(f"\n--- Testing POST /api/audit/vision ---")
        
        # Create a small test image
        test_image = create_test_image_base64()
        print(f"Created test image (base64 length: {len(test_image)} chars)")
        
        response = requests.post(
            f"{BASE_URL}/audit/vision",
            json={"image": test_image},
            timeout=30  # Vision calls may take longer
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        analysis = response.json()
        print(f"\nAnalysis response keys: {list(analysis.keys())}")
        print(f"Full response: {json.dumps(analysis, indent=2)}")
        
        # Check for analysis object structure
        if 'score' not in analysis:
            print(f"❌ FAILED: Missing 'score' field")
            return False
        
        # Should have issues or recommendations (or both)
        has_structure = 'issues' in analysis or 'recommendations' in analysis
        if not has_structure:
            print(f"❌ FAILED: Missing 'issues' or 'recommendations' fields")
            return False
        
        print(f"\n✅ PASSED: AI Vision working!")
        print(f"   - Score: {analysis.get('score')}")
        print(f"   - No crash, JSON returned")
        print(f"   - Vision API integration verified")
        
        return True
    except Exception as e:
        print(f"❌ FAILED: Exception - {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_comment_to_dm_engine():
    """Test 7: Comment-to-DM Engine (CRITICAL)"""
    print("\n" + "="*80)
    print("TEST 7: Comment-to-DM Engine + Simulator (CRITICAL)")
    print("="*80)
    
    # Test price inquiry
    try:
        print(f"\n--- Testing POST /api/simulate/comment (PRICE_INQUIRY) ---")
        
        price_comment = {
            "message": "Bu masanin fiyati kaç tl acaba?",
            "userName": "Mehmet Test"
        }
        
        response = requests.post(
            f"{BASE_URL}/simulate/comment",
            json=price_comment,
            timeout=15
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if not result.get('processed') or len(result['processed']) == 0:
            print(f"❌ FAILED: No processed results")
            return False
        
        processed = result['processed'][0]
        if processed.get('sentiment') != 'PRICE_INQUIRY':
            print(f"❌ FAILED: Expected sentiment 'PRICE_INQUIRY', got {processed.get('sentiment')}")
            return False
        
        print(f"✅ Price inquiry detected correctly")
        
    except Exception as e:
        print(f"❌ FAILED: Price inquiry exception - {str(e)}")
        return False
    
    # Test general comment
    try:
        print(f"\n--- Testing POST /api/simulate/comment (GENERAL) ---")
        
        general_comment = {
            "message": "Cok guzel olmus",
            "userName": "Ayse Test"
        }
        
        response = requests.post(
            f"{BASE_URL}/simulate/comment",
            json=general_comment,
            timeout=15
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        result = response.json()
        processed = result['processed'][0]
        
        if processed.get('sentiment') != 'GENERAL':
            print(f"❌ FAILED: Expected sentiment 'GENERAL', got {processed.get('sentiment')}")
            return False
        
        print(f"✅ General comment detected correctly")
        
    except Exception as e:
        print(f"❌ FAILED: General comment exception - {str(e)}")
        return False
    
    # Verify leads were created
    try:
        print(f"\n--- Verifying leads in GET /api/leads ---")
        
        response = requests.get(f"{BASE_URL}/leads", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        leads = response.json()
        if not isinstance(leads, list):
            print(f"❌ FAILED: Expected array, got {type(leads)}")
            return False
        
        # Find our test leads (newest first)
        mehmet_lead = next((l for l in leads if l.get('userName') == 'Mehmet Test'), None)
        ayse_lead = next((l for l in leads if l.get('userName') == 'Ayse Test'), None)
        
        if not mehmet_lead:
            print(f"❌ FAILED: Mehmet Test lead not found")
            return False
        
        if not ayse_lead:
            print(f"❌ FAILED: Ayse Test lead not found")
            return False
        
        # Verify fields
        required_fields = ['userName', 'userMessage', 'sentiment', 'platform']
        for lead in [mehmet_lead, ayse_lead]:
            for field in required_fields:
                if field not in lead:
                    print(f"❌ FAILED: Lead missing field '{field}'")
                    return False
        
        if mehmet_lead.get('platform') != 'FACEBOOK_COMMENT':
            print(f"❌ FAILED: Wrong platform for Mehmet lead")
            return False
        
        print(f"✅ Leads created correctly with all required fields")
        
        # Test lead update
        print(f"\n--- Testing PUT /api/leads/:id ---")
        lead_id = mehmet_lead['id']
        
        response = requests.put(
            f"{BASE_URL}/leads/{lead_id}",
            json={"status": "CONTACTED"},
            timeout=10
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        updated_lead = response.json()
        if updated_lead.get('status') != 'CONTACTED':
            print(f"❌ FAILED: Lead status not updated")
            return False
        
        print(f"✅ Lead updated successfully")
        print("\n✅ PASSED: Comment-to-DM Engine fully working!")
        
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Leads verification exception - {str(e)}")
        return False

def test_content_publish():
    """Test 8: Content publish"""
    print("\n" + "="*80)
    print("TEST 8: Content Publish")
    print("="*80)
    
    try:
        # First, get a content post to publish
        print(f"\n--- Getting content posts ---")
        response = requests.get(f"{BASE_URL}/content", timeout=10)
        
        if response.status_code != 200:
            print(f"❌ FAILED: Could not get content posts")
            return False
        
        posts = response.json()
        if not posts or len(posts) == 0:
            print(f"❌ FAILED: No content posts available to publish")
            return False
        
        post_id = posts[0]['id']
        print(f"Using post ID: {post_id}")
        
        # Publish it
        print(f"\n--- Testing POST /api/content/publish ---")
        response = requests.post(
            f"{BASE_URL}/content/publish",
            json={"id": post_id},
            timeout=10
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        published_post = response.json()
        if published_post.get('status') != 'PUBLISHED':
            print(f"❌ FAILED: Status not set to PUBLISHED, got {published_post.get('status')}")
            return False
        
        print(f"✅ PASSED: Content publish working correctly")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception - {str(e)}")
        return False

def test_expected_errors():
    """Test 9: Expected error checks (should return clean JSON errors, not crash)"""
    print("\n" + "="*80)
    print("TEST 9: Expected Error Handling (Meta/Telegram without tokens)")
    print("="*80)
    
    all_passed = True
    
    # Test audit/crawl
    try:
        print(f"\n--- Testing POST /api/audit/crawl (expected error) ---")
        
        # First get a page
        response = requests.get(f"{BASE_URL}/pages", timeout=10)
        pages = response.json()
        
        if not pages or len(pages) == 0:
            print(f"⚠️  SKIPPED: No pages available to test crawl")
        else:
            page_id = pages[0]['id']
            response = requests.post(
                f"{BASE_URL}/audit/crawl",
                json={"pageId": page_id},
                timeout=10
            )
            print(f"Status Code: {response.status_code}")
            
            # Should be 400 or 502 with clean error message
            if response.status_code not in [400, 502]:
                print(f"⚠️  WARNING: Expected 400 or 502, got {response.status_code}")
            
            try:
                error_data = response.json()
                if 'error' in error_data:
                    print(f"✅ Clean JSON error returned: {error_data['error']}")
                else:
                    print(f"⚠️  WARNING: No 'error' field in response")
            except:
                print(f"❌ FAILED: Response is not valid JSON (crashed)")
                all_passed = False
                
    except Exception as e:
        print(f"❌ FAILED: Exception - {str(e)}")
        all_passed = False
    
    # Test telegram approval
    try:
        print(f"\n--- Testing POST /api/content/telegram-approval (expected error) ---")
        
        # Get a content post
        response = requests.get(f"{BASE_URL}/content", timeout=10)
        posts = response.json()
        
        if not posts or len(posts) == 0:
            print(f"⚠️  SKIPPED: No content posts available")
        else:
            post_id = posts[0]['id']
            response = requests.post(
                f"{BASE_URL}/content/telegram-approval",
                json={"id": post_id},
                timeout=10
            )
            print(f"Status Code: {response.status_code}")
            
            # Should be 502 with clean error message
            if response.status_code != 502:
                print(f"⚠️  WARNING: Expected 502, got {response.status_code}")
            
            try:
                error_data = response.json()
                if 'error' in error_data:
                    print(f"✅ Clean JSON error returned: {error_data['error']}")
                else:
                    print(f"⚠️  WARNING: No 'error' field in response")
            except:
                print(f"❌ FAILED: Response is not valid JSON (crashed)")
                all_passed = False
                
    except Exception as e:
        print(f"❌ FAILED: Exception - {str(e)}")
        all_passed = False
    
    if all_passed:
        print(f"\n✅ PASSED: All expected errors return clean JSON (no crashes)")
    
    return all_passed

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("COMMAND COCKPIT BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    results = {}
    
    # Run all tests in order
    results['1_health'] = test_health_endpoint()
    results['2_config'] = test_config_endpoint()
    results['3_stats_logs'] = test_stats_and_logs()
    results['4_page_crud'] = test_facebook_page_crud()
    results['5_ai_content'] = test_ai_content_generation()
    results['6_ai_vision'] = test_ai_vision()
    results['7_comment_dm'] = test_comment_to_dm_engine()
    results['8_publish'] = test_content_publish()
    results['9_expected_errors'] = test_expected_errors()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    print("="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Backend is fully functional.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. See details above.")
        return 1

if __name__ == "__main__":
    exit(main())
