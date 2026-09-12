#!/usr/bin/env python3
"""
Backend test for Logo Library endpoints
Tests: GET/POST/DELETE /api/studio/logos + transitionDur sanity check
"""

import requests
import time
import sys

BASE_URL = "https://audit-hub-154.preview.emergentagent.com/api"

# Tiny 1x1 PNG base64 (valid PNG)
TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

def test_logo_library():
    """Test Logo Library endpoints"""
    print("\n" + "="*80)
    print("LOGO LIBRARY TESTING")
    print("="*80)
    
    created_ids = []
    
    try:
        # TEST 1: GET /api/studio/logos (initial state)
        print("\n[TEST 1] GET /api/studio/logos (initial state)")
        try:
            r = requests.get(f"{BASE_URL}/studio/logos", timeout=10)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                logos = r.json()
                print(f"✅ PASSED: GET /api/studio/logos returns 200 JSON array (count: {len(logos)})")
                initial_count = len(logos)
                # Clean up any existing logos for fresh test
                for logo in logos:
                    if 'id' in logo:
                        requests.delete(f"{BASE_URL}/studio/logos/{logo['id']}", timeout=10)
                        print(f"  Cleaned up existing logo: {logo.get('name', 'unnamed')}")
            else:
                print(f"❌ FAILED: Expected 200, got {r.status_code}")
                print(f"Response: {r.text[:500]}")
                return False
        except Exception as e:
            print(f"❌ FAILED: Exception - {e}")
            return False
        
        # TEST 2: POST /api/studio/logos with valid data
        print("\n[TEST 2] POST /api/studio/logos with valid data")
        try:
            payload = {"image": TINY_PNG, "name": "Test Logo"}
            r = requests.post(f"{BASE_URL}/studio/logos", json=payload, timeout=10)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                print(f"Response keys: {list(data.keys())}")
                # Check required fields
                if 'id' in data and 'name' in data and 'image' in data and 'createdAt' in data:
                    if '_id' not in data:
                        print(f"✅ PASSED: POST /api/studio/logos returns 200 JSON with id (uuid), name, image, createdAt, NO _id field")
                        print(f"  id: {data['id']}")
                        print(f"  name: {data['name']}")
                        print(f"  createdAt: {data['createdAt']}")
                        created_ids.append(data['id'])
                    else:
                        print(f"❌ FAILED: Response contains _id field (should be stripped)")
                        return False
                else:
                    print(f"❌ FAILED: Missing required fields. Got: {list(data.keys())}")
                    return False
            else:
                print(f"❌ FAILED: Expected 200, got {r.status_code}")
                print(f"Response: {r.text[:500]}")
                return False
        except Exception as e:
            print(f"❌ FAILED: Exception - {e}")
            return False
        
        # TEST 3: POST /api/studio/logos with invalid data (empty body)
        print("\n[TEST 3] POST /api/studio/logos with invalid data (empty body)")
        try:
            r = requests.post(f"{BASE_URL}/studio/logos", json={}, timeout=10)
            print(f"Status: {r.status_code}")
            if r.status_code == 400:
                data = r.json()
                error_msg = data.get('error', '')
                if 'Gecerli bir gorsel (dataUrl) zorunlu' in error_msg:
                    print(f"✅ PASSED: POST with empty body returns clean 400 error: '{error_msg}'")
                else:
                    print(f"❌ FAILED: Expected error message 'Gecerli bir gorsel (dataUrl) zorunlu', got: '{error_msg}'")
                    return False
            else:
                print(f"❌ FAILED: Expected 400, got {r.status_code}")
                print(f"Response: {r.text[:500]}")
                return False
        except Exception as e:
            print(f"❌ FAILED: Exception - {e}")
            return False
        
        # TEST 4: POST /api/studio/logos with invalid image (not starting with data:image)
        print("\n[TEST 4] POST /api/studio/logos with invalid image (not starting with data:image)")
        try:
            payload = {"image": "invalid_base64_string", "name": "Invalid Logo"}
            r = requests.post(f"{BASE_URL}/studio/logos", json=payload, timeout=10)
            print(f"Status: {r.status_code}")
            if r.status_code == 400:
                data = r.json()
                error_msg = data.get('error', '')
                if 'Gecerli bir gorsel (dataUrl) zorunlu' in error_msg:
                    print(f"✅ PASSED: POST with invalid image returns clean 400 error: '{error_msg}'")
                else:
                    print(f"❌ FAILED: Expected error message 'Gecerli bir gorsel (dataUrl) zorunlu', got: '{error_msg}'")
                    return False
            else:
                print(f"❌ FAILED: Expected 400, got {r.status_code}")
                print(f"Response: {r.text[:500]}")
                return False
        except Exception as e:
            print(f"❌ FAILED: Exception - {e}")
            return False
        
        # TEST 5: Create 4 more logos to reach limit of 5
        print("\n[TEST 5] Create 4 more logos to reach limit of 5")
        try:
            for i in range(2, 6):
                payload = {"image": TINY_PNG, "name": f"Test Logo {i}"}
                r = requests.post(f"{BASE_URL}/studio/logos", json=payload, timeout=10)
                if r.status_code == 200:
                    data = r.json()
                    created_ids.append(data['id'])
                    print(f"  Created logo {i}: {data['id']}")
                else:
                    print(f"❌ FAILED: Could not create logo {i}, status: {r.status_code}")
                    return False
            print(f"✅ PASSED: Created 4 more logos (total 5 logos)")
        except Exception as e:
            print(f"❌ FAILED: Exception - {e}")
            return False
        
        # TEST 6: Attempt to create 6th logo (should fail with limit error)
        print("\n[TEST 6] POST 6th logo when 5 already exist (should fail with limit error)")
        try:
            payload = {"image": TINY_PNG, "name": "Test Logo 6"}
            r = requests.post(f"{BASE_URL}/studio/logos", json=payload, timeout=10)
            print(f"Status: {r.status_code}")
            if r.status_code == 400:
                data = r.json()
                error_msg = data.get('error', '')
                if 'En fazla 5 logo saklayabilirsiniz. Once bir logoyu silin.' in error_msg:
                    print(f"✅ PASSED: POST 6th logo returns clean 400 error: '{error_msg}'")
                else:
                    print(f"❌ FAILED: Expected error message 'En fazla 5 logo saklayabilirsiniz. Once bir logoyu silin.', got: '{error_msg}'")
                    return False
            else:
                print(f"❌ FAILED: Expected 400, got {r.status_code}")
                print(f"Response: {r.text[:500]}")
                return False
        except Exception as e:
            print(f"❌ FAILED: Exception - {e}")
            return False
        
        # TEST 7: GET /api/studio/logos after creating (should include all 5 logos)
        print("\n[TEST 7] GET /api/studio/logos after creating (should include all 5 logos)")
        try:
            r = requests.get(f"{BASE_URL}/studio/logos", timeout=10)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                logos = r.json()
                print(f"Logo count: {len(logos)}")
                if len(logos) == 5:
                    # Verify all created IDs are present
                    logo_ids = [logo['id'] for logo in logos]
                    all_present = all(cid in logo_ids for cid in created_ids)
                    if all_present:
                        print(f"✅ PASSED: GET /api/studio/logos returns all 5 created logos")
                        for logo in logos:
                            print(f"  - {logo['name']} (id: {logo['id']})")
                    else:
                        print(f"❌ FAILED: Not all created logos are present in the list")
                        return False
                else:
                    print(f"❌ FAILED: Expected 5 logos, got {len(logos)}")
                    return False
            else:
                print(f"❌ FAILED: Expected 200, got {r.status_code}")
                print(f"Response: {r.text[:500]}")
                return False
        except Exception as e:
            print(f"❌ FAILED: Exception - {e}")
            return False
        
        # TEST 8: DELETE /api/studio/logos/<id>
        print("\n[TEST 8] DELETE /api/studio/logos/<id>")
        try:
            if created_ids:
                delete_id = created_ids[0]
                r = requests.delete(f"{BASE_URL}/studio/logos/{delete_id}", timeout=10)
                print(f"Status: {r.status_code}")
                if r.status_code == 200:
                    data = r.json()
                    if data.get('ok') == True:
                        print(f"✅ PASSED: DELETE /api/studio/logos/{delete_id} returns {{ok:true}}")
                    else:
                        print(f"❌ FAILED: Expected {{ok:true}}, got: {data}")
                        return False
                else:
                    print(f"❌ FAILED: Expected 200, got {r.status_code}")
                    print(f"Response: {r.text[:500]}")
                    return False
            else:
                print(f"❌ FAILED: No logos to delete")
                return False
        except Exception as e:
            print(f"❌ FAILED: Exception - {e}")
            return False
        
        # TEST 9: GET /api/studio/logos after DELETE (verify removal)
        print("\n[TEST 9] GET /api/studio/logos after DELETE (verify removal)")
        try:
            r = requests.get(f"{BASE_URL}/studio/logos", timeout=10)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                logos = r.json()
                print(f"Logo count after delete: {len(logos)}")
                logo_ids = [logo['id'] for logo in logos]
                if delete_id not in logo_ids:
                    print(f"✅ PASSED: Deleted logo {delete_id} is no longer in the list (count: {len(logos)})")
                else:
                    print(f"❌ FAILED: Deleted logo {delete_id} is still in the list")
                    return False
            else:
                print(f"❌ FAILED: Expected 200, got {r.status_code}")
                print(f"Response: {r.text[:500]}")
                return False
        except Exception as e:
            print(f"❌ FAILED: Exception - {e}")
            return False
        
        # CLEANUP: Delete remaining logos
        print("\n[CLEANUP] Deleting remaining logos")
        try:
            r = requests.get(f"{BASE_URL}/studio/logos", timeout=10)
            if r.status_code == 200:
                logos = r.json()
                for logo in logos:
                    if 'id' in logo:
                        r = requests.delete(f"{BASE_URL}/studio/logos/{logo['id']}", timeout=10)
                        if r.status_code == 200:
                            print(f"  Deleted logo: {logo.get('name', 'unnamed')} ({logo['id']})")
                        else:
                            print(f"  Failed to delete logo: {logo['id']}")
                print(f"✅ CLEANUP COMPLETE: All logos deleted")
        except Exception as e:
            print(f"⚠️ CLEANUP WARNING: Exception - {e}")
        
        return True
        
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        return False


