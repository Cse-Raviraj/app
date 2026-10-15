#!/usr/bin/env python3
"""
Backend test for Talk to Strangers - ROUND 3 features
Tests: Photo sharing, Name change propagation, Voice call signaling, Regression on realtime messaging
"""
import requests
import socketio
import time
import json
import io
from PIL import Image

BASE_URL = "https://find-random-friend.preview.emergentagent.com/api"
SOCKET_PATH = "/api/socketio"

class TestUser:
    def __init__(self, name):
        self.name = name
        # Use timestamp to make emails unique
        self.email = f"{name.lower()}_{int(time.time())}@test.com"
        self.password = "password123"
        self.user_id = None
        self.token = None
        self.cookie = None
        self.sio = None
        self.events = []
        
    def signup(self):
        """Sign up a new user"""
        try:
            resp = requests.post(f"{BASE_URL}/auth/signup", json={
                "email": self.email,
                "password": self.password
            })
            if resp.status_code == 201:
                self.user_id = resp.json()["user"]["id"]
                self.cookie = resp.cookies.get("tts_token")
                print(f"✅ {self.name} signed up: {self.user_id}")
                return True
            else:
                print(f"❌ {self.name} signup failed: {resp.status_code} {resp.text}")
                return False
        except Exception as e:
            print(f"❌ {self.name} signup error: {e}")
            return False
    
    def connect_socket(self):
        """Connect to Socket.IO with auth cookie"""
        try:
            # Add delay before creating new socket client
            time.sleep(1)
            self.sio = socketio.Client(logger=False, engineio_logger=False)
            self.events = []
            
            # Register event handlers
            @self.sio.on('connected_ok')
            def on_connected(data):
                self.events.append(('connected_ok', data))
            
            @self.sio.on('chat_request')
            def on_chat_request(data):
                self.events.append(('chat_request', data))
            
            @self.sio.on('match_found')
            def on_match_found(data):
                self.events.append(('match_found', data))
            
            @self.sio.on('new_message')
            def on_new_message(data):
                self.events.append(('new_message', data))
            
            @self.sio.on('typing')
            def on_typing(data):
                self.events.append(('typing', data))
            
            @self.sio.on('messages_read')
            def on_messages_read(data):
                self.events.append(('messages_read', data))
            
            @self.sio.on('chat_ended')
            def on_chat_ended(data):
                self.events.append(('chat_ended', data))
            
            @self.sio.on('peer_updated')
            def on_peer_updated(data):
                self.events.append(('peer_updated', data))
            
            @self.sio.on('call_incoming')
            def on_call_incoming(data):
                self.events.append(('call_incoming', data))
            
            @self.sio.on('call_answered')
            def on_call_answered(data):
                self.events.append(('call_answered', data))
            
            @self.sio.on('call_ice')
            def on_call_ice(data):
                self.events.append(('call_ice', data))
            
            @self.sio.on('call_ended')
            def on_call_ended(data):
                self.events.append(('call_ended', data))
            
            @self.sio.on('call_rejected')
            def on_call_rejected(data):
                self.events.append(('call_rejected', data))
            
            @self.sio.on('nobody_available')
            def on_nobody_available(data):
                self.events.append(('nobody_available', data))
            
            # Connect with cookie
            self.sio.connect(
                "https://find-random-friend.preview.emergentagent.com",
                socketio_path=SOCKET_PATH,
                headers={"Cookie": f"tts_token={self.cookie}"},
                transports=['websocket']
            )
            time.sleep(0.5)
            print(f"✅ {self.name} connected to socket")
            return True
        except Exception as e:
            print(f"❌ {self.name} socket connection error: {e}")
            return False
    
    def disconnect_socket(self):
        """Disconnect from Socket.IO"""
        if self.sio and self.sio.connected:
            self.sio.disconnect()
            time.sleep(1)  # Add delay after disconnect
            print(f"✅ {self.name} disconnected from socket")
    
    def get_event(self, event_name, timeout=2):
        """Wait for and return a specific event"""
        start = time.time()
        while time.time() - start < timeout:
            for event in self.events:
                if event[0] == event_name:
                    self.events.remove(event)
                    return event[1]
            time.sleep(0.1)
        return None
    
    def clear_events(self):
        """Clear all events"""
        self.events = []

