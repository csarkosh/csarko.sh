Arkos IDE installs as `/Applications/Arkos IDE.app` through the Homebrew cask, which holds both
`arkos` and `arkosd`:

```sh
brew install --cask csarkosh/tap/arkos-ide
xattr -dr com.apple.quarantine "/Applications/Arkos IDE.app"
```

The second line is needed until the app is notarized: the bundle is ad-hoc signed, and Gatekeeper
refuses a quarantined ad-hoc app. From then on the IDE updates itself: the daemon checks the signed
release manifest, downloads a newer build, and the window applies it once you have been idle for
half a minute. Apple silicon, macOS 14 or later. The zip below is the same bundle, for a hand
install.
