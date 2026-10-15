#!/usr/bin/env python3
"""
Focused Socket.IO test for matchmaking and disconnect scenarios
"""

import requests
import socketio
import time

# Configuration
BASE_URL = "https://find-random-friend.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"
SOCKET_PATH = "/api/socketio"

def get_timestamp():
    return int(time.time() * 1000)

def test_socketio_matchmaking():
    print("\n" + "="*80)
    print("SOCKET.IO MATCHMAKING TEST")
    print("="*80)
    
    ts = get_timestamp()
    email_a = f"sockettest_a_{ts}@test.com"
    email_b = f"sockettest_b_{ts}@test.com"
    password = "password123"
    
    session_a = requests.Session()
    session_b = requests.Session()
    
    # Create users
    print("Creating users...")
    resp_a = session_a.post(f"{API_BASE}/auth/signup", json={"email": email_a, "password": password}, timeout=10)
    resp_b = session_b.post(f"{API_BASE}/auth/signup", json={"email": email_b, "password": password}, timeout=10)
    
    if resp_a.status_code != 201 or resp_b.status_code != 201:
        print(f"❌ Failed to create users: A={resp_a.status_code}, B={resp_b.status_code}")
        return
    
    user_a = resp_a.json()["user"]
    user_b = resp_b.json()["user"]
    print(f"✅ Created users: A={user_a['anonymousName']}, B={user_b['anonymousName']}")
    
    # Get cookies
    cookie_a = f"tts_token={session_a.cookies.get('tts_token')}"
    cookie_b = f"tts_token={session_b.cookies.get('tts_token')}"
    
    print(f"Cookie A: {cookie_a[:50]}...")
    print(f"Cookie B: {cookie_b[:50]}...")
    
    # Create Socket.IO clients
    sio_a = socketio.Client(logger=True, engineio_logger=True)
    sio_b = socketio.Client(logger=True, engineio_logger=True)
    
    events_a = []
    events_b = []
    
    @sio_a.event
    def connect():
        print("A: Connected!")
        events_a.append({"event": "connect"})
    
    @sio_a.event
    def connect_error(data):
        print(f"A: Connect error: {data}")
        events_a.append({"event": "connect_error", "data": data})
    
    @sio_a.event
    def connected_ok(data):
        print(f"A: connected_ok: {data}")
        events_a.append({"event": "connected_ok", "data": data})
    
    @sio_a.event
    def searching(data):
        print(f"A: searching: {data}")
        events_a.append({"event": "searching", "data": data})
    
    @sio_a.event
    def match_found(data):
        print(f"A: match_found: {data}")
        events_a.append({"event": "match_found", "data": data})
    
    @sio_a.event
    def app_error(data):
        print(f"A: app_error: {data}")
        events_a.append({"event": "app_error", "data": data})
    
    @sio_a.event
    def chat_ended(data):
        print(f"A: chat_ended: {data}")
        events_a.append({"event": "chat_ended", "data": data})
    
    @sio_b.event
    def connect():
        print("B: Connected!")
        events_b.append({"event": "connect"})
    
    @sio_b.event
    def connect_error(data):
        print(f"B: Connect error: {data}")
        events_b.append({"event": "connect_error", "data": data})
    
    @sio_b.event
    def connected_ok(data):
        print(f"B: connected_ok: {data}")
        events_b.append({"event": "connected_ok", "data": data})
    
    @sio_b.event
    def chat_request(data):
        print(f"B: chat_request: {data}")
        events_b.append({"event": "chat_request", "data": data})
    
    @sio_b.event
    def match_found(data):
        print(f"B: match_found: {data}")
        events_b.append({"event": "match_found", "data": data})
    
    @sio_b.event
    def app_error(data):
        print(f"B: app_error: {data}")
        events_b.append({"event": "app_error", "data": data})
    
    @sio_b.event
    def chat_ended(data):
        print(f"B: chat_ended: {data}")
        events_b.append({"event": "chat_ended", "data": data})
    
    try:
        # Connect A
        print("\nConnecting A...")
        sio_a.connect(
            BASE_URL,
            socketio_path=SOCKET_PATH,
            headers={"Cookie": cookie_a},
            wait_timeout=15,
            transports=['websocket', 'polling']
        )
        print(f"A connected: {sio_a.connected}")
        time.sleep(1)
        
        # Connect B
        print("\nConnecting B...")
        sio_b.connect(
            BASE_URL,
            socketio_path=SOCKET_PATH,
            headers={"Cookie": cookie_b},
            wait_timeout=15,
            transports=['websocket', 'polling']
        )
        print(f"B connected: {sio_b.connected}")
        time.sleep(1)
        
        if not sio_a.connected or not sio_b.connected:
            print(f"❌ Connection failed: A={sio_a.connected}, B={sio_b.connected}")
            return
        
        print("✅ Both sockets connected")
        
        # A finds friend
        print("\nA emits find_friend...")
        sio_a.emit("find_friend")
        time.sleep(2)
        
        print(f"\nA events: {[e['event'] for e in events_a]}")
        print(f"B events: {[e['event'] for e in events_b]}")
        
        # Check if B received chat_request
        chat_requests = [e for e in events_b if e["event"] == "chat_request"]
        if chat_requests:
            print(f"✅ B received chat_request")
            request_id = chat_requests[0]["data"]["requestId"]
            
            # B accepts
            print(f"\nB accepts request {request_id}...")
            sio_b.emit("accept_request", {"requestId": request_id})
            time.sleep(2)
            
            print(f"\nA events: {[e['event'] for e in events_a]}")
            print(f"B events: {[e['event'] for e in events_b]}")
            
            # Check for match_found
            match_a = [e for e in events_a if e["event"] == "match_found"]
            match_b = [e for e in events_b if e["event"] == "match_found"]
            
            if match_a and match_b:
                conv_id = match_a[0]["data"]["conversation"]["id"]
                print(f"✅ Both matched! ConvId: {conv_id}")
                
                # Test end_chat
                print(f"\nA ends chat...")
                events_a.clear()
                events_b.clear()
                sio_a.emit("end_chat", {"conversationId": conv_id})
                time.sleep(1)
                
                ended_a = [e for e in events_a if e["event"] == "chat_ended"]
                ended_b = [e for e in events_b if e["event"] == "chat_ended"]
                
                if ended_a and ended_b:
                    print(f"✅ Both received chat_ended")
                    
                    # Test self-heal: A finds friend again
                    print(f"\nA emits find_friend AGAIN (should NOT get 'busy')...")
                    events_a.clear()
                    time.sleep(0.5)
                    sio_a.emit("find_friend")
                    time.sleep(2)
                    
                    busy_errors = [e for e in events_a if e.get("event") == "app_error" and e.get("data", {}).get("code") == "busy"]
                    if not busy_errors:
                        print(f"✅ No 'busy' error after chat ended")
                    else:
                        print(f"❌ Got 'busy' error: {busy_errors[0]['data']}")
                else:
                    print(f"❌ chat_ended not received by both: A={bool(ended_a)}, B={bool(ended_b)}")
            else:
                print(f"❌ match_found not received by both: A={bool(match_a)}, B={bool(match_b)}")
        else:
            print(f"❌ B did not receive chat_request")
            print(f"B events detail: {events_b}")
        
        # Cleanup
        sio_a.disconnect()
        sio_b.disconnect()
        
    except Exception as e:
        print(f"❌ Exception: {str(e)}")
        import traceback
        traceback.print_exc()
        if sio_a.connected:
            sio_a.disconnect()
        if sio_b.connected:
            sio_b.disconnect()

if __name__ == "__main__":
    test_socketio_matchmaking()