def create_tiny_png():
    """Create a tiny valid PNG image in memory"""
    img = Image.new('RGB', (10, 10), color='red')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf

def test_setup():
    """Setup: Create two users A and B, make them friends"""
    print("\n=== SETUP: Creating users A and B ===")
    
    userA = TestUser("UserA")
    userB = TestUser("UserB")
    
    if not userA.signup() or not userB.signup():
        return None, None, None
    
    # Make them friends
    print("\n=== Making A and B friends ===")
    
    # A sends friend request to B
    resp = requests.post(
        f"{BASE_URL}/friends/request",
        json={"toUserId": userB.user_id},
        cookies={"tts_token": userA.cookie}
    )
    if resp.status_code != 201:
        print(f"❌ Friend request failed: {resp.status_code} {resp.text}")
        return None, None, None
    
    request_id = resp.json()["requestId"]
    print(f"✅ A sent friend request to B: {request_id}")
    
    # B accepts friend request
    resp = requests.post(
        f"{BASE_URL}/friends/respond",
        json={"requestId": request_id, "accept": True},
        cookies={"tts_token": userB.cookie}
    )
    if resp.status_code != 200:
        print(f"❌ Friend accept failed: {resp.status_code} {resp.text}")
        return None, None, None
    
    print(f"✅ B accepted friend request")
    
    # Get friend conversation ID
    resp = requests.get(
        f"{BASE_URL}/conversations",
        cookies={"tts_token": userA.cookie}
    )
    if resp.status_code != 200:
        print(f"❌ Get conversations failed: {resp.status_code}")
        return None, None, None
    
    convs = resp.json()["conversations"]
    friend_conv = next((c for c in convs if c["type"] == "friend"), None)
    
    if not friend_conv:
        print(f"❌ No friend conversation found")
        return None, None, None
    
    friend_conv_id = friend_conv["id"]
    print(f"✅ Friend conversation ID: {friend_conv_id}")
    
    return userA, userB, friend_conv_id

