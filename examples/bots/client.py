"""A dependency-free owned external bot. See README.md for setup."""
import hashlib,json,os,time,uuid,urllib.request,urllib.error,signal
origin=os.environ.get("SOAP_URL","http://localhost:3000")
token=os.environ.get("SOAP_BOT_TOKEN")
strategy=os.environ.get("SOAP_STRATEGY","tit-for-tat")
seed=os.environ.get("SOAP_RANDOM_SEED","noodles")
if not token: raise SystemExit("Set SOAP_BOT_TOKEN")
if strategy not in ("cooperate","betray","tit-for-tat","random"): raise SystemExit("Unknown SOAP_STRATEGY")
stopped=False
def stop(*_):
    global stopped
    stopped=True
signal.signal(signal.SIGTERM,stop)
signal.signal(signal.SIGINT,stop)
def api(path,data=None):
    request=urllib.request.Request(origin+"/api/v1"+path,data=None if data is None else json.dumps(data).encode(),headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(request,timeout=10) as response: return json.load(response)
    except urllib.error.HTTPError as error:
        global stopped
        if error.code==401: stopped=True
        payload=json.load(error)
        raise RuntimeError(payload.get("error",{}).get("code","HTTP error")) from None
def decide(state):
    if strategy=="cooperate": return "C"
    if strategy=="betray": return "D"
    if strategy=="random":
        key=seed+":"+state["id"]+":"+str(state["round"])+":"+state["ownSeatId"]
        return "C" if hashlib.sha256(key.encode()).digest()[0]<128 else "D"
    own=state["ownSeatId"]
    pair=next((p for p in state["pairs"] if own in (p["a"],p["b"])),None)
    if not pair: return "C"
    other=pair["b"] if pair["a"]==own else pair["a"]
    for result in reversed(state["results"]):
        if set((result["a"],result["b"]))==set((own,other)):
            return "D" if result["aMove" if result["a"]==other else "bMove"]=="D" else "C"
    return "C"
epoch=None
heartbeat_at=0
pending={}
while not stopped:
    try:
        if epoch is None:
            epoch=api("/bot-controller/acquire",{})["controllerEpoch"]
            pending.clear()
            print("Bot controller acquired",flush=True)
        if time.monotonic()-heartbeat_at>=5:
            api("/bot-controller/heartbeat",{"controllerEpoch":epoch})
            heartbeat_at=time.monotonic()
        assignments=api("/bot/assignments")["assignments"]
        for state in assignments:
            if state["phase"]!="collecting" or not state["ownSeatId"] or state["ownMove"] or state["deadline"]<=time.time()*1000: continue
            key=(state["id"],state["round"])
            if key not in pending:
                pending[key]={"v":1,"commandId":str(uuid.uuid4()),"controllerEpoch":epoch,"matchId":state["id"],"seatId":state["ownSeatId"],"round":state["round"],"payload":{"move":decide(state)}}
            ack=api("/matches/"+state["id"]+"/moves",pending[key])
            if ack["ok"]:
                print("Decision accepted for round "+str(state["round"]),flush=True)
                pending.pop(key,None)
            elif ack["error"]["code"] in ("CONTROLLER_STALE","BOT_OFFLINE"):
                epoch=None
                break
            elif ack["error"]["code"] in ("MOVE_LOCKED","DEADLINE_PASSED","ROUND_MISMATCH","WRONG_PHASE"): pending.pop(key,None)
            else: raise RuntimeError(ack["error"]["code"])
        active={(s["id"],s["round"]) for s in assignments}
        pending={key:value for key,value in pending.items() if key in active}
    except Exception as error:
        code=str(error)
        if code in ("CONTROLLER_STALE","BOT_OFFLINE"): epoch=None
        if not stopped: print("Bot retry: "+code,flush=True)
    time.sleep(1)
