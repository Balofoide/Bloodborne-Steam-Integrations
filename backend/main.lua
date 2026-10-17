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

local REPO = "Awakenchan/BloodBorneButPc"
local RELEASES_URL = "https://api.github.com/repos/" .. REPO .. "/releases?per_page=8"
local RELEASES_TTL = 10 * 60

-- appid (string) -> resolved game root (forward slashes, no trailing slash)
local roots = {}
local releases_cache = { at = 0, body = nil }

-- ── helpers ───────────────────────────────────────────────────────────

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

local function is_game_root(p)
    return p and is_dir(p .. "/user/trophy") or false
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

-- Every Steam account on this machine has its own shortcuts.vdf; scan them all.
local function find_shortcut(appid)
    local steam = clean_path(millennium.steam_path())
    if not steam then return nil end
    local want = tonumber(appid)
    for _, user in ipairs(list_dir(steam .. "/userdata")) do
        local data = read_file(steam .. "/userdata/" .. user.name .. "/config/shortcuts.vdf")
        if data then
            local root = parse_binary_vdf(data)
            local entries = root.shortcuts or root.Shortcuts or root
            for _, s in pairs(type(entries) == "table" and entries or {}) do
                if type(s) == "table" then
                    local id = tonumber(field(s, "appid", "AppId", "AppID"))
                    -- shortcuts.vdf stores the id as uint32 here; the library URL
                    -- uses the same number, but older files may hold it signed.
                    if id and want and (id == want or id + 4294967296 == want) then
                        return {
                            exe = field(s, "Exe", "exe"),
                            start_dir = field(s, "StartDir", "startdir"),
                        }
                    end
                end
            end
        end
    end
    return nil
end

local function resolve_root(appid)
    local cached = roots[appid]
    if cached and is_game_root(cached) then return cached end

    local shortcut = find_shortcut(appid)
    if not shortcut then return nil, "atalho não encontrado no shortcuts.vdf" end

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
    return nil, "pasta user/trophy não encontrada perto de " .. tostring(candidates[1])
end

local function count_unlocked(xml)
    local n = 0
    for _ in xml:gmatch('unlockstate="true"') do n = n + 1 end
    return n
end

-- ── RPC ───────────────────────────────────────────────────────────────

-- Locate the trophy set and the most advanced local profile for a shortcut.
-- lang is the PS4 language index used by TROP_XX.XML (e.g. "17" = pt-BR).
function bb_state(appid, lang)
    local ok, result = pcall(function()
        appid = tostring(appid or "")
        local root, err = resolve_root(appid)
        if not root then return { ok = false, error = err } end

        -- Pick the user profile with the most unlocks across every trophy set.
        local best = nil
        for _, set in ipairs(list_dir(root .. "/user/trophy")) do
            local conf_dir = root .. "/user/trophy/" .. set.name .. "/Xml"
            if set.is_directory and is_file(conf_dir .. "/TROP.XML") then
                for _, home in ipairs(list_dir(root .. "/user/home")) do
                    local path = root .. "/user/home/" .. home.name .. "/trophy/" .. set.name .. ".xml"
                    local xml = home.is_directory and read_file(path)
                    if xml then
                        local n = count_unlocked(xml)
                        if not best or n > best.unlocked then
                            best = { set = set.name, user = home.name, progress = xml, unlocked = n }
                        end
                    end
                end
                if not best then
                    -- No profile has played yet: fall back to the bare set.
                    best = { set = set.name, user = "", progress = read_file(conf_dir .. "/TROP.XML"), unlocked = 0 }
                end
            end
        end
        if not best then return { ok = false, error = "nenhum conjunto de troféus em " .. root .. "/user/trophy" } end

        local conf_dir = root .. "/user/trophy/" .. best.set .. "/Xml"
        local localized = nil
        if lang and tostring(lang):match("^%d%d$") then
            localized = read_file(conf_dir .. "/TROP_" .. lang .. ".XML")
        end

        local pkg = read_file(root .. "/package.json") or ""
        return {
            ok = true,
            root = root,
            npcommid = best.set,
            user = best.user,
            progress = best.progress or "",
            localized = localized or "",
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
    local root = roots[tostring(appid or "")]
    file = tostring(file or "")
    if not root or not file:match("^[%w_]+%.PNG$") then return "" end
    local npcommid = nil
    for _, set in ipairs(list_dir(root .. "/user/trophy")) do
        if set.is_directory and is_file(root .. "/user/trophy/" .. set.name .. "/Icons/" .. file) then
            npcommid = set.name
            break
        end
    end
    if not npcommid then return "" end
    local data = read_file(root .. "/user/trophy/" .. npcommid .. "/Icons/" .. file)
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

return {
    on_load = function()
        logger:info("Bloodborne PC backend loaded")
        millennium.ready()
    end,
    on_frontend_loaded = function() end,
    on_unload = function() end,
}
