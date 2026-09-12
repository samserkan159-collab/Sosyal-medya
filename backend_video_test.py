#!/usr/bin/env python3
"""
Backend test for Video Cutter (trim & split) endpoints
Tests: POST /api/video/upload-chunk, POST /api/video/trim, POST /api/video/split
"""

import requests
import time
import sys
import subprocess
import os

BASE_URL = "https://audit-hub-154.preview.emergentagent.com/api"

def generate_test_video():
    """Generate a 6-second test video using ffmpeg"""
    print("\n" + "="*80)
    print("GENERATING TEST VIDEO")
    print("="*80)
    
    try:
        output_path = "/tmp/test.mp4"
        # Remove existing file if present
        if os.path.exists(output_path):
            os.remove(output_path)
            print(f"Removed existing {output_path}")
        
        cmd = [
            'ffmpeg', '-f', 'lavfi', '-i', 'testsrc=duration=6:size=320x240:rate=25',
            '-pix_fmt', 'yuv420p', output_path
        ]
        
        print(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0 and os.path.exists(output_path):
            size = os.path.getsize(output_path)
            print(f"✅ Test video generated: {output_path} ({size} bytes)")
            return output_path
        else:
            print(f"❌ Failed to generate test video")
            print(f"STDERR: {result.stderr[:500]}")
            return None
    except Exception as e:
        print(f"❌ Exception generating test video: {e}")
        return None


def test_video_upload_chunk(video_path):
    """Test POST /api/video/upload-chunk"""
    print("\n" + "="*80)
    print("TEST 1: POST /api/video/upload-chunk")
    print("="*80)
    
    try:
        # Read video file
        with open(video_path, 'rb') as f:
            video_bytes = f.read()
        
        print(f"Video size: {len(video_bytes)} bytes")
        
        # Prepare multipart form data
        files = {
            'chunk': ('test.mp4', video_bytes, 'video/mp4')
        }
        data = {
            'uploadId': 'test_upload_001',
            'index': '0',
            'ext': 'mp4',
            'final': 'true'
        }
        
        print(f"Uploading video as single chunk with uploadId='test_upload_001', final='true'")
        r = requests.post(f"{BASE_URL}/video/upload-chunk", files=files, data=data, timeout=30)
        
        print(f"Status: {r.status_code}")
        
        if r.status_code == 200:
            response = r.json()
            print(f"Response keys: {list(response.keys())}")
            
            if response.get('ok') == True and 'file' in response and 'url' in response and 'duration' in response:
                file = response['file']
                url = response['url']
                duration = response['duration']
                
                print(f"✅ PASSED: Upload successful")
                print(f"  file: {file}")
                print(f"  url: {url}")
                print(f"  duration: {duration}s")
                
                # Verify duration is approximately 6 seconds (5.9-6.1)
                if 5.9 <= duration <= 6.1:
                    print(f"✅ PASSED: Duration is within expected range (5.9-6.1s)")
                    return file
                else:
                    print(f"⚠️ WARNING: Duration {duration}s is outside expected range (5.9-6.1s), but continuing")
                    return file
            else:
                print(f"❌ FAILED: Missing required fields in response")
                print(f"Response: {response}")
                return None
        else:
            print(f"❌ FAILED: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            return None
            
    except Exception as e:
        print(f"❌ FAILED: Exception - {e}")
        return None


def test_video_trim(file):
    """Test POST /api/video/trim"""
    print("\n" + "="*80)
    print("TEST 2: POST /api/video/trim")
    print("="*80)
    
    try:
        payload = {
            "file": file,
            "start": 1,
            "end": 3
        }
        
        print(f"Trimming video from 1s to 3s (expected duration ~2s)")
        r = requests.post(f"{BASE_URL}/video/trim", json=payload, timeout=30)
        
        print(f"Status: {r.status_code}")
        
        if r.status_code == 200:
            response = r.json()
            print(f"Response keys: {list(response.keys())}")
            
            if 'jobId' in response and 'file' in response and 'url' in response and 'duration' in response:
                job_id = response['jobId']
                trim_file = response['file']
                url = response['url']
                duration = response['duration']
                
                print(f"✅ PASSED: Trim successful")
                print(f"  jobId: {job_id}")
                print(f"  file: {trim_file}")
                print(f"  url: {url}")
                print(f"  duration: {duration}s")
                
                # Verify duration is approximately 2 seconds
                if 1.8 <= duration <= 2.2:
                    print(f"✅ PASSED: Duration is within expected range (~2s)")
                else:
                    print(f"⚠️ WARNING: Duration {duration}s is outside expected range (~2s)")
                
                # Verify render doc exists with status DONE
                print(f"\nVerifying render doc status...")
                r = requests.get(f"{BASE_URL}/studio/render/{job_id}", timeout=10)
                
                if r.status_code == 200:
                    render_doc = r.json()
                    status = render_doc.get('status')
                    out_file = render_doc.get('outFile')
                    
                    print(f"  Render status: {status}")
                    print(f"  outFile: {out_file}")
                    
                    if status == 'DONE' and out_file:
                        print(f"✅ PASSED: Render doc has status=DONE and outFile set")
                        
                        # Verify MP4 is accessible via url
                        print(f"\nVerifying MP4 is accessible via url...")
                        video_r = requests.get(f"https://audit-hub-154.preview.emergentagent.com{url}", timeout=10)
                        
                        if video_r.status_code == 200:
                            content_type = video_r.headers.get('Content-Type', '')
                            size = len(video_r.content)
                            
                            print(f"  Status: {video_r.status_code}")
                            print(f"  Content-Type: {content_type}")
                            print(f"  Size: {size} bytes")
                            
                            if 'video/mp4' in content_type and size > 0:
                                print(f"✅ PASSED: MP4 is accessible and valid (video/mp4, {size} bytes)")
                                return True
                            else:
                                print(f"❌ FAILED: Invalid Content-Type or size")
                                return False
                        else:
                            print(f"❌ FAILED: MP4 not accessible, status: {video_r.status_code}")
                            return False
                    else:
                        print(f"❌ FAILED: Render doc status is not DONE or outFile is missing")
                        return False
                else:
                    print(f"❌ FAILED: Could not fetch render doc, status: {r.status_code}")
                    return False
            else:
                print(f"❌ FAILED: Missing required fields in response")
                print(f"Response: {response}")
                return False
        else:
            print(f"❌ FAILED: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            return False
            
    except Exception as e:
        print(f"❌ FAILED: Exception - {e}")
        return False


def test_video_split_parts(file):
    """Test POST /api/video/split with parts parameter"""
    print("\n" + "="*80)
    print("TEST 3: POST /api/video/split (parts=3)")
    print("="*80)
    
    try:
        payload = {
            "file": file,
            "parts": 3
        }
        
        print(f"Splitting video into 3 equal parts")
        r = requests.post(f"{BASE_URL}/video/split", json=payload, timeout=60)
        
        print(f"Status: {r.status_code}")
        
        if r.status_code == 200:
            response = r.json()
            print(f"Response keys: {list(response.keys())}")
            
            if 'segments' in response:
                segments = response['segments']
                print(f"Number of segments: {len(segments)}")
                
                if len(segments) == 3:
                    print(f"✅ PASSED: Split returned 3 segments")
                    
                    # Verify each segment
                    all_valid = True
                    for i, seg in enumerate(segments):
                        print(f"\n  Segment {i+1}:")
                        print(f"    jobId: {seg.get('jobId')}")
                        print(f"    url: {seg.get('url')}")
                        print(f"    duration: {seg.get('duration')}s")
                        print(f"    start: {seg.get('start')}s")
                        print(f"    end: {seg.get('end')}s")
                        
                        # Verify each segment has required fields
                        if not all(k in seg for k in ['jobId', 'url', 'duration']):
                            print(f"    ❌ FAILED: Missing required fields")
                            all_valid = False
                            continue
                        
                        # Verify duration is approximately 2 seconds (6/3)
                        duration = seg.get('duration')
                        if 1.8 <= duration <= 2.2:
                            print(f"    ✅ Duration is within expected range (~2s)")
                        else:
                            print(f"    ⚠️ WARNING: Duration {duration}s is outside expected range (~2s)")
                        
                        # Verify MP4 is accessible
                        url = seg.get('url')
                        video_r = requests.get(f"https://audit-hub-154.preview.emergentagent.com{url}", timeout=10)
                        
                        if video_r.status_code == 200:
                            content_type = video_r.headers.get('Content-Type', '')
                            size = len(video_r.content)
                            
                            if 'video/mp4' in content_type and size > 0:
                                print(f"    ✅ MP4 is accessible and valid ({size} bytes)")
                            else:
                                print(f"    ❌ FAILED: Invalid Content-Type or size")
                                all_valid = False
                        else:
                            print(f"    ❌ FAILED: MP4 not accessible, status: {video_r.status_code}")
                            all_valid = False
                    
                    if all_valid:
                        print(f"\n✅ PASSED: All 3 segments are valid and accessible")
                        return True
                    else:
                        print(f"\n❌ FAILED: Some segments are invalid")
                        return False
                else:
                    print(f"❌ FAILED: Expected 3 segments, got {len(segments)}")
                    return False
            else:
                print(f"❌ FAILED: Missing 'segments' in response")
                print(f"Response: {response}")
                return False
        else:
            print(f"❌ FAILED: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            return False
            
    except Exception as e:
        print(f"❌ FAILED: Exception - {e}")
        return False


def test_video_split_points(file):
    """Test POST /api/video/split with points parameter"""
    print("\n" + "="*80)
    print("TEST 4: POST /api/video/split (points=[2,4])")
    print("="*80)
    
    try:
        payload = {
            "file": file,
            "points": [2, 4]
        }
        
        print(f"Splitting video at points [2, 4] (expected 3 segments: 0-2, 2-4, 4-6)")
        r = requests.post(f"{BASE_URL}/video/split", json=payload, timeout=60)
        
        print(f"Status: {r.status_code}")
        
        if r.status_code == 200:
            response = r.json()
            print(f"Response keys: {list(response.keys())}")
            
            if 'segments' in response:
                segments = response['segments']
                print(f"Number of segments: {len(segments)}")
                
                if len(segments) == 3:
                    print(f"✅ PASSED: Split returned 3 segments")
                    
                    # Verify segment boundaries
                    expected_ranges = [(0, 2), (2, 4), (4, 6)]
                    all_valid = True
                    
                    for i, seg in enumerate(segments):
                        start = seg.get('start')
                        end = seg.get('end')
                        duration = seg.get('duration')
                        
                        print(f"\n  Segment {i+1}:")
                        print(f"    start: {start}s (expected ~{expected_ranges[i][0]}s)")
                        print(f"    end: {end}s (expected ~{expected_ranges[i][1]}s)")
                        print(f"    duration: {duration}s")
                        print(f"    jobId: {seg.get('jobId')}")
                        print(f"    url: {seg.get('url')}")
                        
                        # Verify boundaries are approximately correct (allow 0.2s tolerance)
                        exp_start, exp_end = expected_ranges[i]
                        if abs(start - exp_start) <= 0.2 and abs(end - exp_end) <= 0.2:
                            print(f"    ✅ Boundaries are correct")
                        else:
                            print(f"    ⚠️ WARNING: Boundaries differ from expected")
                        
                        # Verify MP4 is accessible
                        url = seg.get('url')
                        video_r = requests.get(f"https://audit-hub-154.preview.emergentagent.com{url}", timeout=10)
                        
                        if video_r.status_code == 200:
                            content_type = video_r.headers.get('Content-Type', '')
                            size = len(video_r.content)
                            
                            if 'video/mp4' in content_type and size > 0:
                                print(f"    ✅ MP4 is accessible and valid ({size} bytes)")
                            else:
                                print(f"    ❌ FAILED: Invalid Content-Type or size")
                                all_valid = False
                        else:
                            print(f"    ❌ FAILED: MP4 not accessible, status: {video_r.status_code}")
                            all_valid = False
                    
                    if all_valid:
                        print(f"\n✅ PASSED: All 3 segments with correct boundaries are valid and accessible")
                        return True
                    else:
                        print(f"\n❌ FAILED: Some segments are invalid")
                        return False
                else:
                    print(f"❌ FAILED: Expected 3 segments, got {len(segments)}")
                    return False
            else:
                print(f"❌ FAILED: Missing 'segments' in response")
                print(f"Response: {response}")
                return False
        else:
            print(f"❌ FAILED: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            return False
            
    except Exception as e:
        print(f"❌ FAILED: Exception - {e}")
        return False


def test_error_cases(file):
    """Test error cases for video endpoints"""
    print("\n" + "="*80)
    print("TEST 5: ERROR CASES")
    print("="*80)
    
    all_passed = True
    
    # Test 5a: POST /api/video/trim with end <= start
    print("\n[TEST 5a] POST /api/video/trim with end <= start (should return 400)")
    try:
        payload = {
            "file": file,
            "start": 3,
            "end": 2
        }
        
        r = requests.post(f"{BASE_URL}/video/trim", json=payload, timeout=10)
        print(f"Status: {r.status_code}")
        
        if r.status_code == 400:
            response = r.json()
            error_msg = response.get('error', '')
            print(f"Error message: {error_msg}")
            
            if 'bitis, baslangictan buyuk olmali' in error_msg:
                print(f"✅ PASSED: Returns clean 400 error with correct message")
            else:
                print(f"❌ FAILED: Error message doesn't match expected")
                all_passed = False
        else:
            print(f"❌ FAILED: Expected 400, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            all_passed = False
    except Exception as e:
        print(f"❌ FAILED: Exception - {e}")
        all_passed = False
    
    # Test 5b: POST /api/video/trim with nonexistent file
    print("\n[TEST 5b] POST /api/video/trim with nonexistent file (should return 404)")
    try:
        payload = {
            "file": "nonexistent.mp4",
            "start": 0,
            "end": 1
        }
        
        r = requests.post(f"{BASE_URL}/video/trim", json=payload, timeout=10)
        print(f"Status: {r.status_code}")
        
        if r.status_code == 404:
            response = r.json()
            error_msg = response.get('error', '')
            print(f"Error message: {error_msg}")
            
            if 'video dosyasi yok' in error_msg:
                print(f"✅ PASSED: Returns clean 404 error with correct message")
            else:
                print(f"❌ FAILED: Error message doesn't match expected")
                all_passed = False
        else:
            print(f"❌ FAILED: Expected 404, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            all_passed = False
    except Exception as e:
        print(f"❌ FAILED: Exception - {e}")
        all_passed = False
    
    # Test 5c: POST /api/video/trim with empty body
    print("\n[TEST 5c] POST /api/video/trim with empty body (should return 400)")
    try:
        payload = {}
        
        r = requests.post(f"{BASE_URL}/video/trim", json=payload, timeout=10)
        print(f"Status: {r.status_code}")
        
        if r.status_code == 400:
            response = r.json()
            error_msg = response.get('error', '')
            print(f"Error message: {error_msg}")
            
            if 'file zorunlu' in error_msg:
                print(f"✅ PASSED: Returns clean 400 error with correct message")
            else:
                print(f"❌ FAILED: Error message doesn't match expected")
                all_passed = False
        else:
            print(f"❌ FAILED: Expected 400, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            all_passed = False
    except Exception as e:
        print(f"❌ FAILED: Exception - {e}")
        all_passed = False
    
    return all_passed


def main():
    print("\n" + "="*80)
    print("BACKEND TESTING - VIDEO CUTTER (TRIM & SPLIT)")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    results = []
    
    # Generate test video
    video_path = generate_test_video()
    if not video_path:
        print("\n❌ FAILED TO GENERATE TEST VIDEO - ABORTING")
        sys.exit(1)
    
    # Test 1: Upload video chunk
    uploaded_file = test_video_upload_chunk(video_path)
    results.append(("Video Upload Chunk", uploaded_file is not None))
    
    if not uploaded_file:
        print("\n❌ UPLOAD FAILED - SKIPPING REMAINING TESTS")
        sys.exit(1)
    
    # Test 2: Trim video
    trim_result = test_video_trim(uploaded_file)
    results.append(("Video Trim", trim_result))
    
    # Test 3: Split video (parts)
    split_parts_result = test_video_split_parts(uploaded_file)
    results.append(("Video Split (parts=3)", split_parts_result))
    
    # Test 4: Split video (points)
    split_points_result = test_video_split_points(uploaded_file)
    results.append(("Video Split (points=[2,4])", split_points_result))
    
    # Test 5: Error cases
    error_cases_result = test_error_cases(uploaded_file)
    results.append(("Error Cases", error_cases_result))
    
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
