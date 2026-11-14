# Quietgram

Instagram on your iPhone without the Reels tab, suggested posts, suggested accounts or ads.
Reels that people send you in DMs still open.

It works the same way Socialite, Dull and similar apps do: the app is a full-screen web view
showing instagram.com, and a script (`Web/filter.js`) removes the parts you don't want before
you see them. You log in to Instagram's own site inside the app; nothing goes anywhere else.

## Build and install (Windows, free Apple ID)

You can't compile an iOS app on Windows, so GitHub builds it for you.

1. Create a new repository on github.com and upload everything in this folder, including the
   `.github` folder. A public repository gets free build minutes; a private one draws on a
   limited monthly allowance.
2. Open the repository's **Actions** tab. The "Build IPA" workflow runs on each push (or press
   **Run workflow**). It takes a few minutes.
3. Open the finished run, download the **Quietgram-ipa** artifact and unzip it to get
   `Quietgram.ipa`.
4. On Windows, install iTunes and iCloud from Apple's website (not the Microsoft Store
   versions), then install Sideloadly.
5. Plug in the iPhone, drag `Quietgram.ipa` into Sideloadly, enter your Apple ID and press Start.
6. On the phone: Settings > General > VPN & Device Management, trust your Apple ID. If iOS asks,
   also turn on Settings > Privacy & Security > Developer Mode.

With a free Apple ID the app stops opening after 7 days and has to be re-signed. Sideloadly can
refresh it automatically while the phone and laptop are on the same Wi-Fi. A paid developer
account stretches that to a year.

## Tuning

All rules are in `Web/filter.js`:

- `CONFIG` switches each rule on or off.
- `TEXT` lists the labels the filter looks for ("Suggested for you", "Sponsored", "Follow",
  "You're all caught up"). They are matched exactly, so **if your Instagram isn't in English or
  French, add your language's wording here** or the feed rules won't fire.

Edit, push to GitHub, download the new IPA, re-install over the old one. You stay logged in.

## What each rule does

| Rule | Behaviour |
| --- | --- |
| `blockReelsTab` | Hides the Reels tab; opening `/reels/` sends you back to the feed. |
| `lockSingleReels` | A reel opened from a DM or a profile plays, but moving on to the next reel sends you back where you came from. |
| `blockExploreGrid` | The Explore page keeps search and loses the recommended grid. |
| `hideSuggestedPosts`, `hideUnfollowedPosts` | Removes feed posts labelled as suggested, or that show a Follow button. |
| `hideSponsored` | Removes feed ads. |
| `hideSuggestedAccounts` | Removes "Suggested for you" account carousels. |
| `hideAfterCaughtUp` | Ends the feed at "You're all caught up". |

## Limits

- No push notifications: web views can't receive Instagram's. Keep the official app for those
  and for posting.
- Instagram's mobile site lacks a few things the official app has (some story tools, Notes).
- Instagram changes its pages regularly. When something reappears, it is a `filter.js` fix.

## Testing the filter

`cd test && npm install jsdom && node filter.test.js` runs the rules against sample pages.