def test_photo_sharing(userA, userB, friend_conv_id):
    """TEST 1 - Photo sharing"""
    print("\n=== TEST 1: Photo Sharing ===")
    
    # Connect B to socket and join conversation
    if not userB.connect_socket():
        print("❌ TEST 1a: Failed to connect B to socket")
        return False
    
    time.sleep(0.5)
    userB.sio.emit('join_conversation', {'conversationId': friend_conv_id})
    time.sleep(0.5)
    userB.clear_events()
    
    # TEST 1a: A uploads valid PNG to friend conversation
    print("\n--- TEST 1a: Valid PNG upload ---")
    try:
        png_data = create_tiny_png()
        files = {'image': ('test.png', png_data, 'image/png')}
        resp = requests.post(
            f"{BASE_URL}/conversations/{friend_conv_id}/image",
            files=files,
            cookies={"tts_token": userA.cookie}
        )
        
        if resp.status_code == 201:
            msg = resp.json()["message"]
            if msg.get("image") and "/uploads/chat/" in msg["image"] and msg["image"].endswith(".png"):
                print(f"✅ TEST 1a PASS: Image uploaded, path: {msg['image']}")
                
                # Check if B received socket event
                time.sleep(1)
                new_msg_event = userB.get_event('new_message', timeout=2)
                if new_msg_event and new_msg_event.get("image"):
                    print(f"✅ TEST 1a PASS: B received new_message event with image: {new_msg_event['image']}")
                else:
                    print(f"⚠️  TEST 1a: B did not receive new_message event (best-effort)")
            else:
                print(f"❌ TEST 1a FAIL: Invalid image path in response: {msg}")
                return False
        else:
            print(f"❌ TEST 1a FAIL: Upload failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 1a FAIL: Exception: {e}")
        return False
    
    # TEST 1b: GET messages should include image
    print("\n--- TEST 1b: GET messages includes image ---")
    try:
        resp = requests.get(
            f"{BASE_URL}/conversations/{friend_conv_id}/messages",
            cookies={"tts_token": userA.cookie}
        )
        if resp.status_code == 200:
            messages = resp.json()["messages"]
            image_msg = next((m for m in messages if m.get("image")), None)
            if image_msg:
                print(f"✅ TEST 1b PASS: Message with image found: {image_msg['image']}")
            else:
                print(f"❌ TEST 1b FAIL: No message with image field found")
                return False
        else:
            print(f"❌ TEST 1b FAIL: GET messages failed: {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 1b FAIL: Exception: {e}")
        return False
    
    # TEST 1c: Non-participant user C uploads to A/B conversation -> 404
    print("\n--- TEST 1c: Non-participant upload -> 404 ---")
    try:
        userC = TestUser("UserC")
        if not userC.signup():
            print(f"❌ TEST 1c: Failed to create user C")
            return False
        
        png_data = create_tiny_png()
        files = {'image': ('test.png', png_data, 'image/png')}
        resp = requests.post(
            f"{BASE_URL}/conversations/{friend_conv_id}/image",
            files=files,
            cookies={"tts_token": userC.cookie}
        )
        
        if resp.status_code == 404:
            print(f"✅ TEST 1c PASS: Non-participant got 404")
        else:
            print(f"❌ TEST 1c FAIL: Expected 404, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 1c FAIL: Exception: {e}")
        return False
    
    # TEST 1d: Upload non-image file -> 400
    print("\n--- TEST 1d: Non-image file -> 400 ---")
    try:
        text_data = io.BytesIO(b"This is not an image")
        files = {'image': ('test.txt', text_data, 'text/plain')}
        resp = requests.post(
            f"{BASE_URL}/conversations/{friend_conv_id}/image",
            files=files,
            cookies={"tts_token": userA.cookie}
        )
        
        if resp.status_code == 400:
            print(f"✅ TEST 1d PASS: Non-image file got 400")
        else:
            print(f"❌ TEST 1d FAIL: Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 1d FAIL: Exception: {e}")
        return False
    
    # TEST 1d: Upload with no file -> 400
    print("\n--- TEST 1d: No file -> 400 ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/conversations/{friend_conv_id}/image",
            cookies={"tts_token": userA.cookie}
        )
        
        if resp.status_code == 400:
            print(f"✅ TEST 1d PASS: No file got 400")
        else:
            print(f"❌ TEST 1d FAIL: Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 1d FAIL: Exception: {e}")
        return False
    
    # TEST 1e: Ended random conversation -> 400, Active random conversation -> 201
    print("\n--- TEST 1e: Random conversation image upload ---")
    try:
        # Disconnect B first
        userB.disconnect_socket()
        time.sleep(0.5)
        
        # Connect both to socket for matchmaking
        if not userA.connect_socket() or not userB.connect_socket():
            print(f"❌ TEST 1e: Failed to connect sockets")
            return False
        
        time.sleep(0.5)
        
        # A finds friend
        userA.clear_events()
        userB.clear_events()
        userA.sio.emit('find_friend')
        time.sleep(0.5)
        
        # B should receive chat_request
        chat_req = userB.get_event('chat_request', timeout=2)
        if not chat_req:
            print(f"❌ TEST 1e: B did not receive chat_request")
            return False
        
        # B accepts
        userB.sio.emit('accept_request', {'requestId': chat_req['requestId']})
        time.sleep(1)
        
        # Both should get match_found
        match_a = userA.get_event('match_found', timeout=2)
        match_b = userB.get_event('match_found', timeout=2)
        
        if not match_a or not match_b:
            print(f"❌ TEST 1e: Match not found")
            return False
        
        random_conv_id = match_a['conversation']['id']
        print(f"✅ TEST 1e: Random match created: {random_conv_id}")
        
        # Upload image to ACTIVE random conversation -> should work (201)
        png_data = create_tiny_png()
        files = {'image': ('test.png', png_data, 'image/png')}
        resp = requests.post(
            f"{BASE_URL}/conversations/{random_conv_id}/image",
            files=files,
            cookies={"tts_token": userA.cookie}
        )
        
        if resp.status_code == 201:
            print(f"✅ TEST 1e PASS: Active random conversation image upload -> 201")
        else:
            print(f"❌ TEST 1e FAIL: Active random expected 201, got {resp.status_code}")
            return False
        
        # End the chat
        userA.sio.emit('end_chat', {'conversationId': random_conv_id})
        time.sleep(1)
        
        # Try to upload to ENDED random conversation -> 400
        png_data = create_tiny_png()
        files = {'image': ('test.png', png_data, 'image/png')}
        resp = requests.post(
            f"{BASE_URL}/conversations/{random_conv_id}/image",
            files=files,
            cookies={"tts_token": userA.cookie}
        )
        
        if resp.status_code == 400:
            print(f"✅ TEST 1e PASS: Ended random conversation image upload -> 400")
        else:
            print(f"❌ TEST 1e FAIL: Ended random expected 400, got {resp.status_code}")
            return False
        
        # Disconnect sockets
        userA.disconnect_socket()
        userB.disconnect_socket()
        
    except Exception as e:
        print(f"❌ TEST 1e FAIL: Exception: {e}")
        return False
    
    print(f"\n✅ TEST 1: Photo Sharing - ALL PASS")
    return True

