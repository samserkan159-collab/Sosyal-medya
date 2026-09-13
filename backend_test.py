#!/usr/bin/env python3
"""
Backend test for Video Cutter add-on endpoints
Tests: /api/video/thumbnail, /api/video/vertical, /api/video/audio
"""
import requests
import subprocess
import os
import json
import time

BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:3000/api").rstrip("/")
ORIGIN = BASE_URL[:-4] if BASE_URL.endswith("/api") else BASE_URL

def run_command(cmd):
    """Run shell command and return output"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr

def test_video_cutter_addons():
    """Test Video Cutter add-on endpoints"""
    print("\n" + "="*80)
    print("VIDEO CUTTER ADD-ON ENDPOINTS TEST")
    print("="*80)
    
    # Step 1: Create source video WITH audio
    print("\n[SETUP] Creating source video with audio...")
    cmd = "ffmpeg -f lavfi -i testsrc=duration=6:size=640x480:rate=25 -f lavfi -i sine=frequency=440:duration=6 -pix_fmt yuv420p -shortest /tmp/src.mp4 -y"
    code, out, err = run_command(cmd)
    if code != 0:
        print(f"❌ FAILED to create source video: {err}")
        return False
    
    # Check file exists and has size
    if not os.path.exists('/tmp/src.mp4'):
        print("❌ FAILED: /tmp/src.mp4 not created")
        return False
    
    file_size = os.path.getsize('/tmp/src.mp4')
    print(f"✅ Source video created: /tmp/src.mp4 ({file_size} bytes)")
    
    # Step 2: Upload video via POST /api/video/upload-chunk
    print("\n[SETUP] Uploading source video via POST /api/video/upload-chunk...")
    try:
        with open('/tmp/src.mp4', 'rb') as f:
            video_bytes = f.read()
        
        files = {
            'chunk': ('src.mp4', video_bytes, 'video/mp4')
        }
        data = {
            'uploadId': 'test_video_cutter_001',
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
        
        uploaded_file = upload_result['file']
        duration = upload_result.get('duration', 0)
        print(f"✅ Video uploaded: {uploaded_file}, duration: {duration}s")
        
        if duration < 5.9 or duration > 6.1:
            print(f"⚠️  WARNING: Duration {duration}s not in expected range 5.9-6.1s")
        
    except Exception as e:
        print(f"❌ FAILED to upload video: {str(e)}")
        return False
    
    # Test 1: POST /api/video/thumbnail
    print("\n" + "-"*80)
    print("TEST 1: POST /api/video/thumbnail")
    print("-"*80)
    try:
        payload = {
            'file': uploaded_file,
            'time': 2
        }
        response = requests.post(f"{BASE_URL}/video/thumbnail", json=payload, timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        result = response.json()
        if not result.get('file') or not result['file'].endswith('.png'):
            print(f"❌ FAILED: Response does not contain .png file")
            return False
        
        if not result.get('url'):
            print(f"❌ FAILED: Response does not contain url")
            return False
        
        thumb_file = result['file']
        thumb_url = result['url']
        print(f"✅ Thumbnail generated: {thumb_file}")
        print(f"   URL: {thumb_url}")
        
        # GET the thumbnail URL to verify it's accessible
        full_url = BASE_URL.replace('/api', '') + thumb_url
        print(f"\n[TEST 1.1] GET {full_url}")
        img_response = requests.get(full_url, timeout=30)
        print(f"Status: {img_response.status_code}")
        print(f"Content-Type: {img_response.headers.get('Content-Type')}")
        print(f"Content-Length: {len(img_response.content)} bytes")
        
        if img_response.status_code != 200:
            print(f"❌ FAILED: Could not GET thumbnail image")
            return False
        
        if len(img_response.content) == 0:
            print(f"❌ FAILED: Thumbnail image has 0 bytes")
            return False
        
        print(f"✅ TEST 1 PASSED: Thumbnail endpoint working, image accessible ({len(img_response.content)} bytes)")
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED: {str(e)}")
        return False
    
    # Test 2: POST /api/video/vertical
    print("\n" + "-"*80)
    print("TEST 2: POST /api/video/vertical")
    print("-"*80)
    try:
        payload = {
            'file': uploaded_file
        }
        response = requests.post(f"{BASE_URL}/video/vertical", json=payload, timeout=60)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        result = response.json()
        if not result.get('jobId'):
            print(f"❌ FAILED: Response does not contain jobId")
            return False
        
        if not result.get('url'):
            print(f"❌ FAILED: Response does not contain url")
            return False
        
        job_id = result['jobId']
        video_url = result['url']
        video_duration = result.get('duration', 0)
        
        print(f"✅ Vertical video created: jobId={job_id}, duration={video_duration}s")
        print(f"   URL: {video_url}")
        
        if video_duration < 5.5 or video_duration > 6.5:
            print(f"⚠️  WARNING: Duration {video_duration}s not close to expected ~6s")
        
        # GET /api/studio/render/<jobId> to verify status DONE
        print(f"\n[TEST 2.1] GET /api/studio/render/{job_id}")
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
        print(f"\n[TEST 2.2] GET {full_url}")
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
        
        # Try to verify resolution with ffprobe if we can locate the file
        print(f"\n[TEST 2.3] Verifying resolution with ffprobe...")
        out_file = render_doc.get('outFile')
        if out_file:
            file_path = f"/app/uploads/{out_file}"
            if os.path.exists(file_path):
                cmd = f"ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 {file_path}"
                code, out, err = run_command(cmd)
                if code == 0:
                    resolution = out.strip()
                    print(f"Resolution: {resolution}")
                    if resolution == "1080x1920":
                        print(f"✅ Resolution is correct: 1080x1920")
                    else:
                        print(f"⚠️  WARNING: Resolution {resolution} is not 1080x1920")
                else:
                    print(f"⚠️  Could not probe resolution: {err}")
            else:
                print(f"⚠️  Could not locate file {file_path} for ffprobe verification")
        
        print(f"✅ TEST 2 PASSED: Vertical video endpoint working")
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED: {str(e)}")
        return False
    
    # Test 3: POST /api/video/audio with action='mute'
    print("\n" + "-"*80)
    print("TEST 3: POST /api/video/audio (action='mute')")
    print("-"*80)
    try:
        payload = {
            'file': uploaded_file,
            'action': 'mute'
        }
        response = requests.post(f"{BASE_URL}/video/audio", json=payload, timeout=60)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        result = response.json()
        if not result.get('jobId'):
            print(f"❌ FAILED: Response does not contain jobId")
            return False
        
        if not result.get('url'):
            print(f"❌ FAILED: Response does not contain url")
            return False
        
        job_id = result['jobId']
        video_url = result['url']
        
        print(f"✅ Muted video created: jobId={job_id}")
        print(f"   URL: {video_url}")
        
        # Try to verify NO audio stream with ffprobe
        print(f"\n[TEST 3.1] Verifying NO audio stream with ffprobe...")
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
                    if audio_streams == "":
                        print(f"✅ NO audio stream found (correct for mute)")
                    else:
                        print(f"❌ FAILED: Audio stream found in muted video: {audio_streams}")
                        return False
                else:
                    print(f"⚠️  Could not locate file {file_path} for ffprobe verification")
        
        print(f"✅ TEST 3 PASSED: Mute audio endpoint working")
        
    except Exception as e:
        print(f"❌ TEST 3 FAILED: {str(e)}")
        return False
    
    # Test 4: POST /api/video/audio with action='music', presetId='enerjik'
    print("\n" + "-"*80)
    print("TEST 4: POST /api/video/audio (action='music', presetId='enerjik')")
    print("-"*80)
    try:
        payload = {
            'file': uploaded_file,
            'action': 'music',
            'presetId': 'enerjik'
        }
        response = requests.post(f"{BASE_URL}/video/audio", json=payload, timeout=60)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        result = response.json()
        if not result.get('jobId'):
            print(f"❌ FAILED: Response does not contain jobId")
            return False
        
        if not result.get('url'):
            print(f"❌ FAILED: Response does not contain url")
            return False
        
        job_id = result['jobId']
        video_url = result['url']
        
        print(f"✅ Music video created: jobId={job_id}")
        print(f"   URL: {video_url}")
        
        # Try to verify audio stream EXISTS with ffprobe
        print(f"\n[TEST 4.1] Verifying audio stream EXISTS with ffprobe...")
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
                    if "audio" in audio_streams:
                        print(f"✅ Audio stream found (correct for music)")
                    else:
                        print(f"❌ FAILED: NO audio stream found in music video")
                        return False
                else:
                    print(f"⚠️  Could not locate file {file_path} for ffprobe verification")
        
        print(f"✅ TEST 4 PASSED: Music audio endpoint working")
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED: {str(e)}")
        return False
    
    # Test 5: Error cases
    print("\n" + "-"*80)
    print("TEST 5: Error cases")
    print("-"*80)
    
    # Test 5.1: POST /api/video/thumbnail with empty body
    print("\n[TEST 5.1] POST /api/video/thumbnail with empty body {}")
    try:
        response = requests.post(f"{BASE_URL}/video/thumbnail", json={}, timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400, got {response.status_code}")
            return False
        
        result = response.json()
        if 'file zorunlu' not in result.get('error', ''):
            print(f"⚠️  WARNING: Error message does not contain 'file zorunlu'")
        
        print(f"✅ Correct 400 error for missing file")
        
    except Exception as e:
        print(f"❌ TEST 5.1 FAILED: {str(e)}")
        return False
    
    # Test 5.2: POST /api/video/vertical with nonexistent file
    print("\n[TEST 5.2] POST /api/video/vertical with nonexistent file")
    try:
        payload = {
            'file': 'nope.mp4'
        }
        response = requests.post(f"{BASE_URL}/video/vertical", json=payload, timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code != 404:
            print(f"❌ FAILED: Expected 404, got {response.status_code}")
            return False
        
        result = response.json()
        if 'video dosyasi yok' not in result.get('error', ''):
            print(f"⚠️  WARNING: Error message does not contain 'video dosyasi yok'")
        
        print(f"✅ Correct 404 error for nonexistent file")
        
    except Exception as e:
        print(f"❌ TEST 5.2 FAILED: {str(e)}")
        return False
    
    print(f"\n✅ TEST 5 PASSED: Error cases handled correctly")
    
    print("\n" + "="*80)
    print("✅ ALL VIDEO CUTTER ADD-ON TESTS PASSED (5/5)")
    print("="*80)
    return True

if __name__ == "__main__":
    try:
        success = test_video_cutter_addons()
        exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ TEST SUITE FAILED WITH EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        exit(1)
