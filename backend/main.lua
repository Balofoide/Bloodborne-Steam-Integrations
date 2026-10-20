-- Bloodborne PC · Steam Library integration (Millennium backend, LuaJIT)
--
-- Reads the shadPS4-style trophy data that BloodBorneButPc writes to disk and
-- hands it to the frontend. Everything is local and read-only; the only network
-- call is the GitHub releases feed used for the "Atualizações" section.
--
-- RPC functions must be globals (Millennium looks them up with lua_getglobal).
-- Arguments arrive positionally from the frontend's argument object; parameter
-- names are kept in alphabetical order so they line up whether the host keeps
-- insertion order or sorts the keys.

local logger = require("logger")
local millennium = require("millennium")
local http = require("http")
local fs = require("fs")
local utils = require("utils")

-- The project was renamed (BloodBorneButPc → LanternEngine); the numeric
-- repository id keeps working across renames.
local RELEASES_URL = "https://api.github.com/repositories/1414718338/releases?per_page=8"
local RELEASES_TTL = 10 * 60

-- appid (string) -> resolved game root (forward slashes, no trailing slash)
local roots = {}
local releases_cache = { at = 0, body = nil }

-- helpers

local function read_file(path)
    local f = io.open(path, "rb")
    if not f then return nil end
    local data = f:read("*a")
    f:close()
    return data
end

local function clean_path(p)
    if not p or p == "" then return nil end
    p = tostring(p):gsub('^%s*"', ""):gsub('"%s*$', ""):gsub("\\", "/"):gsub("/+$", "")
    if p == "" then return nil end
    return p
end

local function dirname(p)
    p = clean_path(p)
    return p and p:match("^(.*)/[^/]*$") or nil
end

local function is_dir(p)
    local ok, res = pcall(fs.is_directory, p)
    return ok and res == true
end

local function is_file(p)
    local ok, res = pcall(fs.is_file, p)
    return ok and res == true
end

local function list_dir(p)
    local ok, res = pcall(fs.list, p)
    if not ok or type(res) ~= "table" then return {} end
    table.sort(res, function(a, b) return tostring(a.name) < tostring(b.name) end)
    return res
end

-- A LanternEngine port folder (the Bloodborne.exe of the Steam shortcut sits in it).
local function is_game_root(p)
    if not p then return false end
    return is_file(p .. "/Bloodborne.exe") or is_dir(p .. "/user/game_data") or is_dir(p .. "/user/trophy")
end

-- Minimal binary VDF reader for shortcuts.vdf:
-- 0x00 nested map, 0x01 string, 0x02 int32, 0x08 end of map.
local function parse_binary_vdf(data)
    local pos = 1
    local function cstring()
        local e = data:find("\0", pos, true)
        if not e then pos = #data + 1; return "" end
        local s = data:sub(pos, e - 1)
        pos = e + 1
        return s
    end
    local function int32()
        local a, b, c, d = data:byte(pos, pos + 3)
        pos = pos + 4
        return (a or 0) + (b or 0) * 256 + (c or 0) * 65536 + (d or 0) * 16777216
    end
    local function map()
        local t = {}
        while pos <= #data do
            local typ = data:byte(pos); pos = pos + 1
            if not typ or typ == 0x08 then break end
            local key = cstring()
            if typ == 0x00 then t[key] = map()
            elseif typ == 0x01 then t[key] = cstring()
            elseif typ == 0x02 then t[key] = int32()
            else break end
        end
        return t
    end
    return map()
end

local function field(t, ...)
    for i = 1, select("#", ...) do
        local v = t[select(i, ...)]
        if v ~= nil then return v end
    end
end

-- Shortcuts of one account (or of every account when accountid is nil):
-- each Steam account on this machine has its own shortcuts.vdf.
local function list_shortcuts(accountid)
    local steam = clean_path(millennium.steam_path())
    if not steam then return {} end
    local out = {}
    for _, user in ipairs(list_dir(steam .. "/userdata")) do
        if not accountid or user.name == tostring(accountid) then
            local data = read_file(steam .. "/userdata/" .. user.name .. "/config/shortcuts.vdf")
            local root = data and parse_binary_vdf(data) or {}
            local entries = root.shortcuts or root.Shortcuts or root
            for _, s in pairs(type(entries) == "table" and entries or {}) do
                if type(s) == "table" then
                    local id = tonumber(field(s, "appid", "AppId", "AppID"))
                    -- Stored as uint32 here; older files may hold it signed.
                    if id and id < 0 then id = id + 4294967296 end
                    table.insert(out, {
                        appid = id,
                        name = field(s, "AppName", "appname") or "",
                        exe = field(s, "Exe", "exe"),
                        start_dir = field(s, "StartDir", "startdir"),
                    })
                end
            end
        end
    end
    return out
