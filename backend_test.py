#!/usr/bin/env python3
"""
Backend test for POST /api/studio/custom-boxes endpoint
Tests the new custom-boxes endpoint that uses gpt-4o vision to place user-provided texts on an image.
"""

import requests
import json
import sys

# Base URL from .env
BASE_URL = "https://audit-hub-154.preview.emergentagent.com/api"

# Small 10x10 red PNG in base64 (for testing)
SMALL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC"

def test_custom_boxes_valid():
    """Test POST /api/studio/custom-boxes with valid data"""
    print("\n=== TEST 1: POST /api/studio/custom-boxes with valid data ===")
    
    url = f"{BASE_URL}/studio/custom-boxes"
    payload = {
        "image": f"data:image/png;base64,{SMALL_PNG_BASE64}",
        "texts": ["Hizli Servis", "2 Yil Garanti", "Ucretsiz Kesif"],
        "context": "oto klima gazi dolum cihazi"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=60)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check if boxes array exists
        if "boxes" not in data:
            print("❌ FAILED: Response missing 'boxes' key")
            return False
        
        boxes = data["boxes"]
        
        if not isinstance(boxes, list):
            print("❌ FAILED: 'boxes' is not an array")
            return False
        
        if len(boxes) == 0:
            print("❌ FAILED: 'boxes' array is empty")
            return False
        
        print(f"✅ Received {len(boxes)} boxes")
        
        # Verify each box has required fields
        provided_texts = ["Hizli Servis", "2 Yil Garanti", "Ucretsiz Kesif"]
        returned_texts = []
        
        for i, box in enumerate(boxes):
            print(f"\nBox {i+1}:")
            print(f"  text: {box.get('text')}")
            print(f"  kind: {box.get('kind')}")
            print(f"  xPct: {box.get('xPct')}")
            print(f"  yPct: {box.get('yPct')}")
            
            # Check required fields
            if "text" not in box or not isinstance(box["text"], str):
                print(f"❌ FAILED: Box {i+1} missing or invalid 'text' field")
                return False
            
            if "kind" not in box or box["kind"] not in ["title", "badge", "feature", "cta"]:
                print(f"❌ FAILED: Box {i+1} has invalid 'kind' field: {box.get('kind')}")
                return False
            
            if "xPct" not in box or not isinstance(box["xPct"], (int, float)) or not (0 <= box["xPct"] <= 100):
                print(f"❌ FAILED: Box {i+1} has invalid 'xPct' field: {box.get('xPct')}")
                return False
            
            if "yPct" not in box or not isinstance(box["yPct"], (int, float)) or not (0 <= box["yPct"] <= 100):
                print(f"❌ FAILED: Box {i+1} has invalid 'yPct' field: {box.get('yPct')}")
                return False
            
            returned_texts.append(box["text"])
        
        # CRITICAL: Verify that returned texts match provided texts (AI must NOT rewrite them)
        print(f"\nProvided texts: {provided_texts}")
        print(f"Returned texts: {returned_texts}")
        
        # Check if all returned texts are from the provided list
        for text in returned_texts:
            if text not in provided_texts:
                print(f"❌ FAILED: AI rewrote text! '{text}' is not in provided texts {provided_texts}")
                return False
        
        print("✅ PASSED: All returned texts match provided texts (AI preserved them)")
        print("✅ TEST 1 PASSED")
        return True
        
    except requests.exceptions.Timeout:
        print("❌ FAILED: Request timeout (60s)")
        return False
    except Exception as e:
        print(f"❌ FAILED: Exception: {str(e)}")
        return False


def test_custom_boxes_empty_body():
    """Test POST /api/studio/custom-boxes with empty body"""
    print("\n=== TEST 2: POST /api/studio/custom-boxes with empty body {} ===")
    
    url = f"{BASE_URL}/studio/custom-boxes"
    payload = {}
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400, got {response.status_code}")
            return False
        
        # Check if response is valid JSON
        try:
            data = response.json()
            if "error" not in data:
                print("❌ FAILED: Error response missing 'error' key")
                return False
            print(f"✅ Clean 400 error: {data['error']}")
        except:
            print("❌ FAILED: Response is not valid JSON")
            return False
        
        print("✅ TEST 2 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {str(e)}")
        return False


def test_custom_boxes_empty_texts():
    """Test POST /api/studio/custom-boxes with image but empty texts array"""
    print("\n=== TEST 3: POST /api/studio/custom-boxes with image but empty texts[] ===")
    
    url = f"{BASE_URL}/studio/custom-boxes"
    payload = {
        "image": f"data:image/png;base64,{SMALL_PNG_BASE64}",
        "texts": []
    }
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400, got {response.status_code}")
            return False
        
        # Check if response is valid JSON
        try:
            data = response.json()
            if "error" not in data:
                print("❌ FAILED: Error response missing 'error' key")
                return False
            print(f"✅ Clean 400 error: {data['error']}")
        except:
            print("❌ FAILED: Response is not valid JSON")
            return False
        
        print("✅ TEST 3 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {str(e)}")
        return False


def main():
    print("=" * 80)
    print("BACKEND TEST: POST /api/studio/custom-boxes")
    print("Testing new endpoint that uses gpt-4o vision to place user texts on image")
    print("=" * 80)
    
    results = []
    
    # Run all tests
    results.append(("Valid request with texts", test_custom_boxes_valid()))
    results.append(("Empty body validation", test_custom_boxes_empty_body()))
    results.append(("Empty texts array validation", test_custom_boxes_empty_texts()))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - custom-boxes endpoint is fully functional!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
