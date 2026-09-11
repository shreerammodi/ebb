# Changelog

This file documents all notable changes to Ebb.

This changelog uses the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format, and this project obeys [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-09-11

### Added

- **Extend an argument into the next speech for the same side.** Select one
  vertical run and press `Mod+E`, choose Extend to next speech from the command
  palette, or use the grid context menu. ebb copies the text, formatting, card
  data, groups, and CardMirror source into the matching later speech, shifts
  existing cells down instead of overwriting them, and leaves the source
  unchanged. One undo or redo reverses or restores the complete operation.
  Shared rounds replicate the extension as one structural edit, including
  rebasing local undo history around remote changes.

## [1.1.0] - 2026-09-02

### Added

- **Append mode: typing on a cell adds to it.** Typing on a selected cell
  used to open an empty editor, so the first character wiped whatever the
  cell held. With append mode on, the editor opens with the cell's own text
  and the caret past its end, so a debater amending an argument mid-round
  types straight onto it. Enter, F2 and a double click still open the full
  editor as before, and Left and Right still commit and move on. On by
  default; a switch in Settings turns it off.
- **New flow asks for a name.** After choosing the event, the New flow dialog
  offers a name field prefilled with the suggested filename and fully
  selected, so typing replaces it and Enter alone keeps it. Escape steps back
  to the event list instead of closing.
- **The sidebar is resizable.** Drag its edge, or focus the handle and use
  the arrow keys in steps of ten, Home and End for the narrowest and widest.
  The width is kept in the config file. As the sidebar narrows, the header
  hides the bulk count and shortens the side labels to a single letter so
  the collapse caret is never pushed out of view.
- **Ctrl/Meta+Arrow can be bound to a command.** The grid used to swallow
  all four chords with its Excel-style jump, so a binding never saw them.
  A bound chord now runs the command instead; unbound, the jump is
  unchanged. In a text box all four stay caret movement.

### Fixed

- **Selected text in inputs is readable under the dark theme.** Inputs
  painted selected text near-black over the violet tint; they now use the
  same translucent selection as the rest of the app.
- **The grid fills the pane on the first frame after a layout change.**
  Collapsing or resizing the sidebar, or toggling split view, painted one
  frame with the grid at its old width and bare pane background beside it.
- **The start screen's Join row no longer hydrates against a Settings row**
  in the desktop shell.
- **ebb no longer claims to run on macOS versions it cannot run on.** The
  bundle advertised support back to macOS 10.13 while the binary itself
  required macOS 11, so on an older Mac the Finder started the app and the
  loader then killed it: the icon bounced once in the Dock and nothing opened,
  with no message naming the reason. The bundle now states macOS 11, which is
  what it has always needed, so an unsupported Mac says so instead of failing
  silently.

## [1.0.0] - 2026-08-10

ebb's first stable release. A flow is a file on your own disk, the app is
keyboard-first from the start screen to the last cell, and two debaters can
flow one round together without a server of ours in the middle.

### Added

- **Select a range of sheets and move it.** Shift+click a sidebar row to paint
  the range from the sheet you are on to the one you clicked, and `Meta+{` and
  `Meta+}` slide the whole block one slot up or down. A 1NC that is nine off
  moves above the case in one gesture rather than nine drags. `Alt+[` and
  `Alt+]` build the range from the keyboard, growing it away from the sheet you
  started on and shrinking it back toward it, and they open a collapsed sidebar
  so the block is visible while you build it. Painting a range never changes
  which sheet the grid shows, so the speech being flowed stays on screen the
  whole time, and a move leaves the cursor exactly where it was. Dragging any
  row of the range drags all of it. With no range, the move chords act on the
  sheet you are on, so a single-sheet move needs no gesture first. The range
  ends whenever the sheet on screen changes - a plain click, stepping sheets, a
  numbered jump - so it never outlives the moment it was made for. Deleting a
  sheet still deletes only that row; there is no bulk delete, because erasing
  nine columns of a live round by a mistargeted click is a far worse failure
  than nine drags. Cross-examination is never in a range and is never
  displaced by one. Move Sheet Up and Move Sheet Down are in the View menu
  beside Next and Previous Sheet, and all four chords are in the `?` sheet.
- **Share a round with a code you can read out.** Invite partner opens a short
  menu with the two ways a round travels - a saved partner, or a code - each
  offered to edit or to view, so what a peer may do is named before anyone is
  dialled and never carried over from the last round. A code is eight
  characters on screen, in two groups; your partner types them into Join and
  the round opens on their machine. No invite to copy, and nothing to paste
  through another application. A view-only code keeps working for as long as
  the sheet is open, while a partner code is spent on the first person who
  uses it. Sharing lives beside the round now, on the sidebar next to the
  session corner, rather than in Settings, and the first time you share or
  join, ebb asks whether to turn sharing on. Settings keeps the switches.
  Joining is also on the start screen, on `j`, and in the File menu as Join
  Round, since someone arriving with a code has no round open to stand beside.
  The start screen's cursor moves on the arrow keys and `k`; `j` is Join.
- **Pairing works between two networks.** Both sides work out the same
  temporary address from the code, including which relay to meet at, so venue
  wifi on one side and a telephone hotspot on the other reach each other.
  There is still nothing published anywhere and no server of ours in the
  middle: the code travels between two people, and what crosses the connection
  is the same single-use invite as before.
- **Visually align speeches**, a switch under Settings > Display, off by
  default. On, every flow sheet lines up on the round's speaking order: a
  sheet that does not open the round leads with a greyed column for each
  speech it skips, labelled with that speech and inert - nothing can be typed
  there and the cursor does not enter it. A speech then holds one place on
  screen for the whole round, so moving between sheets no longer slides the
  columns sideways under the cursor, and it holds that place however far you
  have scrolled. A cross-examination sheet stays flush, since its columns are
  periods rather than speeches. Printing and exporting ignore the setting: a
  sheet's own columns are what reaches the page and the workbook. Off, a sheet
  still starts at its own side's first speech and gives up no width.
- **A Parliamentary flow template**, on `r` in the New flow menu. Five columns
  carry the six speeches - PM, LOC, MGC, Block, PMR - because the MOC and the
  LOR run back to back, so they share one column the way Policy's 2NC and 1NR
  do. A Parliamentary round is Gov and Opp throughout: the sidebar adds Gov and
  Opp sheets, the round header and the ballot read Gov and Opp, and the debater
  slots are PM, MG, LO, and MO, in the round and in an exported workbook. It
  opens with no cross-examination sheet, since a point of information
  interrupts a speech rather than taking a period of its own.
- A speech answers to the abbreviation its column header shows, in both the
  command palette and cell search, so "ns" reaches the Neg Summary and "mgc"
  the Member of the Government Constructive. Either speech folded into a Block
  reaches it too: "2nc" and "1nr" in Policy, "moc" and "lor" in Parliamentary.
  Parliamentary speeches also answer to the Policy-style numbering some
  debaters use for them, so "1ac" finds the Prime Minister, and to the
  Constructive name some circuits give the opening speech, so "pmc" finds it
  too. None of these names are displayed. The column header and the palette
  still read the one name the speech goes by.
- **Shared editing**, off by default under Settings > Collaboration. On, that
  pane grows a Session row: Share this round puts a one-time invite on screen
  to send however you already talk, Invite a partner dials a saved one, and
  Join with an invite takes one you were handed. The same four actions are in
  the command palette. The two of you flow one round together: every cell each
  of you writes reaches the other, the cell someone has an editor open on is
  marked so nobody types over it, and each of you keeps a real `.ebb` of your
  own, so a dead laptop or a dead network costs nothing. A partner can be
  invited to read the round rather than write to it. Switching it on does not
  connect you to anything. ebb goes to the network when you share a round or
  join one, and at no other time. Off, the app binds no endpoint, dials no
  peer, publishes no discovery record, and contacts no relay, which is a
  tested invariant rather than a promise.
- **Listen for invites**, a second switch under Settings > Collaboration, off
  by default. On, ebb holds an endpoint open until you close the app. A saved
  partner can then offer you a round while you have no round open. Off, they
  send you an invite instead. macOS asks for local network access the first
  time an endpoint opens, and Windows asks about the firewall. You see that
  question when you turn this on, rather than during a launch.
- **Contacts.** After a session, one click saves that partner, and inviting
  them again needs no link at all: pick them from Invite a saved partner and
  they get a corner message offering the round, with a Join that is theirs to
  press. Saving someone you are connected to saves you to them, so a pair only
  has to do it once between them and either of you can invite the other after
  that. Nobody you have not saved, and who has not saved you, can put anything
  on your screen. Saved partners are listed under Settings > Collaboration,
  where you can rename them or drop them.
- **What a partner may do is decided per flow, when you invite them.** Invite a
  saved partner offers Edit and View beside each name, with neither chosen for
  you, and the round remembers the answer: the same person can be writing one
  flow with you and reading another. A grant survives closing and reopening the
  file, and promoting someone mid-round sticks.
- **Show viewer cursors**, a switch under Settings > Collaboration, on by
  default. It marks the cell a view-only partner is looking at. Off hides
  those marks, leaving only the cells somebody is actually editing, which is
  the quieter grid when a coach is reading along.
- **Partners can be saved before the first round.** Settings > Collaboration
  shows Your ID, the one identity this install answers to, with a Copy beside
  it. Send it to a partner and they add you under Contacts by pasting it with
  a name. Two people on the way to a tournament can pair up on the bus and
  invite each other by name for the rest of the day. The ID is checked as you
  type it, opens nothing but a round you invite them to, and is the same one
  the app has always used, so nothing about an existing contact changes. ebb
  reads it from your own identity file rather than from a live connection, so
  it is there whether or not you are sharing.
- **Your name travels with the round you share.** A session carries what
  Settings > Collaboration calls Your name, so a partner sees "Rin" in the
  chip and on the toast that offers to save you, instead of eight characters
  of key. Left blank it is your machine's name, which is what most people
  would recognise anyway, and that hostname is never written to `config.toml`:
  the file syncs between machines, and a name baked in there would follow one
  laptop onto another. A name you have already saved for a partner always
  wins over the one they send, so nobody can rename themselves on your screen
  mid-round.
- A round remembers the partners it was shared with, so opening the file again
  reconnects to them silently, with no new invite.
- Closing a window says so to the partners in the round, so they see you leave
  at once instead of watching a connection that is already gone time out.
- The session chip in the bottom-left corner reports the connection and lists
  who is in the round, with a way to drop one peer or end the session.
- Right-clicking a cell that came in from CardMirror now offers "Jump to
  source" below the row items, so the jump is reachable without remembering
  its shortcut. It acts on the cell you clicked, which in split view can sit
  in the pane that does not hold the cursor. A cell you typed yourself, and
  every cell while the integration is switched off, shows the row items alone.

### Changed

- **Stepping between sheets moved onto the platform modifier: Cmd/Ctrl+[ and
  Cmd/Ctrl+]**, from the bare brackets. A bare key is text to a cell you are
  typing in, so the old chords only worked with the editor closed, which is
  not where a debater is mid-speech. The modifier carries them out of the
  editor, and the cell you were part-way through is kept on the sheet you left
  rather than dropped with the switch. A bracket you have rebound by hand
  stays yours; a config file still carrying the old default is read as the
  default it was, not as a choice.
- The round's date is the platform's own date field rather than a calendar that
  opened in a popover, so it takes a typed date, follows the date format the
  machine is set to, and reaches the keyboard the way every other field in the
  panel does. A date written as free text by a much older build is still in the
  file, but the field shows nothing until a date is picked, and picking one
  replaces it.
- **Nothing ends the app with an unwritten edit.** Quitting, closing the window,
  and installing an update all write the open flow first. If that write fails -
  a full disk, an ejected drive - the exit is cancelled and the round stays on
  screen instead of going down with the process. Closing a flow behaves the same
  way: it will not discard a round it could not save.
- Autosave now writes at least every two seconds during continuous editing.
  The debounce alone never fired while flowing a fast speech, because each cell
  reset it, so a crash could cost the whole burst rather than half a second.
- The first edit after Save As is saved. It was previously mistaken for a
  freshly opened file and skipped, so a single edit followed by closing the flow
  was lost with no error.
- A flow changed outside ebb - by a sync client, a backup tool, or another
  editor - is no longer silently overwritten. The header reports "Changed on
  disk" and offers to keep your version.
- **Flows are files now.** A flow is a `.ebb` file on your disk instead of a
  row in a browser database, so you can move, copy, rename, back up, and sync
  your rounds with everything else you own. New flows are filed in
  `~/Documents/ebb` and autosave there from the first keystroke, exactly as
  before. Save As puts one wherever you like. Writes are atomic - the file is
  written beside itself and moved into place - so a crash mid-round can cost
  the last half second, never the file. Flows already in ebb are moved into
  that folder automatically the first time you open this version, and the move
  reads every file back before it lets go of the old copy.
- **The dashboard is now a start screen.** No list of flows to manage: New
  flow, Open, and Settings, then the six flows you were last in, then links to
  the docs, the repo, and its author. Every row answers to one key - `n`, `o`,
  `j`, `s`, or `1` through `6` - with `k` and the arrows to walk them. The
  wordmark's caret blinks like the one on ebb.smodi.net.
- The File menu gained New Flow, Open, Join Round, Save, Save As, Show in
  Finder, and Close Flow, above the sheet items that were already there.
- Existing flows are no longer moved out of the old storage on their own. The
  first launch asks, shows where they would land, and lets you pick a different
  folder before anything is written. Declining leaves them untouched and asks
  again next time, so nothing is stranded.
- **Flows folder** is now a setting, under Settings > Editor. It decides where
  new flows are filed. Files already written stay where they are.
- Double-clicking a `.ebb` file opens it in ebb. macOS and Linux also know a
  flow is a kind of JSON, so Quick Look previews one and any text editor will
  open it. ebb stays the default. On Windows and Linux, opening a second flow
  focuses the window you already have rather than starting a rival copy.

### Removed

- Trash is gone, along with the `/trash` screen. Deleting a flow is deleting a
  file, which Finder and Explorer already do better, and their own trash
  already undoes it. Anything sitting in ebb's trash is moved to a `trash`
  subfolder of your flows folder rather than dropped.
- Import and Export all are gone. Each flow is already a file, so backing them
  up is copying the folder. Old `.json` exports still open, and a backup file
  full of rounds becomes one `.ebb` per round.
- "Export as JSON" is gone from the editor: a `.ebb` file already is the
  round's JSON, and Save As writes one anywhere you want. Excel export and the
  print view are unchanged.
- The dashboard's keytip overlay went with the dashboard, and `[keytips]` no
  longer appears in `config.toml`. The start screen shows each key beside the
  thing it does.
- A new flow no longer asks whether you are Aff, Neg, or the judge. The New
  flow menu now asks only for the event: Policy, Public Forum (with its
  first-speaker submenu), or Lincoln-Douglas. Every flow holds both sides, so
  the choice only decided which sheet opened first, and the first speech
  already decides that. Rounds you already have keep all of their sheets. The
  Aff/Neg/Judge pill is gone, and exported filenames drop the role segment
  (`debate-flow-20260725.xlsx`).

### Fixed

- **Joining a round with a code now connects it.** The round arrived and the
  file opened, but nothing after that was live: the flow sat there while your
  partner's edits went nowhere, and their attempt to reach you turned up in the
  corner as an invitation to the round already on your screen. Joining is you
  asking for a round to be live, so it no longer waits on "Listen for invites",
  and a round you join while it is already open connects where before nothing
  happened at all.
- **Shared editing no longer hands out an invite that cannot work.** An invite
  carries the relay a partner sends their first packet to, and ebb was minting
  one before that relay had answered: the invite looked correct, worked between
  two laptops on one wifi, and failed between venue wifi and a telephone
  hotspot. It also left the round with no route back to that partner, so
  reopening the flow later did not reconnect them. Sharing now waits for the
  connection to be ready and says so on the sheet if it cannot be, rather than
  handing over something that names nowhere.
- A partner parked on the first cell of a sheet's first column shows their
  initial there like anywhere else. The badge was a blank orange square:
  Handsontable gives that one cell, while it is empty, a spacer of its own
  drawn on the same corner, and it outranked the badge.
- **The session corner says who is missing and why.** It read "Connecting, no
  peers" whether a partner had not opened the round yet or could not be reached
  at all. It now names them - "Waiting for Sam to open this round", or "Can't
  reach Sam. You both need internet, or the same wifi." - and warns before
  making a code that turning Allow relay off keeps a round on one wifi.
- Mod+N opens a new window on an install that predates the change, instead of
  the New flow prompt. `config.toml` records every binding by name, so the
  chord's old owner stayed behind as an override and outranked the new one on
  every upgraded install. A binding that only restates a default the app has
  since moved is now read as the leftover it is and dropped.
- A shared round reaches a partner on another network. An invite carried the
  host's identity and no way to reach it, and the only lookup ebb runs answers
  across one room, so two laptops in the same building found each other and two
  on different networks did not: the join sat for ten seconds and then said it
  could not reach that peer. An invite now names the relay the host is on, and
  ebb remembers where each partner was last found, beside the round and beside
  the contact, so a reconnect and a saved partner work from anywhere too. That
  address travels in the invite you send by hand. Nothing about this install is
  published anywhere, and an idle ebb still says nothing about itself.
- The app no longer freezes while a shared session starts, dials, or ends.
  Every one of those waits on the network for seconds at a time, and each was
  run on the thread that draws the window, so clicking Share this round could
  leave the cursor spinning with nothing to click. A round that remembers
  several partners also dialled them one after another, spending each one's
  full timeout in turn; it now reaches all of them at once.
- Opening a flow you once shared no longer puts you back on the network. A
  `.ebb` remembers the partners it was shared with, and reopening it - from
  Finder, from a file association, from a second launch - reconnected to every
  one of them even with Listen for invites off, which is the switch that is
  supposed to decide whether ebb is reachable when you have not asked for it. A
  reopen asks for that switch now, so a round you shared in October does not
  put this laptop on the local network in March because you double-clicked it,
  and the macOS local network prompt arrives when you turn the switch on rather
  than during a launch.
- A partner cannot choose where a file lands on your disk. Joining a round
  built the new flow's filename out of the tournament and event names the host
  sent, and a host that sent a path instead of an event name could file that
  flow outside your flows folder, where it would keep autosaving. The name is
  cut down to a plain filename before anything is written, whichever way the
  flow is created.
- A nightly build says what it actually does. Its release notes claimed a
  nightly does not update itself. It does: it reads the same update feed a
  tagged build reads, so it offers you the next tagged release. What stays true
  is the other direction - a nightly is never served as an update to anyone.
- A link in an RFD renders as its text rather than as a link. A note is
  markdown, and a click on a link in one used to replace the whole flowing app
  with that page, taking an unsaved round with it - which a partner or a coach
  could put there as easily as you could. Links you paste for your own
  reference still read the same; they no longer navigate.
- The cell editor leaves what you type alone. The browser's own text assistance
  was live in it, so autocorrect rewrote debate shorthand, autocapitalize
  raised the first letter of a tag, and a red underline sat under most of a
  round's vocabulary. Autocorrect, autocapitalization, autocomplete, and
  spellcheck are all off in the editor now.

## [0.7.2] - 2026-07-25

### Added

- CardMirror can now ask your permission before another app writes into a
  document, and ebb identifies itself so that prompt names it. The choice you
  make there sticks: allow ebb once, allow it always, or deny it, and change
  your mind later under External apps in CardMirror's settings. While the
  prompt is waiting, ebb says it is waiting for approval rather than claiming
  the text went through. Approving finishes the send or jump that was already
  queued, so there is nothing to do again on this side. If you deny ebb, or
  turn off inbound inserts entirely, ebb says which of the two happened and
  stops there instead of retrying or reaching the document some other way. A
  CardMirror too old to ask keeps working exactly as before.

## [0.7.1] - 2026-07-25

### Added

- Settings then Editor now keeps the CardMirror integration in its own section,
  behind an "Enable CardMirror integration" switch. Switching it off turns away
  every inbound send from CardMirror, makes jump to source and send to
  CardMirror do nothing, and drops both from the shortcut list and the `?`
  cheatsheet. The integration stays on unless you turn it off, and it exists
  only in the desktop app: the web build has no CardMirror commands, no section
  in Settings, and answers nothing on the bridge.
- A cell that came in from CardMirror carries a teal rail down its left edge,
  the same rail a linked copy wears in CardMirror. A sheet shows at a glance
  which runs came from a document and which you typed yourself. The rail follows
  the cell's stored source, so it survives sheet switches, row shifts, undo, and
  an export and import. It does not print. Emptying a cell breaks its link and
  takes the rail with it. Editing the text keeps the link, the same way an
  edited linked copy stays linked in CardMirror.
- A CardMirror send can leave empty cells below itself, so consecutive sends
  read as separate cards instead of one continuous run. The count is a setting
  of the ebb plugin inside CardMirror (its gear in CardMirror's Settings then
  Plugins), not an ebb setting, and it travels with each send. Sends that name
  no count, including those from an older plugin, leave no empty cells.

### Fixed

- A cell you emptied kept the provenance of the text it used to hold. The stale
  link survived a save, so "Reveal in Flow" in CardMirror could select a blank
  cell, and text you typed into that cell later inherited a jump target it never
  earned. Emptying a cell now drops the link, and a sheet that carries a stale
  one from an earlier version drops it on the next save.
- A dashboard taller than the window had no way to reach its lower rounds. The
  dashboard now scrolls.

## [0.7.0] - 2026-07-24

### Added

- CardMirror integration (desktop only). ebb and CardMirror find each other
  through the shared `cardmirror-bridge` directory and talk over a loopback
  HTTP bridge that never leaves your machine.
    - Send to flow: with the ebb plugin installed in CardMirror, "Send to Flow
      (ebb)" writes the headings, tags, cites and analytics under your cursor
      into the active sheet at the active cell. Pocket, hat and block headings
      land bold, tags land as cards, and a cite rides as a second line inside
      the tag's cell. The write respects your insert-paste setting, and one Undo
      takes the whole send back.
    - Jump to source in CardMirror (`Meta+e` / `Ctrl+e`): on a cell that came
      from a document, CardMirror scrolls to the card it came from and selects
      it. A cell you typed yourself says so instead.
    - Send to CardMirror (`Meta+Shift+e` / `Ctrl+Shift+e`): pushes the selected
      cells into the document open in CardMirror, joined as paragraphs. Settings
      then Editor picks the role ebb tags the text with (card body, cite, or
      inline). CardMirror decides how to type it from there.
    - Reveal in flow: CardMirror's "Reveal in Flow (ebb)" finds every cell a
      card produced, activates that sheet, selects the cell, and steps to the
      next match each time you run it.
    - Where a cell came from travels with it: sheet switches, cell inserts,
      insert-paste displacement, undo, redo, and export or import of a flow file
      all keep it attached to its text.

## [0.6.1] - 2026-07-24

### Changed

- The desktop app writes its name in lowercase everywhere it shows: the window
  title, the application menu, and the name of every installer file. The macOS
  bundle is `ebb.app`, and an installer is `ebb_0.6.1_x64-setup.exe`. An
  existing install keeps the name it was installed under until you install the
  new version.

## [0.6.0] - 2026-07-24

### Added

- Excel-style KeyTips on the dashboard. Push `f` to paint the key for each
  control, then push a key to fire it: `n` new flow, `i` import, `e` export,
  `t` trash, `s` search, `,` settings, and `?` shortcuts. `l` focuses the flow
  list for arrow-key navigation, where Up and Down move a full grid row, and
  reveals `s` (sort) and `t` (group by tournament). The new-flow menu paints a
  key for each flow type, including the Public Forum first-speaker submenu.
  Escape steps back one level. Every key is configurable in `config.toml` under
  the `[keytips]` table.
- Mod+F focuses the dashboard search field. Escape leaves the field and re-arms
  the KeyTips.

### Changed

- Write the flow font in `config.toml` as its real name ("DM Sans", "IBM Plex
  Sans") instead of Ebb's internal id. Hand-edited names are matched
  case-insensitively, and older files that stored the id still load.

### Fixed

- Renaming a sheet, whether from the rename command or by clicking its title in
  the sidebar, returns keyboard focus to the grid on commit, so the next
  keystroke edits the flow instead of falling on the page body.

## [0.5.2] - 2026-07-20

### Added

- A Lincoln-Douglas flow template. Create an aff, neg, or judge flow with the
  1AC, 1NC, 1AR, 2NR, and 2AR speeches and their cross-examination periods.

### Fixed

- The desktop window no longer enforces a minimum width, so it can shrink to
  match the narrow-window dashboard layout.

## [0.5.1] - 2026-07-19

### Added

- Record a flight alongside the round. The flight shows in the flow's info
  panel and next to the round on its dashboard card.
- The round date is a calendar picker, not a plain text field.

### Changed

- The dashboard prepares the flow editor while idle. The first flow you open
  then loads its grid from cache. It does not fetch and parse the grid on open.
- On narrow windows, the dashboard menu bar shows its buttons as icons and
  removes the brand logo. The controls then stay visible and do not overlap.
- The dashboard's Settings and Info buttons swap order, and the
  keyboard-shortcuts button uses a question icon to match its help role.

### Fixed

- Opening a flow no longer flashes an empty black grid before the cells
  appear. The grid stays hidden until its first data load completes, then
  shows fully drawn.

## [0.5.0] - 2026-07-18

### Added

- Public Forum rounds. Choose which side speaks first when you create one, and
  flow its cross-examination on a dedicated sheet. The "Swap speaking order"
  palette command changes the speaking order at any time.
- Palette search understands sheet and column context: "2ac warming" finds
  warming answers in the 2AC column, ranked below direct text matches.
- A Display setting to turn off tooltips. Hover hints show by default. The
  toggle hides them everywhere.
- Jumping to a search result now briefly flashes the target cell in the
  selection violet. The eye then finds the cursor after the viewport
  teleports.

### Changed

- Excel export is rebuilt: each sheet exports with its cell styling intact,
  alongside Info and RFD worksheets. The app no longer ships a bundled
  spreadsheet template.
- Palette matching is order-independent ("da warming" finds "Warming DA") and
  ranks results by how directly they match: exact, then prefix, then
  word-start, then substring anywhere.
- Search palette redesign: single-line result rows with a column badge in
  aff/neg ink and the sheet name on the right. A key-hint strip sits under the
  results, and long lists page behind a "show more" row. The bar shows a brief
  violet pulse as it opens. Matched-character bolding is gone in favor of
  calmer plain-text rows.
- The search palette opens and closes instantly with no animation.
- Dialogs, menus, tooltips, and the flow detail drawer share one easing curve
  with quicker, consistent timings (exits slightly faster than entrances).
  Their movement now respects the system reduced-motion preference.

### Fixed

- "Rename active sheet" no longer does nothing when the sidebar is collapsed.
  The command opens the sidebar first so there is a row to edit.
- "Rename active sheet" now renames the sheet in the focused pane. In split
  view, running it while Tab 2 is focused renamed Tab 1's sheet.

## [0.4.1] - 2026-07-16

### Added

- A Display setting to turn off scroll-to-zoom. Mod+scroll and trackpad pinch
  zoom the flow grid by default. The toggle disables that gesture.

### Fixed

- Shift+Tab in the first grid column keeps the cursor in the grid and does not
  yield focus to the sidebar.

### Removed

- Move mode no longer follows the mouse. Picking up a block and dropping it is
  keyboard-driven (Up/Down/Enter) as before.

## [0.4.0] - 2026-07-16

### Added

- Zoom the flow grid. Minus/plus buttons around a slider, a click-to-edit
  percentage field, Mod+scroll over the grid, and "Zoom in"/"Zoom out"
  command-palette commands all scroll in 10% steps. Settings gains a "Default
  zoom" that the grid opens at, synced to the desktop config file.
- Move mode follows the mouse: the picked-up block tracks the hovered row and a
  click releases it, mirroring the keyboard Up/Down/Enter path.

### Removed

- Tournament Mode. Each update waits for you to press "Install latest update",
  so a separate switch to pin the version was redundant. Updates install only
  when you confirm.

## [0.3.8] - 2026-07-15

### Added

- The Updates settings pane has a single "Install latest update" button. It is
  greyed, with an "already on the latest version" tooltip, until the app
  downloads a newer version. It then turns green and is one click from
  installing and relaunching. You get to that state by letting checks run
  automatically or by pressing "Check for updates".

### Fixed

- The "update downloaded" chip now appears on all screens - the dashboard and
  trash as well as an open flow - not only while a flow is open.

## [0.3.7] - 2026-07-15

### Fixed

- Reordering sheets by drag-and-drop now works in the desktop app. The
  window's OS-level drag-drop handler no longer swallows the in-app drop.
- The sidebar now accepts a sheet drop anywhere in the sheet list - between
  rows, on the section label, or below the last row. Before, only a drop
  directly on a row worked.

## [0.3.6] - 2026-07-15

### Changed

- Desktop updates ask before installing. A check downloads the new version, but
  only rewrites the install on disk when you confirm. You confirm from the
  update chip (now labelled "Update x.y.z - Install") or the critical-update
  modal. A repeat check skips re-downloading a staged version.
- The manual "Check for updates" button reports its outcome (up to date, or a
  check, download, or install failure). It no longer goes idle silently.

### Fixed

- A fast drag-and-drop of a sheet in the sidebar now reorders it. A quick drag
  then drop no longer bails out reading stale drag state.
- The settings panel keeps a stable size while navigating between its
  categories.

## [0.3.5] - 2026-07-15

### Added

- Rename a sheet straight from the pane title bar. Click anywhere in the title
  strip to edit its name in place, the same rename the sidebar offers.
- A bulk-add field in the sidebar sets how many rows to add at once, matching
  the Excel-template flow.

### Changed

- The keyboard-shortcuts button moves next to Settings in the round header and
  shows a help icon to match it. The cheatsheet footer links to the docs site.
- Add-sheet buttons are identified by color.
- The round header removes its Import button. Importing a flow lives on the
  dashboard, not inside an open round.
- Switching sheets is faster.
- The settings panel is laid out as divided rows with the control on the right,
  and its sidebar gains an icon per category.
- Focus rings on inputs, selects, buttons, and toggles are a single thin violet
  border, not a thick glowing halo.

### Fixed

- The round header stays readable when the window is narrow. The left and right
  groups no longer overlap, and the autosave label shows only its icon below
  the small breakpoint.
- The bulk-add field keeps its rounded shape on focus and hides its placeholder,
  so the caret no longer cuts through the digit.
- On Windows and Linux, the window close button now quits the app. The close
  guard is macOS-only. It keeps a round from being lost to an accidental close,
  and matches that platform's close-is-not-quit norm.

## [0.3.4] - 2026-07-13

### Fixed

- Auto-update and the manual "Check for updates" button work again on the
  desktop app. The update check read the release manifest with a webview fetch.
  GitHub's release CDN sends no CORS headers, so it blocked the cross-origin
  read and each check failed silently. The manifest now loads through the
  updater plugin, which fetches it outside the webview. Existing 0.3.3 and
  earlier installs cannot self-update to this fix. Install 0.3.4 manually once,
  and automatic updates resume from there.

## [0.3.3] - 2026-07-13

### Changed

- Desktop menu shortcuts are real native accelerators: they right-align in
  the macOS shortcut column, and they follow custom keybindings set in
  Settings.

## [0.3.2] - 2026-07-10

### Fixed

- Opening Settings > Updates on the desktop no longer replaces the full app
  with a "This page couldn't load" error. The Updates pane reads the update
  context, but the settings panel mounted outside its provider. Rendering it
  threw, and Next's root error boundary replaced the app.
- Reload the desktop app on a flow or trash page and it comes back, with no
  WKWebView "This page couldn't load" error. The static export now emits an
  index.html for each route so a bare-path load (such as the reload after an
  update relaunch) resolves in Tauri's asset server.

## [0.3.1] - 2026-07-10

### Fixed

- Check for updates again. GitHub moved release-asset downloads to a new host.
  The desktop app's content-security-policy did not allow that host, so the
  update check failed silently. The policy now allows GitHub's user-content
  hosts.

## [0.3.0] - 2026-07-10

### Added

- Insert a cell below the selection with Meta+Alt+o (Ctrl+Alt+o elsewhere).
- An "Insert paste" setting under Editor > Paste. With it on, pasting pushes the
  text in the target columns down and does not write over it. Neighboring
  speeches keep their rows.
- Move cells with Meta+Shift+m (Ctrl+Shift+m elsewhere). Up and Down nudge the
  selected cells along their column, and the cells they pass over flow around
  them. Meta/Ctrl with them puts the block against the next filled cell. Enter
  commits the full move as one undo step, and Esc puts everything back.
- Show the installed version and platform in Settings > Updates.

### Changed

- Open Settings with its chord from any screen, not just the dashboard and a
  flow.
- Read the flow library once per session, not on each dashboard visit.
  Returning from a flow, or refreshing after a rename or delete, no longer
  reloads all rounds.
- Scroll and edit the grid without rebuilding each column's styling for all
  visible cells on each frame.
- Show placeholder cards, not a blank screen, while Trash loads.

### Fixed

- Undo a cell insert and its decorations come back with its text. The bold or
  highlight no longer stays a row down from the cell it belongs to.

## [0.2.2] - 2026-07-08

### Added

- Bulk-add sheets from the ribbon and the command palette.
- Enumerate default sheet names per-side.

### Changed

- Group the keybindings in `config.toml` into nested `[keymap.*]` tables, not
  quoted dotted keys. Ebb continues to read files from earlier versions, and
  migrates them to the new layout on the next settings change.
- Make the empty-state Judge a peer button inline with Aff/Neg.

### Fixed

- Create and source `config.toml` on launch even when no flow is open, so a
  fresh install no longer skips it until the first flow is opened.

## [0.2.1] - 2026-07-08

### Fixed

- Hoist the update provider so the Updates settings tab cannot crash.

## [0.2.0] - 2026-07-08

### Added

- Export through the native Save As picker, not a forced download.
- Ship the full default keymap and each configurable command in
  `config.toml`.

### Changed

- Split the in-app guide into a keyboard-shortcut sheet plus external docs.
- Build a single macOS universal binary.

### Fixed

- Stop the Close tooltip from auto-popping when a dialog opens.
- Show Cmd+Arrows for jump-to-edge on Mac in the guide.
- Right-align menu chord hints against a shared column.

## [0.1.1] - 2026-07-07

### Changed

- Ad-hoc sign macOS builds and document the Gatekeeper quarantine bypass.
- Ship AppImage only on Linux. Remove Flatpak distribution.

## [0.1.0] - 2026-07-07

### Added

- Initial tagged release.

[Unreleased]: https://github.com/shreerammodi/ebb/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/shreerammodi/ebb/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/shreerammodi/ebb/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/shreerammodi/ebb/compare/v0.7.2...v1.0.0
[0.7.2]: https://github.com/shreerammodi/ebb/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/shreerammodi/ebb/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/shreerammodi/ebb/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/shreerammodi/ebb/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/shreerammodi/ebb/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/shreerammodi/ebb/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/shreerammodi/ebb/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/shreerammodi/ebb/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/shreerammodi/ebb/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/shreerammodi/ebb/compare/v0.3.8...v0.4.0
[0.3.8]: https://github.com/shreerammodi/ebb/compare/v0.3.7...v0.3.8
[0.3.7]: https://github.com/shreerammodi/ebb/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/shreerammodi/ebb/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/shreerammodi/ebb/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/shreerammodi/ebb/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/shreerammodi/ebb/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/shreerammodi/ebb/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/shreerammodi/ebb/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/shreerammodi/ebb/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/shreerammodi/ebb/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/shreerammodi/ebb/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/shreerammodi/ebb/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/shreerammodi/ebb/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/shreerammodi/ebb/releases/tag/v0.1.0