end

local function find_shortcut(appid)
    local want = tonumber(appid)
    for _, s in ipairs(list_shortcuts(nil)) do
        if want and s.appid == want then return s end
    end
    return nil
end

-- which shortcut is Bloodborne PC

local function exe_name(p) return (clean_path(p) or ""):match("([^/]+)$") or "" end

-- LanternEngine is added to Steam as Bloodborne.exe (its README), usually
-- named "Bloodborne"; the launcher exe or the name alone also count.
local function looks_like_bloodborne(shortcut)
    local exe = exe_name(shortcut.exe):lower()
    return exe == "bloodborne.exe" or exe == "bloodborne launcher.exe" or exe == "bloodborne.launcher.exe"
        or tostring(shortcut.name):lower():find("bloodborne", 1, true) ~= nil
end

-- where LanternEngine keeps trophies
--
-- Mirrors the launcher (LanternEngine launcher/windows/.../Core):
--  • %APPDATA%\bbport-launcher\settings.json holds user_dir (the saves root,
--    default <port>\user) and the active player_profile;
--  • profile "Main" is the saves root itself, others are <saves>\profiles\<name>;
--  • unlocks are "<id> <unix-time>" lines in <profile>\trophies.log, plus
--    "Runtime: trophy <id> unlocked" lines the runtime printed to
--    <profile>\last_run.log that the launcher has not recorded yet (the game
--    was started straight from Bloodborne.exe, e.g. through Steam);
--  • the platinum is awarded once every base-game trophy (1–33) is unlocked.

local PLATINUM_NEEDS = 33 -- ids 1..33 = base game; 34..39 = The Old Hunters

local function expand(p)
    p = tostring(p or "")
    if p:sub(1, 1) == "~" then p = (os.getenv("USERPROFILE") or "") .. p:sub(2) end
    p = p:gsub("%%(%w+)%%", function(v) return os.getenv(v) or ("%" .. v .. "%") end)
    return clean_path(p)
end

local function launcher_settings()
    local appdata = os.getenv("APPDATA")
    local text = appdata and read_file(clean_path(appdata) .. "/bbport-launcher/settings.json")
    if not text then return nil end
    local function str(key)
        local v = text:match('"' .. key .. '"%s*:%s*"(.-)"%s*[,}\r\n]')
        return v and (v:gsub("\\\\", "\\"):gsub("\\/", "/")) or ""
    end
    return { user_dir = str("user_dir"), profile = str("player_profile"), profiles = str("player_profiles"), text = text }
end