def test_render_transition_dur():
    """Test transitionDur parameter in multi-scene render"""
    print("\n" + "="*80)
    print("RENDER TRANSITIONDUR SANITY CHECK")
    print("="*80)
    
    try:
        # TEST: POST /api/studio/render with 2 scenes + transition='fade' + transitionDur=1.5 + audioMode='silent'
        print("\n[TEST] POST /api/studio/render with 2 scenes + transition='fade' + transitionDur=1.5 + audioMode='silent'")
        
        payload = {
            "scenes": [
                {"posterDataUrl": TINY_PNG, "duration": 2},
                {"posterDataUrl": TINY_PNG, "duration": 2}
            ],
            "transition": "fade",
            "transitionDur": 1.5,
            "audioMode": "silent"
        }
        
        r = requests.post(f"{BASE_URL}/studio/render", json=payload, timeout=15)
        print(f"Status: {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            print(f"Response keys: {list(data.keys())}")
            
            if 'jobId' in data and 'status' in data:
                job_id = data['jobId']
                print(f"✅ PASSED: POST /api/studio/render returns jobId: {job_id}, status: {data['status']}")
                
                # Poll for completion (max 30 seconds)
                print(f"\nPolling for render completion (max 30s)...")
                max_wait = 30
                start_time = time.time()
                
                while time.time() - start_time < max_wait:
                    r = requests.get(f"{BASE_URL}/studio/render/{job_id}", timeout=10)
                    if r.status_code == 200:
                        render_data = r.json()
                        status = render_data.get('status')
                        print(f"  Status: {status} (elapsed: {int(time.time() - start_time)}s)")
                        
                        if status == 'DONE':
                            if 'videoUrl' in render_data:
                                video_url = render_data['videoUrl']
                                print(f"✅ PASSED: Render completed with videoUrl: {video_url}")
                                
                                # Verify video is accessible
                                video_r = requests.get(f"https://audit-hub-154.preview.emergentagent.com{video_url}", timeout=10)
                                if video_r.status_code == 200:
                                    content_type = video_r.headers.get('Content-Type', '')
                                    size = len(video_r.content)
                                    print(f"✅ PASSED: Video accessible, Content-Type: {content_type}, Size: {size} bytes")
                                    if 'video/mp4' in content_type and size > 0:
                                        print(f"✅ PASSED: Valid MP4 video produced with transitionDur=1.5")
                                        return True
                                    else:
                                        print(f"❌ FAILED: Invalid video Content-Type or size")
                                        return False
                                else:
                                    print(f"❌ FAILED: Video not accessible, status: {video_r.status_code}")
                                    return False
                            else:
                                print(f"❌ FAILED: Render DONE but no videoUrl in response")
                                return False
                        elif status == 'FAILED':
                            print(f"❌ FAILED: Render failed with error: {render_data.get('error', 'unknown')}")
                            return False
                        
                        time.sleep(2)
                    else:
                        print(f"❌ FAILED: Poll request failed with status: {r.status_code}")
                        return False
                
                print(f"❌ FAILED: Render did not complete within {max_wait}s")
                return False
            else:
                print(f"❌ FAILED: Missing jobId or status in response")
                print(f"Response: {data}")
                return False
        else:
            print(f"❌ FAILED: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            return False
            
    except Exception as e:
        print(f"❌ FAILED: Exception - {e}")
        return False


def main():
    print("\n" + "="*80)
    print("BACKEND TESTING - LOGO LIBRARY + TRANSITIONDUR")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    results = []
    
    # Test Logo Library
    logo_result = test_logo_library()
    results.append(("Logo Library", logo_result))
    
    # Test transitionDur
    transition_result = test_render_transition_dur()
    results.append(("Render transitionDur", transition_result))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    all_passed = all(result for _, result in results)
    
    if all_passed:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
