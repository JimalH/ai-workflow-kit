export type Installed = {
  /** `<name>@<marketplace>` */
  id: string
  name: string
  marketplace: string
  version: string
  isEnabled: boolean
  /** Where its files are, as `claude plugin list` reports it. */
  installPath: string
  /** Read from its own files once listed. */
  description: string
  /** `mod`: it has a hooks module; else a plugin of skills, commands or servers. */
  kind: 'mod' | 'plugin'
  /** How to use it: its slash commands and skills, `/name` each. */
  commands: string[]
}

export type Available = {
  id: string
  name: string
  marketplace: string
  description: string
  installCount: number
}

export type Marketplace = {
  name: string
  /** `owner/repo` on GitHub, when it comes from there. */
  repo?: string
  /** The page it opens: the GitHub repository, or its URL. */
  url?: string
}

export type Catalog = {
  installed: Installed[]
  available: Available[]
  marketplaces: Marketplace[]
  /** When it was read, in ms since the epoch; 0 before the first read. */
  readAt: number
}

export type View = {
  /** What runs now (`refresh`, or the plugin id being changed); '' when idle. */
  busy: string
  /** One line about the last action, or an error. */
  message: string
  /** Changes made that the running session has not reloaded yet. */
  isDirty: boolean
  tab: 'installed' | 'marketplaces'
  /** The marketplace whose available plugins are listed; '' none. */
  openMarketplace: string
  filter: string
}

declare module 'claude-code' {
  interface PluginState {
    'jimal-mods': {
      catalog: Catalog
      view: View
    }
  }
}