-- Seconds the launcher has counted for a profile ("playtime.<profile>").
-- Bloodborne.exe (the Steam shortcut's target) starts the game through the
-- launcher ("Lantern Engine.exe --play"), so Steam-started sessions count too.
local function launcher_playtime(ls, profile)
    if not ls then return 0 end
    local key = "playtime." .. tostring(profile):lower()
    local v = ls.text:match('"' .. key:gsub("%p", "%%%0") .. '"%s*:%s*(%d+)')
    return tonumber(v) or 0
end

local function mtime(path)
    if not is_file(path) then return 0 end
    local ok, t = pcall(fs.last_write_time, path)
    return (ok and tonumber(t)) or 0
end

local function safe_name(name)
    return (tostring(name):gsub("[^%w _%-\128-\255]", ""):match("^%s*(.-)%s*$"))
end

local function inside(path, root)
    local p, r = (clean_path(path) or ""):lower(), (clean_path(root) or ""):lower()
    return p ~= "" and r ~= "" and (p == r or p:sub(1, #r + 1) == r .. "/")
end

-- Saves root and active profile folder for a port folder. The launcher's
-- user_dir belongs to the port it manages: it is used when it lives inside this
-- port's folder, or when this folder has no saves of its own.
local function profile_dirs(root)
    local ls = launcher_settings()
    local saves = root .. "/user"
    if ls and ls.user_dir ~= "" then
        local custom = expand(ls.user_dir)
        if custom and is_dir(custom) and (inside(custom, root) or not is_dir(saves .. "/game_data")) then saves = custom end
    end
    local profile = "Main"
    if ls and ls.profile ~= "" and ls.profile:lower() ~= "main" then
        for name in (ls.profiles .. "|"):gmatch("([^|]*)|") do
            if safe_name(name):lower() == safe_name(ls.profile):lower() and safe_name(name) ~= "" then profile = safe_name(name) end
        end
    end
    local dir = saves .. "/profiles/" .. profile
    if profile == "Main" or not is_dir(dir) then return saves, saves, "Main", ls end
    return saves, dir, profile, ls
end

-- Built-in definitions (the launcher's own list) for when the engine has not
-- extracted the game's trophy files yet. English only, no icons.
local BUILTIN = {
    { "P", "Bloodborne", "All trophies acquired. Hats off!" },
    { "G", "Yharnam Sunrise", "You lived through the hunt, and saw another day." },
    { "G", "Honoring Wishes", "Captivated by the moon presence, you pledge to watch over the hunter's dream." },
    { "G", "Childhood's Beginning", "You became an infant Great One, lifting humanity into its next childhood." },
    { "G", "Yharnam, Pthumerian Queen", "Defeat Yharnam, Blood Queen of the Old Labyrinth." },
    { "G", "Hunter's Essence", "Acquire all hunter weapons." },
    { "G", "Hunter's Craft", "Acquire all special hunter tools." },
    { "S", "Weapon Master", "Acquire a weapon of the highest level." },
    { "S", "Blood Gem Master", "Acquire an extremely precious blood gem." },
    { "S", "Rune Master", "Acquire an extremely precious Caryll Rune." },
    { "S", "Cainhurst", "Gain entry to Cainhurst, the lost and ruined castle." },
    { "S", "The Choir", "Gain entry to the realm of the Choir, the high stratum of the Healing Church." },
    { "S", "The Source of the Dream", "Discover the abandoned old workshop, the source of the hunter's dream." },
    { "S", "Nightmare Lecture Building", "Gain entry into the Byrgenwerth lecture building, that drifts within the realm of nightmare." },
    { "B", "Father Gascoigne", "Defeat the beast that once was Father Gascoigne." },
    { "B", "Vicar Amelia", "Defeat the beast that once was Vicar Amelia." },
    { "B", "Shadow of Yharnam", "Defeat the Shadow of Yharnam." },
    { "B", "Rom, the Vacuous Spider", "Defeat Great One: Rom, the Vacuous Spider." },
    { "B", "The One Reborn", "Defeat the One Reborn." },
    { "B", "Micolash, Host of the Nightmare", "Defeat Micolash, Host of the Nightmare." },
    { "B", "Mergo's Wet Nurse", "Defeat Great One: Mergo's Wet Nurse." },
    { "B", "Cleric Beast", "Defeat Cleric Beast." },
    { "B", "Blood-starved Beast", "Defeat Blood-starved Beast." },
    { "B", "The Witch of Hemwick", "Defeat the Witch of Hemwick." },
    { "B", "Darkbeast Paarl", "Defeat Darkbeast Paarl." },
    { "B", "Amygdala", "Defeat Great One: Amygdala." },
    { "B", "Martyr Logarius", "Defeat Martyr Logarius." },
    { "B", "Celestial Emissary", "Defeat Great One: Celestial Emissary." },
    { "B", "Ebrietas, Daughter of the Cosmos", "Defeat Great One: Ebrietas, Daughter of the Cosmos." },
    { "B", "Blood Gem Contact", "Acquire a blood gem that imbues hunter weapons with special strength." },
    { "B", "Rune Contact", "Acquire a Caryll Rune that endows hunters with special strength." },
    { "B", "Chalice of Pthumeru", "Acquire the Chalice of Pthumeru that seals the catacombs that form a web deep below Yharnam." },
    { "B", "Chalice of Ailing Loran", "Acquire the Chalice of Ailing Loran that seals the tragic land lost to the sands." },
    { "B", "Chalice of Isz", "Acquire the Great Chalice of Isz that seals the home of the cosmic kin." },
    { "G", "Old Hunter's Essence", "Acquire all old hunter weapons." },
    { "S", "Orphan of Kos", "Defeat Great One: Orphan of Kos." },
    { "B", "Ludwig, the Holy Blade", "Defeat the beast that was once Ludwig, the Holy Blade." },
    { "B", "Lady Maria of the Astral Clocktower", "Defeat Lady Maria of the Astral Clocktower." },
    { "B", "Living Failures", "Defeat the failed attempts to become Great Ones." },
    { "B", "Laurence, the First Vicar", "Defeat the beast that was once Laurence, the First Vicar." },
}

local function xml_escape(v) return (tostring(v):gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;")) end

local function builtin_xml()
    local out = { '<?xml version="1.0"?>\n<trophyconf version="1.1" platform="ps4">\n<title-name>Bloodborne</title-name>\n',
        '<group id="001"><name>Bloodborne: The Old Hunters</name><detail>Bloodborne: The Old Hunters</detail></group>\n' }
    for i, t in ipairs(BUILTIN) do
        local id = i - 1
        out[#out + 1] = string.format('<trophy id="%03d" hidden="no" ttype="%s" pid="%s"%s><name>%s</name><detail>%s</detail></trophy>\n',
            id, t[1], id == 0 and "-1" or "000", id >= 34 and ' gid="001"' or "", xml_escape(t[2]), xml_escape(t[3]))
    end
    out[#out + 1] = "</trophyconf>\n"
    return table.concat(out)
end

-- Trophy definitions: what the engine extracted from the game
-- (<saves>\game_data\<title>\TrophyFiles\trophy00), else shadPS4's older
-- <saves>\trophy\<npcommid>, else the built-in list.
local function find_definitions(saves)
    local tried = {}
    for _, title in ipairs(list_dir(saves .. "/game_data")) do
        table.insert(tried, saves .. "/game_data/" .. title.name .. "/TrophyFiles/trophy00")
    end
    for _, set in ipairs(list_dir(saves .. "/trophy")) do table.insert(tried, saves .. "/trophy/" .. set.name) end
    for _, dir in ipairs(tried) do
        if is_file(dir .. "/Xml/TROP.XML") then return { xml = dir .. "/Xml", icons = dir .. "/Icons", set = dir:match("([^/]+)$") } end
    end
    return nil
end

local function read_unlocks(dir)
    local got, found = {}, false
    local log = read_file(dir .. "/trophies.log")
    if log then
        found = true
        for line in log:gmatch("[^\r\n]+") do
            local id, when = line:match("^%s*(%d+)%s+(%d+)")
            id, when = tonumber(id), tonumber(when)
            if id and when and (not got[id] or when < got[id]) then got[id] = when end
        end
    end
    local run = read_file(dir .. "/last_run.log")
    if run then
        found = true
        local okt, when = pcall(fs.last_write_time, dir .. "/last_run.log")
        when = (okt and tonumber(when)) or os.time()
        for _, pat in ipairs({ "Runtime: trophy (%d+) unlocked", "Runtime: trophy (%d+) earned in this save" }) do
            for id in run:gmatch(pat) do
                id = tonumber(id)
                if id and not got[id] then got[id] = when end
            end
        end
    end
    if not got[0] then
        local latest = 0
        for id = 1, PLATINUM_NEEDS do
            if not got[id] then latest = nil break end
            latest = math.max(latest, got[id])
        end
        if latest then got[0] = latest end
    end
    return got, found
end

-- shadPS4's own progress files (installs that predate the launcher).
local function legacy_progress(saves, set)
    local best, best_n = nil, -1
    for _, home in ipairs(list_dir(saves .. "/home")) do
        local xml = home.is_directory and set and read_file(saves .. "/home/" .. home.name .. "/trophy/" .. set .. ".xml")
        if xml then
            local n = 0
            for _ in xml:gmatch('unlockstate="true"') do n = n + 1 end
            if n > best_n then best, best_n = xml, n end
        end
    end
    return best
end

-- Definitions XML with unlockstate/timestamp set from the profile's unlocks.
local function apply_unlocks(xml, got)
    return (xml:gsub("<trophy(%s[^>]-)>", function(attrs)
        local id = tonumber(attrs:match('id="(%d+)"'))
        attrs = attrs:gsub('%s+unlockstate="[^"]*"', ""):gsub('%s+timestamp="[^"]*"', "")
        if id and got[id] then attrs = attrs .. ' unlockstate="true" timestamp="' .. got[id] .. '"' end
        return "<trophy" .. attrs .. ">"
    end))
end

-- appid → icons folder of the definitions in use
local icon_dirs = {}

local function has_trophies(root)
    local saves, dir = profile_dirs(root)
    local _, found = read_unlocks(dir)
    return found or find_definitions(saves) ~= nil
end

-- Returns root, or nil + reason code + detail. Reasons: "not_shortcut",
-- "missing_folder" (the shortcut's folder is gone), "no_data" (folder there
-- but no LanternEngine trophy data yet).
local function resolve_root(appid)
    local cached = roots[appid]
    if cached and is_game_root(cached) then return cached end

    local shortcut = find_shortcut(appid)
    if not shortcut then return nil, "not_shortcut", "not in shortcuts.vdf" end

    local candidates = {}
    local function add(p) if p then table.insert(candidates, p) end end
    add(clean_path(shortcut.start_dir))
    add(dirname(shortcut.exe))
    -- The launcher can sit next to the game folder instead of inside it.
    for i = 1, #candidates do
        local base = candidates[i]
        add(dirname(base))
        for _, entry in ipairs(list_dir(base)) do
            if entry.is_directory then add(base .. "/" .. entry.name) end
        end
    end

    for _, p in ipairs(candidates) do
        if is_game_root(p) then
            roots[appid] = p
            return p
        end
    end
    local where = candidates[1] or ""
    if where ~= "" and not is_dir(where) then return nil, "missing_folder", where end
    return nil, "no_data", where
end

-- RPC

-- Trophies of the launcher's active player profile for a shortcut.
-- lang is the PS4 language index used by TROP_XX.XML (e.g. "17" = pt-BR).
function bb_state(appid, lang)
    local ok, result = pcall(function()
        appid = tostring(appid or "")
        local root, reason, detail = resolve_root(appid)
        if not root then
            local shortcut = find_shortcut(appid)
            return {
                ok = false, reason = reason, error = reason .. ": " .. tostring(detail), path = detail,
                -- Lets the frontend explain the problem on the Bloodborne page only.
                bloodborne = shortcut ~= nil and looks_like_bloodborne(shortcut),
            }
        end

        local saves, dir, profile, ls = profile_dirs(root)
        local defs = find_definitions(saves)
        local base = defs and read_file(defs.xml .. "/TROP.XML") or builtin_xml()
        local got, found = read_unlocks(dir)
        local progress, source
        if found then
            progress, source = apply_unlocks(base, got), "launcher"
        else
            -- No launcher data for this profile: shadPS4's own files, else nothing yet.
            local legacy = legacy_progress(saves, defs and defs.set)
            progress, source = legacy or apply_unlocks(base, {}), legacy and "shadps4" or "none"
        end
        icon_dirs[appid] = defs and defs.icons or nil

        local localized = nil
        if defs and lang and tostring(lang):match("^%d%d$") then
            localized = read_file(defs.xml .. "/TROP_" .. lang .. ".XML")
        end
        local pkg = read_file(root .. "/package.json") or ""
        return {
            ok = true,
            root = root,
            npcommid = defs and defs.set or "",
            user = profile,
            source = source,
            progress = progress,
            localized = localized or "",
            icons = defs ~= nil,
            -- Stats of the launcher profile (per profile, so a new Steam
            -- shortcut does not start from zero).
            playtime = launcher_playtime(ls, profile),
            saves_dir = dir,
            last_played = math.max(mtime(dir .. "/last_run.log"), mtime(dir .. "/trophies.log")),
            version = pkg:match('"version"%s*:%s*"([^"]+)"') or "",
            engine = pkg:match('"engine"%s*:%s*"([^"]+)"') or "",
        }
    end)
    if ok then return result end
    logger:error("bb_state failed: " .. tostring(result))
    return { ok = false, error = tostring(result) }
end

-- Return one trophy icon as a data URL (icons are ~120 KB each, so the
-- frontend fetches them one by one and caches them).
function bb_icon(appid, file)
    local dir = icon_dirs[tostring(appid or "")]
    file = tostring(file or "")
    if not dir or not file:match("^[%w_]+%.PNG$") then return "" end
    local data = read_file(dir .. "/" .. file)
    if not data then return "" end
    return "data:image/png;base64," .. utils.base64_encode(data)
end

-- Raw GitHub releases JSON (parsed on the frontend), cached for 10 minutes.
function bb_releases()
    local now = os.time()
    if releases_cache.body and now - releases_cache.at < RELEASES_TTL then
        return releases_cache.body
    end
    local ok, res = pcall(http.get, RELEASES_URL, {
        timeout = 10,
        user_agent = "bloodborne-steam-plugin",
        headers = { Accept = "application/vnd.github+json" },
    })
    if ok and res and res.status == 200 and res.body then
        releases_cache = { at = now, body = res.body }
        return res.body
    end
    logger:warn("bb_releases failed: " .. tostring(ok and res and res.status or res))
    return releases_cache.body or "[]"
end

-- Is Bloodborne PC in this account's library, and does it have data?
-- Used by the first-run message (add it to Steam / optional SteamGridDB key).
function bb_find_bloodborne(accountid)
    local id = tostring(accountid or ""):match("^%d+$")
    -- Several candidates (old copies, renamed shortcuts): prefer one that
    -- works, then one whose folder still exists. shortcuts.vdf order is not
    -- stable, so the choice must not depend on it.
    local best, best_rank = nil, -1
    for _, s in ipairs(list_shortcuts(id)) do
        if looks_like_bloodborne(s) then
            local root, reason = resolve_root(tostring(s.appid))
            local ready = root ~= nil and has_trophies(root)
            local rank = ready and 2 or (reason ~= "missing_folder" and 1 or 0)
            if rank > best_rank then
                local profile, playtime = nil, nil
                if root then
                    local _, _, p, ls = profile_dirs(root)
                    profile, playtime = p, launcher_playtime(ls, p)
                end
                best, best_rank = { found = true, appid = tostring(s.appid), name = s.name, ready = ready, profile = profile, playtime = playtime }, rank
            end
        end
    end
    return best or { found = false }
end

-- SteamGridDB artwork
--
-- The frontend applies artwork through SteamClient.Apps.SetCustomArtworkForApp
-- (the same call as Steam's "Set custom artwork" menu); the backend only does
-- the network part, because the SteamGridDB API and CDN send no CORS headers.

local SGDB_API = "https://www.steamgriddb.com/api/v2"
local SGDB_CDN = "^https://cdn%d*%.steamgriddb%.com/[%w%-%._~/]+%.(%a+)$"
local IMAGE_EXT = { png = "png", jpg = "jpg", jpeg = "jpg" }
local MAX_IMAGE_BYTES = 5 * 1024 * 1024 -- base64 must stay under Millennium's IPC limit

local here = (debug.getinfo(1, "S").source:sub(2):match("(.*[/\\])") or "./")

local function url_encode(s)
    return (tostring(s or ""):gsub("([^%w%-_.~])", function(c) return string.format("%%%02X", string.byte(c)) end))
end

local function sgdb_get(path, key)
    if not key or key == "" then return nil, "no_key" end
    local ok, res = pcall(http.get, SGDB_API .. path, {
        timeout = 15,
        user_agent = "bloodborne-steam-plugin",
        headers = { Authorization = "Bearer " .. key },
    })
    if not ok or not res then return nil, "network: " .. tostring(res) end
    if res.status == 401 or res.status == 403 then return nil, "bad_key" end
    if res.status ~= 200 then return nil, "http: " .. tostring(res.status) end
    return res.body
end

-- Raw JSON from /search/autocomplete (parsed on the frontend).
function bb_sgdb_search(key, term)
    local body, err = sgdb_get("/search/autocomplete/" .. url_encode(term), key)
    return body or { error = err }
end

-- Raw JSON for one asset kind of a SteamGridDB game.
--
-- "<kind>" asks for what an official Steam release ships: the plain key-art
-- style ("alternate", not blurred / minimal / logo-only) at Steam's own asset
-- sizes, and the "official" logo and icon. "<kind>_any" is the fallback when
-- a game has nothing in that style. Style and size values are the ones
-- SteamGridDB's own Decky plugin uses.
local SAFE = "&types=static&nsfw=false&humor=false&epilepsy=false"
local KIND_QUERY = {
    capsule = "/grids/game/%d?styles=alternate&dimensions=600x900,660x930&mimes=image/png,image/jpeg" .. SAFE,
    header = "/grids/game/%d?styles=alternate&dimensions=920x430,460x215&mimes=image/png,image/jpeg" .. SAFE,
    hero = "/heroes/game/%d?styles=alternate&dimensions=3840x1240,1920x620&mimes=image/png,image/jpeg" .. SAFE,
    logo = "/logos/game/%d?styles=official&mimes=image/png" .. SAFE,
    icon = "/icons/game/%d?styles=official&mimes=image/png" .. SAFE,
    capsule_any = "/grids/game/%d?dimensions=600x900,660x930,342x482&mimes=image/png,image/jpeg" .. SAFE,
    header_any = "/grids/game/%d?dimensions=920x430,460x215&mimes=image/png,image/jpeg" .. SAFE,
    hero_any = "/heroes/game/%d?mimes=image/png,image/jpeg" .. SAFE,
    logo_any = "/logos/game/%d?mimes=image/png" .. SAFE,
    icon_any = "/icons/game/%d?mimes=image/png" .. SAFE,
}

function bb_sgdb_assets(game, key, kind)
    local q = KIND_QUERY[tostring(kind)]
    local id = tonumber(game)
    if not q or not id then return { error = "bad_request" } end
    local body, err = sgdb_get(string.format(q, id), key)
    return body or { error = err }
end

local function download(url, path)
    local ok, res = pcall(http.download, url, path, { timeout = 60, user_agent = "bloodborne-steam-plugin" })
    if not ok or not res then return false, tostring(res) end
    if res.success == false or (res.status and res.status ~= 200) then return false, "HTTP " .. tostring(res.status) end
    return true
end

-- Errors are codes ("no_key", "bad_key", "download: <detail>"…); the frontend
-- shows them in the user's language (artErrorText in i18n.ts).

-- Download one SteamGridDB image and return it as base64 for the frontend.
function bb_fetch_image(url)
    url = tostring(url or "")
    local ext = url:match(SGDB_CDN)
    ext = ext and IMAGE_EXT[ext:lower()]
    if not ext then return { error = "url_not_allowed" } end
    local tmp = here .. "sgdb-download." .. ext
    local ok, err = download(url, tmp)
    if not ok then os.remove(tmp); return { error = "download: " .. tostring(err) } end
    local data = read_file(tmp)
    os.remove(tmp)
    if not data or #data == 0 then return { error = "empty_file" } end
    if #data > MAX_IMAGE_BYTES then return { error = "too_large" } end
    return { b64 = utils.base64_encode(data), ext = ext }
end

local function grid_dir(accountid)
    local steam = clean_path(millennium.steam_path())
    local id = tostring(accountid or ""):match("^%d+$")
    if not steam or not id then return nil end
    return steam .. "/userdata/" .. id .. "/config/grid"
end

-- Which custom artwork the signed-in account already has for a shortcut,
-- using Steam's grid file names (<appid>p, <appid>, <appid>_hero, <appid>_logo).
function bb_art_status(accountid, appid)
    local dir = grid_dir(accountid)
    local id = tostring(appid or ""):match("^%d+$")
    if not dir or not id then return { error = "bad_request" } end
    local function has(suffix)
        for _, ext in ipairs({ "png", "jpg", "jpeg", "webp" }) do
            if is_file(dir .. "/" .. id .. suffix .. "." .. ext) then return true end
        end
        return false
    end
    return { capsule = has("p"), header = has(""), hero = has("_hero"), logo = has("_logo"), icon = has("_icon") }
end

-- Shortcut icons are set from a local file (SteamClient.Apps.SetShortcutIcon),
-- so the icon is saved next to the other artwork in the grid folder.
function bb_save_icon(accountid, appid, url)
    local dir = grid_dir(accountid)
    local id = tostring(appid or ""):match("^%d+$")
    url = tostring(url or "")
    local ext = url:match(SGDB_CDN)
    if not dir or not id or not (ext and IMAGE_EXT[ext:lower()]) then return { error = "bad_request" } end
    if not is_dir(dir) then pcall(fs.create_directories, dir) end
    local path = dir .. "/" .. id .. "_icon." .. IMAGE_EXT[ext:lower()]
    local ok, err = download(url, path)
    if not ok then return { error = "download: " .. tostring(err) } end
    return { path = path:gsub("/", "\\") }
end

return {
    on_load = function()
        logger:info("Bloodborne backend loaded")
        millennium.ready()
    end,
    on_frontend_loaded = function() end,
    on_unload = function() end,
}
