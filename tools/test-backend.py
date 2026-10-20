"""Dev test: run backend/main.lua under real LuaJIT (via lupa) with Millennium's
Lua modules stubbed, against the real game folder and Steam userdata.

    pip install --target <dir> lupa
    # Set STEAM_WIN, ACCOUNT, or REAL_APPDATA when using non-default paths.
    PYTHONPATH=<dir> python3 tools/test-backend.py [--sgdb-key KEY]

Writes nothing into Steam: the icon test points the Steam path at a temp dir.
"""
import base64, json, os, re, sys, tempfile, urllib.request

from lupa import luajit21

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, "..", "backend", "main.lua")
STEAM = os.environ.get("STEAM_WIN", "C:/Program Files (x86)/Steam")
KEY = sys.argv[sys.argv.index("--sgdb-key") + 1] if "--sgdb-key" in sys.argv else ""

lua = luajit21.LuaRuntime(unpack_returned_tuples=True, encoding=None)
D = lambda v: v.decode() if isinstance(v, bytes) else v
state = {"steam": STEAM}


def tr(p):  # Windows path -> WSL path
    p = D(p).replace("\\", "/")
    m = re.match(r"^([A-Za-z]):/(.*)$", p)
    return f"/mnt/{m.group(1).lower()}/{m.group(2)}" if m else p


if os.environ.get("ACCOUNT"):
    ACCOUNT = os.environ["ACCOUNT"]
else:
    try:
        account_ids = sorted(name for name in os.listdir(tr(f"{STEAM}/userdata")) if name.isdecimal() and name != "0")
    except OSError:
        account_ids = []
    ACCOUNT = account_ids[0] if account_ids else "0"


def fs_list(p):
    out = lua.table()
    try:
        names = sorted(os.listdir(tr(p)))
    except OSError:
        return out
    for i, n in enumerate(names, 1):
        full = os.path.join(tr(p), n)
        out[i] = lua.table_from({b"name": n.encode(), b"path": full.encode(),
                                 b"is_directory": os.path.isdir(full), b"is_file": os.path.isfile(full)})
    return out