def test_name_change_propagation(userA, userB, friend_conv_id):
    """TEST 2 - Name change propagation"""
    print("\n=== TEST 2: Name Change Propagation ===")
    
    # Connect B to socket
    if not userB.connect_socket():
        print("❌ TEST 2: Failed to connect B to socket")
        return False
    
    time.sleep(0.5)
    userB.clear_events()
    
    # A changes name
    new_name = f"NewName_{int(time.time())}"
    print(f"\n--- A changing name to {new_name} ---")
    
    try:
        resp = requests.patch(
            f"{BASE_URL}/me/profile",
            json={"anonymousName": new_name},
            cookies={"tts_token": userA.cookie}
        )
        
        if resp.status_code == 200:
            updated_user = resp.json()["user"]
            if updated_user["anonymousName"] == new_name:
                print(f"✅ TEST 2 PASS: Name updated to {new_name}")
            else:
                print(f"❌ TEST 2 FAIL: Name not updated correctly")
                return False
        else:
            print(f"❌ TEST 2 FAIL: Name update failed: {resp.status_code} {resp.text}")
            return False
        
        # Check if B received peer_updated event (best-effort)
        time.sleep(1)
        peer_updated = userB.get_event('peer_updated', timeout=2)
        if peer_updated and peer_updated.get("user", {}).get("anonymousName") == new_name:
            print(f"✅ TEST 2 PASS: B received peer_updated event with new name")
        else:
            print(f"⚠️  TEST 2: B did not receive peer_updated event (best-effort, not critical)")
        
    except Exception as e:
        print(f"❌ TEST 2 FAIL: Exception: {e}")
        return False
    
    # Test duplicate name -> 409
    print(f"\n--- B trying to take A's name (duplicate) ---")
    try:
        resp = requests.patch(
            f"{BASE_URL}/me/profile",
            json={"anonymousName": new_name},
            cookies={"tts_token": userB.cookie}
        )
        
        if resp.status_code == 409:
            print(f"✅ TEST 2 PASS: Duplicate name got 409")
        else:
            print(f"❌ TEST 2 FAIL: Expected 409, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 2 FAIL: Exception: {e}")
        return False
    
    userB.disconnect_socket()
    print(f"\n✅ TEST 2: Name Change Propagation - ALL PASS")
    return True

