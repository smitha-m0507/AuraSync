import json, urllib.request, urllib.error, time

BASE = "http://localhost:4000/api/v1"

# Generate a small valid WAV so the test is self-contained.
import wave as _wave, struct as _struct, math as _math
with _wave.open("sample.wav", "wb") as _w:
    _w.setnchannels(1); _w.setsampwidth(2); _w.setframerate(16000)
    _w.writeframes(b"".join(_struct.pack("<h", int(1500 * _math.sin(i / 25))) for i in range(16000 * 8)))

def req(method, path, body=None, token=None, raw=None):
    url = BASE + path
    data = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if raw is not None:
        data = raw
        headers.pop("Content-Type", None)
    elif body is not None:
        data = body
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r)
        return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

import uuid
EMAIL = f"avery{uuid.uuid4().hex[:8]}@acme.io"

# 1. Signup
status, body = req("POST", "/auth/signup", json.dumps({
    "fullName": "Avery Morgan",
    "email": EMAIL,
    "password": "password123",
    "purpose": "Enterprise"
}).encode())
print("SIGNUP", status, body.get("success"), body.get("data", {}).get("user", {}).get("email"))
token = body["data"]["accessToken"]

# 2. me
status, body = req("GET", "/auth/me", token=token)
print("ME", status, body.get("success"))

# 3. Upload (multipart)
boundary = "----aurasynctest"
with open("sample.wav", "rb") as f:
    file_bytes = f.read()
parts = []
parts.append(("--" + boundary).encode())
parts.append(b'Content-Disposition: form-data; name="audio"; filename="sample.wav"')
parts.append(b"Content-Type: audio/wav")
parts.append(b"")
parts.append(file_bytes)
parts.append(("--" + boundary).encode())
parts.append(b'Content-Disposition: form-data; name="outputType"')
parts.append(b"")
parts.append(b"flowchart")
parts.append(("--" + boundary).encode())
parts.append(b'Content-Disposition: form-data; name="speakerCount"')
parts.append(b"")
parts.append(b"2")
parts.append(("--" + boundary + "--").encode())
parts.append(b"")
body_bytes = b"\r\n".join(parts)

req_obj = urllib.request.Request(
    BASE + "/jobs/upload", data=body_bytes,
    headers={"Authorization": "Bearer " + token,
              "Content-Type": "multipart/form-data; boundary=" + boundary},
    method="POST")
resp = urllib.request.urlopen(req_obj)
upload = json.loads(resp.read().decode())
print("UPLOAD", resp.status, upload.get("success"), upload.get("data"))
job_id = upload["data"]["jobId"]

# 4. Poll
result = None
for _ in range(40):
    s, b = req("GET", f"/jobs/{job_id}/status", token=token)
    st = b["data"]["status"]
    stages = b["data"].get("completedStages", [])
    print("  POLL", s, st, stages)
    if st == "completed":
        result = b["data"]; break
    if st == "failed":
        print("  FAILED:", b["data"].get("error")); break
    time.sleep(0.5)

if result and result.get("visual"):
    vis = result["visual"]
    print("VISUAL type=", vis.get("type"), "mermaidType=", vis.get("mermaidType"),
          "nodes=", len(vis.get("nodes", [])), "edges=", len(vis.get("edges", [])))
    print("TRANSCRIPT head:", (result.get("transcript") or "")[:60].replace("\n"," "))

# 5. Result endpoint
s, b = req("GET", f"/jobs/{job_id}/result", token=token)
print("RESULT", s, b.get("success"), "hasVisual=", bool(b.get("data", {}).get("visual")))

# 6. Save report
s, b = req("POST", "/reports", json.dumps({
    "title": "Test Flowchart",
    "outputType": "flowchart",
    "speakerCount": 2,
    "visualData": (result.get("visual") if result else None) or {"nodes": [], "edges": []}
}).encode(), token=token)
print("REPORT_SAVE", s, b.get("success"), b.get("data", {}).get("id"))

# 7. List reports
s, b = req("GET", "/reports", token=token)
print("REPORT_LIST", s, "count=", len(b.get("data", {}).get("reports", [])))

# 8. Bad job test
print("--- error handling ---")
s, b = req("GET", "/jobs/nonexistent/status", token=token)
print("BAD_JOB", s, b.get("error", {}).get("code"))


def upload_file(fname, output_type, token):
    boundary2 = "----aurasyncX"
    with open(fname, "rb") as f:
        fb = f.read()
    p = []
    p.append(("--" + boundary2).encode())
    p.append(f'Content-Disposition: form-data; name="audio"; filename="{fname}"'.encode())
    p.append(b"Content-Type: audio/wav")
    p.append(b"")
    p.append(fb)
    for name, val in [("outputType", output_type), ("speakerCount", "2")]:
        p.append(("--" + boundary2).encode())
        p.append(f'Content-Disposition: form-data; name="{name}"'.encode())
        p.append(b"")
        p.append(val.encode())
    p.append(("--" + boundary2 + "--").encode())
    p.append(b"")
    data = b"\r\n".join(p)
    ro = urllib.request.Request(
        BASE + "/jobs/upload", data=data,
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "multipart/form-data; boundary=" + boundary2},
        method="POST")
    return json.loads(urllib.request.urlopen(ro).read().decode())


# 9. Dashboard output type
up = upload_file("sample.wav", "dashboard", token)
jid = up["data"]["jobId"]
dres = None
for _ in range(40):
    s, b = req("GET", f"/jobs/{jid}/status", token=token)
    if b["data"]["status"] == "completed":
        dres = b["data"]; break
    if b["data"]["status"] == "failed":
        print("DASH FAILED", b["data"].get("error")); break
    time.sleep(0.5)
if dres:
    dv = dres.get("visual") or {}
    print("DASHBOARD keys=", sorted(dv.keys()), "plotlyFigs=", len((dv.get("plotly") or {}).get("figures", [])))

# 10. Subscription limit (free user, >30 min audio)
import wave, struct
with wave.open("long.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    # header-only large-ish; duration estimated from size via fallback
    w.writeframes(struct.pack("<h", 0) * (16000 * 60))  # 60s real frames
# Force >30min by making a big file so estimate exceeds limit
with open("long.wav", "ab") as f:
    f.write(b"\x00" * (60 * 1024 * 1024))  # pad to ~60MB -> estimate > 30 min
up = upload_file("long.wav", "flowchart", token)
jid = up["data"]["jobId"]
for _ in range(20):
    s, b = req("GET", f"/jobs/{jid}/status", token=token)
    st = b["data"]["status"]
    if st in ("completed", "failed"):
        print("SUBSCRIPTION_TEST status=", st, "error=", b["data"].get("error"))
        break
    time.sleep(0.5)