def http_get(url, opts):
    headers = {"User-Agent": "test"}
    if opts is not None and opts[b"headers"] is not None:
        for k, v in opts[b"headers"].items():
            headers[D(k)] = D(v)
    req = urllib.request.Request(D(url), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return lua.table_from({b"status": r.status, b"body": r.read()})
    except urllib.error.HTTPError as e:
        return lua.table_from({b"status": e.code, b"body": e.read()})


def http_download(url, path, opts):
    req = urllib.request.Request(D(url), headers={"User-Agent": "test"})
    with urllib.request.urlopen(req, timeout=60) as r, open(tr(path), "wb") as f:
        data = r.read()
        f.write(data)
        return lua.table_from({b"success": True, b"status": r.status, b"bytes_written": len(data)})


g = lua.globals()
g[b"py_isdir"] = lambda p: os.path.isdir(tr(p))
g[b"py_isfile"] = lambda p: os.path.isfile(tr(p))
g[b"py_mkdirs"] = lambda p: os.makedirs(tr(p), exist_ok=True) or True
g[b"py_list"] = fs_list
g[b"py_tr"] = lambda p: tr(p).encode()
g[b"py_b64"] = lambda s: base64.b64encode(s)
g[b"py_http"] = http_get
g[b"py_download"] = http_download
g[b"py_steam"] = lambda: state["steam"].encode()
g[b"py_mtime"] = lambda p: int(os.path.getmtime(tr(p)))
REAL_APPDATA = os.environ.get("REAL_APPDATA", os.environ.get("APPDATA", ""))
if REAL_APPDATA:
    os.environ["APPDATA"] = REAL_APPDATA  # read by the backend through os.getenv
lua.execute(rb'''
local real_open, real_remove = io.open, os.remove
io.open = function(p, m) return real_open(py_tr(p), m) end
os.remove = function(p) return real_remove(py_tr(p)) end
package.preload.logger = function() local l = {}; function l:info(m) print("[info] "..m) end; function l:warn(m) print("[warn] "..m) end; function l:error(m) print("[error] "..m) end; return l end
package.preload.millennium = function() return { steam_path = py_steam, ready = function() end } end
package.preload.fs = function() return { is_directory = py_isdir, is_file = py_isfile, list = py_list, create_directories = py_mkdirs, last_write_time = py_mtime } end
package.preload.utils = function() return { base64_encode = py_b64 } end
package.preload.http = function() return { get = py_http, download = py_download } end
''')
mod = lua.execute(open(BACKEND, "rb").read())
mod[b"on_load"]()


def py(v):
    if luajit21.lua_type(v) == "table":
        return {D(k): py(x) for k, x in v.items()}
    return D(v)


def call(name, *args):
    return py(g[name.encode()](*[a.encode() if isinstance(a, str) else a for a in args]))


failures = []
def check(label, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + label + (f"  ({detail})" if detail and not cond else ""))
    if not cond:
        failures.append(label)

# synthetic Steam + game folders for the trophy/detection scenarios
def vdf_shortcuts(entries):
    """Binary shortcuts.vdf: {name, exe, start} per entry."""
    out = b"\x00shortcuts\x00"
    for i, e in enumerate(entries):
        out += b"\x00" + str(i).encode() + b"\x00"
        out += b"\x02appid\x00" + int(e["appid"]).to_bytes(4, "little")
        for k, v in (("AppName", e["name"]), ("Exe", f'"{e["exe"]}"'), ("StartDir", f'"{e["start"]}"')):
            out += b"\x01" + k.encode() + b"\x00" + v.encode() + b"\x00"
        out += b"\x08"
    return out + b"\x08\x08"

TROP = '<?xml version="1.0"?><trophyconf><title-name>Bloodborne</title-name>' \
       '<trophy id="000" hidden="no" ttype="P" pid="-1"><name>Bloodborne</name><detail>All</detail></trophy>' \
       '<trophy id="001" hidden="no" ttype="G" pid="000" unlockstate="true" timestamp="1766022662"><name>A</name><detail>a</detail></trophy></trophyconf>'

sandbox = tempfile.mkdtemp()
games = {k: os.path.join(sandbox, k) for k in ("ready", "nodata", "missing", "other")}
os.makedirs(os.path.join(games["ready"], "user", "trophy", "NPWR05818_00", "Xml"))
os.makedirs(os.path.join(games["ready"], "user", "home", "1000", "trophy"))
open(os.path.join(games["ready"], "user", "trophy", "NPWR05818_00", "Xml", "TROP.XML"), "w").write(TROP)
open(os.path.join(games["ready"], "user", "home", "1000", "trophy", "NPWR05818_00.xml"), "w").write(TROP)
open(os.path.join(games["ready"], "package.json"), "w").write('{ "version": "0.9.40", "engine": "bbhost-test" }')
os.makedirs(games["nodata"])
os.makedirs(games["other"])
steam_dir = os.path.join(sandbox, "steam")
cfg = os.path.join(steam_dir, "userdata", "1", "config")
os.makedirs(cfg)
open(os.path.join(cfg, "shortcuts.vdf"), "wb").write(vdf_shortcuts([
    {"appid": 3000000001, "name": "Bloodborne", "exe": games["ready"] + "/Bloodborne.exe", "start": games["ready"]},
    {"appid": 3000000002, "name": "Bloodborne (vazio)", "exe": games["nodata"] + "/Bloodborne.exe", "start": games["nodata"]},
    {"appid": 3000000003, "name": "Bloodborne (sumiu)", "exe": games["missing"] + "/Bloodborne.exe", "start": games["missing"]},
    {"appid": 3000000004, "name": "Hades", "exe": games["other"] + "/Hades.exe", "start": games["other"]},
]))
state["steam"] = steam_dir
appdata = os.path.join(sandbox, "appdata")          # no launcher settings → profile "Main"
os.makedirs(appdata)
os.environ["APPDATA"] = appdata

st = call("bb_state", "3000000001", "17")
check("ready: bb_state ok with progress + version", st.get("ok") is True and "unlockstate" in st.get("progress", "") and st.get("version") == "0.9.40", str(st)[:160])
check("legacy install (no launcher data) → source shadps4", st.get("source") == "shadps4", str(st.get("source")))
st = call("bb_state", "3000000002", "17")
check("folder without the port: reason no_data, flagged as Bloodborne", st.get("reason") == "no_data" and st.get("bloodborne") is True, str(st)[:160])
st = call("bb_state", "3000000003", "17")
check("folder gone: reason missing_folder + path", st.get("reason") == "missing_folder" and "missing" in st.get("path", ""), str(st)[:160])
st = call("bb_state", "3000000004", "17")
check("other game: not flagged as Bloodborne", st.get("ok") is False and st.get("bloodborne") is False, str(st)[:160])
check("unknown appid: reason not_shortcut", call("bb_state", "123", "17").get("reason") == "not_shortcut")
fb = call("bb_find_bloodborne", "1")
check("find_bloodborne: found + ready on the first Bloodborne shortcut", fb.get("found") is True and fb.get("ready") is True and fb.get("appid") == "3000000001", str(fb))
check("find_bloodborne: other account → not found", call("bb_find_bloodborne", "2").get("found") is False)
check("bb_icon rejects path traversal", call("bb_icon", "3000000001", "../../x.PNG") == "")
# LanternEngine launcher profiles
lantern = os.path.join(sandbox, "lantern")
trop_dir = os.path.join(lantern, "user", "game_data", "CUSA00900", "TrophyFiles", "trophy00")
os.makedirs(os.path.join(trop_dir, "Xml")); os.makedirs(os.path.join(trop_dir, "Icons"))
open(os.path.join(lantern, "Bloodborne.exe"), "wb").write(b"MZ")
defs = '<trophyconf><title-name>Bloodborne</title-name>' + "".join(
    f'<trophy id="{i:03d}" hidden="no" ttype="{"P" if i == 0 else "B"}" pid="-1"><name>T{i}</name><detail>d</detail></trophy>' for i in range(40)) + '</trophyconf>'
open(os.path.join(trop_dir, "Xml", "TROP.XML"), "w").write(defs)
open(os.path.join(trop_dir, "Xml", "TROP_17.XML"), "w").write(defs.replace("<name>T", "<name>PT"))
open(os.path.join(trop_dir, "Icons", "TROP002.PNG"), "wb").write(b"\x89PNG\r\n\x1a\nfake")
hunter = os.path.join(lantern, "user", "profiles", "Hunter")
os.makedirs(hunter)
open(os.path.join(hunter, "trophies.log"), "w").write("2 1792207623\n29 1792354849\n29 1792000000\n")
open(os.path.join(hunter, "last_run.log"), "w").write("Runtime: guest thread...\nRuntime: trophy 21 unlocked\nRuntime: trophy 2 unlocked\n")
# Main profile with every base-game trophy → platinum
main_log = os.path.join(lantern, "user", "trophies.log")
open(main_log, "w").write("".join(f"{i} {1790000000 + i}\n" for i in range(1, 34)))
os.makedirs(os.path.join(appdata, "bbport-launcher"))
settings_path = os.path.join(appdata, "bbport-launcher", "settings.json")
def launcher(profile, profiles="Hunter", user_dir=""):
    open(settings_path, "w").write(json.dumps({"user_dir": user_dir, "player_profile": profile, "player_profiles": profiles,
                                               "playtime.main": 568, "playtime.hunter": 8740}, indent=2))
open(os.path.join(cfg, "shortcuts.vdf"), "ab")  # keep file
open(os.path.join(cfg, "shortcuts.vdf"), "wb").write(vdf_shortcuts([
    {"appid": 3000000010, "name": "Bloodborne", "exe": lantern + "/Bloodborne.exe", "start": lantern},
]))

def unlocked_ids(xml):
    return sorted(int(m) for m in re.findall(r'<trophy id="(\d+)"[^>]*unlockstate="true"', xml))

launcher("Hunter")
st = call("bb_state", "3000000010", "17")
ids = unlocked_ids(st.get("progress", ""))
check("profile Hunter: trophies.log + last_run.log → 2, 21, 29", ids == [2, 21, 29], f"{ids} {st.get('error')}")
check("profile Hunter: source launcher, user Hunter", st.get("source") == "launcher" and st.get("user") == "Hunter", f"{st.get('source')} {st.get('user')}")
check("profile Hunter: playtime 8740 s + last played time", st.get("playtime") == 8740 and (st.get("last_played") or 0) > 1700000000, f"{st.get('playtime')} {st.get('last_played')}")
check("earliest time wins for duplicate lines", 'id="029" hidden="no" ttype="B" pid="-1" unlockstate="true" timestamp="1792000000"' in st.get("progress", ""))
check("pt-BR names from the engine's TROP_17", "PT2" in st.get("localized", "") and st.get("icons") is True)
check("icons come from the engine's TrophyFiles", call("bb_icon", "3000000010", "TROP002.PNG").startswith("data:image/png;base64,"))
launcher("Main")
ids = unlocked_ids(call("bb_state", "3000000010", "17").get("progress", ""))
check("profile Main: 33 base trophies → platinum awarded", ids == list(range(0, 34)), str(ids[:5]))
launcher("Ghost", profiles="Hunter")
st = call("bb_state", "3000000010", "17")
check("unknown profile → falls back to Main (and Main's playtime)", st.get("user") == "Main" and st.get("playtime") == 568, f"{st.get('user')} {st.get('playtime')}")
import shutil
shutil.rmtree(os.path.join(lantern, "user", "game_data"))
st = call("bb_state", "3000000010", "17")
check("no extracted files → built-in 40 trophies, no icons", len(re.findall(r"<trophy id=", st.get("progress", ""))) == 40 and st.get("icons") is False and "Cleric Beast" in st.get("progress", ""))

os.environ["APPDATA"] = REAL_APPDATA
state["steam"] = STEAM

# Real Steam: the user's own shortcut (its game folder may have been moved).
vdf = open(tr(f"{STEAM}/userdata/{ACCOUNT}/config/shortcuts.vdf"), "rb").read()
i = vdf.find(b"Bloodborne"); j = vdf.rfind(b"\x02appid\x00", 0, i)
appid = str(int.from_bytes(vdf[j + 7:j + 11], "little"))
real = call("bb_state", appid, "17")
print(f"info: real Bloodborne shortcut {appid} → ok={real.get('ok')} reason={real.get('reason')} path={real.get('path')}")
check("real shortcut detected as Bloodborne", real.get("ok") is True or real.get("bloodborne") is True, str(real)[:160])
fb = call("bb_find_bloodborne", ACCOUNT)
if fb.get("found"):
    live = call("bb_state", fb["appid"], "17")
    ids = unlocked_ids(live.get("progress", ""))
    print(f"info: working shortcut {fb['appid']} → profile={live.get('user')} source={live.get('source')} unlocked={ids} "
          f"playtime={live.get('playtime')}s last_played={live.get('last_played')}")
    check("real profile reports the launcher's playtime", (live.get("playtime") or 0) > 0 and fb.get("playtime") == live.get("playtime"), f"{live.get('playtime')} {fb.get('playtime')}")

# releases (renamed repo, numeric id)
rel = json.loads(call("bb_releases"))
check("bb_releases returns releases", isinstance(rel, list) and len(rel) > 0, str(rel)[:80])

# artwork status
art = call("bb_art_status", ACCOUNT, appid)
check("bb_art_status sees existing grid art", art.get("hero") is True and art.get("capsule") is True, json.dumps(art))
check("bb_art_status rejects bad account", "error" in call("bb_art_status", "../x", appid))

# SteamGridDB
res = call("bb_sgdb_search", "", "bloodborne")
check("sgdb search without key → no_key", isinstance(res, dict) and res.get("error") == "no_key", str(res))
res = call("bb_sgdb_search", "invalid-key", "bloodborne")
check("sgdb search with bad key → bad_key", isinstance(res, dict) and res.get("error") == "bad_key", str(res))
check("fetch_image rejects non-SGDB hosts", "error" in call("bb_fetch_image", "https://example.com/a.png"))
img = call("bb_fetch_image", "https://cdn2.steamgriddb.com/hero/2c6ae45a3e88aee548c0714fad7f8269.png")
ok = isinstance(img, dict) and img.get("ext") == "png" and base64.b64decode(img.get("b64", ""))[:4] == b"\x89PNG"
check("fetch_image downloads + base64 (binary-safe)", ok, str(img)[:120])
check("fetch_image leaves no temp file", not any(n.startswith("sgdb-download") for n in os.listdir(os.path.join(HERE, "..", "backend"))))

with tempfile.TemporaryDirectory() as tmp:
    state["steam"] = tmp
    saved = call("bb_save_icon", ACCOUNT, appid, "https://cdn2.steamgriddb.com/hero/2c6ae45a3e88aee548c0714fad7f8269.png")
    path = os.path.join(tmp, "userdata", ACCOUNT, "config", "grid", f"{appid}_icon.png")
    check("save_icon writes <appid>_icon.png in the grid folder", os.path.isfile(path) and saved.get("path", "").endswith(f"{appid}_icon.png"), str(saved))
    state["steam"] = STEAM

if KEY:
    res = json.loads(call("bb_sgdb_search", KEY, "Bloodborne"))
    check("sgdb search (real key)", res.get("success") and len(res.get("data", [])) > 0, str(res)[:120])
    gid = str(res["data"][0]["id"])
    for kind in ["capsule", "header", "hero", "logo", "icon"]:
        a = json.loads(call("bb_sgdb_assets", gid, KEY, kind))
        check(f"sgdb assets {kind}", a.get("success") and len(a.get("data", [])) > 0, str(a)[:120])

print(f"\n{len(failures)} failure(s)")
sys.exit(1 if failures else 0)
