#!/usr/bin/env python3
"""
Regression + new-feature backend test for "Talk to Strangers"
Focus areas:
1. USER SEARCH BY UNIQUE ID
2. FRIEND REQUEST + ACCEPT VIA SEARCH FLOW
3. 'ALREADY IN A CHAT' SELF-HEAL (the main reported bug)
4. DISCONNECT AUTO-END (grace period 8s)
5. QUICK REGRESSION (smoke tests)
"""

import requests
import socketio
import time
import threading
from datetime import datetime

# Configuration - use production URL from .env
BASE_URL = "https://find-random-friend.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"
SOCKET_PATH = "/api/socketio"

# Test results tracking
test_results = []

def log_test(scenario, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"{status}: {scenario}"
    if details:
        result += f" - {details}"
    print(result)
    test_results.append({"scenario": scenario, "passed": passed, "details": details})

def get_timestamp():
    """Get unique timestamp for test data"""
    return int(time.time() * 1000)

def wait_for_event(events_list, event_name, timeout=15):
    """Wait for a specific event to appear in events list"""
    start = time.time()
    while time.time() - start < timeout:
        for e in events_list:
            if e.get("event") == event_name:
                return e
        time.sleep(0.1)
    return None

# ============================================================================
# TEST 1: USER SEARCH BY UNIQUE ID
# ============================================================================
def test_user_search():
    print("\n" + "="*80)
    print("TEST 1: USER SEARCH BY UNIQUE ID")
    print("="*80)
    
    ts = get_timestamp()
    email_a = f"alice_{ts}@test.com"
    email_b = f"bob_{ts}@test.com"
    password = "password123"
    
    session_a = requests.Session()
    session_b = requests.Session()
    
    # Create user A
    try:
        resp = session_a.post(f"{API_BASE}/auth/signup", json={"email": email_a, "password": password}, timeout=10)
        if resp.status_code != 201:
            log_test("Setup: Create user A", False, f"Status: {resp.status_code}")
            return None, None, None, None
        user_a = resp.json().get("user")
        log_test("Setup: Create user A", True, f"User: {user_a['anonymousName']}")
    except Exception as e:
        log_test("Setup: Create user A", False, f"Exception: {str(e)}")
        return None, None, None, None
    
    # Create user B
    try:
        resp = session_b.post(f"{API_BASE}/auth/signup", json={"email": email_b, "password": password}, timeout=10)
        if resp.status_code != 201:
            log_test("Setup: Create user B", False, f"Status: {resp.status_code}")
            return None, None, None, None
        user_b = resp.json().get("user")
        log_test("Setup: Create user B", True, f"User: {user_b['anonymousName']}")
    except Exception as e:
        log_test("Setup: Create user B", False, f"Exception: {str(e)}")
        return None, None, None, None
    
    # Test 1.1: Search with full anonymousName
    try:
        resp = session_a.get(f"{API_BASE}/users/search?query={user_b['anonymousName']}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            users = data.get("users", [])
            if users and len(users) > 0:
                result = users[0]
                user_data = result.get("user")
                relationship = result.get("relationship")
                is_self = result.get("self")
                
                # Check user has only public fields
                if user_data and "id" in user_data and "anonymousName" in user_data and "avatarColor" in user_data and "bio" in user_data:
                    if "email" not in user_data and "passwordHash" not in user_data:
                        if user_data["id"] == user_b["id"] and relationship == "none" and is_self == False:
                            log_test("Search by full anonymousName returns user with public fields only", True, f"Found: {user_data['anonymousName']}, relationship: {relationship}")
                        else:
                            log_test("Search by full anonymousName returns user with public fields only", False, f"Wrong user or relationship: {result}")
                    else:
                        log_test("Search by full anonymousName returns user with public fields only", False, f"Private fields exposed: {user_data.keys()}")
                else:
                    log_test("Search by full anonymousName returns user with public fields only", False, f"Missing public fields: {user_data}")
            else:
                log_test("Search by full anonymousName returns user with public fields only", False, f"No users found")
        else:
            log_test("Search by full anonymousName returns user with public fields only", False, f"Status: {resp.status_code}, Body: {resp.text}")
    except Exception as e:
        log_test("Search by full anonymousName returns user with public fields only", False, f"Exception: {str(e)}")
    
    # Test 1.2: Search with prefix (first 4+ chars, case-insensitive)
    try:
        prefix = user_b['anonymousName'][:5].lower()  # Take first 5 chars, lowercase
        resp = session_a.get(f"{API_BASE}/users/search?query={prefix}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            users = data.get("users", [])
            found_b = any(u.get("user", {}).get("id") == user_b["id"] for u in users)
            if found_b:
                log_test("Search by prefix (case-insensitive) finds user", True, f"Query: {prefix}, Found: {user_b['anonymousName']}")
            else:
                log_test("Search by prefix (case-insensitive) finds user", False, f"Query: {prefix}, Users: {[u.get('user', {}).get('anonymousName') for u in users]}")
        else:
            log_test("Search by prefix (case-insensitive) finds user", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("Search by prefix (case-insensitive) finds user", False, f"Exception: {str(e)}")
    
    # Test 1.3: Query shorter than 3 chars -> 400 error
    try:
        resp = session_a.get(f"{API_BASE}/users/search?query=ab", timeout=10)
        if resp.status_code == 400:
            log_test("Search with query < 3 chars returns 400", True, f"Error: {resp.json().get('error', '')}")
        else:
            log_test("Search with query < 3 chars returns 400", False, f"Expected 400, got {resp.status_code}")
    except Exception as e:
        log_test("Search with query < 3 chars returns 400", False, f"Exception: {str(e)}")
    
    # Test 1.4: Search own anonymousName -> self=true
    try:
        resp = session_a.get(f"{API_BASE}/users/search?query={user_a['anonymousName']}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            users = data.get("users", [])
            self_result = next((u for u in users if u.get("user", {}).get("id") == user_a["id"]), None)
            if self_result and self_result.get("self") == True:
                log_test("Search own anonymousName returns self=true", True, f"Found self: {self_result['user']['anonymousName']}")
            else:
                log_test("Search own anonymousName returns self=true", False, f"Self result: {self_result}")
        else:
            log_test("Search own anonymousName returns self=true", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("Search own anonymousName returns self=true", False, f"Exception: {str(e)}")
    
    # Test 1.5: Unauthenticated search -> 401
    try:
        resp = requests.get(f"{API_BASE}/users/search?query={user_b['anonymousName']}", timeout=10)
        if resp.status_code == 401:
            log_test("Unauthenticated search returns 401", True, "Correctly rejected")
        else:
            log_test("Unauthenticated search returns 401", False, f"Expected 401, got {resp.status_code}")
    except Exception as e:
        log_test("Unauthenticated search returns 401", False, f"Exception: {str(e)}")
    
    return session_a, session_b, user_a, user_b

# ============================================================================
# TEST 2: FRIEND REQUEST + ACCEPT VIA SEARCH FLOW
# ============================================================================
def test_friend_request_via_search(session_a, session_b, user_a, user_b):
    print("\n" + "="*80)
    print("TEST 2: FRIEND REQUEST + ACCEPT VIA SEARCH FLOW")
    print("="*80)
    
    if not user_a or not user_b:
        log_test("Friend request via search setup", False, "Users not created")
        return
    
    # Test 2.1: A sends friend request to B
    request_id = None
    try:
        resp = session_a.post(f"{API_BASE}/friends/request", json={"toUserId": user_b["id"]}, timeout=10)
        if resp.status_code == 201:
            data = resp.json()
            request_id = data.get("requestId")
            log_test("A sends friend request to B", True, f"RequestId: {request_id}")
        else:
            log_test("A sends friend request to B", False, f"Status: {resp.status_code}, Body: {resp.text}")
            return
    except Exception as e:
        log_test("A sends friend request to B", False, f"Exception: {str(e)}")
        return
    
    # Test 2.2: A searches B -> relationship now 'pending_out'
    try:
        resp = session_a.get(f"{API_BASE}/users/search?query={user_b['anonymousName']}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            users = data.get("users", [])
            b_result = next((u for u in users if u.get("user", {}).get("id") == user_b["id"]), None)
            if b_result:
                relationship = b_result.get("relationship")
                if relationship == "pending_out":
                    log_test("After request, A searches B -> relationship 'pending_out'", True, f"Relationship: {relationship}")
                else:
                    log_test("After request, A searches B -> relationship 'pending_out'", False, f"Expected 'pending_out', got '{relationship}'")
            else:
                log_test("After request, A searches B -> relationship 'pending_out'", False, "B not found in search")
        else:
            log_test("After request, A searches B -> relationship 'pending_out'", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("After request, A searches B -> relationship 'pending_out'", False, f"Exception: {str(e)}")
    
    # Test 2.3: B searches A -> relationship 'pending_in' with requestId
    try:
        resp = session_b.get(f"{API_BASE}/users/search?query={user_a['anonymousName']}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            users = data.get("users", [])
            a_result = next((u for u in users if u.get("user", {}).get("id") == user_a["id"]), None)
            if a_result:
                relationship = a_result.get("relationship")
                req_id = a_result.get("requestId")
                if relationship == "pending_in" and req_id:
                    log_test("B searches A -> relationship 'pending_in' with requestId", True, f"Relationship: {relationship}, RequestId: {req_id}")
                else:
                    log_test("B searches A -> relationship 'pending_in' with requestId", False, f"Relationship: {relationship}, RequestId: {req_id}")
            else:
                log_test("B searches A -> relationship 'pending_in' with requestId", False, "A not found in search")
        else:
            log_test("B searches A -> relationship 'pending_in' with requestId", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("B searches A -> relationship 'pending_in' with requestId", False, f"Exception: {str(e)}")
    
    # Test 2.4: B accepts friend request
    try:
        resp = session_b.post(f"{API_BASE}/friends/respond", json={"requestId": request_id, "accept": True}, timeout=10)
        if resp.status_code == 200:
            log_test("B accepts friend request", True, "Accepted")
        else:
            log_test("B accepts friend request", False, f"Status: {resp.status_code}, Body: {resp.text}")
            return
    except Exception as e:
        log_test("B accepts friend request", False, f"Exception: {str(e)}")
        return
    
    # Test 2.5: A searches B -> relationship now 'friend'
    try:
        resp = session_a.get(f"{API_BASE}/users/search?query={user_b['anonymousName']}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            users = data.get("users", [])
            b_result = next((u for u in users if u.get("user", {}).get("id") == user_b["id"]), None)
            if b_result:
                relationship = b_result.get("relationship")
                if relationship == "friend":
                    log_test("After accept, A searches B -> relationship 'friend'", True, f"Relationship: {relationship}")
                else:
                    log_test("After accept, A searches B -> relationship 'friend'", False, f"Expected 'friend', got '{relationship}'")
            else:
                log_test("After accept, A searches B -> relationship 'friend'", False, "B not found in search")
        else:
            log_test("After accept, A searches B -> relationship 'friend'", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("After accept, A searches B -> relationship 'friend'", False, f"Exception: {str(e)}")
    
    # Test 2.6: B searches A -> relationship now 'friend'
    try:
        resp = session_b.get(f"{API_BASE}/users/search?query={user_a['anonymousName']}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            users = data.get("users", [])
            a_result = next((u for u in users if u.get("user", {}).get("id") == user_a["id"]), None)
            if a_result:
                relationship = a_result.get("relationship")
                if relationship == "friend":
                    log_test("After accept, B searches A -> relationship 'friend'", True, f"Relationship: {relationship}")
                else:
                    log_test("After accept, B searches A -> relationship 'friend'", False, f"Expected 'friend', got '{relationship}'")
            else:
                log_test("After accept, B searches A -> relationship 'friend'", False, "A not found in search")
        else:
            log_test("After accept, B searches A -> relationship 'friend'", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("After accept, B searches A -> relationship 'friend'", False, f"Exception: {str(e)}")
    
    # Test 2.7: GET /api/friends shows each other
    try:
        resp = session_a.get(f"{API_BASE}/friends", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            friends = data.get("friends", [])
            friend_ids = [f["id"] for f in friends]
            if user_b["id"] in friend_ids:
                log_test("GET /api/friends (A) lists B", True, f"Friends count: {len(friends)}")
            else:
                log_test("GET /api/friends (A) lists B", False, f"Friend IDs: {friend_ids}")
        else:
            log_test("GET /api/friends (A) lists B", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("GET /api/friends (A) lists B", False, f"Exception: {str(e)}")
    
    # Test 2.8: GET /api/conversations includes friend conversation
    try:
        resp = session_a.get(f"{API_BASE}/conversations", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            convs = data.get("conversations", [])
            friend_convs = [c for c in convs if c.get("type") == "friend"]
            if friend_convs:
                log_test("GET /api/conversations (A) includes type='friend' conversation", True, f"Found {len(friend_convs)} friend conversation(s)")
            else:
                log_test("GET /api/conversations (A) includes type='friend' conversation", False, "No friend conversations found")
        else:
            log_test("GET /api/conversations (A) includes type='friend' conversation", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("GET /api/conversations (A) includes type='friend' conversation", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 3: 'ALREADY IN A CHAT' SELF-HEAL
# ============================================================================
def test_busy_self_heal():
    print("\n" + "="*80)
    print("TEST 3: 'ALREADY IN A CHAT' SELF-HEAL (Main Bug Fix)")
    print("="*80)
    
    # Create FRESH users for Socket.IO test (not friends)
    ts = get_timestamp()
    email_a = f"sockettest_a_{ts}@test.com"
    email_b = f"sockettest_b_{ts}@test.com"
    password = "password123"
    
    session_a = requests.Session()
    session_b = requests.Session()
    
    try:
        resp_a = session_a.post(f"{API_BASE}/auth/signup", json={"email": email_a, "password": password}, timeout=10)
        resp_b = session_b.post(f"{API_BASE}/auth/signup", json={"email": email_b, "password": password}, timeout=10)
        
        if resp_a.status_code != 201 or resp_b.status_code != 201:
            log_test("Setup: Create fresh users for Socket.IO test", False, f"A={resp_a.status_code}, B={resp_b.status_code}")
            return
        
        user_a = resp_a.json()["user"]
        user_b = resp_b.json()["user"]
        log_test("Setup: Create fresh users for Socket.IO test", True, f"A={user_a['anonymousName']}, B={user_b['anonymousName']}")
    except Exception as e:
        log_test("Setup: Create fresh users for Socket.IO test", False, f"Exception: {str(e)}")
        return
    
    cookie_a = f"tts_token={session_a.cookies.get('tts_token')}"
    cookie_b = f"tts_token={session_b.cookies.get('tts_token')}"
    
    sio_a = socketio.Client()
    sio_b = socketio.Client()
    
    events_a = []
    events_b = []
    
    @sio_a.event
    def connect():
        events_a.append({"event": "connect", "time": time.time()})
    
    @sio_a.event
    def connected_ok(data):
        events_a.append({"event": "connected_ok", "data": data, "time": time.time()})
    
    @sio_a.event
    def searching(data):
        events_a.append({"event": "searching", "data": data, "time": time.time()})
    
    @sio_a.event
    def match_found(data):
        events_a.append({"event": "match_found", "data": data, "time": time.time()})
    
    @sio_a.event
    def chat_ended(data):
        events_a.append({"event": "chat_ended", "data": data, "time": time.time()})
    
    @sio_a.event
    def app_error(data):
        events_a.append({"event": "app_error", "data": data, "time": time.time()})
    
    @sio_a.event
    def nobody_available(data):
        events_a.append({"event": "nobody_available", "data": data, "time": time.time()})
    
    @sio_b.event
    def connect():
        events_b.append({"event": "connect", "time": time.time()})
    
    @sio_b.event
    def connected_ok(data):
        events_b.append({"event": "connected_ok", "data": data, "time": time.time()})
    
    @sio_b.event
    def chat_request(data):
        events_b.append({"event": "chat_request", "data": data, "time": time.time()})
    
    @sio_b.event
    def match_found(data):
        events_b.append({"event": "match_found", "data": data, "time": time.time()})
    
    @sio_b.event
    def chat_ended(data):
        events_b.append({"event": "chat_ended", "data": data, "time": time.time()})
    
    @sio_b.event
    def app_error(data):
        events_b.append({"event": "app_error", "data": data, "time": time.time()})
    
    try:
        # Connect both sockets
        print("Connecting sockets...")
        sio_a.connect(BASE_URL, socketio_path=SOCKET_PATH, headers={"Cookie": cookie_a}, wait_timeout=15)
        time.sleep(0.5)
        sio_b.connect(BASE_URL, socketio_path=SOCKET_PATH, headers={"Cookie": cookie_b}, wait_timeout=15)
        time.sleep(0.5)
        
        if not (sio_a.connected and sio_b.connected):
            log_test("Socket connections for busy test", False, f"A: {sio_a.connected}, B: {sio_b.connected}")
            return
        
        log_test("Socket connections for busy test", True, "Both connected")
        
        # Step 1: Match A and B into a random chat
        print("Step 1: A emits find_friend...")
        sio_a.emit("find_friend")
        time.sleep(1.5)
        
        # B should receive chat_request
        chat_req = wait_for_event(events_b, "chat_request", timeout=5)
        if not chat_req:
            log_test("B receives chat_request", False, "No chat_request received")
            sio_a.disconnect()
            sio_b.disconnect()
            return
        
        request_id = chat_req["data"].get("requestId")
        log_test("B receives chat_request", True, f"RequestId: {request_id}")
        
        # B accepts
        print("Step 2: B accepts request...")
        sio_b.emit("accept_request", {"requestId": request_id})
        time.sleep(1)
        
        # Both should receive match_found
        match_a = wait_for_event(events_a, "match_found", timeout=5)
        match_b = wait_for_event(events_b, "match_found", timeout=5)
        
        if not (match_a and match_b):
            log_test("Both receive match_found", False, f"A: {bool(match_a)}, B: {bool(match_b)}")
            sio_a.disconnect()
            sio_b.disconnect()
            return
        
        conversation_id = match_a["data"]["conversation"]["id"]
        log_test("Both receive match_found", True, f"ConvId: {conversation_id}")
        
        # Step 2: A ends the chat
        print("Step 3: A ends chat...")
        events_a.clear()
        events_b.clear()
        sio_a.emit("end_chat", {"conversationId": conversation_id})
        time.sleep(1)
        
        # Both should receive chat_ended
        ended_a = wait_for_event(events_a, "chat_ended", timeout=5)
        ended_b = wait_for_event(events_b, "chat_ended", timeout=5)
        
        if ended_a and ended_b:
            log_test("Both receive chat_ended", True, f"EndedBy: {ended_a['data'].get('endedBy')}")
        else:
            log_test("Both receive chat_ended", False, f"A: {bool(ended_a)}, B: {bool(ended_b)}")
        
        # Step 3: THE KEY TEST - A emits find_friend AGAIN
        print("Step 4: A emits find_friend AGAIN (should NOT get 'busy' error)...")
        events_a.clear()
        time.sleep(0.5)  # Small delay
        sio_a.emit("find_friend")
        time.sleep(2)
        
        # Check for app_error with code 'busy'
        busy_errors = [e for e in events_a if e.get("event") == "app_error" and e.get("data", {}).get("code") == "busy"]
        
        if not busy_errors:
            log_test("After chat ended, A find_friend does NOT get 'busy' error", True, "No 'busy' error received")
        else:
            log_test("After chat ended, A find_friend does NOT get 'busy' error", False, f"Received 'busy' error: {busy_errors[0]['data']}")
        
        # A should either be searching or match with B if B also searches
        searching_a = [e for e in events_a if e.get("event") == "searching"]
        if searching_a:
            log_test("A enters searching state after previous chat ended", True, "Searching")
        else:
            # Maybe matched immediately if B was also searching
            match_a_again = [e for e in events_a if e.get("event") == "match_found"]
            if match_a_again:
                log_test("A enters searching state after previous chat ended", True, "Matched immediately")
            else:
                # Check for nobody_available (if no one else is searching)
                log_test("A enters searching state after previous chat ended", True, "Waiting for match or timeout")
        
        # Step 4: Have B also search to verify they can match again
        print("Step 5: B emits find_friend to match with A again...")
        events_a.clear()
        events_b.clear()
        sio_b.emit("find_friend")
        time.sleep(2)
        
        # They should match into a NEW conversation
        match_a_new = wait_for_event(events_a, "match_found", timeout=5)
        match_b_new = wait_for_event(events_b, "match_found", timeout=5)
        
        if match_a_new and match_b_new:
            new_conv_id = match_a_new["data"]["conversation"]["id"]
            if new_conv_id != conversation_id:
                log_test("A and B match again into NEW conversation", True, f"New ConvId: {new_conv_id}, Old: {conversation_id}")
            else:
                log_test("A and B match again into NEW conversation", False, f"Same conversation ID: {new_conv_id}")
            
            # Clean up - end the new chat
            sio_a.emit("end_chat", {"conversationId": new_conv_id})
            time.sleep(0.5)
        else:
            log_test("A and B match again into NEW conversation", False, f"A matched: {bool(match_a_new)}, B matched: {bool(match_b_new)}")
        
        sio_a.disconnect()
        sio_b.disconnect()
        
    except Exception as e:
        log_test("Busy self-heal test", False, f"Exception: {str(e)}")
        if sio_a.connected:
            sio_a.disconnect()
        if sio_b.connected:
            sio_b.disconnect()

# ============================================================================
# TEST 4: DISCONNECT AUTO-END (grace period 8s)
# ============================================================================
def test_disconnect_auto_end():
    print("\n" + "="*80)
    print("TEST 4: DISCONNECT AUTO-END (Grace Period 8s)")
    print("="*80)
    
    # Create FRESH users for Socket.IO test (not friends)
    ts = get_timestamp()
    email_a = f"disconnect_a_{ts}@test.com"
    email_b = f"disconnect_b_{ts}@test.com"
    password = "password123"
    
    session_a = requests.Session()
    session_b = requests.Session()
    
    try:
        resp_a = session_a.post(f"{API_BASE}/auth/signup", json={"email": email_a, "password": password}, timeout=10)
        resp_b = session_b.post(f"{API_BASE}/auth/signup", json={"email": email_b, "password": password}, timeout=10)
        
        if resp_a.status_code != 201 or resp_b.status_code != 201:
            log_test("Setup: Create fresh users for disconnect test", False, f"A={resp_a.status_code}, B={resp_b.status_code}")
            return
        
        user_a = resp_a.json()["user"]
        user_b = resp_b.json()["user"]
        log_test("Setup: Create fresh users for disconnect test", True, f"A={user_a['anonymousName']}, B={user_b['anonymousName']}")
    except Exception as e:
        log_test("Setup: Create fresh users for disconnect test", False, f"Exception: {str(e)}")
        return
    
    cookie_a = f"tts_token={session_a.cookies.get('tts_token')}"
    cookie_b = f"tts_token={session_b.cookies.get('tts_token')}"
    
    sio_a = socketio.Client()
    sio_b = socketio.Client()
    
    events_a = []
    events_b = []
    
    @sio_a.event
    def match_found(data):
        events_a.append({"event": "match_found", "data": data, "time": time.time()})
    
    @sio_a.event
    def chat_ended(data):
        events_a.append({"event": "chat_ended", "data": data, "time": time.time()})
    
    @sio_a.event
    def app_error(data):
        events_a.append({"event": "app_error", "data": data, "time": time.time()})
    
    @sio_b.event
    def chat_request(data):
        events_b.append({"event": "chat_request", "data": data, "time": time.time()})
    
    @sio_b.event
    def match_found(data):
        events_b.append({"event": "match_found", "data": data, "time": time.time()})
    
    @sio_b.event
    def chat_ended(data):
        events_b.append({"event": "chat_ended", "data": data, "time": time.time()})
    
    try:
        # Connect and match A and B
        print("Connecting and matching A and B...")
        sio_a.connect(BASE_URL, socketio_path=SOCKET_PATH, headers={"Cookie": cookie_a}, wait_timeout=15)
        time.sleep(0.5)
        sio_b.connect(BASE_URL, socketio_path=SOCKET_PATH, headers={"Cookie": cookie_b}, wait_timeout=15)
        time.sleep(0.5)
        
        if not (sio_a.connected and sio_b.connected):
            log_test("Socket connections for disconnect test", False, f"A: {sio_a.connected}, B: {sio_b.connected}")
            return
        
        # A finds friend
        sio_a.emit("find_friend")
        time.sleep(1.5)
        
        # B accepts
        chat_req = wait_for_event(events_b, "chat_request", timeout=5)
        if not chat_req:
            log_test("Setup: B receives chat_request", False, "No chat_request")
            sio_a.disconnect()
            sio_b.disconnect()
            return
        
        sio_b.emit("accept_request", {"requestId": chat_req["data"]["requestId"]})
        time.sleep(1)
        
        # Both matched
        match_a = wait_for_event(events_a, "match_found", timeout=5)
        match_b = wait_for_event(events_b, "match_found", timeout=5)
        
        if not (match_a and match_b):
            log_test("Setup: Both matched", False, "Match failed")
            sio_a.disconnect()
            sio_b.disconnect()
            return
        
        conversation_id = match_a["data"]["conversation"]["id"]
        log_test("Setup: A and B matched", True, f"ConvId: {conversation_id}")
        
        # Step 1: Forcibly DISCONNECT A without emitting end_chat
        print("Step 1: Forcibly disconnect A (without end_chat)...")
        events_b.clear()
        sio_a.disconnect()
        
        # Do NOT reconnect A
        print("Step 2: Waiting ~11 seconds for grace period (8s) to expire...")
        time.sleep(11)
        
        # Step 2: B should receive chat_ended event
        ended_b = [e for e in events_b if e.get("event") == "chat_ended"]
        
        if ended_b:
            ended_data = ended_b[0]["data"]
            ended_by = ended_data.get("endedBy")
            if ended_by == user_a["id"]:
                log_test("After 8s grace, B receives chat_ended (endedBy: A)", True, f"EndedBy: {ended_by}")
            else:
                log_test("After 8s grace, B receives chat_ended (endedBy: A)", False, f"EndedBy: {ended_by}, Expected: {user_a['id']}")
        else:
            log_test("After 8s grace, B receives chat_ended (endedBy: A)", False, f"No chat_ended event. Events: {[e['event'] for e in events_b]}")
        
        # Step 3: Reconnect A and verify A is NOT stuck in 'busy' state
        print("Step 3: Reconnect A and emit find_friend (should NOT get 'busy')...")
        sio_a = socketio.Client()
        events_a.clear()
        
        @sio_a.event
        def app_error(data):
            events_a.append({"event": "app_error", "data": data, "time": time.time()})
        
        @sio_a.event
        def searching(data):
            events_a.append({"event": "searching", "data": data, "time": time.time()})
        
        @sio_a.event
        def nobody_available(data):
            events_a.append({"event": "nobody_available", "data": data, "time": time.time()})
        
        sio_a.connect(BASE_URL, socketio_path=SOCKET_PATH, headers={"Cookie": cookie_a}, wait_timeout=15)
        time.sleep(0.5)
        
        sio_a.emit("find_friend")
        time.sleep(2)
        
        # Check for 'busy' error
        busy_errors = [e for e in events_a if e.get("event") == "app_error" and e.get("data", {}).get("code") == "busy"]
        
        if not busy_errors:
            log_test("After reconnect, A find_friend does NOT get 'busy' error", True, "No 'busy' error")
        else:
            log_test("After reconnect, A find_friend does NOT get 'busy' error", False, f"Got 'busy' error: {busy_errors[0]['data']}")
        
        # Clean up
        sio_a.disconnect()
        sio_b.disconnect()
        
    except Exception as e:
        log_test("Disconnect auto-end test", False, f"Exception: {str(e)}")
        if sio_a.connected:
            sio_a.disconnect()
        if sio_b.connected:
            sio_b.disconnect()

# ============================================================================
# TEST 5: QUICK REGRESSION (Smoke Tests)
# ============================================================================
def test_quick_regression():
    print("\n" + "="*80)
    print("TEST 5: QUICK REGRESSION (Smoke Tests)")
    print("="*80)
    
    ts = get_timestamp()
    email = f"regression_{ts}@test.com"
    password = "password123"
    session = requests.Session()
    
    # Test 5.1: Signup
    try:
        resp = session.post(f"{API_BASE}/auth/signup", json={"email": email, "password": password}, timeout=10)
        if resp.status_code == 201 and "user" in resp.json():
            user = resp.json()["user"]
            log_test("Regression: Signup", True, f"User: {user['anonymousName']}")
        else:
            log_test("Regression: Signup", False, f"Status: {resp.status_code}")
            return
    except Exception as e:
        log_test("Regression: Signup", False, f"Exception: {str(e)}")
        return
    
    # Test 5.2: Login
    try:
        resp = session.post(f"{API_BASE}/auth/login", json={"email": email, "password": password}, timeout=10)
        if resp.status_code == 200 and "user" in resp.json():
            log_test("Regression: Login", True, "Logged in")
        else:
            log_test("Regression: Login", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("Regression: Login", False, f"Exception: {str(e)}")
    
    # Test 5.3: GET /api/auth/me
    try:
        resp = session.get(f"{API_BASE}/auth/me", timeout=10)
        if resp.status_code == 200 and "user" in resp.json():
            log_test("Regression: GET /api/auth/me", True, "User returned")
        else:
            log_test("Regression: GET /api/auth/me", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("Regression: GET /api/auth/me", False, f"Exception: {str(e)}")
    
    # Test 5.4: GET /api/stats
    try:
        resp = requests.get(f"{API_BASE}/stats", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "online" in data and "available" in data:
                log_test("Regression: GET /api/stats", True, f"online={data['online']}, available={data['available']}")
            else:
                log_test("Regression: GET /api/stats", False, f"Missing fields: {data}")
        else:
            log_test("Regression: GET /api/stats", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("Regression: GET /api/stats", False, f"Exception: {str(e)}")
    
    # Test 5.5: POST feed post
    try:
        resp = session.post(f"{API_BASE}/posts", json={"text": "regression test post"}, timeout=10)
        if resp.status_code == 201:
            post = resp.json().get("post")
            post_id = post.get("id")
            log_test("Regression: POST feed post", True, f"PostId: {post_id}")
            
            # Test 5.6: Like toggle
            resp = session.post(f"{API_BASE}/posts/{post_id}/like", timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("liked") == True:
                    log_test("Regression: Like toggle (on)", True, f"Liked: {data['liked']}")
                else:
                    log_test("Regression: Like toggle (on)", False, f"Data: {data}")
            else:
                log_test("Regression: Like toggle (on)", False, f"Status: {resp.status_code}")
        else:
            log_test("Regression: POST feed post", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("Regression: POST feed post", False, f"Exception: {str(e)}")
    
    # Test 5.7: GET /api/communities
    try:
        resp = session.get(f"{API_BASE}/communities", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            communities = data.get("communities", [])
            if len(communities) >= 6:
                log_test("Regression: GET /api/communities returns 6 seeded", True, f"Found {len(communities)} communities")
            else:
                log_test("Regression: GET /api/communities returns 6 seeded", False, f"Found {len(communities)} communities")
        else:
            log_test("Regression: GET /api/communities returns 6 seeded", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("Regression: GET /api/communities returns 6 seeded", False, f"Exception: {str(e)}")
    
    # Test 5.8: POST /api/report (valid category)
    try:
        resp = session.post(f"{API_BASE}/report", json={"category": "spam", "description": "test"}, timeout=10)
        if resp.status_code == 201:
            log_test("Regression: POST /api/report (valid category)", True, "Report created")
        else:
            log_test("Regression: POST /api/report (valid category)", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("Regression: POST /api/report (valid category)", False, f"Exception: {str(e)}")
    
    # Test 5.9: POST /api/report (invalid category)
    try:
        resp = session.post(f"{API_BASE}/report", json={"category": "invalid", "description": "test"}, timeout=10)
        if resp.status_code == 400:
            log_test("Regression: POST /api/report (invalid category) returns 400", True, "Correctly rejected")
        else:
            log_test("Regression: POST /api/report (invalid category) returns 400", False, f"Expected 400, got {resp.status_code}")
    except Exception as e:
        log_test("Regression: POST /api/report (invalid category) returns 400", False, f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================
def main():
    print("\n" + "="*80)
    print("TALK TO STRANGERS - REGRESSION + NEW FEATURE BACKEND TEST")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Socket.IO Path: {SOCKET_PATH}")
    print("="*80)
    
    # Run tests in order
    session_a, session_b, user_a, user_b = test_user_search()
    
    if session_a and session_b and user_a and user_b:
        test_friend_request_via_search(session_a, session_b, user_a, user_b)
    
    # Socket.IO tests use fresh users (not friends)
    test_busy_self_heal()
    test_disconnect_auto_end()
    
    test_quick_regression()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for r in test_results if r["passed"])
    failed = sum(1 for r in test_results if not r["passed"])
    total = len(test_results)
    
    print(f"\nTotal: {total} tests")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success Rate: {(passed/total*100):.1f}%")
    
    print("\n" + "="*80)
    print("DETAILED RESULTS")
    print("="*80)
    
    for r in test_results:
        status = "✅" if r["passed"] else "❌"
        print(f"{status} {r['scenario']}")
        if r["details"] and not r["passed"]:
            print(f"   └─ {r['details']}")
    
    print("\n" + "="*80)
    
    # Return exit code based on results
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    exit(main())