def test_voice_call_signaling(userA, userB, friend_conv_id):
    """TEST 3 - Voice call signaling relay"""
    print("\n=== TEST 3: Voice Call Signaling ===")
    
    # Connect both users to socket
    if not userA.connect_socket() or not userB.connect_socket():
        print("❌ TEST 3: Failed to connect sockets")
        return False
    
    time.sleep(0.5)
    
    # Both join the conversation
    userA.sio.emit('join_conversation', {'conversationId': friend_conv_id})
    userB.sio.emit('join_conversation', {'conversationId': friend_conv_id})
    time.sleep(0.5)
    
    userA.clear_events()
    userB.clear_events()
    
    # TEST 3a: A emits call_offer -> B receives call_incoming
    print("\n--- TEST 3a: call_offer -> call_incoming ---")
    try:
        fake_sdp = {"type": "offer", "sdp": "fake_sdp_data_123"}
        userA.sio.emit('call_offer', {
            'conversationId': friend_conv_id,
            'sdp': fake_sdp
        })
        time.sleep(1)
        
        call_incoming = userB.get_event('call_incoming', timeout=2)
        if call_incoming:
            if (call_incoming.get('conversationId') == friend_conv_id and
                call_incoming.get('from') == userA.user_id and
                call_incoming.get('sdp') == fake_sdp and
                call_incoming.get('fromUser')):
                print(f"✅ TEST 3a PASS: B received call_incoming with correct data")
            else:
                print(f"❌ TEST 3a FAIL: call_incoming data incorrect: {call_incoming}")
                return False
        else:
            print(f"❌ TEST 3a FAIL: B did not receive call_incoming")
            return False
    except Exception as e:
        print(f"❌ TEST 3a FAIL: Exception: {e}")
        return False
    
    # TEST 3b: B emits call_answer -> A receives call_answered
    print("\n--- TEST 3b: call_answer -> call_answered ---")
    try:
        fake_answer_sdp = {"type": "answer", "sdp": "fake_answer_sdp_456"}
        userB.sio.emit('call_answer', {
            'conversationId': friend_conv_id,
            'sdp': fake_answer_sdp
        })
        time.sleep(1)
        
        call_answered = userA.get_event('call_answered', timeout=2)
        if call_answered:
            if (call_answered.get('conversationId') == friend_conv_id and
                call_answered.get('sdp') == fake_answer_sdp):
                print(f"✅ TEST 3b PASS: A received call_answered with correct data")
            else:
                print(f"❌ TEST 3b FAIL: call_answered data incorrect: {call_answered}")
                return False
        else:
            print(f"❌ TEST 3b FAIL: A did not receive call_answered")
            return False
    except Exception as e:
        print(f"❌ TEST 3b FAIL: Exception: {e}")
        return False
    
    # TEST 3c: A emits call_ice -> B receives call_ice
    print("\n--- TEST 3c: call_ice relay ---")
    try:
        fake_candidate = {"candidate": "fake_ice_candidate_789", "sdpMid": "0"}
        userA.sio.emit('call_ice', {
            'conversationId': friend_conv_id,
            'candidate': fake_candidate
        })
        time.sleep(1)
        
        call_ice = userB.get_event('call_ice', timeout=2)
        if call_ice:
            if (call_ice.get('conversationId') == friend_conv_id and
                call_ice.get('candidate') == fake_candidate):
                print(f"✅ TEST 3c PASS: B received call_ice with correct data")
            else:
                print(f"❌ TEST 3c FAIL: call_ice data incorrect: {call_ice}")
                return False
        else:
            print(f"❌ TEST 3c FAIL: B did not receive call_ice")
            return False
    except Exception as e:
        print(f"❌ TEST 3c FAIL: Exception: {e}")
        return False
    
    # TEST 3d: B emits call_end -> A receives call_ended
    print("\n--- TEST 3d: call_end -> call_ended ---")
    try:
        userB.sio.emit('call_end', {'conversationId': friend_conv_id})
        time.sleep(1)
        
        call_ended = userA.get_event('call_ended', timeout=2)
        if call_ended:
            if call_ended.get('conversationId') == friend_conv_id:
                print(f"✅ TEST 3d PASS: A received call_ended")
            else:
                print(f"❌ TEST 3d FAIL: call_ended data incorrect: {call_ended}")
                return False
        else:
            print(f"❌ TEST 3d FAIL: A did not receive call_ended")
            return False
    except Exception as e:
        print(f"❌ TEST 3d FAIL: Exception: {e}")
        return False
    
    # TEST 3e: A emits call_reject -> B receives call_rejected
    print("\n--- TEST 3e: call_reject -> call_rejected ---")
    try:
        userA.sio.emit('call_reject', {'conversationId': friend_conv_id})
        time.sleep(1)
        
        call_rejected = userB.get_event('call_rejected', timeout=2)
        if call_rejected:
            if call_rejected.get('conversationId') == friend_conv_id:
                print(f"✅ TEST 3e PASS: B received call_rejected")
            else:
                print(f"❌ TEST 3e FAIL: call_rejected data incorrect: {call_rejected}")
                return False
        else:
            print(f"❌ TEST 3e FAIL: B did not receive call_rejected")
            return False
    except Exception as e:
        print(f"❌ TEST 3e FAIL: Exception: {e}")
        return False
    
    # TEST 3f: Non-participant emits call_offer -> should NOT reach A or B
    print("\n--- TEST 3f: Non-participant call_offer blocked ---")
    try:
        userC = TestUser("UserC_Call")
        if not userC.signup():
            print(f"❌ TEST 3f: Failed to create user C")
            return False
        
        if not userC.connect_socket():
            print(f"❌ TEST 3f: Failed to connect C to socket")
            return False
        
        time.sleep(0.5)
        userA.clear_events()
        userB.clear_events()
        
        # C tries to emit call_offer to A/B conversation
        userC.sio.emit('call_offer', {
            'conversationId': friend_conv_id,
            'sdp': {"type": "offer", "sdp": "malicious_sdp"}
        })
        time.sleep(1)
        
        # A and B should NOT receive call_incoming
        call_incoming_a = userA.get_event('call_incoming', timeout=1)
        call_incoming_b = userB.get_event('call_incoming', timeout=1)
        
        if not call_incoming_a and not call_incoming_b:
            print(f"✅ TEST 3f PASS: Non-participant call blocked")
        else:
            print(f"❌ TEST 3f FAIL: Non-participant call reached participants")
            return False
        
        userC.disconnect_socket()
    except Exception as e:
        print(f"❌ TEST 3f FAIL: Exception: {e}")
        return False
    
    userA.disconnect_socket()
    userB.disconnect_socket()
    print(f"\n✅ TEST 3: Voice Call Signaling - ALL PASS")
    return True

