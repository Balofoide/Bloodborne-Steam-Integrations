// The signed-in user's name and avatar, for the "<Name> conquistou" feed
// headline. Read from Steam's friends store (g_FriendsUIApp.FriendStore.self).

export interface SelfPersona {
  name: string
  avatar: string
}

interface Persona {
  m_strPlayerName?: string
  avatar_url_medium?: string
  avatar_url?: string
}

export function selfPersona(): SelfPersona {
  try {
    const self = (window as {
      g_FriendsUIApp?: { FriendStore?: { self?: { display_name?: string; persona?: Persona } } }
    }).g_FriendsUIApp?.FriendStore?.self
    return {
      name: self?.display_name || self?.persona?.m_strPlayerName || "",
      avatar: self?.persona?.avatar_url_medium || self?.persona?.avatar_url || "",
    }
  } catch {
    return { name: "", avatar: "" }
  }
}

/** userdata/<accountid> of the signed-in account (its grid folder holds the artwork). */
export function selfAccountId(): string {
  try {
    const id = (window as { g_FriendsUIApp?: { FriendStore?: { self?: { accountid?: number } } } })
      .g_FriendsUIApp?.FriendStore?.self?.accountid
    return id ? String(id) : ""
  } catch {
    return ""
  }
}
