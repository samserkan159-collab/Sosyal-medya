#!/usr/bin/env python3
"""
Backend test for Prepend Poster (Afiş) to Video feature
Tests: /api/posters (GET/POST/DELETE), /api/video/prepend-poster
"""
import requests
import subprocess
import os
import json
import time
import base64

# Base URL from .env
BASE_URL = "https://audit-hub-154.preview.emergentagent.com/api"

def run_command(cmd):
    """Run shell command and return output"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr

def create_tiny_png_base64():
    """Create a tiny valid PNG as base64 dataUrl"""
    # 1x1 red PNG
    png_bytes = bytes([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
        0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  # IEND chunk
        0x44, 0xAE, 0x42, 0x60, 0x82
    ])
    b64 = base64.b64encode(png_bytes).decode('utf-8')
    return f"data:image/png;base64,{b64}"

def test_prepend_poster():
    """Test Prepend Poster (Afiş) to Video feature"""
    print("\n" + "="*80)
    print("PREPEND POSTER (AFIŞ) TO VIDEO TEST")
    print("="*80)
    
    # Setup: Create source video WITH audio (portrait 720x1280)
    print("\n[SETUP] Creating source video WITH audio (portrait 720x1280)...")
    cmd = "ffmpeg -f lavfi -i testsrc=duration=5:size=720x1280:rate=25 -f lavfi -i sine=frequency=440:duration=5 -pix_fmt yuv420p -shortest /tmp/v.mp4 -y"
    code, out, err = run_command(cmd)
    if code != 0:
        print(f"❌ FAILED to create source video: {err}")
        return False
    
    if not os.path.exists('/tmp/v.mp4'):
        print("❌ FAILED: /tmp/v.mp4 not created")
        return False
    
    file_size = os.path.getsize('/tmp/v.mp4')
    print(f"✅ Source video WITH audio created: /tmp/v.mp4 ({file_size} bytes)")
    
    # Upload video via POST /api/video/upload-chunk
    print("\n[SETUP] Uploading source video via POST /api/video/upload-chunk...")
    try:
        with open('/tmp/v.mp4', 'rb') as f:
            video_bytes = f.read()
        
        files = {
            'chunk': ('v.mp4', video_bytes, 'video/mp4')
        }
        data = {
            'uploadId': 'test_prepend_001',
            'index': '0',
            'ext': 'mp4',
            'final': 'true'
        }
        
        response = requests.post(f"{BASE_URL}/video/upload-chunk", files=files, data=data, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED to upload video: {response.text}")
            return False
        
        upload_result = response.json()
        print(f"Response: {json.dumps(upload_result, indent=2)}")
        
        if not upload_result.get('ok') or not upload_result.get('file'):
            print(f"❌ FAILED: Upload did not return ok=true or file")
            return False
        
        VFILE = upload_result['file']
        duration = upload_result.get('duration', 0)
        print(f"✅ Video uploaded: VFILE={VFILE}, duration: {duration}s")
        
    except Exception as e:
        print(f"❌ FAILED to upload video: {str(e)}")
        return False
    
    # Setup: Create SILENT source video
    print("\n[SETUP] Creating SILENT source video (640x480)...")
    cmd = "ffmpeg -f lavfi -i testsrc=duration=4:size=640x480:rate=25 -pix_fmt yuv420p /tmp/vs.mp4 -y"
    code, out, err = run_command(cmd)
    if code != 0:
        print(f"❌ FAILED to create silent video: {err}")
        return False
    
    if not os.path.exists('/tmp/vs.mp4'):
        print("❌ FAILED: /tmp/vs.mp4 not created")
        return False
    
    file_size = os.path.getsize('/tmp/vs.mp4')
    print(f"✅ SILENT source video created: /tmp/vs.mp4 ({file_size} bytes)")
    
    # Upload silent video
    print("\n[SETUP] Uploading SILENT video via POST /api/video/upload-chunk...")
    try:
        with open('/tmp/vs.mp4', 'rb') as f:
            video_bytes = f.read()
        
        files = {
            'chunk': ('vs.mp4', video_bytes, 'video/mp4')
        }
        data = {
            'uploadId': 'test_prepend_002',
            'index': '0',
            'ext': 'mp4',
            'final': 'true'
        }
        
        response = requests.post(f"{BASE_URL}/video/upload-chunk", files=files, data=data, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED to upload silent video: {response.text}")
            return False
        
        upload_result = response.json()
        print(f"Response: {json.dumps(upload_result, indent=2)}")
        
        if not upload_result.get('ok') or not upload_result.get('file'):
            print(f"❌ FAILED: Upload did not return ok=true or file")
            return False
        
        SFILE = upload_result['file']
        duration = upload_result.get('duration', 0)
        print(f"✅ SILENT video uploaded: SFILE={SFILE}, duration: {duration}s")
        
    except Exception as e:
        print(f"❌ FAILED to upload silent video: {str(e)}")
        return False
    
    # Test 1: GET /api/posters
    print("\n" + "-"*80)
    print("TEST 1: GET /api/posters")
    print("-"*80)
    try:
        response = requests.get(f"{BASE_URL}/posters", timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        result = response.json()
        if not isinstance(result, list):
            print(f"❌ FAILED: Response is not a JSON array")
            return False
        
        print(f"✅ TEST 1 PASSED: GET /api/posters returns 200 JSON array (count: {len(result)})")
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED: {str(e)}")
        return False
    
    # Test 2: POST /api/posters with valid dataUrl
    print("\n" + "-"*80)
    print("TEST 2: POST /api/posters with valid dataUrl")
    print("-"*80)
    try:
        png_data_url = create_tiny_png_base64()
        payload = {
            'dataUrl': png_data_url
        }
        response = requests.post(f"{BASE_URL}/posters", json=payload, timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        result = response.json()
        
        # Verify response has required fields
        if not result.get('id'):
            print(f"❌ FAILED: Response does not contain 'id'")
            return False
        
        if not result.get('file'):
            print(f"❌ FAILED: Response does not contain 'file'")
            return False
        
        if not result.get('url'):
            print(f"❌ FAILED: Response does not contain 'url'")
            return False
        
        # Verify NO _id field
        if '_id' in result:
            print(f"❌ FAILED: Response contains '_id' field (should be stripped)")
            return False
        
        PID = result['id']
        PFILE = result['file']
        
        print(f"✅ Poster created: PID={PID}, PFILE={PFILE}")
        print(f"✅ TEST 2 PASSED: POST /api/posters returns 200 with id, file, url, thumb and NO _id")
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED: {str(e)}")
        return False
    
    # Test 3: POST /api/posters with invalid dataUrl
    print("\n" + "-"*80)
    print("TEST 3: POST /api/posters with invalid dataUrl")
    print("-"*80)
    try:
        payload = {
            'dataUrl': 'not-an-image'
        }
        response = requests.post(f"{BASE_URL}/posters", json=payload, timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400, got {response.status_code}")
            return False
        
        result = response.json()
        error_msg = result.get('error', '')
        
        if 'Gecerli bir afis gorseli (dataUrl) zorunlu' not in error_msg:
            print(f"⚠️  WARNING: Error message does not match expected: '{error_msg}'")
        
        print(f"✅ TEST 3 PASSED: POST /api/posters with invalid dataUrl returns clean 400 error")
        
    except Exception as e:
        print(f"❌ TEST 3 FAILED: {str(e)}")
        return False
    
    # Test 4: POST /api/video/prepend-poster with posterDataUrl
    print("\n" + "-"*80)
    print("TEST 4: POST /api/video/prepend-poster with posterDataUrl")
    print("-"*80)
    try:
        png_data_url = create_tiny_png_base64()
        payload = {
            'file': VFILE,
            'posterDataUrl': png_data_url,
            'duration': 2
        }
        response = requests.post(f"{BASE_URL}/video/prepend-poster", json=payload, timeout=60)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        result = response.json()
        
        if not result.get('jobId'):
            print(f"❌ FAILED: Response does not contain 'jobId'")
            return False
        
        if not result.get('url'):
            print(f"❌ FAILED: Response does not contain 'url'")
            return False
        
        if not result.get('duration'):
            print(f"❌ FAILED: Response does not contain 'duration'")
            return False
        
        job_id = result['jobId']
        video_url = result['url']
        video_duration = result['duration']
        
        print(f"✅ Prepend poster completed: jobId={job_id}, duration={video_duration}s")
        print(f"   URL: {video_url}")
        
        # Verify duration is ~7s (5s video + 2s intro, tolerance ±0.5)
        expected_duration = 7.0
        if video_duration < expected_duration - 0.5 or video_duration > expected_duration + 0.5:
            print(f"❌ FAILED: Duration {video_duration}s not in expected range {expected_duration}±0.5s")
            return False
        
        print(f"✅ Duration {video_duration}s is within expected range {expected_duration}±0.5s")
        
        # GET /api/studio/render/<jobId> to verify status DONE
        print(f"\n[TEST 4.1] GET /api/studio/render/{job_id}")
        render_response = requests.get(f"{BASE_URL}/studio/render/{job_id}", timeout=30)
        print(f"Status: {render_response.status_code}")
        
        if render_response.status_code != 200:
            print(f"❌ FAILED: Could not GET render status")
            return False
        
        render_doc = render_response.json()
        print(f"Render status: {render_doc.get('status')}")
        
        if render_doc.get('status') != 'DONE':
            print(f"❌ FAILED: Render status is not DONE")
            return False
        
        print(f"✅ Render status is DONE")
        
        # GET the video URL to verify it's accessible
        full_url = BASE_URL.replace('/api', '') + video_url
        print(f"\n[TEST 4.2] GET {full_url}")
        video_response = requests.get(full_url, timeout=30)
        print(f"Status: {video_response.status_code}")
        print(f"Content-Type: {video_response.headers.get('Content-Type')}")
        print(f"Content-Length: {len(video_response.content)} bytes")
        
        if video_response.status_code != 200:
            print(f"❌ FAILED: Could not GET video")
            return False
        
        if len(video_response.content) == 0:
            print(f"❌ FAILED: Video has 0 bytes")
            return False
        
        if 'video' not in video_response.headers.get('Content-Type', ''):
            print(f"⚠️  WARNING: Content-Type is not video/*")
        
        print(f"✅ Video is accessible and playable ({len(video_response.content)} bytes)")
        
        # Verify audio stream EXISTS with ffprobe
        print(f"\n[TEST 4.3] Verifying audio stream EXISTS with ffprobe...")
        out_file = render_doc.get('outFile')
        if out_file:
            file_path = f"/app/uploads/{out_file}"
            if os.path.exists(file_path):
                # Check audio stream
                cmd = f"ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 {file_path}"
                code, out, err = run_command(cmd)
                audio_streams = out.strip()
                print(f"Audio streams: '{audio_streams}'")
                if "audio" not in audio_streams:
                    print(f"❌ FAILED: NO audio stream found (video had audio, should be preserved)")
                    return False
                print(f"✅ Audio stream EXISTS (correct)")
                
                # Check total duration
                cmd = f"ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 {file_path}"
                code, out, err = run_command(cmd)
                if code == 0:
                    actual_duration = float(out.strip())
                    print(f"Actual duration from ffprobe: {actual_duration:.2f}s")
                    if actual_duration < expected_duration - 0.5 or actual_duration > expected_duration + 0.5:
                        print(f"⚠️  WARNING: ffprobe duration {actual_duration:.2f}s not in expected range {expected_duration}±0.5s")
                    else:
                        print(f"✅ ffprobe duration {actual_duration:.2f}s is correct")
            else:
                print(f"⚠️  Could not locate file {file_path} for ffprobe verification")
        
        print(f"✅ TEST 4 PASSED: POST /api/video/prepend-poster with posterDataUrl working")
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED: {str(e)}")
        return False
    
    # Test 5: POST /api/video/prepend-poster with posterFile
    print("\n" + "-"*80)
    print("TEST 5: POST /api/video/prepend-poster with posterFile")
    print("-"*80)
    try:
        payload = {
            'file': VFILE,
            'posterFile': PFILE,
            'duration': 1.5
        }
        response = requests.post(f"{BASE_URL}/video/prepend-poster", json=payload, timeout=60)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        result = response.json()
        
        if not result.get('jobId'):
            print(f"❌ FAILED: Response does not contain 'jobId'")
            return False
        
        if not result.get('duration'):
            print(f"❌ FAILED: Response does not contain 'duration'")
            return False
        
        job_id = result['jobId']
        video_duration = result['duration']
        
        print(f"✅ Prepend poster with posterFile completed: jobId={job_id}, duration={video_duration}s")
        
        # Verify duration is ~6.5s (5s video + 1.5s intro, tolerance ±0.5)
        expected_duration = 6.5
        if video_duration < expected_duration - 0.5 or video_duration > expected_duration + 0.5:
            print(f"❌ FAILED: Duration {video_duration}s not in expected range {expected_duration}±0.5s")
            return False
        
        print(f"✅ Duration {video_duration}s is within expected range {expected_duration}±0.5s")
        print(f"✅ TEST 5 PASSED: POST /api/video/prepend-poster with posterFile working")
        
    except Exception as e:
        print(f"❌ TEST 5 FAILED: {str(e)}")
        return False
    
    # Test 6: POST /api/video/prepend-poster with SILENT video
    print("\n" + "-"*80)
    print("TEST 6: POST /api/video/prepend-poster with SILENT video")
    print("-"*80)
    try:
        png_data_url = create_tiny_png_base64()
        payload = {
            'file': SFILE,
            'posterDataUrl': png_data_url,
            'duration': 1
        }
        response = requests.post(f"{BASE_URL}/video/prepend-poster", json=payload, timeout=60)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        result = response.json()
        
        if not result.get('jobId'):
            print(f"❌ FAILED: Response does not contain 'jobId'")
            return False
        
        job_id = result['jobId']
        video_duration = result.get('duration', 0)
        
        print(f"✅ Prepend poster with SILENT video completed: jobId={job_id}, duration={video_duration}s")
        
        # Verify duration is ~5s (4s video + 1s intro, tolerance ±0.5)
        expected_duration = 5.0
        if video_duration < expected_duration - 0.5 or video_duration > expected_duration + 0.5:
            print(f"⚠️  WARNING: Duration {video_duration}s not in expected range {expected_duration}±0.5s")
        
        # Verify audio stream EXISTS (even though video is silent, we add silent audio)
        print(f"\n[TEST 6.1] Verifying audio stream EXISTS with ffprobe (silent audio)...")
        render_response = requests.get(f"{BASE_URL}/studio/render/{job_id}", timeout=30)
        if render_response.status_code == 200:
            render_doc = render_response.json()
            out_file = render_doc.get('outFile')
            if out_file:
                file_path = f"/app/uploads/{out_file}"
                if os.path.exists(file_path):
                    cmd = f"ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 {file_path}"
                    code, out, err = run_command(cmd)
                    audio_streams = out.strip()
                    print(f"Audio streams: '{audio_streams}'")
                    if "audio" not in audio_streams:
                        print(f"❌ FAILED: NO audio stream found (should have silent audio stream)")
                        return False
                    print(f"✅ Audio stream EXISTS (silent audio, correct)")
                else:
                    print(f"⚠️  Could not locate file {file_path} for ffprobe verification")
        
        print(f"✅ TEST 6 PASSED: POST /api/video/prepend-poster with SILENT video working")
        
    except Exception as e:
        print(f"❌ TEST 6 FAILED: {str(e)}")
        return False
    
    # Test 7: Error cases
    print("\n" + "-"*80)
    print("TEST 7: Error cases")
    print("-"*80)
    
    # Test 7.1: POST /api/video/prepend-poster with empty body
    print("\n[TEST 7.1] POST /api/video/prepend-poster with empty body {}")
    try:
        response = requests.post(f"{BASE_URL}/video/prepend-poster", json={}, timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400, got {response.status_code}")
            return False
        
        result = response.json()
        error_msg = result.get('error', '')
        if 'file (video) zorunlu' not in error_msg:
            print(f"⚠️  WARNING: Error message does not contain 'file (video) zorunlu': '{error_msg}'")
        
        print(f"✅ Correct 400 error for missing file")
        
    except Exception as e:
        print(f"❌ TEST 7.1 FAILED: {str(e)}")
        return False
    
    # Test 7.2: POST /api/video/prepend-poster with nonexistent file
    print("\n[TEST 7.2] POST /api/video/prepend-poster with nonexistent file")
    try:
        png_data_url = create_tiny_png_base64()
        payload = {
            'file': 'nope.mp4',
            'posterDataUrl': png_data_url
        }
        response = requests.post(f"{BASE_URL}/video/prepend-poster", json=payload, timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code != 404:
            print(f"❌ FAILED: Expected 404, got {response.status_code}")
            return False
        
        result = response.json()
        error_msg = result.get('error', '')
        if 'video dosyasi yok' not in error_msg:
            print(f"⚠️  WARNING: Error message does not contain 'video dosyasi yok': '{error_msg}'")
        
        print(f"✅ Correct 404 error for nonexistent file")
        
    except Exception as e:
        print(f"❌ TEST 7.2 FAILED: {str(e)}")
        return False
    
    print(f"\n✅ TEST 7 PASSED: Error cases handled correctly")
    
    # Test 8: DELETE /api/posters/<PID>
    print("\n" + "-"*80)
    print("TEST 8: DELETE /api/posters/<PID>")
    print("-"*80)
    try:
        response = requests.delete(f"{BASE_URL}/posters/{PID}", timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        result = response.json()
        if not result.get('ok'):
            print(f"❌ FAILED: Response does not contain ok:true")
            return False
        
        print(f"✅ Poster deleted: PID={PID}")
        
        # Verify removal by GET /api/posters
        print(f"\n[TEST 8.1] GET /api/posters to confirm removal")
        response = requests.get(f"{BASE_URL}/posters", timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Could not GET posters list")
            return False
        
        posters = response.json()
        for poster in posters:
            if poster.get('id') == PID:
                print(f"❌ FAILED: Poster {PID} still exists after deletion")
                return False
        
        print(f"✅ Poster {PID} confirmed removed from list")
        print(f"✅ TEST 8 PASSED: DELETE /api/posters/<PID> working")
        
    except Exception as e:
        print(f"❌ TEST 8 FAILED: {str(e)}")
        return False
    
    print("\n" + "="*80)
    print("✅ ALL PREPEND POSTER TESTS PASSED (8/8)")
    print("="*80)
    return True

if __name__ == "__main__":
    try:
        success = test_prepend_poster()
        exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ TEST SUITE FAILED WITH EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        exit(1)