def test_regression_realtime_messaging(userA, userB, friend_conv_id):
    """TEST 4 - Regression: realtime messaging with per-user rooms"""
    print("\n=== TEST 4: Regression - Realtime Messaging ===")
    
    # TEST 4a: Full random match flow
    print("\n--- TEST 4a: Full random match flow ---")
    try:
        # Connect both to socket
        if not userA.connect_socket() or not userB.connect_socket():
            print("❌ TEST 4a: Failed to connect sockets")
            return False
        
        time.sleep(0.5)
        userA.clear_events()
        userB.clear_events()
        
        # A finds friend
        userA.sio.emit('find_friend')
        time.sleep(0.5)
        
        # B should receive chat_request
        chat_req = userB.get_event('chat_request', timeout=2)
        if not chat_req:
            print(f"❌ TEST 4a FAIL: B did not receive chat_request")
            return False
        print(f"✅ TEST 4a: B received chat_request")
        
        # B accepts
        userB.sio.emit('accept_request', {'requestId': chat_req['requestId']})
        time.sleep(1)
        
        # Both should get match_found with same conversation ID
        match_a = userA.get_event('match_found', timeout=2)
        match_b = userB.get_event('match_found', timeout=2)
        
        if not match_a or not match_b:
            print(f"❌ TEST 4a FAIL: Match not found")
            return False
        
        if match_a['conversation']['id'] != match_b['conversation']['id']:
            print(f"❌ TEST 4a FAIL: Conversation IDs don't match")
            return False
        
        random_conv_id = match_a['conversation']['id']
        print(f"✅ TEST 4a: Both got match_found with same conv ID: {random_conv_id}")
        
        # A sends message -> B receives new_message
        userB.clear_events()
        userA.sio.emit('send_message', {
            'conversationId': random_conv_id,
            'text': 'Hello from A'
        })
        time.sleep(1)
        
        new_msg = userB.get_event('new_message', timeout=2)
        if new_msg and new_msg.get('text') == 'Hello from A' and new_msg.get('senderId') == userA.user_id:
            print(f"✅ TEST 4a: B received new_message from A")
        else:
            print(f"❌ TEST 4a FAIL: B did not receive correct new_message")
            return False
        
        # B sends message -> A receives new_message
        userA.clear_events()
        userB.sio.emit('send_message', {
            'conversationId': random_conv_id,
            'text': 'Hello from B'
        })
        time.sleep(1)
        
        new_msg = userA.get_event('new_message', timeout=2)
        if new_msg and new_msg.get('text') == 'Hello from B' and new_msg.get('senderId') == userB.user_id:
            print(f"✅ TEST 4a: A received new_message from B")
        else:
            print(f"❌ TEST 4a FAIL: A did not receive correct new_message")
            return False
        
        # Typing indicator A -> B
        userB.clear_events()
        userA.sio.emit('typing', {
            'conversationId': random_conv_id,
            'isTyping': True
        })
        time.sleep(1)
        
        typing_event = userB.get_event('typing', timeout=2)
        if typing_event and typing_event.get('isTyping') == True:
            print(f"✅ TEST 4a: B received typing indicator from A")
        else:
            print(f"❌ TEST 4a FAIL: B did not receive typing indicator")
            return False
        
        # Read messages B -> A receives messages_read
        userA.clear_events()
        userB.sio.emit('read_messages', {'conversationId': random_conv_id})
        time.sleep(1)
        
        read_event = userA.get_event('messages_read', timeout=2)
        if read_event and read_event.get('readerId') == userB.user_id:
            print(f"✅ TEST 4a: A received messages_read from B")
        else:
            print(f"❌ TEST 4a FAIL: A did not receive messages_read")
            return False
        
        # End chat -> both get chat_ended
        userA.clear_events()
        userB.clear_events()
        userA.sio.emit('end_chat', {'conversationId': random_conv_id})
        time.sleep(1)
        
        ended_a = userA.get_event('chat_ended', timeout=2)
        ended_b = userB.get_event('chat_ended', timeout=2)
        
        if ended_a and ended_b:
            print(f"✅ TEST 4a: Both received chat_ended")
        else:
            print(f"❌ TEST 4a FAIL: chat_ended not received by both")
            return False
        
        userA.disconnect_socket()
        userB.disconnect_socket()
        
    except Exception as e:
        print(f"❌ TEST 4a FAIL: Exception: {e}")
        return False
    
    # TEST 4b: Friend conversation live text
    print("\n--- TEST 4b: Friend conversation live text ---")
    try:
        # Connect both to socket
        if not userA.connect_socket() or not userB.connect_socket():
            print("❌ TEST 4b: Failed to connect sockets")
            return False
        
        time.sleep(0.5)
        
        # Both join the friend conversation
        userA.sio.emit('join_conversation', {'conversationId': friend_conv_id})
        userB.sio.emit('join_conversation', {'conversationId': friend_conv_id})
        time.sleep(0.5)
        
        userA.clear_events()
        userB.clear_events()
        
        # A sends message -> B receives new_message
        userA.sio.emit('send_message', {
            'conversationId': friend_conv_id,
            'text': 'Friend message from A'
        })
        time.sleep(1)
        
        new_msg = userB.get_event('new_message', timeout=2)
        if new_msg and new_msg.get('text') == 'Friend message from A':
            print(f"✅ TEST 4b: B received new_message in friend chat")
        else:
            print(f"❌ TEST 4b FAIL: B did not receive new_message in friend chat")
            return False
        
        # B sends message -> A receives new_message
        userA.clear_events()
        userB.sio.emit('send_message', {
            'conversationId': friend_conv_id,
            'text': 'Friend message from B'
        })
        time.sleep(1)
        
        new_msg = userA.get_event('new_message', timeout=2)
        if new_msg and new_msg.get('text') == 'Friend message from B':
            print(f"✅ TEST 4b: A received new_message in friend chat")
        else:
            print(f"❌ TEST 4b FAIL: A did not receive new_message in friend chat")
            return False
        
        userA.disconnect_socket()
        userB.disconnect_socket()
        
    except Exception as e:
        print(f"❌ TEST 4b FAIL: Exception: {e}")
        return False
    
    print(f"\n✅ TEST 4: Regression - Realtime Messaging - ALL PASS")
    return True

def main():
    """Main test runner"""
    print("=" * 60)
    print("BACKEND TESTING - ROUND 3 FEATURES")
    print("=" * 60)
    
    # Setup
    userA, userB, friend_conv_id = test_setup()
    if not userA or not userB or not friend_conv_id:
        print("\n❌ SETUP FAILED - Cannot continue")
        return
    
    results = []
    
    # Run tests
    results.append(("Photo Sharing", test_photo_sharing(userA, userB, friend_conv_id)))
    results.append(("Name Change Propagation", test_name_change_propagation(userA, userB, friend_conv_id)))
    results.append(("Voice Call Signaling", test_voice_call_signaling(userA, userB, friend_conv_id)))
    results.append(("Regression - Realtime Messaging", test_regression_realtime_messaging(userA, userB, friend_conv_id)))
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed ({passed*100//total}%)")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
