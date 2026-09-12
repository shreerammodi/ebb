//! The iroh endpoint behind the PeerLink port.
//!
//! Everything about what the peers say to each other lives in TypeScript and
//! is proven against an in-memory transport. This module only carries bytes:
//! it binds an endpoint, accepts and dials connections on one ALPN, and moves
//! newline-delimited JSON in both directions.
//!
//! The endpoint is built from `presets::Minimal`, never `presets::N0`. N0 adds
//! a Pkarr publisher and a DNS lookup pointed at n0.computer, which would
//! publish this install to a public registry on every launch. Minimal sets the
//! crypto provider and nothing else. The DNS and DHT lookup crates are linked
//! in regardless, because iroh depends on them unconditionally; what keeps them
//! dark is that nothing here registers one, which `preset_guard` holds in
//! place. Port mapping is off too, so nothing asks the router for an inbound
//! hole and nothing probes for a gateway by multicast.
//!
//! What a bound endpoint does say about itself is its EndpointId to every
//! device on the local network, whenever mDNS is asked for. That is a
//! same-room announcement rather than a registry entry, and it is bounded by
//! the bind: no endpoint, nothing announced.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use iroh::endpoint::{presets, Connection, PortmapperConfig, TransportAddrUsage};
use iroh::{Endpoint, EndpointAddr, EndpointId, RelayMode, RelayUrl, SecretKey, TransportAddr};
use iroh_mdns_address_lookup::MdnsAddressLookup;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::sync::mpsc;
use tokio::time::timeout;

/// One round's worth of protocol. Bumped only for a change an older build
/// cannot read, which the handshake refuses by version rather than by parse.
pub const ALPN: &[u8] = b"ebb/flow/1";

/// The most one line of wire JSON may be. A connection is read from the moment
/// `accept_bi` returns, which is before the handshake has admitted anyone, so
/// this is the only thing bounding what a peer that merely opened the ALPN can
/// make this process allocate. The cap is the loopback bridge's, which is the
/// standard a peer link is held to.
const MAX_LINE: usize = 4 * 1024 * 1024;

/// The most connections one endpoint holds at once, counting both the ones it
/// has taken a line from and the ones still finishing a handshake.
///
/// A dial that has not been admitted anywhere still costs a QUIC connection and
/// a task, and admission is decided above this module from a line this module
/// has to read first, so the wait is real time a stranger can buy. A round is a
/// partner, a few guests and a coach; anything near this number is not a debate.
/// `Pending` is what makes the count cover a handshake that has produced no line
/// and so has no map entry to be counted by.
const MAX_CONNS: usize = 32;

/// One in-flight connection, counted from the moment the accept loop hands it
/// to a task until that task ends.
///
/// The map alone cannot bound what a stranger spends: an entry appears only
/// once the peer has opened its stream and sent a line, so a dialler that
/// completes the handshake and then says nothing is invisible to a count of the
/// map, and holds a connection and a task for the whole hello deadline. Only
/// dial rate would bound those.
struct Pending(Arc<AtomicUsize>);

impl Drop for Pending {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Relaxed);
    }
}

/// How long a connection has to open its stream and finish its first line.
///
/// The dialling side speaks first, so a connection that has completed the
/// handshake and produced no complete line by then is not a guest. Without a
/// deadline it holds two tasks and a map entry for the life of the process:
/// nothing above this module ever hears a message from it, so nothing there
/// ever closes it.
const HELLO_DEADLINE: Duration = Duration::from_secs(10);

/// How long a dial waits for a peer to answer, and then for stream credit.
///
/// iroh's own connect takes up to ten seconds when it has no reachable address
/// to try, and a peer that advertises no bidirectional streams withholds
/// credit for as long as it likes, so both waits are bounded and not only the
/// first.
const DIAL_DEADLINE: Duration = Duration::from_secs(15);

/// How many lines may wait for one peer before the host stops queueing for it.
///
/// A peer that stops reading its own stream stalls the writer on QUIC flow
/// control, and in a star topology the host relays every guest's delta to
/// every guest, so an unbounded queue in front of a stalled peer is memory
/// that peer chooses the size of. A dropped line costs that peer its place in
/// the round, which the CRDT resyncs; a queue with no ceiling costs the round.
const OUTBOUND_QUEUE: usize = 256;

/// How long a hang-up gives the writer to put what is already queued on the
/// wire before the connection goes down under it.
///
/// `collab_send` returns once a line is on the queue the writer drains, so a
/// line handed over immediately before a hang-up is still sitting in that
/// queue: the round's farewell is exactly such a line, and a peer told
/// nothing sees a socket vanish instead of a partner leaving. The wait is
/// bounded because the only thing that can hold it is a peer stalling the
/// writer on flow control, and that peer must not decide when this window
/// gets to exit. The shell gives a closing window three seconds to flush
/// (`shutdown::FLUSH_TIMEOUT`), and this stays well inside it.
const HANG_UP_GRACE: Duration = Duration::from_millis(250);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PeerEvent {
    conn_id: String,
    endpoint_id: String,
    connection_type: String,
    /// The relay this peer is homed on, when the path runs through one. What
    /// makes a peer dialable again from another network: an EndpointId alone
    /// is a name, and mDNS only answers for it across one room.
    relay_url: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageEvent {
    conn_id: String,
    payload: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClosedEvent {
    conn_id: String,
    /// Why the connection ended, as QUIC saw it: timed out, closed by the
    /// peer, reset, or ended here. Every one of those looks the same to a
    /// webview that only hears "closed", and they point at different
    /// failures - an idle timeout on a relayed path is a relay that went
    /// away, on a direct one a NAT mapping that expired.
    reason: String,
    /// The path as last observed, beside the reason, because the reason
    /// alone does not say which path it was on when it went.
    connection_type: String,
    relay_url: Option<String>,
}

/// One thing that happened on a connection, on its way to the webview.
enum Event {
    Peer(PeerEvent),
    Message(MessageEvent),
    /// A peer that arrived on the temporary endpoint a pairing code named.
    /// Its own channel, because a session's listener would read one as a guest
    /// arriving with no hello and hang up on it.
    PairPeer(PeerEvent),
    Closed(ClosedEvent),
}

/// Where those events go. The `AppHandle` is the one that ships; the seam is
/// what lets the pump be driven with no window in front of it.
trait Events: Send + Sync + 'static {
    /// Delivers one event to the window that owns the connection, or to every
    /// window when nothing owns it yet.
    fn emit(&self, to: Option<&str>, event: Event);
}

impl Events for AppHandle {
    fn emit(&self, to: Option<&str>, event: Event) {
        // A connection belongs to the window that dialled it or admitted it,
        // so the label travels with the connection instead of being guessed
        // per event. The focused window is not the owning one whenever the
        // debater is looking elsewhere, and a helloAck delivered to the wrong
        // window is a session that never finishes coming up.
        //
        // An accepted connection has no owner yet, which is why the None arm
        // is a broadcast and not a leak: which round the connection is for
        // arrives in its hello, which is read above this module, so every
        // window hears about it and each discards what its own connection id
        // filter does not recognise. The first window to write to it is the
        // one that answered, and from then on it is named.
        let _ = match (to, event) {
            (Some(w), Event::Peer(e)) => Emitter::emit_to(self, w, "collab:peer", e),
            (Some(w), Event::Message(e)) => Emitter::emit_to(self, w, "collab:message", e),
            (Some(w), Event::Closed(e)) => Emitter::emit_to(self, w, "collab:closed", e),
            (None, Event::Peer(e)) => Emitter::emit(self, "collab:peer", e),
            (None, Event::Message(e)) => Emitter::emit(self, "collab:message", e),
            (None, Event::Closed(e)) => Emitter::emit(self, "collab:closed", e),
            (Some(w), Event::PairPeer(e)) => Emitter::emit_to(self, w, "collab:pair", e),
            (None, Event::PairPeer(e)) => Emitter::emit(self, "collab:pair", e),
        };
    }
}

/// What a dial hands back. The path rides along rather than arriving as an
/// event, so the caller never has to correlate the two.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DialResult {
    conn_id: String,
    connection_type: String,
    relay_url: Option<String>,
}

/// One live connection: what to write to it, everything that has to go when it
/// closes, and which window it answers to.
struct Conn {
    tx: mpsc::Sender<String>,
    conn: Connection,
    writer: tokio::task::JoinHandle<()>,
    /// The window this connection's events go to, and the only window that may
    /// write to it or hang up on it. A dial knows its window from the call that
    /// made it. An accepted connection has none until a window claims it,
    /// because the round it belongs to is not knowable here; while it has none
    /// any window may answer it and any window may hang up on it, which is what
    /// a refusal is.
    owner: Option<String>,
    /// The windows that refused this connection while nobody owned it. A
    /// refusal is one window's answer and the hang-up waits for all of them,
    /// since the window that admits the peer answers in the same instant.
    refused: Vec<String>,
}

impl Conn {
    /// Ends the connection for real, once what is already queued has gone
    /// out. Dropping the sender only stops the writer: the QUIC connection and
    /// the reader outlive it, so a peer the host refused would hold its
    /// connection and keep pumping messages into the webview until it chose to
    /// hang up.
    ///
    /// The order is what makes a farewell survive. Dropping the sender ends
    /// the writer's queue rather than the writer, so everything already on it
    /// is written and the stream is finished; only then does the connection
    /// go. Closing first, or aborting the writer, discards whatever
    /// `collab_send` handed over in the moments before the hang-up - which is
    /// where a round's last message always sits.
    ///
    /// The reader is not held at all. Closing the connection is what wakes it,
    /// and it is the only thing that reports the close upward, so aborting it
    /// would be a race: win it and the webview is never told the peer went
    /// away, and the chip reads connected over a connection that is gone.
    async fn hang_up(self) {
        let Conn {
            tx,
            conn,
            mut writer,
            ..
        } = self;
        drop(tx);
        // A peer that has stopped reading stalls the writer on flow control
        // for as long as it likes, and a window's exit is not its to hold.
        if timeout(HANG_UP_GRACE, &mut writer).await.is_err() {
            writer.abort();
        }
        conn.close(0u32.into(), b"closed");
    }
}

/// The temporary endpoint one pairing code names.
///
/// A second endpoint rather than a second identity on the first: it is bound
/// with a key anybody holding the code can compute, and it homes on the one
/// relay that code picked. The install's real endpoint keeps its own key and
/// its own relay, and nothing about it changes for a pairing.
struct Pair {
    endpoint: Endpoint,
    endpoint_id: String,
    accept: tokio::task::JoinHandle<()>,
}

struct Live {
    runtime: Arc<tokio::runtime::Runtime>,
    endpoint: Endpoint,
    endpoint_id: String,
    conns: Arc<Mutex<HashMap<String, Conn>>>,
    accept: tokio::task::JoinHandle<()>,
    /// The hang-ups still draining, one per peer a window let go of and did
    /// not outlast. A hang-up flushes on the runtime rather than in the call
    /// that asked for it, so a `stop` landing in that moment would close the
    /// endpoint over a farewell halfway to the wire; `shutdown` waits on
    /// these first. Finished handles are pruned as new ones arrive, so a long
    /// round does not accumulate one per peer it ever hung up on.
    closing: Mutex<Vec<tokio::task::JoinHandle<()>>>,
    /// What this endpoint was bound with. A later holder asking for different
    /// network settings is refused rather than quietly run on these: a debater
    /// who turned relaying off for one round would otherwise be relayed by
    /// whatever another window bound first.
    relay: bool,
    mdns: bool,
    /// The pairing endpoint on the air right now, if there is one. At most
    /// one: a second code replaces the first, because two codes for one round
    /// is two endpoints held open for a debater who only sees the newer.
    pair: Option<Pair>,
    /// One entry per window holding this endpoint, and how many times that
    /// window took it. Two PeerLinks overlap by design - the idle invite
    /// listener and a round's session - and they share one bind, so the
    /// identity and the accept loop survive either of them stopping and only
    /// the last one out closes it.
    ///
    /// Keyed by window rather than counted, so a caller that never started
    /// cannot release a share it does not hold. The label arrives with the
    /// call from Tauri, not from the webview, which is what makes it a bound
    /// and not a convention.
    holders: HashMap<String, usize>,
}

pub struct CollabState {
    live: Mutex<Option<Live>>,
    /// The three deadlines, as fields rather than as the constants they are set
    /// from, so the suite can prove they fire without waiting out a real one.
    hello: Duration,
    dial: Duration,
    pair_online: Duration,
}

impl Default for CollabState {
    fn default() -> Self {
        Self {
            live: Mutex::new(None),
            hello: HELLO_DEADLINE,
            dial: DIAL_DEADLINE,
            pair_online: PAIR_ONLINE_DEADLINE,
        }
    }
}

fn relay_mode(relay: bool) -> RelayMode {
    // Off restricts a session to links the two machines can make themselves.
    if relay {
        RelayMode::Default
    } else {
        RelayMode::Disabled
    }
}

/// The identity file, kept beside the config file.
fn identity_path() -> Option<PathBuf> {
    crate::config::config_dir().map(|dir| dir.join("identity.key"))
}

/// This install's long-lived secret key, minted on first use.
///
/// Saved contacts and a host's known-peer list are keyed by EndpointId, which
/// is this key's public half, so a key drawn fresh on every bind would turn a
/// saved partner back into a stranger after a restart.
///
/// None means the key could not be stored, which a read-only config directory
/// is enough to cause. That is not fatal: the endpoint mints its own and the
/// session runs on an identity that lasts one process.
fn load_or_create_secret_key() -> Option<SecretKey> {
    secret_key_at(&identity_path()?)
}

fn secret_key_at(path: &Path) -> Option<SecretKey> {
    match std::fs::read(path) {
        Ok(bytes) => {
            let stored = std::str::from_utf8(&bytes)
                .ok()
                .and_then(|text| decode_hex(text.trim()));
            if let Some(bytes) = stored {
                return Some(SecretKey::from_bytes(&bytes));
            }
        }
        // A file that is there and cannot be read is a key this run cannot
        // reach, not a key that is gone. Minting over it would retire the
        // identity every peer saved as a contact, permanently, over something
        // as transient as a lock or a mode bit - so this run goes without one
        // and the next run that can read the file has it back.
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return None,
        Err(_) => {}
    }
    // Nothing there, or something that read fine and is not a key. Neither can
    // be recovered, so a new one takes its place.
    let key = SecretKey::generate();
    write_identity(path, &encode_hex(&key.to_bytes())).ok()?;
    Some(key)
}

/// Writes the key where only this account can read it, through a temp file in
/// the same directory that is synced and then renamed over the target.
///
/// Anyone holding these bytes can present themselves as this install to a
/// saved contact, so the mode is set as the file is created rather than once
/// it already holds the key. The rename is what makes the replacement atomic:
/// a truncating write interrupted halfway leaves a file that reads back as
/// junk, which costs the install the identity its peers have saved.
fn write_identity(path: &Path, hex: &str) -> std::io::Result<()> {
    let dir = path.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "the key has no directory")
    })?;
    std::fs::create_dir_all(dir)?;
    let name = path.file_name().and_then(|n| n.to_str()).ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "the key has no filename")
    })?;

    // A leftover temp file from a crashed run may be a symlink someone with
    // write access to this directory planted, and the write below must not
    // land on whatever it points at. Removing the link drops the link and not
    // its target; the exclusive create is what closes the gap between the two.
    let tmp = dir.join(format!(".{name}.tmp"));
    let _ = std::fs::remove_file(&tmp);
    if let Err(e) = write_private(&tmp, hex.as_bytes()) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    if let Err(e) = std::fs::rename(&tmp, path) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    Ok(())
}

/// Creates a file this account alone can read, and makes its bytes durable
/// before anything renames them into place.
///
/// The create is exclusive: a path that already exists is refused rather than
/// opened, so a symlink standing where this file goes costs the write and not
/// whatever the link points at. Losing the write loses the key, which the
/// caller already treats as survivable; following the link would truncate,
/// rewrite and re-mode a file this account owns and never meant to touch.
fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;

    #[cfg(unix)]
    let mut file = {
        use std::os::unix::fs::OpenOptionsExt;
        // The mode is set as the file is created rather than once it already
        // holds the key: anyone holding these bytes can present themselves as
        // this install to a saved contact.
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(path)?
    };
    // ponytail: no ACL on Windows. Restricting the file there means building a
    // DACL and calling SetNamedSecurityInfoW, which lives in windows-sys - not
    // a dependency of this crate, and not one worth adding for a single file,
    // because %APPDATA% is per-user and already keeps other accounts out. What
    // is missing is protection from another process running as this same user,
    // which is the residual the loopback bridge's session token carries too.
    #[cfg(not(unix))]
    let mut file = std::fs::File::create_new(path)?;

    file.write_all(bytes)?;
    file.sync_all()
}

pub(crate) fn encode_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut out, byte| {
            let _ = write!(out, "{byte:02x}");
            out
        })
}

/// A connection id the webview cannot guess.
///
/// The id crosses the IPC boundary and names a connection a window may write
/// to, so a counter would let a script reach a link it was never told about by
/// naming `c1`. Sixteen random bytes is not a secret worth storing anywhere; it
/// is simply not enumerable.
fn new_conn_id() -> String {
    encode_hex(&rand::random::<[u8; 16]>())
}

fn decode_hex(text: &str) -> Option<[u8; 32]> {
    if text.len() != 64 {
        return None;
    }
    let mut bytes = [0u8; 32];
    for (slot, pair) in bytes.iter_mut().zip(text.as_bytes().chunks_exact(2)) {
        let high = char::from(pair[0]).to_digit(16)?;
        let low = char::from(pair[1]).to_digit(16)?;
        *slot = (high * 16 + low) as u8;
    }
    Some(bytes)
}

/// One read from a peer's stream.
enum Line {
    Text(String),
    /// The peer hung up. A partial line at the end is not a message anyone
    /// finished sending, so it goes with the connection.
    Eof,
    /// Past the cap or not UTF-8. A refused line takes the connection with it
    /// rather than being truncated and parsed, because what would be left is
    /// not what the peer sent.
    Refused,
    /// The stream failed under the read: reset by the peer, the connection
    /// gone, or the hello deadline passed. Carried out by name, because with
    /// the connection still open none of these leaves a close reason behind
    /// and they would all read as the peer finishing its stream.
    Broken(String),
}

/// Reads one newline-delimited line, refusing anything longer than `cap`.
///
/// Reading one byte past the cap is what tells a line that ends exactly at it
/// from one that runs past it.
async fn read_capped_line<R: AsyncBufRead + Unpin>(reader: &mut R, cap: usize) -> Line {
    let mut buf = Vec::new();
    let read = match (&mut *reader)
        .take(cap as u64 + 1)
        .read_until(b'\n', &mut buf)
        .await
    {
        Ok(read) => read,
        Err(e) => return Line::Broken(format!("read failed: {e}")),
    };
    if read == 0 {
        return Line::Eof;
    }
    if buf.last() != Some(&b'\n') {
        return if read > cap { Line::Refused } else { Line::Eof };
    }
    buf.pop();
    if buf.last() == Some(&b'\r') {
        buf.pop();
    }
    match String::from_utf8(buf) {
        Ok(line) => Line::Text(line),
        Err(_) => Line::Refused,
    }
}

/// The first line, under a deadline.
///
/// A stream that has been opened and has not finished a line by then is
/// refused, which takes the connection with it. Nothing above this module has
/// heard of the peer yet, so nothing there would ever close it.
async fn read_hello<R: AsyncBufRead + Unpin>(reader: &mut R, cap: usize, within: Duration) -> Line {
    timeout(within, read_capped_line(reader, cap))
        .await
        .unwrap_or_else(|_| Line::Broken("no hello within the deadline".to_string()))
}

/// Pumps one connection's bidirectional stream in both directions.
///
/// The dialling side must write before the listening side's `accept_bi` can
/// return, which is exactly the protocol's shape: the guest speaks first with
/// its hello.
fn spawn_conn(
    events: Arc<dyn Events>,
    state_conns: Arc<Mutex<HashMap<String, Conn>>>,
    conn_id: String,
    owner: Option<String>,
    hello: Duration,
    endpoint: Endpoint,
    conn: Connection,
    send: iroh::endpoint::SendStream,
    recv: iroh::endpoint::RecvStream,
) {
    let (tx, mut rx) = mpsc::channel::<String>(OUTBOUND_QUEUE);

    // The map is held across both spawns so a task that ends immediately
    // cannot drop this connection before it is in there to drop.
    let mut conns = state_conns.lock();

    // Outbound: one JSON object per line.
    let mut send = send;
    let writer = tokio::spawn(async move {
        while let Some(line) = rx.recv().await {
            if send.write_all(line.as_bytes()).await.is_err() {
                break;
            }
            if send.write_all(b"\n").await.is_err() {
                break;
            }
        }
        // A write that has returned is a write the peer's QUIC stack may not
        // have seen: closing the connection over unacknowledged stream data
        // discards it. Finishing says there is no more coming, and the wait is
        // what turns "queued" into "delivered", so a hang-up that waits on
        // this task waits for the last line and not merely for the last
        // `write_all`. It ends the moment the connection does, so a peer that
        // never acknowledges holds nothing but its own hang-up deadline.
        let _ = send.finish();
        let _ = send.stopped().await;
    });

    // Inbound: each line is one wire message for the webview.
    let reader_id = conn_id.clone();
    let reader_conn = conn.clone();
    let reader_conns = state_conns.clone();
    let mut route = owner.clone();
    tokio::spawn(async move {
        let mut recv = BufReader::new(recv);
        let mut first = true;
        let (ended, refused) = loop {
            let line = if std::mem::take(&mut first) {
                read_hello(&mut recv, MAX_LINE, hello).await
            } else {
                read_capped_line(&mut recv, MAX_LINE).await
            };
            match line {
                Line::Text(line) => {
                    if line.is_empty() {
                        continue;
                    }
                    // An accepted connection is claimed by the window that
                    // admits its peer, so the map is consulted until one has.
                    if route.is_none() {
                        route = reader_conns
                            .lock()
                            .get(&reader_id)
                            .and_then(|held| held.owner.clone());
                    }
                    events.emit(
                        route.as_deref(),
                        Event::Message(MessageEvent {
                            conn_id: reader_id.clone(),
                            payload: line,
                        }),
                    );
                }
                Line::Eof => break ("stream ended".to_string(), false),
                Line::Refused => break ("line refused".to_string(), true),
                Line::Broken(why) => break (why, false),
            }
        };
        // Read before any close of this side's, which would otherwise report
        // every ending as this side's own. QUIC's reason when it has one; the
        // read's when the connection is still up and only the stream went.
        let quic = reader_conn.close_reason();
        if refused {
            reader_conn.close(1u32.into(), b"line refused");
        }
        let reason = quic.map_or(ended, |err| err.to_string());
        let (connection_type, relay_url) = remote_path(&endpoint, reader_conn.remote_id()).await;
        eprintln!(
            "collab: {} closed: {reason} ({connection_type}{})",
            reader_conn.remote_id().fmt_short(),
            relay_url
                .as_deref()
                .map(|r| format!(" via {r}"))
                .unwrap_or_default()
        );
        // Ending the read means this link is over, so it is closed here rather
        // than waited on. A peer that finishes its send stream and keeps
        // answering keepalives never closes the connection, and waiting for it
        // to would park this task, its entry and both pumps for good - which
        // the connection cap turns into a lockout at the thirty-second one.
        reader_conn.close(0u32.into(), b"closed");
        if let Some(held) = reader_conns.lock().remove(&reader_id) {
            route = route.or(held.owner);
        }
        events.emit(
            route.as_deref(),
            Event::Closed(ClosedEvent {
                conn_id: reader_id,
                reason,
                connection_type,
                relay_url,
            }),
        );
    });

    conns.insert(
        conn_id,
        Conn {
            tx,
            conn,
            writer,
            owner,
            refused: Vec::new(),
        },
    );
}

/// How a peer is reached, and where it is homed.
///
/// The first half is direct or relayed, as the endpoint actually observes it:
/// a path is only direct when it is an IP path that is actually in use, and
/// anything else reports relayed, because a relay disclosure that has to guess
/// must guess in the direction that over-discloses, never under.
///
/// The second is the peer's relay, when it has one. That is the one piece of
/// addressing that survives the connection: an EndpointId names a peer but
/// does not route to them, and the only lookup this build runs is mDNS, which
/// answers across a room and no further. Handing it back is what lets a
/// partner met on one network be dialled again from another.
async fn remote_path(endpoint: &Endpoint, remote: EndpointId) -> (String, Option<String>) {
    let Some(info) = endpoint.remote_info(remote).await else {
        return ("relayed".to_string(), None);
    };
    let direct = info
        .addrs()
        .any(|a| matches!(a.usage(), TransportAddrUsage::Active) && a.addr().is_ip());
    let relay = info.addrs().find_map(|a| match a.addr() {
        TransportAddr::Relay(url) => Some(url.to_string()),
        _ => None,
    });
    (if direct { "direct" } else { "relayed" }.to_string(), relay)
}

/// Runs one blocking piece of shell work off the thread that draws the window.
///
/// A `#[tauri::command]` with no `async` runs on the main thread, and every
/// wait in this module is seconds wide: binding an endpoint reaches the
/// network, a dial waits out a peer that may never answer, and a stop waits
/// for QUIC to say goodbye. On the main thread each of those is a frozen app,
/// which is what a debater sees as a spinning cursor with no session yet.
///
/// A blocking-pool thread rather than an async task, because the work below
/// drives the collaboration runtime with `block_on`, which panics inside
/// another runtime's async context and is exactly what a blocking thread is
/// for.
async fn off_thread<T, F>(work: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| "The collaboration shell stopped unexpectedly".to_string())?
}

#[tauri::command]
pub async fn collab_start(
    app: AppHandle,
    window: WebviewWindow,
    relay: bool,
    mdns: bool,
) -> Result<String, String> {
    let holder = window.label().to_string();
    let events: Arc<dyn Events> = Arc::new(app.clone());
    off_thread(move || {
        start_gated(
            &app.state::<CollabState>(),
            events,
            relay,
            mdns,
            &holder,
            crate::config::collab_enabled(),
        )
    })
    .await
}

/// The bind, behind the switch the debater set.
///
/// The gate sits on the command rather than on `start`, because the command is
/// the only way into this module from a webview and the suite drives the whole
/// protocol through `start` with no config file in sight. What it answers is
/// script execution in the webview: `collabLive()` refuses the route a debater
/// takes and a script does not take that route. One check covers the surface,
/// because a dial and a send both need an endpoint this refused to bind.
fn start_gated(
    state: &CollabState,
    events: Arc<dyn Events>,
    relay: bool,
    mdns: bool,
    holder: &str,
    enabled: bool,
) -> Result<String, String> {
    if !enabled {
        return Err("Shared editing is off".to_string());
    }
    start(state, events, relay, mdns, holder)
}

/// Accepts connections on one endpoint until the handle is dropped.
///
/// Shared by the session's endpoint and by the temporary one a pairing code
/// names, because everything bounding what a stranger can spend - the
/// connection cap, the pending count, the hello deadline, one task per
/// connection - is the same question on both.
///
/// `owner` is the window every connection here answers to. None for the
/// session's endpoint, whose accepted connections are claimed by whichever
/// window admits their peer; a pairing endpoint was asked for by one window
/// and belongs to it from the start. `pairing` says whether a peer arriving
/// here is redeeming a code, which is its own channel to the webview.
fn spawn_accept(
    runtime: &tokio::runtime::Runtime,
    events: Arc<dyn Events>,
    endpoint: Endpoint,
    conns: Arc<Mutex<HashMap<String, Conn>>>,
    hello: Duration,
    owner: Option<String>,
    pairing: bool,
) -> tokio::task::JoinHandle<()> {
    let pending = Arc::new(AtomicUsize::new(0));
    runtime.spawn(async move {
        while let Some(incoming) = endpoint.accept().await {
            // Refused before a task exists to hold it, and refusing costs
            // one packet. Both populations count: an established peer sits
            // in the map, one still finishing its handshake sits nowhere,
            // and counting only the map would leave the cheapest connection
            // to make the one thing a stranger can spend without limit.
            if conns.lock().len() + pending.load(Ordering::Relaxed) >= MAX_CONNS {
                incoming.refuse();
                continue;
            }
            // Everything one connection costs runs off this loop. The
            // handshake and the wait for the peer's first stream both take
            // as long as the peer likes, and a loop awaiting them is a
            // loop accepting nobody else: one dial that opens the ALPN and
            // then goes quiet would keep the debater's own partner out.
            let events = events.clone();
            let conns = conns.clone();
            let endpoint = endpoint.clone();
            let owner = owner.clone();
            pending.fetch_add(1, Ordering::Relaxed);
            let counted = Pending(pending.clone());
            tokio::spawn(async move {
                // Held until this task ends, however it ends.
                let _counted = counted;
                let Ok(conn) = incoming.await else { return };
                let Ok(Ok((send, recv))) = timeout(hello, conn.accept_bi()).await else {
                    conn.close(2u32.into(), b"no stream");
                    return;
                };
                let remote = conn.remote_id();
                let conn_id = new_conn_id();
                let (connection_type, relay_url) = remote_path(&endpoint, remote).await;
                let peer = PeerEvent {
                    conn_id: conn_id.clone(),
                    endpoint_id: remote.to_string(),
                    connection_type,
                    relay_url,
                };
                events.emit(
                    owner.as_deref(),
                    if pairing {
                        Event::PairPeer(peer)
                    } else {
                        Event::Peer(peer)
                    },
                );
                spawn_conn(
                    events, conns, conn_id, owner, hello, endpoint, conn, send, recv,
                );
            });
        }
    })
}

/// Binds the endpoint, or takes a share of the one already bound.
fn start(
    state: &CollabState,
    events: Arc<dyn Events>,
    relay: bool,
    mdns: bool,
    holder: &str,
) -> Result<String, String> {
    let mut held = state.live.lock();
    if let Some(live) = held.as_mut() {
        // One bind is shared, so a later holder cannot apply different network
        // settings to it. Refusing is the honest answer: rebinding would drop
        // the other holder's peers, and running on the settings already in
        // force would relay a round the debater asked to keep off relays, or
        // multicast one they asked to keep off the LAN.
        if (live.relay, live.mdns) != (relay, mdns) {
            return Err("Another window is sharing with different network settings".to_string());
        }
        *live.holders.entry(holder.to_string()).or_insert(0) += 1;
        return Ok(live.endpoint_id.clone());
    }

    // Two workers, not one per core. Everything this runtime carries is async
    // socket IO - an accept loop and two pumps per connection - so the default
    // would mint a dozen threads to move newline-delimited JSON between a
    // debater and their partner. Nothing here blocks a worker.
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .map_err(|e| format!("Could not start the collaboration runtime: {e}"))?;

    let endpoint = runtime.block_on(async {
        // Minimal, never N0: see the module comment.
        let mut builder = Endpoint::builder(presets::Minimal)
            // Off, and stated rather than assumed: iroh's default asks the
            // router over UPnP/NAT-PMP/PCP for an inbound hole at this socket
            // and probes for a gateway by multicast to find one.
            .portmapper_config(PortmapperConfig::Disabled)
            .alpns(vec![ALPN.to_vec()])
            .relay_mode(relay_mode(relay));
        if let Some(key) = load_or_create_secret_key() {
            builder = builder.secret_key(key);
        }
        let endpoint = builder
            .bind()
            .await
            .map_err(|e| format!("Could not bind an endpoint: {e}"))?;

        if mdns {
            let lookup = MdnsAddressLookup::builder()
                .build(endpoint.id())
                .map_err(|e| format!("Could not start local discovery: {e}"))?;
            if let Ok(services) = endpoint.address_lookup() {
                services.add(lookup);
            }
        }
        Ok::<Endpoint, String>(endpoint)
    })?;

    let endpoint_id = endpoint.id().to_string();
    let conns: Arc<Mutex<HashMap<String, Conn>>> = Arc::new(Mutex::new(HashMap::new()));

    // No owner. Which round an accepted connection is for arrives in its
    // hello, above this module, so every window hears about it and the one
    // that answers claims it.
    let accept = spawn_accept(
        &runtime,
        events,
        endpoint.clone(),
        conns.clone(),
        state.hello,
        None,
        false,
    );

    *held = Some(Live {
        runtime: Arc::new(runtime),
        endpoint,
        endpoint_id: endpoint_id.clone(),
        conns,
        accept,
        closing: Mutex::new(Vec::new()),
        relay,
        mdns,
        pair: None,
        holders: HashMap::from([(holder.to_string(), 1)]),
    });
    Ok(endpoint_id)
}

#[tauri::command]
pub async fn collab_dial(
    app: AppHandle,
    window: WebviewWindow,
    endpoint_id: String,
    relay_url: Option<String>,
) -> Result<DialResult, String> {
    let holder = window.label().to_string();
    let events: Arc<dyn Events> = Arc::new(app.clone());
    let addr = dial_target(&endpoint_id, relay_url.as_deref())?;
    off_thread(move || dial(&app.state::<CollabState>(), events, &holder, addr)).await
}

/// Where to send the first packet, from what the webview knows.
///
/// The relay is a routing hint and never an authorization: it says where the
/// peer can be found, which is what an EndpointId on its own does not say.
/// Without one the only lookup this build runs is mDNS, so a peer on another
/// network is a name with nowhere to send it, and the dial spends its whole
/// deadline waiting for an address that is never coming. A ticket carries the
/// host's, and a peer already met carries its own back on the connection.
///
/// A relay that will not parse is dropped rather than refused: the dial can
/// still land over mDNS or over a path this endpoint already holds, and a
/// round in the room is not worth losing to a malformed field.
fn dial_target(endpoint_id: &str, relay_url: Option<&str>) -> Result<EndpointAddr, String> {
    let remote = EndpointId::from_str(endpoint_id).map_err(|_| "Not an endpoint id".to_string())?;
    let addr = EndpointAddr::new(remote);
    Ok(
        match relay_url.and_then(|url| RelayUrl::from_str(url).ok()) {
            Some(url) => addr.with_relay_url(url),
            None => addr,
        },
    )
}

/// Dials a peer, and hands the calling window a connection it owns.
fn dial(
    state: &CollabState,
    events: Arc<dyn Events>,
    holder: &str,
    addr: EndpointAddr,
) -> Result<DialResult, String> {
    let remote = addr.id;
    // Cloned out of the guard before the first await. Every other collab
    // command takes this same lock, so holding it across a dial would let one
    // peer that answers slowly - or not at all - freeze every window,
    // including the stop that would have let go of it.
    let (runtime, endpoint, conns, within, hello) = {
        let held = state.live.lock();
        let live = held.as_ref().ok_or("No collaboration session is running")?;
        (
            live.runtime.clone(),
            live.endpoint.clone(),
            live.conns.clone(),
            state.dial,
            state.hello,
        )
    };
    if conns.lock().len() >= MAX_CONNS {
        return Err("This session is holding as many peers as it can".to_string());
    }

    // Both waits are deadlined. A peer that answers the handshake and then
    // advertises no bidirectional streams withholds credit for as long as it
    // likes, so bounding only the connect would leave the second half open.
    let (conn, send, recv, kind, relay) = runtime.block_on(async {
        let conn = timeout(within, endpoint.connect(addr, ALPN))
            .await
            .map_err(|_| "That peer did not answer".to_string())?
            .map_err(|e| format!("Could not reach that peer: {e}"))?;
        let (send, recv) = timeout(within, conn.open_bi())
            .await
            .map_err(|_| "That peer opened no stream".to_string())?
            .map_err(|e| format!("Could not open a stream: {e}"))?;
        let (kind, relay) = remote_path(&endpoint, remote).await;
        Ok::<_, String>((conn, send, recv, kind, relay))
    })?;

    let conn_id = new_conn_id();
    // No collab:peer event here. The dialler already holds this connection,
    // and announcing it would race the return of this very call: the webview
    // could see the event before it learns the id and mistake its own dial
    // for an inbound peer.
    let owner = Some(holder.to_string());
    let id = conn_id.clone();
    runtime.spawn(async move {
        spawn_conn(events, conns, id, owner, hello, endpoint, conn, send, recv)
    });
    Ok(DialResult {
        conn_id,
        connection_type: kind,
        relay_url: relay,
    })
}

#[tauri::command]
pub fn collab_send(
    window: WebviewWindow,
    state: State<'_, CollabState>,
    conn_id: String,
    payload: String,
) -> Result<(), String> {
    send(state.inner(), window.label(), &conn_id, payload)
}

/// Writes one line to one peer.
fn send(state: &CollabState, holder: &str, conn_id: &str, payload: String) -> Result<(), String> {
    let held = state.live.lock();
    let live = held.as_ref().ok_or("No collaboration session is running")?;
    let conns = live.conns.lock();
    let conn = conns.get(conn_id).ok_or("That peer is gone")?;
    // Writing does not claim. An accepted connection reaches every window, and
    // a window that is not hosting the round the hello names answers it with a
    // refusal, so the first write is not always the admitting window's:
    // latching on it would hand a round's guest to a window that just hung up
    // on them. Unclaimed, any window may answer; claimed, only the owner may.
    if conn.owner.as_deref().is_some_and(|owner| owner != holder) {
        return Err("That peer belongs to another window".to_string());
    }
    match conn.tx.try_send(payload) {
        Ok(()) => Ok(()),
        Err(mpsc::error::TrySendError::Full(_)) => Err("That peer is not keeping up".to_string()),
        Err(mpsc::error::TrySendError::Closed(_)) => Err("That peer is gone".to_string()),
    }
}

#[tauri::command]
pub fn collab_claim(
    window: WebviewWindow,
    state: State<'_, CollabState>,
    conn_id: String,
) -> Result<(), String> {
    claim(state.inner(), window.label(), &conn_id)
}

/// Takes an accepted connection for the window that admitted its peer.
///
/// The shell cannot know whose a connection is when it accepts one: the round
/// arrives in the hello, which is read above this module. So an accepted
/// connection starts owned by nobody and its events reach every window.
/// Admission is the moment one window becomes answerable for it, and this is
/// how that window says so. A connection another window holds is refused
/// rather than taken over, or a second window's refusal would still cost the
/// host its guest.
fn claim(state: &CollabState, holder: &str, conn_id: &str) -> Result<(), String> {
    let held = state.live.lock();
    let live = held.as_ref().ok_or("No collaboration session is running")?;
    let mut conns = live.conns.lock();
    let conn = conns.get_mut(conn_id).ok_or("That peer is gone")?;
    if let Some(owner) = &conn.owner {
        // A repeat from the window already holding it is not a takeover.
        if owner == holder {
            return Ok(());
        }
        return Err("That peer belongs to another window".to_string());
    }
    conn.owner = Some(holder.to_string());
    // Whatever refused it before now was the other windows answering a hello
    // this one has admitted, and none of that is a reason to hang up.
    conn.refused.clear();
    Ok(())
}

#[tauri::command]
pub async fn collab_close(
    app: AppHandle,
    window: WebviewWindow,
    conn_id: String,
) -> Result<(), String> {
    let holder = window.label().to_string();
    off_thread(move || close(&app.state::<CollabState>(), &holder, &conn_id)).await
}

/// Hangs up on one peer, leaving the endpoint and every other peer up.
///
/// Returns once the peer has been hung up on rather than once the hang-up has
/// been started, so a window that says goodbye and then tears its session down
/// has said it. The wait is the deadline and no longer.
///
/// A hang-up on a connection nobody has claimed is a refusal, and one window's
/// refusal is not the answer: an accepted connection reaches every window
/// holding the endpoint, the round it is for arrives in its hello, and the
/// windows not hosting that round refuse it in the same instant the one that
/// is admits it. Those are IPC calls from different webviews and nothing
/// orders them, so a refusal that hung up on arrival would take a guest away
/// from its host whenever it landed first. So a refusal is counted, and the
/// connection goes only once every holder has refused it, or once the hello
/// deadline has passed with nobody claiming it - which covers a window that
/// holds the endpoint and never answers.
fn close(state: &CollabState, holder: &str, conn_id: &str) -> Result<(), String> {
    let (runtime, hung_up) = {
        let held = state.live.lock();
        let live = held.as_ref().ok_or("No collaboration session is running")?;
        let gone = {
            let mut conns = live.conns.lock();
            let Some(conn) = conns.get_mut(conn_id) else {
                return Ok(());
            };
            match conn.owner.as_deref() {
                // A connection another window owns is not its to end.
                Some(owner) if owner != holder => {
                    return Err("That peer belongs to another window".to_string())
                }
                Some(_) => conns.remove(conn_id),
                None => {
                    if !conn.refused.iter().any(|w| w == holder) {
                        conn.refused.push(holder.to_string());
                    }
                    let first = conn.refused.len() == 1;
                    let everyone = live
                        .holders
                        .keys()
                        .all(|w| conn.refused.iter().any(|r| r == w));
                    if everyone {
                        conns.remove(conn_id)
                    } else {
                        if first {
                            live.runtime.spawn(hang_up_unclaimed(
                                live.conns.clone(),
                                conn_id.to_string(),
                                state.hello,
                            ));
                        }
                        return Ok(());
                    }
                }
            }
        };
        let Some(conn) = gone else { return Ok(()) };
        // The drain ends by closing the connection, so this is what the wait
        // below watches: the task itself belongs to `closing`, where a `stop`
        // racing this call can find it.
        let hung_up = conn.conn.clone();
        let mut closing = live.closing.lock();
        closing.retain(|draining| !draining.is_finished());
        closing.push(live.runtime.spawn(conn.hang_up()));
        (live.runtime.clone(), hung_up)
    };
    // Off the lock every other collab command takes: a peer stalling the
    // writer would otherwise freeze every window for the whole deadline.
    runtime.block_on(async {
        let _ = timeout(HANG_UP_GRACE, hung_up.closed()).await;
    });
    Ok(())
}

/// Ends a refused connection nobody claimed within the hello deadline.
///
/// The backstop for a holder that never answers: without it a refusal from
/// every window but one would hold the connection until the session ends.
async fn hang_up_unclaimed(
    conns: Arc<Mutex<HashMap<String, Conn>>>,
    conn_id: String,
    within: Duration,
) {
    tokio::time::sleep(within).await;
    let unclaimed = {
        let mut conns = conns.lock();
        match conns.get(&conn_id) {
            Some(conn) if conn.owner.is_none() => conns.remove(&conn_id),
            _ => None,
        }
    };
    if let Some(conn) = unclaimed {
        conn.hang_up().await;
    }
}

#[tauri::command]
pub async fn collab_stop(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let holder = window.label().to_string();
    off_thread(move || stop(&app.state::<CollabState>(), &holder)).await
}

/// Where this endpoint can be reached from another network, for the ticket
/// that carries it.
///
/// A relay is the one address a peer behind a router can hand out: the public
/// IP this endpoint discovers is the router's, and a hole punched through it
/// belongs to a path that does not exist yet. So the ticket names the relay,
/// the guest's first packet arrives over it, and the two sides then find each
/// other directly with no registry having heard of either.
///
/// Empty rather than an error for every reason it cannot be said: relaying is
/// off, no relay answered in time, or no endpoint is bound. All three mean the
/// same thing to the ticket, which is a round shareable across the room and
/// not across the country.
#[tauri::command]
pub async fn collab_relay_url(app: AppHandle) -> Result<String, String> {
    off_thread(move || Ok(relay_url(&app.state::<CollabState>()))).await
}

/// How long the ticket waits for a relay to answer. Contacting one is a round
/// trip to whichever server is nearest, and a debater is holding a dialog open
/// for it, so a slow answer costs the ticket its relay rather than the click.
const ONLINE_DEADLINE: Duration = Duration::from_secs(8);

fn relay_url(state: &CollabState) -> String {
    let (runtime, endpoint) = {
        let held = state.live.lock();
        let Some(live) = held.as_ref() else {
            return String::new();
        };
        if !live.relay {
            return String::new();
        }
        (live.runtime.clone(), live.endpoint.clone())
    };
    runtime.block_on(async {
        let _ = timeout(ONLINE_DEADLINE, endpoint.online()).await;
        endpoint
            .addr()
            .addrs
            .into_iter()
            .find_map(|a| match a {
                TransportAddr::Relay(url) => Some(url.to_string()),
                _ => None,
            })
            .unwrap_or_default()
    })
}

/// How long a pairing endpoint has to home on the relay its code named.
///
/// A debater is looking at a `Getting ready...` screen for this, and a code
/// that cannot be reached is worse than a slower one: the host discards it and
/// mints another, which picks a different relay.
const PAIR_ONLINE_DEADLINE: Duration = Duration::from_secs(8);

/// Where a guest sends its first packet to redeem a code.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairTarget {
    endpoint_id: String,
    relay_url: String,
}

/// A fresh pairing code. Nothing is bound by minting one.
#[tauri::command]
pub fn collab_pair_code() -> String {
    crate::pairing::new_code()
}

/// The endpoint and relay a code names, for the side that dials it.
///
/// A guest needs no second endpoint. It dials from the one it already has, to
/// an address the code told it, which is the ordinary dial this module already
/// does - so the whole guest half of pairing is this derivation.
#[tauri::command]
pub fn collab_pair_target(code: String) -> Result<PairTarget, String> {
    pair_target(&code)
}

fn pair_target(code: &str) -> Result<PairTarget, String> {
    let (key, relay) = crate::pairing::derive(code)?;
    Ok(PairTarget {
        endpoint_id: key.public().to_string(),
        relay_url: relay.to_string(),
    })
}

#[tauri::command]
pub async fn collab_pair_start(
    app: AppHandle,
    window: WebviewWindow,
    code: String,
) -> Result<String, String> {
    let holder = window.label().to_string();
    let events: Arc<dyn Events> = Arc::new(app.clone());
    off_thread(move || {
        pair_start_gated(
            &app.state::<CollabState>(),
            events,
            &holder,
            &code,
            crate::config::collab_enabled(),
        )
    })
    .await
}

/// The pairing bind, behind the switch the debater set.
///
/// The pairing endpoint is a second way onto the network, so it asks the same
/// question the session's bind does and in the same place: on the command,
/// which is the only way into this module from a webview.
fn pair_start_gated(
    state: &CollabState,
    events: Arc<dyn Events>,
    holder: &str,
    code: &str,
    enabled: bool,
) -> Result<String, String> {
    if !enabled {
        return Err("Shared editing is off".to_string());
    }
    pair_start(state, events, holder, code)
}

fn pair_start(
    state: &CollabState,
    events: Arc<dyn Events>,
    holder: &str,
    code: &str,
) -> Result<String, String> {
    let (key, relay) = crate::pairing::derive(code)?;
    // The session's own switch. One install has one answer to "may this reach
    // a relay", and a pairing endpoint that ignored it would be a way around
    // the setting.
    let relaying = {
        let held = state.live.lock();
        held.as_ref()
            .ok_or("No collaboration session is running")?
            .relay
    };
    pair_bind(state, events, holder, key, relay, relaying)
}

/// Binds the endpoint a code names, waits for it to be reachable, and answers
/// on it.
///
/// Nothing is handed back until the endpoint is homed, because a code that
/// cannot be reached is worse than no code: the debater reads it out, the
/// partner types it, and the dial spends its whole deadline on an address that
/// is not there. The caller discards the code and mints another, which picks a
/// different relay.
///
/// A bind that gets that far and then fails closes the endpoint on the way
/// out. A leaked endpoint is a socket, a relay connection and an accept loop
/// outliving the window that asked for them.
fn pair_bind(
    state: &CollabState,
    events: Arc<dyn Events>,
    holder: &str,
    key: SecretKey,
    relay: RelayUrl,
    relaying: bool,
) -> Result<String, String> {
    let (runtime, conns, hello, online, mdns) = {
        let held = state.live.lock();
        let live = held.as_ref().ok_or("No collaboration session is running")?;
        (
            live.runtime.clone(),
            live.conns.clone(),
            state.hello,
            state.pair_online,
            live.mdns,
        )
    };

    let pinned = relay.clone();
    let endpoint = runtime.block_on(async move {
        // Minimal, never N0: see the module comment.
        let builder = Endpoint::builder(presets::Minimal)
            .portmapper_config(PortmapperConfig::Disabled)
            .alpns(vec![ALPN.to_vec()])
            .secret_key(key)
            // The one relay the code picked, not the nearest. A host and a
            // guest two networks apart must land on the same server, and a
            // default homes each of them on whichever is closest to them.
            .relay_mode(if relaying {
                RelayMode::custom([pinned.clone()])
            } else {
                RelayMode::Disabled
            });
        let endpoint = builder
            .bind()
            .await
            .map_err(|e| format!("Could not bind a pairing endpoint: {e}"))?;
        if mdns {
            // With relaying off this is the only thing left that can find the
            // endpoint, and the debater is told what that costs before the
            // code goes on screen.
            if let Ok(lookup) = MdnsAddressLookup::builder().build(endpoint.id()) {
                if let Ok(services) = endpoint.address_lookup() {
                    services.add(lookup);
                }
            }
        }
        if relaying {
            let homed = timeout(online, endpoint.online()).await.is_ok()
                && endpoint
                    .addr()
                    .addrs
                    .into_iter()
                    .any(|a| matches!(a, TransportAddr::Relay(url) if url == pinned));
            if !homed {
                endpoint.close().await;
                return Err("Could not reach the relay for that code".to_string());
            }
        }
        Ok::<Endpoint, String>(endpoint)
    })?;

    let endpoint_id = endpoint.id().to_string();
    let accept = spawn_accept(
        &runtime,
        events,
        endpoint.clone(),
        conns,
        hello,
        Some(holder.to_string()),
        true,
    );
    let bound = Pair {
        endpoint,
        endpoint_id: endpoint_id.clone(),
        accept,
    };

    let replaced = {
        let mut held = state.live.lock();
        match held.as_mut() {
            // The session went away while this was homing, so nothing here has
            // anywhere to live.
            None => Some(bound),
            Some(live) => live.pair.replace(bound),
        }
    };
    if let Some(old) = replaced {
        let orphaned = old.endpoint_id == endpoint_id;
        shutdown_pair(&runtime, old);
        if orphaned {
            return Err("No collaboration session is running".to_string());
        }
    }
    Ok(endpoint_id)
}

#[tauri::command]
pub async fn collab_pair_stop(app: AppHandle) -> Result<(), String> {
    off_thread(move || pair_stop(&app.state::<CollabState>())).await
}

/// Takes the pairing endpoint off the air. A no-op when there is none, because
/// a sheet closing twice is not an error.
fn pair_stop(state: &CollabState) -> Result<(), String> {
    let taken = {
        let mut held = state.live.lock();
        let Some(live) = held.as_mut() else {
            return Ok(());
        };
        live.pair.take().map(|pair| (live.runtime.clone(), pair))
    };
    if let Some((runtime, pair)) = taken {
        shutdown_pair(&runtime, pair);
    }
    Ok(())
}

/// Closes one pairing endpoint and the loop accepting on it.
///
/// The connections it accepted are in the shared map and are not touched here:
/// a guest that has already redeemed a code is mid-handshake on a connection
/// the window still holds, and the endpoint going away does not take it.
fn shutdown_pair(runtime: &tokio::runtime::Runtime, pair: Pair) {
    pair.accept.abort();
    let endpoint = pair.endpoint;
    runtime.block_on(async move { endpoint.close().await });
}

/// Lets go of one holder's share of the endpoint.
fn stop(state: &CollabState, holder: &str) -> Result<(), String> {
    let last = {
        let mut held = state.live.lock();
        let Some(live) = held.as_mut() else {
            return Ok(());
        };
        // A window releases what it took and nothing else. A caller holding no
        // share has nothing to give back, so this is a no-op for it rather than
        // another window's endpoint coming down mid-round.
        match live.holders.get_mut(holder) {
            Some(count) if *count > 1 => {
                *count -= 1;
                return Ok(());
            }
            Some(_) => live.holders.remove(holder),
            None => return Ok(()),
        };
        if !live.holders.is_empty() {
            return Ok(());
        }
        held.take()
    };
    if let Some(live) = last {
        shutdown(live);
    }
    Ok(())
}

/// Hangs up on every peer and waits out what they were already sent, then
/// closes the accept loop and the endpoint.
fn shutdown(mut live: Live) {
    // Every peer at once, because the deadline is spent once rather than once
    // per peer: a host leaving a round of eight guests, two of them stalled,
    // has the shell's three seconds to be gone in.
    let mut draining: Vec<_> = live
        .conns
        .lock()
        .drain()
        .map(|(_, conn)| live.runtime.spawn(conn.hang_up()))
        .collect();
    // A hang-up a window already started is finished here rather than cut
    // off. Closing the endpoint under one discards the farewell it is
    // flushing, which is the whole reason the drain is waited on at all.
    draining.append(&mut live.closing.lock());
    live.runtime.block_on(async {
        let _ = timeout(HANG_UP_GRACE, async {
            for one in draining {
                let _ = one.await;
            }
        })
        .await;
    });
    // The pairing endpoint goes with the session that hung it there. After the
    // drain, so a farewell already in flight is not closed out from under.
    if let Some(pair) = live.pair.take() {
        shutdown_pair(&live.runtime, pair);
    }
    live.accept.abort();
    let endpoint = live.endpoint.clone();
    live.runtime.block_on(async move { endpoint.close().await });
    // Dropping the runtime here would block this thread on its workers, so it
    // is handed to one that is allowed to wait.
    std::thread::spawn(move || drop(live.runtime));
}

/// Strips what a hostname carries for the network and a debater does not: the
/// mDNS suffix, and any domain past the first label. `smodi-mbp.local` and
/// `smodi-mbp.tourney.lan` are both `smodi-mbp`.
fn short_host(raw: &str) -> String {
    raw.trim()
        .trim_end_matches('.')
        .split('.')
        .next()
        .unwrap_or("")
        .to_string()
}

/// What this machine calls itself, for the display name a shared round
/// carries. Read from the `hostname` binary every desktop platform ships,
/// rather than pulling in a crate for one string. Empty when it cannot be
/// read, which the caller shows as no default rather than as an error.
#[tauri::command]
pub fn machine_name() -> String {
    let Ok(out) = std::process::Command::new("hostname").output() else {
        return String::new();
    };
    if !out.status.success() {
        return String::new();
    }
    short_host(&String::from_utf8_lossy(&out.stdout))
}

/// This install's EndpointId, read from the identity file rather than from a
/// bound endpoint.
///
/// The id is the public half of the stored secret key, so Settings can show a
/// debater the id a partner saves them under while no socket is open and
/// nothing has touched the network. Empty when the key can neither be read
/// nor written, which the caller shows as no id rather than as an error.
#[tauri::command]
pub fn collab_endpoint_id() -> String {
    identity_path()
        .map(|path| endpoint_id_at(&path))
        .unwrap_or_default()
}

fn endpoint_id_at(path: &Path) -> String {
    secret_key_at(path)
        .map(|key| key.public().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_alpn_names_the_protocol_version() {
        assert_eq!(ALPN, b"ebb/flow/1");
    }

    #[test]
    fn relay_off_disables_relays_outright() {
        assert_eq!(relay_mode(false), RelayMode::Disabled);
        assert_eq!(relay_mode(true), RelayMode::Default);
    }

    /// A peer on another network is an EndpointId with nowhere to send the
    /// first packet, so the relay a ticket carries is what makes the dial land
    /// at all. It rides in the address rather than in the handshake, because
    /// it says where the peer is and not who may talk to them.
    #[test]
    fn a_relay_hint_becomes_part_of_the_address() {
        let peer = SecretKey::generate().public().to_string();

        let bare = dial_target(&peer, None).expect("an id is enough to name a peer");
        assert!(bare.is_empty(), "an id alone routes nowhere");

        let homed = dial_target(&peer, Some("https://usw1-1.relay.n0.iroh.link./"))
            .expect("a relay is where the peer is");
        assert_eq!(
            homed
                .addrs
                .iter()
                .filter_map(|a| match a {
                    TransportAddr::Relay(url) => Some(url.to_string()),
                    _ => None,
                })
                .collect::<Vec<_>>(),
            vec!["https://usw1-1.relay.n0.iroh.link./"]
        );
        assert!(
            !homed.addrs.iter().any(TransportAddr::is_ip),
            "and nothing about this machine's own network"
        );

        // A round in the room still has mDNS and the paths the endpoint
        // already holds, so junk in this field costs the hint and not the dial.
        let junk = dial_target(&peer, Some("not a url")).expect("a bad hint is dropped");
        assert!(junk.is_empty());

        assert_eq!(
            dial_target("bogus", None).unwrap_err(),
            "Not an endpoint id"
        );
    }

    #[test]
    fn a_host_keeps_its_first_label_and_nothing_else() {
        assert_eq!(short_host("smodi-mbp.local\n"), "smodi-mbp");
        assert_eq!(short_host("smodi-mbp.tourney.lan"), "smodi-mbp");
        assert_eq!(short_host("  smodi-mbp  "), "smodi-mbp");
        assert_eq!(short_host(""), "");
    }

    /// A peer that streams bytes and never a newline is not sending a message,
    /// it is asking for an allocation. The reader stops one byte past the cap
    /// and refuses what it has rather than following the stream.
    #[tokio::test]
    async fn a_line_is_refused_at_the_cap_rather_than_buffered() {
        let mut fits = BufReader::new(&b"0123456789\n"[..]);
        let Line::Text(line) = read_capped_line(&mut fits, 10).await else {
            panic!("a line that ends exactly at the cap is a line");
        };
        assert_eq!(line, "0123456789");

        let over = format!("{}\n", "x".repeat(11));
        let mut over = BufReader::new(over.as_bytes());
        assert!(matches!(
            read_capped_line(&mut over, 10).await,
            Line::Refused
        ));

        // What is left of the stream is the proof: the cap stopped the read
        // rather than the end of the bytes.
        let endless = "x".repeat(64 * 1024);
        let mut source: &[u8] = endless.as_bytes();
        let mut reader = BufReader::with_capacity(64, &mut source);
        assert!(matches!(
            read_capped_line(&mut reader, 10).await,
            Line::Refused
        ));
        drop(reader);
        assert!(source.len() > endless.len() - 1024);
    }
}

/// The stored key behind a stable EndpointId.
#[cfg(test)]
mod identity {
    use super::*;

    const KNOWN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    /// A path under a directory of this test's own, never the real config dir.
    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ebb-collab-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(&dir);
        dir.join("identity.key")
    }

    /// The wiring `collab_start` uses: the stored key, or the endpoint's own
    /// when there is none.
    async fn bound_with(path: &Path) -> Endpoint {
        let mut builder = Endpoint::builder(presets::Minimal)
            .alpns(vec![ALPN.to_vec()])
            .relay_mode(RelayMode::Disabled);
        if let Some(key) = secret_key_at(path) {
            builder = builder.secret_key(key);
        }
        builder.bind().await.expect("bind")
    }

    /// A contact is saved under an EndpointId, which is the public half of the
    /// stored key, so two binds from one identity file are one peer.
    #[tokio::test]
    async fn rebinding_keeps_the_endpoint_id() {
        let path = scratch("rebind");

        let first = bound_with(&path).await;
        let id = first.id();
        drop(first);
        let second = bound_with(&path).await;

        assert_eq!(second.id(), id);
    }

    /// `collab_endpoint_id` answers from the file so Settings can show the id
    /// with nothing bound. That is only the same id if the formula matches
    /// what the endpoint would have reported.
    #[tokio::test]
    async fn the_id_read_from_the_file_is_the_id_an_endpoint_would_report() {
        let path = scratch("derived");
        let derived = endpoint_id_at(&path);

        let bound = bound_with(&path).await;

        assert_eq!(derived, bound.id().to_string());
    }

    /// A read-only config directory costs the id, not the app: the pane shows
    /// no id rather than an error, and nothing binds to go looking for one.
    #[test]
    fn an_identity_that_cannot_be_stored_reads_as_no_id() {
        let blocked = scratch("no-id");
        std::fs::write(
            blocked.parent().unwrap(),
            "a file where a directory would go",
        )
        .unwrap();

        assert_eq!(endpoint_id_at(&blocked), "");
    }

    #[test]
    fn a_stored_key_is_read_back_byte_for_byte() {
        let path = scratch("stored");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, format!("{KNOWN}\n")).unwrap();

        let key = secret_key_at(&path).expect("the stored key");
        assert_eq!(encode_hex(&key.to_bytes()), KNOWN);
    }

    #[test]
    fn a_minted_key_is_the_same_key_on_the_next_run() {
        let path = scratch("minted");

        let first = secret_key_at(&path).expect("a minted key");
        let second = secret_key_at(&path).expect("the same key again");

        assert_eq!(first.to_bytes(), second.to_bytes());
        assert_eq!(std::fs::read_to_string(&path).unwrap().len(), 64);
    }

    #[test]
    fn a_malformed_file_yields_a_fresh_key_rather_than_an_error() {
        for (tag, junk) in [
            ("empty", ""),
            ("short", "abcd"),
            ("prose", "not a key"),
            (
                "nonhex",
                "zz23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            ),
        ] {
            let path = scratch(tag);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, junk).unwrap();

            let key = secret_key_at(&path).expect("a fresh key");
            assert_eq!(
                std::fs::read_to_string(&path).unwrap(),
                encode_hex(&key.to_bytes()),
                "{tag}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn the_stored_key_is_readable_only_by_its_owner() {
        use std::os::unix::fs::PermissionsExt;
        let path = scratch("mode");
        secret_key_at(&path).expect("a minted key");

        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn a_config_directory_that_cannot_be_written_is_not_fatal() {
        let blocked = scratch("blocked");
        std::fs::write(
            blocked.parent().unwrap(),
            "a file where a directory would go",
        )
        .unwrap();

        assert!(secret_key_at(&blocked).is_none());
    }

    #[test]
    fn hex_decoding_takes_exactly_thirty_two_bytes() {
        let bytes = decode_hex(KNOWN).expect("64 hex characters");
        assert_eq!(&bytes[..4], &[0x01, 0x23, 0x45, 0x67]);
        assert_eq!(encode_hex(&bytes), KNOWN);
        assert!(decode_hex(&KNOWN[..62]).is_none());
        assert!(decode_hex(&format!("{KNOWN}00")).is_none());
    }

    /// A key that cannot be read is not a key that is gone. Minting over one
    /// would hand every peer holding this install as a contact an EndpointId
    /// that no longer answers, and would do it over a mode bit.
    #[cfg(unix)]
    #[test]
    fn an_unreadable_key_file_is_left_exactly_as_it_is() {
        use std::os::unix::fs::PermissionsExt;
        let path = scratch("unreadable");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, KNOWN).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o000)).unwrap();
        assert!(
            std::fs::read(&path).is_err(),
            "this proves nothing unless the file is unreadable"
        );

        assert!(secret_key_at(&path).is_none());

        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), KNOWN);
    }

    /// The key lands by rename, so a write cut short leaves the old key in
    /// place rather than half of a new one.
    #[test]
    fn a_minted_key_leaves_no_temp_file_behind() {
        let path = scratch("atomic");
        secret_key_at(&path).expect("a minted key");

        let left: Vec<_> = std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(left, vec![std::ffi::OsString::from("identity.key")]);
    }

    /// The replacement lands by rename, so a write that cannot get that far
    /// leaves what is on disk exactly as it was. A write that truncates first
    /// spends the stored key before it knows it can replace it.
    #[test]
    fn a_write_that_cannot_land_leaves_the_stored_bytes_alone() {
        let path = scratch("blocked-write");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "not a key").unwrap();
        // A directory where the temp file goes: the target stays writable, so
        // only the leg that is supposed to come first can fail.
        std::fs::create_dir_all(path.parent().unwrap().join(".identity.key.tmp")).unwrap();

        assert!(secret_key_at(&path).is_none());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "not a key");
    }

    /// A temp file left where the replacement goes may be a symlink someone
    /// planted, and opening it would truncate, rewrite and re-mode whatever it
    /// points at - a file this account owns and this app never meant to touch.
    #[cfg(unix)]
    #[test]
    fn a_symlink_where_the_temp_file_goes_is_not_followed() {
        let path = scratch("planted");
        let dir = path.parent().unwrap();
        std::fs::create_dir_all(dir).unwrap();
        let victim = dir.join("someone-elses-file");
        std::fs::write(&victim, "not ours to touch").unwrap();
        std::os::unix::fs::symlink(&victim, dir.join(".identity.key.tmp")).unwrap();

        secret_key_at(&path).expect("a minted key");

        assert_eq!(
            std::fs::read_to_string(&victim).unwrap(),
            "not ours to touch"
        );
        assert!(!path.is_symlink(), "the key is a file, not a link");
    }
}

/// The commands that must never run on the thread that draws the window.
#[cfg(test)]
mod off_the_main_thread {
    /// Every command here waits on the network for seconds at a time: a bind
    /// reaches a relay, a dial waits out a peer that may never answer, and a
    /// close and a stop both wait for QUIC to carry the round's farewell and
    /// say goodbye. Tauri runs a command declared without `async` on the main
    /// thread, so dropping the keyword on any of these turns that wait into a
    /// frozen app - which is what a debater sees as a spinning cursor after
    /// clicking Share, with nothing to click.
    ///
    /// The rest of this module's commands are a lock and a channel push, and
    /// belong where they are.
    const OFF_THREAD: [&str; 7] = [
        "collab_start",
        "collab_dial",
        "collab_close",
        "collab_stop",
        "collab_relay_url",
        "collab_pair_start",
        "collab_pair_stop",
    ];

    #[test]
    fn every_command_that_waits_on_the_network_is_async() {
        let source = include_str!("collab.rs");
        for name in OFF_THREAD {
            assert!(
                source.contains(&format!("pub async fn {name}(")),
                "{name} must be an async command"
            );
            assert!(
                !source.contains(&format!("pub fn {name}(")),
                "{name} is declared without async somewhere"
            );
        }
    }
}

#[cfg(test)]
mod preset_guard {
    /// Everything the shipping half of this module must not contain, because
    /// each one reaches a public DNS registry. The preset name is the likely
    /// accident but not the only way in: the import at the top of the file is
    /// already a brace group, an alias hides the module name entirely, and
    /// registering a publisher by hand never mentions a preset at all.
    /// `iroh-dns` and `hickory-resolver` are unconditional dependencies of
    /// `iroh`, so every one of these types is linked in and reachable.
    const BANNED: [&str; 5] = ["N0", "n0_dns", "Pkarr", "DnsAddressLookup", "presets as "];

    /// The shipping half of the source. Scoping the scan is what keeps a test
    /// module from standing in for production code in either direction: these
    /// very strings are below the cut, and so is any test that names a preset.
    fn production(source: &str) -> &str {
        &source[..source.find("#[cfg(test)]").unwrap_or(source.len())]
    }

    /// The first shipping line that would put this install in a public
    /// registry, if any. A comment is free to name what it warns against.
    fn offending_line(source: &str) -> Option<String> {
        production(source)
            .lines()
            .find(|line| {
                let code = line.trim_start();
                !code.starts_with("//") && BANNED.iter().any(|word| code.contains(word))
            })
            .map(str::to_string)
    }

    /// The difference between Minimal and N0 is one word, and choosing wrong
    /// publishes this install to a public DNS registry on every launch. That
    /// is not something a reviewer should have to catch by eye.
    #[test]
    fn nothing_shipping_reaches_a_public_registry() {
        assert_eq!(offending_line(include_str!("collab.rs")), None);
    }

    /// The scan has to bite on the shapes an accident actually takes, not only
    /// on the one spelling of the preset name.
    #[test]
    fn the_scan_catches_every_way_in() {
        for source in [
            "use iroh::endpoint::presets::{Minimal, N0};",
            "use iroh::endpoint::presets as p;",
            "    builder.address_lookup(PkarrPublisher::n0_dns());",
            "    builder.address_lookup(DnsAddressLookup::n0_dns());",
        ] {
            assert!(offending_line(source).is_some(), "{source}");
        }
        assert_eq!(offending_line("// never the N0 preset"), None);
    }

    /// The positive half. Without it a switch to a hand-rolled builder would
    /// pass every ban above by simply naming nothing.
    #[test]
    fn the_shipping_endpoint_names_the_minimal_preset() {
        assert!(production(include_str!("collab.rs")).contains("presets::Minimal"));
    }
}

/// Real endpoints over real QUIC on loopback.
///
/// Everything above the socket is proven against an in-memory transport, so
/// what is left to prove is that this configuration actually carries bytes:
/// the Minimal preset with relays disabled and no discovery at all, which is
/// exactly the shape an isolated room gets. Addresses are passed directly, so
/// nothing is published anywhere for these to find each other.
#[cfg(test)]
mod loopback {
    use super::*;
    use std::future::Future;

    use tokio::io::AsyncBufReadExt;

    async fn bound() -> Endpoint {
        Endpoint::builder(presets::Minimal)
            .alpns(vec![ALPN.to_vec()])
            .relay_mode(RelayMode::Disabled)
            .bind()
            .await
            .expect("bind")
    }

    #[tokio::test]
    async fn two_endpoints_exchange_a_wire_message() {
        let host = bound().await;
        let guest = bound().await;
        let host_addr = host.addr();

        // Both halves run in one scope. Dropping either the endpoint or the
        // connection closes it, so a spawned task that returns early tears the
        // link down before the other side has read its reply.
        let listener = async {
            let incoming = host.accept().await.expect("incoming");
            let conn = incoming.await.expect("accept");
            let (mut send, recv) = conn.accept_bi().await.expect("accept_bi");
            let mut lines = BufReader::new(recv).lines();
            let hello = lines.next_line().await.expect("read").expect("a line");
            send.write_all(b"{\"type\":\"helloAck\",\"ok\":true}\n")
                .await
                .expect("write");
            send.finish().expect("finish");
            // Held open until the dialler hangs up, which it does once it has
            // the reply.
            conn.closed().await;
            hello
        };

        let dialler = async {
            let conn = guest.connect(host_addr, ALPN).await.expect("connect");
            let (mut send, recv) = conn.open_bi().await.expect("open_bi");
            send.write_all(b"{\"type\":\"hello\",\"protocol\":1}\n")
                .await
                .expect("write");
            let mut lines = BufReader::new(recv).lines();
            let ack = lines.next_line().await.expect("read").expect("a line");
            conn.close(0u32.into(), b"done");
            ack
        };

        let (hello, ack) = tokio::join!(listener, dialler);
        assert_eq!(hello, "{\"type\":\"hello\",\"protocol\":1}");
        assert_eq!(ack, "{\"type\":\"helloAck\",\"ok\":true}");
    }

    #[tokio::test]
    async fn a_connection_on_another_protocol_is_refused() {
        let host = bound().await;
        let guest = bound().await;
        let addr = host.addr();
        let listener = host.clone();
        tokio::spawn(async move {
            if let Some(incoming) = listener.accept().await {
                let _ = incoming.await;
            }
        });
        assert!(guest.connect(addr, b"someone/else/1").await.is_err());
        drop(host);
    }

    /// What the pump would have put on the webview's event bus, and which
    /// window each event was addressed to. None is a broadcast.
    #[derive(Default)]
    struct Recorder {
        seen: Mutex<Vec<(Option<String>, Event)>>,
    }

    impl Events for Recorder {
        fn emit(&self, to: Option<&str>, event: Event) {
            self.seen.lock().push((to.map(str::to_string), event));
        }
    }

    impl Recorder {
        fn peers(&self) -> Vec<String> {
            self.pick(|event| match event {
                Event::Peer(e) => Some(e.conn_id.clone()),
                _ => None,
            })
        }

        /// The peers announced on the pairing channel, which is a different
        /// question from the ones the session's listener hears.
        fn pair_peers(&self) -> Vec<String> {
            self.pick(|event| match event {
                Event::PairPeer(e) => Some(e.conn_id.clone()),
                _ => None,
            })
        }

        /// Who the pairing announcement for `conn_id` was addressed to.
        fn pair_routes(&self, conn_id: &str) -> Vec<Option<String>> {
            self.routes(conn_id, |event| match event {
                Event::PairPeer(e) => Some(&e.conn_id),
                _ => None,
            })
        }

        fn messages(&self) -> Vec<String> {
            self.pick(|event| match event {
                Event::Message(e) => Some(e.payload.clone()),
                _ => None,
            })
        }

        fn closed(&self) -> Vec<String> {
            self.pick(|event| match event {
                Event::Closed(e) => Some(e.conn_id.clone()),
                _ => None,
            })
        }

        /// How each announced peer is reached, and where it is homed.
        fn paths(&self) -> Vec<(String, Option<String>)> {
            self.seen
                .lock()
                .iter()
                .filter_map(|(_, event)| match event {
                    Event::Peer(e) => Some((e.connection_type.clone(), e.relay_url.clone())),
                    _ => None,
                })
                .collect()
        }

        fn pick(&self, of: impl Fn(&Event) -> Option<String>) -> Vec<String> {
            self.seen
                .lock()
                .iter()
                .filter_map(|(_, event)| of(event))
                .collect()
        }

        /// Who each message on `conn_id` was addressed to, in order.
        fn message_routes(&self, conn_id: &str) -> Vec<Option<String>> {
            self.routes(conn_id, |event| match event {
                Event::Message(e) => Some(&e.conn_id),
                _ => None,
            })
        }

        /// Who each close on `conn_id` was addressed to.
        fn closed_routes(&self, conn_id: &str) -> Vec<Option<String>> {
            self.routes(conn_id, |event| match event {
                Event::Closed(e) => Some(&e.conn_id),
                _ => None,
            })
        }

        fn routes(
            &self,
            conn_id: &str,
            of: impl Fn(&Event) -> Option<&String>,
        ) -> Vec<Option<String>> {
            self.seen
                .lock()
                .iter()
                .filter(|(_, event)| of(event).is_some_and(|id| id == conn_id))
                .map(|(to, _)| to.clone())
                .collect()
        }

        /// The pump runs on the endpoint's own runtime, so a test waits on it
        /// rather than driving it.
        fn wait(&self, what: &str, done: impl Fn(&Self) -> bool) {
            let deadline = std::time::Instant::now() + Duration::from_secs(10);
            while std::time::Instant::now() < deadline {
                if done(self) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(5));
            }
            panic!("nothing delivered {what} in ten seconds");
        }
    }

    /// The peer, on a runtime of its own so the endpoint under test is driven
    /// by nothing but its own accept loop.
    struct Guest {
        runtime: tokio::runtime::Runtime,
        endpoint: Endpoint,
    }

    impl Guest {
        fn new() -> Self {
            Self::with(bound())
        }

        /// A peer that grants no bidirectional stream credit, so a dial to it
        /// completes its handshake and then waits on `open_bi` for credit that
        /// never arrives.
        fn ungenerous() -> Self {
            Self::tuned(
                iroh::endpoint::QuicTransportConfig::builder()
                    .max_concurrent_bidi_streams(0u32.into())
                    .build(),
            )
        }

        /// A peer that can reach a relay, for the one test that leaves
        /// loopback. It waits until it is online, because an endpoint with no
        /// relay of its own cannot be answered over one.
        fn relaying() -> Self {
            Self::with(async {
                let endpoint = Endpoint::builder(presets::Minimal)
                    .alpns(vec![ALPN.to_vec()])
                    .relay_mode(RelayMode::Default)
                    .bind()
                    .await
                    .expect("bind");
                let _ = timeout(ONLINE_DEADLINE, endpoint.online()).await;
                endpoint
            })
        }

        /// A peer with a one-kilobyte receive window, so the host's writer
        /// stalls on flow control after a line or two and everything behind it
        /// has to queue.
        fn stingy() -> Self {
            Self::tuned(
                iroh::endpoint::QuicTransportConfig::builder()
                    .stream_receive_window(1024u32.into())
                    .receive_window(1024u32.into())
                    .build(),
            )
        }

        fn tuned(config: iroh::endpoint::QuicTransportConfig) -> Self {
            Self::with(async move {
                Endpoint::builder(presets::Minimal)
                    .alpns(vec![ALPN.to_vec()])
                    .relay_mode(RelayMode::Disabled)
                    .transport_config(config)
                    .bind()
                    .await
                    .expect("bind")
            })
        }

        fn with(binding: impl Future<Output = Endpoint>) -> Self {
            // Two workers, like the endpoint under test. The default is one per
            // core, and this module runs seventeen loopback tests at once, each
            // with a peer and an endpoint: enough threads to starve the ten
            // second waits below on a machine with cores to spare.
            let runtime = tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .enable_all()
                .build()
                .expect("runtime");
            let endpoint = runtime.block_on(binding);
            Self { runtime, endpoint }
        }

        /// Answers the handshake and nothing else, so a dial to this peer gets
        /// as far as a connection and no further.
        fn accept_and_stall(&self) {
            let listener = self.endpoint.clone();
            self.runtime.spawn(async move {
                while let Some(incoming) = listener.accept().await {
                    let _ = incoming.await;
                }
            });
        }

        fn dial(
            &self,
            to: EndpointAddr,
        ) -> (
            Connection,
            iroh::endpoint::SendStream,
            iroh::endpoint::RecvStream,
        ) {
            self.try_dial(to).expect("connect")
        }

        #[allow(clippy::type_complexity)]
        fn try_dial(
            &self,
            to: EndpointAddr,
        ) -> Result<
            (
                Connection,
                iroh::endpoint::SendStream,
                iroh::endpoint::RecvStream,
            ),
            String,
        > {
            self.runtime.block_on(async {
                let conn = self
                    .endpoint
                    .connect(to, ALPN)
                    .await
                    .map_err(|e| e.to_string())?;
                let (send, recv) = conn.open_bi().await.map_err(|e| e.to_string())?;
                Ok((conn, send, recv))
            })
        }

        /// Completes the handshake and opens no stream, which is what the
        /// accept loop must not wait on.
        fn connect_only(&self, to: EndpointAddr) -> Connection {
            self.runtime
                .block_on(async { self.endpoint.connect(to, ALPN).await })
                .expect("connect")
        }

        fn write(&self, send: &mut iroh::endpoint::SendStream, bytes: &[u8]) {
            let _ = self.runtime.block_on(async { send.write_all(bytes).await });
        }

        /// Says this peer has nothing more to send, without hanging up.
        fn finish(&self, send: &mut iroh::endpoint::SendStream) {
            let _ = send.finish();
            // The FIN rides the next flush, which the host only sees once this
            // runtime drives the connection again.
            self.runtime
                .block_on(async { tokio::time::sleep(Duration::from_millis(50)).await });
        }

        /// The lines this peer is sent, read after the host has already let
        /// go: what the host wrote is only delivered if it survived the
        /// hang-up. Short of `want` when the stream ended before they arrived,
        /// which is what a discarded queue looks like from here.
        fn read_lines(&self, recv: iroh::endpoint::RecvStream, want: usize) -> Vec<String> {
            self.runtime.block_on(async {
                let mut lines = BufReader::new(recv).lines();
                let mut heard = Vec::new();
                while heard.len() < want {
                    let line = timeout(Duration::from_secs(10), lines.next_line())
                        .await
                        .expect("a peer that is sent a line hears it inside ten seconds");
                    match line {
                        Ok(Some(line)) => heard.push(line),
                        _ => break,
                    }
                }
                heard
            })
        }
    }

    fn live_addr(state: &CollabState) -> EndpointAddr {
        state
            .live
            .lock()
            .as_ref()
            .expect("a live endpoint")
            .endpoint
            .addr()
    }

    fn holds(state: &CollabState, conn_id: &str) -> bool {
        state
            .live
            .lock()
            .as_ref()
            .is_some_and(|live| live.conns.lock().contains_key(conn_id))
    }

    /// A connection the host let go of stops being a connection on the peer's
    /// side too, which is the whole difference between dropping a sender and
    /// closing a link.
    fn wait_closed(conn: &Connection) {
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while std::time::Instant::now() < deadline {
            if conn.close_reason().is_some() {
                return;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        panic!("the peer is still holding an open connection");
    }

    /// The state the app runs, with both deadlines shortened. They are real
    /// time over a loopback link, so waiting out the shipping ten and fifteen
    /// seconds would prove exactly the same thing and cost the suite half a
    /// minute.
    fn impatient() -> CollabState {
        CollabState {
            hello: Duration::from_millis(300),
            dial: Duration::from_millis(300),
            ..CollabState::default()
        }
    }

    /// The reader starts before the handshake has admitted anyone, so an
    /// unbounded line is reachable by anything that can open the ALPN.
    #[test]
    fn a_line_past_the_cap_drops_the_connection() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::new();
        let (conn, mut send, _recv) = guest.dial(live_addr(&state));
        // `accept_bi` returns only once the peer writes, so the flood both
        // opens the stream and overruns it.
        guest.write(&mut send, &vec![b'x'; MAX_LINE + 1]);

        events.wait("the close", |seen| !seen.closed().is_empty());
        let conn_id = events.peers()[0].clone();
        assert_eq!(events.closed(), vec![conn_id.clone()]);
        assert!(events.messages().is_empty(), "nothing past the cap parses");
        assert!(!holds(&state, &conn_id));
        wait_closed(&conn);

        stop(&state, "session").expect("stop");
    }

    /// One dial that opens the ALPN and no stream used to be enough: the
    /// handshake and the wait for the peer's first stream ran in the accept
    /// loop, so the loop stopped accepting and the debater's own partner never
    /// arrived.
    #[test]
    fn a_dial_that_opens_no_stream_does_not_keep_the_next_peer_out() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");
        let addr = live_addr(&state);

        let quiet = Guest::new();
        let _held = quiet.connect_only(addr.clone());

        let guest = Guest::new();
        let (_conn, mut send, _recv) = guest.dial(addr);
        guest.write(&mut send, b"{\"type\":\"hello\",\"protocol\":1}\n");

        events.wait("the second peer's hello", |seen| {
            !seen.messages().is_empty()
        });

        stop(&state, "session").expect("stop");
    }

    /// A peer that finishes its send stream is done talking, and the host has
    /// to let go of it. Waiting for the peer to close the connection instead
    /// hands it the choice: answer keepalives and the entry, both pumps and the
    /// task are held for good, which the connection cap turns from a leak into
    /// a lockout at the thirty-second one.
    #[test]
    fn a_peer_that_finishes_its_stream_is_let_go_of() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::new();
        let (conn, mut send, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();

        // Done sending, and holding the connection open regardless.
        guest.finish(&mut send);

        events.wait("the close", |seen| !seen.closed().is_empty());
        assert_eq!(events.closed(), vec![conn_id.clone()]);
        assert!(!holds(&state, &conn_id), "the entry goes with the read");
        drop(conn);

        stop(&state, "session").expect("stop");
    }

    /// A stream opened with one byte and no newline in it costs two tasks and a
    /// map entry. Admission happens above this module and only ever sees whole
    /// lines, so without a deadline here nothing would ever release it.
    #[test]
    fn a_stream_that_never_finishes_a_line_runs_out_of_time() {
        let state = impatient();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::new();
        let (conn, mut send, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send, b"{");

        events.wait("the close", |seen| !seen.closed().is_empty());
        let conn_id = events.peers()[0].clone();
        assert!(events.messages().is_empty(), "no line was ever finished");
        assert!(!holds(&state, &conn_id), "the entry goes with the deadline");
        wait_closed(&conn);

        stop(&state, "session").expect("stop");
    }

    /// Every dial costs a connection, two tasks and a map entry, and a stranger
    /// who learned the EndpointId can make as many as it likes. The endpoint
    /// stops taking them rather than growing without a ceiling.
    #[test]
    fn the_endpoint_stops_accepting_past_the_connection_cap() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");
        let addr = live_addr(&state);

        let guest = Guest::new();
        let mut kept = Vec::new();
        for n in 1..=MAX_CONNS {
            let (conn, mut send, recv) = guest.dial(addr.clone());
            guest.write(&mut send, b"{\"type\":\"hello\",\"protocol\":1}\n");
            events.wait("every hello", |seen| seen.messages().len() >= n);
            kept.push((conn, send, recv));
        }

        assert!(
            guest.try_dial(addr).is_err(),
            "a full endpoint refuses the next dial"
        );
        assert_eq!(events.peers().len(), MAX_CONNS, "nothing past the cap");

        stop(&state, "session").expect("stop");
    }

    /// The cheapest connection a stranger can make is the one that completes
    /// the handshake and opens no stream: it reaches no map entry, so a cap
    /// counting only the map would let it be made without limit while each one
    /// still holds a connection and a task for the whole hello deadline.
    #[test]
    fn a_handshake_that_opens_no_stream_still_counts_against_the_cap() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");
        let addr = live_addr(&state);

        let quiet = Guest::new();
        let mut held = Vec::new();
        for _ in 0..MAX_CONNS {
            held.push(quiet.connect_only(addr.clone()));
        }

        // Nothing has sent a line, so the map is still empty and only the
        // pending count stands between a stranger and the endpoint.
        assert!(events.peers().is_empty(), "no peer has spoken");
        assert!(
            quiet.try_dial(addr).is_err(),
            "a stranger holding the cap in handshakes takes no more"
        );

        stop(&state, "session").expect("stop");
    }

    /// The in-flight count is what makes the cap a cap rather than a wedge.
    /// `Pending` decrements it when an accept task ends, and the map entry goes
    /// with the read, so an endpoint that has let go of thirty-two peers has
    /// room for the thirty-third. Without the decrement the count keeps every
    /// connection the endpoint ever accepted and refuses every dial after
    /// thirty-two for the life of the process - a worse denial than the
    /// unbounded growth the count was added to stop.
    #[test]
    fn a_connection_the_host_let_go_of_gives_its_place_back() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");
        let addr = live_addr(&state);

        let guest = Guest::new();
        for n in 1..=MAX_CONNS + 1 {
            let (conn, mut send, _recv) = guest
                .try_dial(addr.clone())
                .unwrap_or_else(|e| panic!("dial {n} of {} refused: {e}", MAX_CONNS + 1));
            guest.write(&mut send, b"{\"type\":\"hello\",\"protocol\":1}\n");
            events.wait("every hello", |seen| seen.messages().len() >= n);
            // Done sending, so the host lets go of this one before the next dial
            // asks for its place: nothing here is ever holding two at once.
            guest.finish(&mut send);
            events.wait("every close", |seen| seen.closed().len() >= n);
            drop(conn);
        }

        stop(&state, "session").expect("stop");
    }

    /// A peer that answers the handshake and grants no stream credit used to
    /// freeze the app: the dial held the one lock every collab command takes,
    /// and waited on that credit with no deadline.
    #[test]
    fn a_dial_that_stalls_leaves_the_other_commands_running() {
        let state = impatient();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let stall = Guest::ungenerous();
        stall.accept_and_stall();
        // The full address, so the dial actually reaches this peer and hangs
        // on the credit it withholds. By EndpointId alone there is nothing to
        // send the first packet to, and the deadline this proves would never
        // be the thing that ended the wait.
        let target = stall.endpoint.addr();

        std::thread::scope(|threads| {
            let dialling = threads.spawn(|| dial(&state, events.clone(), "session", target));

            // The lock is free while the dial waits, so this returns instead of
            // queueing behind it.
            let started = std::time::Instant::now();
            stop(&state, "another-window").expect("a window holding nothing lets go");
            assert!(
                started.elapsed() < Duration::from_millis(200),
                "the lock was held across the dial"
            );

            assert!(
                dialling.join().expect("the dial thread").is_err(),
                "the wait is bounded"
            );
        });

        assert!(state.live.lock().is_some(), "the endpoint is still up");
        stop(&state, "session").expect("stop");
    }

    /// The queue in front of a peer is bounded, so a peer that stops reading
    /// its own stream loses lines instead of growing the host's memory until
    /// the round dies with the process.
    #[test]
    fn a_peer_that_stops_reading_fills_its_queue_and_no_more() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::stingy();
        let (_conn, mut send_stream, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send_stream, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();

        // Room for the queue to fill and then some. An unbounded channel takes
        // every one of these.
        let line = "x".repeat(4096);
        let refused = (0..OUTBOUND_QUEUE * 4)
            .find_map(|_| send(&state, "session", &conn_id, line.clone()).err());
        assert_eq!(refused.as_deref(), Some("That peer is not keeping up"));

        stop(&state, "session").expect("stop");
    }

    /// Dropping the sender leaves the peer connected and still being read, so
    /// a host that refused someone would keep hearing from them.
    #[test]
    fn closing_a_connection_takes_the_connection_with_it() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::new();
        let (conn, mut send, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();
        assert!(holds(&state, &conn_id));

        close(&state, "session", &conn_id).expect("close");

        assert!(!holds(&state, &conn_id));
        wait_closed(&conn);

        stop(&state, "session").expect("stop");
    }

    /// A write is a push onto the writer's queue and nothing more, so the line
    /// a round ends with is still in that queue when the hang-up arrives.
    /// Closing the connection over it dropped it on the floor: the partner
    /// never heard the farewell and saw a socket vanish instead of a debater
    /// leaving, which is the difference between "left the round" and "lost
    /// connection" in front of them.
    #[test]
    fn a_line_handed_over_just_before_a_hang_up_still_reaches_the_peer() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::new();
        let (conn, mut send_stream, recv) = guest.dial(live_addr(&state));
        guest.write(&mut send_stream, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();

        // A round's last exchange, back to back with the hang-up and with
        // nothing between them that could flush the queue. The state line is
        // deliberately larger than one flight: a write that has returned is
        // not a write the peer has acknowledged, and closing over the
        // difference truncates the stream just as surely as an aborted writer
        // discards the queue.
        let state_line = "x".repeat(128 * 1024);
        send(&state, "session", &conn_id, state_line.clone()).expect("the round's last state");
        send(
            &state,
            "session",
            &conn_id,
            "{\"type\":\"bye\"}".to_string(),
        )
        .expect("the farewell");
        close(&state, "session", &conn_id).expect("close");

        // Read after the hang-up on purpose: the bytes have to have outlived
        // it, not merely have been queued before it.
        assert_eq!(
            guest.read_lines(recv, 2),
            vec![state_line, "{\"type\":\"bye\"}".to_string()],
            "everything queued went out before the connection went down"
        );
        wait_closed(&conn);
        assert!(!holds(&state, &conn_id));

        stop(&state, "session").expect("stop");
    }

    /// The flush is what a peer could hold the app by: a peer that has stopped
    /// reading stalls the writer on flow control and never lets the queue
    /// drain. Waiting for it without a deadline would hand that peer the
    /// window's exit, which the shell only allows three seconds for in total.
    #[test]
    fn a_peer_that_stopped_reading_cannot_hold_a_hang_up_open() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::stingy();
        let (_conn, mut send_stream, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send_stream, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();

        // Past the peer's one-kilobyte window several times over, so the
        // writer is stalled with lines still queued behind it. The stream is
        // never read from, so nothing reopens the window.
        let line = "x".repeat(4096);
        for _ in 0..8 {
            let _ = send(&state, "session", &conn_id, line.clone());
        }

        let started = std::time::Instant::now();
        close(&state, "session", &conn_id).expect("close");
        let waited = started.elapsed();

        assert!(
            waited >= HANG_UP_GRACE,
            "the flush was not waited on at all"
        );
        assert!(
            waited < HANG_UP_GRACE * 4,
            "a stalled peer held the hang-up for {waited:?}"
        );
        assert!(!holds(&state, &conn_id));

        stop(&state, "session").expect("stop");
    }

    /// The other way a round ends: the window says goodbye and takes the
    /// endpoint down behind it. `shutdown` drains what is queued for the same
    /// reason a hang-up does, because closing the endpoint first discards it.
    #[test]
    fn the_last_line_of_a_round_survives_the_endpoint_coming_down() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::new();
        let (_conn, mut send_stream, recv) = guest.dial(live_addr(&state));
        guest.write(&mut send_stream, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();

        send(
            &state,
            "session",
            &conn_id,
            "{\"type\":\"bye\"}".to_string(),
        )
        .expect("the farewell");
        stop(&state, "session").expect("stop");

        assert_eq!(
            guest.read_lines(recv, 1),
            vec!["{\"type\":\"bye\"}".to_string()],
            "the endpoint waited for what it had queued"
        );
    }

    /// Two PeerLinks share one bind, so a stop by one of them is a release and
    /// not a teardown.
    #[test]
    fn one_holder_stopping_leaves_the_endpoint_usable() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        let listener = start(&state, events.clone(), false, false, "listener").expect("bind");
        let session = start(&state, events.clone(), false, false, "session").expect("share");
        assert_eq!(listener, session, "one bind, not two");

        stop(&state, "listener").expect("the listener lets go");

        let guest = Guest::new();
        let (_conn, mut send, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());

        stop(&state, "session").expect("the session lets go");
        assert!(state.live.lock().is_none(), "the last one out closes it");
    }

    /// A share is released by the window that took it. A caller that never
    /// started holds nothing, so it has nothing to give back - otherwise two
    /// calls from a script would take another window's round down.
    #[test]
    fn a_window_that_never_started_cannot_release_the_endpoint() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        stop(&state, "another-window").expect("nothing to release");
        stop(&state, "another-window").expect("still nothing to release");

        assert!(state.live.lock().is_some(), "the round is still shared");
        stop(&state, "session").expect("the holder lets go");
        assert!(state.live.lock().is_none());
    }

    /// One window taking the endpoint twice gives it back twice. The idle
    /// invite listener and a round's session can both be in one window.
    #[test]
    fn one_window_holding_twice_releases_twice() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");
        start(&state, events.clone(), false, false, "session").expect("share");

        stop(&state, "session").expect("the listener half lets go");
        assert!(state.live.lock().is_some(), "one share is still held");

        stop(&state, "session").expect("the session half lets go");
        assert!(state.live.lock().is_none());
    }

    /// The relay and mDNS settings belong to the bind, and one bind is shared.
    /// A second holder asking for different ones is told so rather than being
    /// quietly run on the first holder's network.
    #[test]
    fn a_second_holder_cannot_quietly_change_the_network_settings() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "listener").expect("bind");

        assert!(
            start(&state, events.clone(), true, false, "session").is_err(),
            "relaying is not turned on behind the first holder's back"
        );
        assert!(
            start(&state, events.clone(), false, true, "session").is_err(),
            "multicast is not turned on behind the first holder's back"
        );
        start(&state, events.clone(), false, false, "session").expect("the same settings share");

        stop(&state, "listener").expect("stop");
        stop(&state, "session").expect("stop");
    }

    /// A connection id names something a window may write to, so it is drawn
    /// rather than counted. `c1` was guessable from any window.
    #[test]
    fn a_connection_id_is_not_guessable() {
        let first = new_conn_id();
        assert_eq!(first.len(), 32);
        assert!(first.chars().all(|c| c.is_ascii_hexdigit()), "{first}");
        assert_ne!(first, new_conn_id());
    }

    /// A connection this app dialled belongs to the window that dialled it, so
    /// every event on it is addressed to that window and never to whichever one
    /// happens to hold focus - a debater looking at a second window must not
    /// cost a guest its helloAck.
    ///
    /// `dial` resolves a bare `EndpointId`, which needs discovery or a relay and
    /// so cannot run in-process without reaching the network. What it
    /// contributes to routing is the owner label it hands `spawn_conn`, and that
    /// is what this drives directly, over a real connection.
    #[test]
    fn a_connection_registered_with_an_owner_is_addressed_to_it() {
        let host = CollabState::default();
        let host_events = Arc::new(Recorder::default());
        start(&host, host_events.clone(), false, false, "host").expect("bind");

        let guest = Guest::new();
        let (conn, mut send_stream, recv) = guest.dial(live_addr(&host));
        // A QUIC stream carries nothing until it does, so the host cannot accept
        // one that has never been written to.
        guest.write(&mut send_stream, b"{\"type\":\"hello\",\"protocol\":1}\n");

        let events = Arc::new(Recorder::default());
        let conns: Arc<Mutex<HashMap<String, Conn>>> = Arc::new(Mutex::new(HashMap::new()));
        guest.runtime.block_on(async {
            spawn_conn(
                events.clone(),
                conns.clone(),
                "c1".to_string(),
                Some("guest-window".to_string()),
                HELLO_DEADLINE,
                guest.endpoint.clone(),
                conn,
                send_stream,
                recv,
            );
        });

        host_events.wait("the peer", |seen| !seen.peers().is_empty());
        let inbound = host_events.peers()[0].clone();
        send(
            &host,
            "host",
            &inbound,
            "{\"type\":\"helloAck\"}".to_string(),
        )
        .expect("ack");

        events.wait("the ack", |seen| !seen.message_routes("c1").is_empty());
        assert_eq!(
            events.message_routes("c1"),
            vec![Some("guest-window".to_string())],
            "the dialling window, not whichever one has focus"
        );

        stop(&host, "host").expect("stop");
    }

    /// An accepted connection cannot be addressed at all until a window claims
    /// it, because the round it belongs to arrives in its hello and that is
    /// read above this module. So it starts on a broadcast, and the window that
    /// admits its peer takes it off one.
    #[test]
    fn an_accepted_connection_leaves_the_broadcast_once_a_window_claims_it() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::new();
        let (_conn, mut send_stream, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send_stream, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();
        assert_eq!(
            events.message_routes(&conn_id),
            vec![None],
            "nothing knows whose connection this is yet"
        );

        claim(&state, "admitting-window", &conn_id).expect("claim");
        guest.write(&mut send_stream, b"{\"type\":\"state\"}\n");
        events.wait("the second line", |seen| {
            seen.message_routes(&conn_id).len() >= 2
        });

        assert_eq!(
            events.message_routes(&conn_id)[1],
            Some("admitting-window".to_string()),
            "the window that admitted the peer owns it from then on"
        );

        close(&state, "admitting-window", &conn_id).expect("close");
        events.wait("the close", |seen| !seen.closed().is_empty());
        assert_eq!(
            events.closed_routes(&conn_id),
            vec![Some("admitting-window".to_string())],
            "the close reaches the owner too"
        );

        stop(&state, "session").expect("stop");
    }

    /// The window hosting a round is not always the first to write on a
    /// connection about it: an accepted connection reaches every window, and a
    /// window with a different flow open reads the same hello as a saved
    /// contact offering a round and answers it with a refusal. Latching on that
    /// write handed the guest to the refusing window, which then hung up, and
    /// the host's own ack was refused as another window's.
    #[test]
    fn a_window_that_refuses_a_peer_does_not_take_it_from_the_one_that_admits_it() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::new();
        let (_conn, mut send_stream, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send_stream, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();

        send(
            &state,
            "refusing-window",
            &conn_id,
            "{\"type\":\"helloAck\",\"ok\":false}".to_string(),
        )
        .expect("a refusal is answered, not claimed");

        claim(&state, "admitting-window", &conn_id).expect("the host still gets its guest");
        assert_eq!(
            claim(&state, "refusing-window", &conn_id).unwrap_err(),
            "That peer belongs to another window",
            "and a second claim does not steal it back"
        );

        stop(&state, "session").expect("stop");
    }

    /// A refusal hangs up, and it never claims what it refused, so hanging up
    /// on a connection nobody has claimed has to stay open to any window. With
    /// one window holding the endpoint, its refusal is everyone's.
    #[test]
    fn the_only_window_refusing_an_unclaimed_peer_hangs_up_on_it() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::new();
        let (conn, mut send_stream, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send_stream, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();

        close(&state, "session", &conn_id).expect("a refusal hangs up");
        assert!(!holds(&state, &conn_id));
        wait_closed(&conn);

        stop(&state, "session").expect("stop");
    }

    /// The other window's refusal and the host's claim are two IPC calls
    /// from two webviews, and nothing orders them. A refusal that landed
    /// first used to hang up on the guest before the host could claim it, so
    /// the outcome of every join with two windows open was the order two
    /// event loops happened to run in.
    #[test]
    fn a_refusal_that_lands_before_the_claim_does_not_cost_the_host_its_guest() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "host").expect("bind");
        start(&state, events.clone(), false, false, "other").expect("second window");

        let guest = Guest::new();
        let (conn, mut send_stream, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send_stream, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();

        close(&state, "other", &conn_id).expect("a refusal is accepted");
        assert!(
            holds(&state, &conn_id),
            "one refusal of two is not a hang-up"
        );
        claim(&state, "host", &conn_id).expect("the host still gets its guest");
        assert!(
            conn.close_reason().is_none(),
            "and the guest is still connected"
        );
        send(
            &state,
            "host",
            &conn_id,
            "{\"type\":\"helloAck\",\"ok\":true}".to_string(),
        )
        .expect("the ack goes out on it");

        stop(&state, "host").expect("stop");
        stop(&state, "other").expect("stop");
    }

    /// Every holder refusing is the whole answer, so a stranger is still hung
    /// up on without waiting out any deadline.
    #[test]
    fn every_window_refusing_an_unclaimed_peer_hangs_up_on_it() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "host").expect("bind");
        start(&state, events.clone(), false, false, "other").expect("second window");

        let guest = Guest::new();
        let (conn, mut send_stream, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send_stream, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();

        close(&state, "other", &conn_id).expect("first refusal");
        close(&state, "other", &conn_id).expect("a repeat counts once");
        assert!(holds(&state, &conn_id));
        close(&state, "host", &conn_id).expect("second refusal");
        assert!(!holds(&state, &conn_id));
        wait_closed(&conn);

        stop(&state, "host").expect("stop");
        stop(&state, "other").expect("stop");
    }

    /// A window that holds the endpoint and never answers would otherwise
    /// hold every refused stranger open for the life of the session.
    #[test]
    fn a_refused_peer_nobody_claims_is_hung_up_on_at_the_hello_deadline() {
        let state = impatient();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "host").expect("bind");
        start(&state, events.clone(), false, false, "silent").expect("second window");

        let guest = Guest::new();
        let (conn, mut send_stream, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send_stream, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();

        close(&state, "host", &conn_id).expect("refusal");
        assert!(holds(&state, &conn_id));
        wait_closed(&conn);
        events.wait("the close", |seen| !seen.closed().is_empty());
        assert!(!holds(&state, &conn_id));

        stop(&state, "host").expect("stop");
        stop(&state, "silent").expect("stop");
    }

    /// Ids are process-global over one shared endpoint, so the owner is what
    /// keeps one window from writing on another window's round or hanging up on
    /// its partner mid-round.
    #[test]
    fn another_window_cannot_write_to_or_close_a_peer_it_does_not_own() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::new();
        let (conn, mut send_stream, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send_stream, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());
        let conn_id = events.peers()[0].clone();

        claim(&state, "owner", &conn_id).expect("the admitting window claims it");

        assert_eq!(
            send(
                &state,
                "intruder",
                &conn_id,
                "{\"type\":\"delta\"}".to_string()
            )
            .unwrap_err(),
            "That peer belongs to another window"
        );
        assert_eq!(
            close(&state, "intruder", &conn_id).unwrap_err(),
            "That peer belongs to another window"
        );
        assert!(holds(&state, &conn_id), "the owner still has its peer");
        assert!(conn.close_reason().is_none(), "and the peer is still up");

        stop(&state, "session").expect("stop");
    }

    /// `collabLive()` is what a debater's click goes through, and a script does
    /// not click. So the command a script would call refuses on its own account
    /// with shared editing off, and refuses before anything binds: a bound
    /// endpoint is what turns webview script execution into a socket, a relay
    /// contact and a multicast announcement.
    #[test]
    fn the_start_command_binds_nothing_with_shared_editing_off() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());

        assert_eq!(
            start_gated(&state, events.clone(), true, true, "session", false).unwrap_err(),
            "Shared editing is off"
        );
        assert!(state.live.lock().is_none(), "nothing was bound");

        start_gated(&state, events.clone(), false, false, "session", true).expect("bind");
        assert!(state.live.lock().is_some(), "the switch is what gates it");

        stop(&state, "session").expect("stop");
    }

    /// The relay in a ticket is what a guest on another network sends its
    /// first packet to, so a session with nothing to name says so plainly
    /// rather than putting a stale or invented address in front of a debater.
    #[test]
    fn a_session_with_no_relay_puts_none_in_the_ticket() {
        let state = CollabState::default();
        assert_eq!(relay_url(&state), "", "nothing is bound");

        let events = Arc::new(Recorder::default());
        start(&state, events, false, false, "session").expect("bind");
        assert_eq!(
            relay_url(&state),
            "",
            "relaying is off, so there is no relay to be reached at"
        );
        stop(&state, "session").expect("stop");
    }

    /// Every wait in this module happens on the collaboration runtime, driven
    /// with `block_on`, and moving the commands off the main thread means
    /// doing that from a thread the shell's own runtime handed out. Tokio
    /// panics if that thread is one running async tasks, so what makes this
    /// legal is `off_thread` choosing a blocking one. A future refactor onto
    /// `spawn` would compile and then panic on the first click.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_command_can_drive_the_collaboration_runtime_from_off_the_main_thread() {
        let events = Arc::new(Recorder::default());
        let state = Arc::new(CollabState::default());

        let bound = state.clone();
        off_thread(move || start(&bound, events, false, false, "session"))
            .await
            .expect("bind");

        let held = state.clone();
        off_thread(move || stop(&held, "session"))
            .await
            .expect("stop");
        assert!(state.live.lock().is_none(), "and the endpoint came down");
    }

    /// A peer met over loopback is reached directly and is homed on no relay,
    /// which is the answer that must reach the webview: an invented relay
    /// would be saved against this contact and dialled forever.
    #[test]
    fn a_direct_peer_reports_no_relay() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), false, false, "session").expect("bind");

        let guest = Guest::new();
        let (_conn, mut send, _recv) = guest.dial(live_addr(&state));
        guest.write(&mut send, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());

        assert_eq!(events.paths(), vec![("direct".to_string(), None)]);

        stop(&state, "session").expect("stop");
    }

    /// Two networks apart, over the real relay fleet.
    ///
    /// Ignored, because it is the one test here that reaches the internet:
    /// the rest of this module is loopback on purpose. Run it by hand with
    /// `cargo test --lib relay_only -- --ignored`.
    ///
    /// What it holds is the whole cross-network claim. The guest is handed the
    /// host's EndpointId and the host's relay and nothing else - no IP, no
    /// mDNS, no lookup service - which is exactly what a pasted ticket
    /// carries. If the link stands up from that, a debater on a hotspot can
    /// reach a partner on home wifi.
    #[test]
    #[ignore]
    fn relay_only_addressing_reaches_a_host_with_no_other_route() {
        let state = CollabState::default();
        let events = Arc::new(Recorder::default());
        start(&state, events.clone(), true, false, "session").expect("bind");

        let host_id = state.live.lock().as_ref().unwrap().endpoint_id.clone();
        let relay = relay_url(&state);
        assert!(relay.starts_with("https://"), "the host found a relay");

        let guest = Guest::relaying();

        // The negative half, and what makes the rest mean anything: by
        // EndpointId alone there is nowhere to send the first packet, which
        // is the ticket this build used to mint.
        assert!(
            guest
                .try_dial(dial_target(&host_id, None).expect("an id names the host"))
                .is_err(),
            "a name with no address reaches nobody"
        );

        let addr = dial_target(&host_id, Some(&relay)).expect("the ticket's address");
        assert!(
            addr.ip_addrs().next().is_none(),
            "the guest is told a relay and nothing about the host's network"
        );

        let (_conn, mut send, _recv) = guest.dial(addr);
        guest.write(&mut send, b"{\"type\":\"hello\",\"protocol\":1}\n");
        events.wait("the hello", |seen| !seen.messages().is_empty());

        stop(&state, "session").expect("stop");
    }

    // --- The temporary endpoint a pairing code names -----------------------

    /// A relay nobody answers on, so homing always runs out of time. The
    /// shipping list is four real n0 servers, and what these prove is what the
    /// shell does with an endpoint that cannot home - reaching a real one to
    /// find out would put a unit test on the network.
    const NOWHERE: [&str; 1] = ["https://relay.invalid./"];

    const A_CODE: &str = "K7QM3XPV";
    const ANOTHER_CODE: &str = "TESTAA01";

    fn pair_addr(state: &CollabState) -> EndpointAddr {
        state
            .live
            .lock()
            .as_ref()
            .expect("a live endpoint")
            .pair
            .as_ref()
            .expect("a pairing endpoint")
            .endpoint
            .addr()
    }

    fn has_pair(state: &CollabState) -> bool {
        state
            .live
            .lock()
            .as_ref()
            .is_some_and(|live| live.pair.is_some())
    }

    /// A bound session with relaying off, which is what a loopback test can
    /// have: the pairing endpoint follows that switch and skips the wait for a
    /// relay it is not allowed to use.
    fn offline_session(events: Arc<Recorder>) -> CollabState {
        let state = impatient();
        start(&state, events, false, false, "win-1").expect("bind");
        state
    }

    #[test]
    fn a_pairing_endpoint_is_the_one_the_code_names() {
        let state = offline_session(Arc::new(Recorder::default()));
        let (key, _) = crate::pairing::derive(A_CODE).expect("a valid code");
        let id = pair_start(&state, Arc::new(Recorder::default()), "win-1", A_CODE)
            .expect("a pairing endpoint");
        assert_eq!(id, key.public().to_string());
        stop(&state, "win-1").expect("stop");
    }

    #[test]
    fn a_code_that_will_not_normalize_binds_nothing() {
        let state = offline_session(Arc::new(Recorder::default()));
        assert!(pair_start(&state, Arc::new(Recorder::default()), "win-1", "IIIIIIII").is_err());
        assert!(!has_pair(&state));
        stop(&state, "win-1").expect("stop");
    }

    #[test]
    fn a_relay_that_never_answers_leaves_no_endpoint_behind() {
        let mut state = impatient();
        // Long enough to bind, far too short for a relay that is not there.
        state.pair_online = Duration::from_millis(50);
        start(&state, Arc::new(Recorder::default()), false, false, "win-1").expect("bind");

        let (key, relay) = crate::pairing::derive_at(A_CODE, &NOWHERE).expect("a valid code");
        let err = pair_bind(
            &state,
            Arc::new(Recorder::default()),
            "win-1",
            key,
            relay,
            true,
        )
        .expect_err("a relay that is not there");
        assert!(err.contains("relay"), "{err}");
        assert!(
            !has_pair(&state),
            "a failed bind must not leave an endpoint held"
        );
        stop(&state, "win-1").expect("stop");
    }

    #[test]
    fn stopping_a_pairing_lets_go_of_its_endpoint() {
        let state = offline_session(Arc::new(Recorder::default()));
        pair_start(&state, Arc::new(Recorder::default()), "win-1", A_CODE).expect("a pairing");
        let addr = pair_addr(&state);
        pair_stop(&state).expect("release");
        assert!(!has_pair(&state));

        // The endpoint is gone, not merely forgotten: a guest that still holds
        // the code reaches nothing.
        let guest = Guest::new();
        assert!(guest.try_dial(addr).is_err());
        stop(&state, "win-1").expect("stop");
    }

    #[test]
    fn stopping_a_pairing_twice_is_not_an_error() {
        let state = offline_session(Arc::new(Recorder::default()));
        pair_start(&state, Arc::new(Recorder::default()), "win-1", A_CODE).expect("a pairing");
        pair_stop(&state).expect("release");
        pair_stop(&state).expect("release again");
        stop(&state, "win-1").expect("stop");
    }

    #[test]
    fn a_second_pairing_replaces_the_first_rather_than_leaking_it() {
        let state = offline_session(Arc::new(Recorder::default()));
        let first = pair_start(&state, Arc::new(Recorder::default()), "win-1", A_CODE)
            .expect("a pairing endpoint");
        let stale = pair_addr(&state);
        let second = pair_start(&state, Arc::new(Recorder::default()), "win-1", ANOTHER_CODE)
            .expect("a pairing endpoint");
        assert_ne!(first, second);
        assert_eq!(
            state
                .live
                .lock()
                .as_ref()
                .expect("live")
                .pair
                .as_ref()
                .expect("a pair")
                .endpoint_id,
            second
        );

        let guest = Guest::new();
        assert!(
            guest.try_dial(stale).is_err(),
            "the old code is off the air"
        );
        stop(&state, "win-1").expect("stop");
    }

    #[test]
    fn releasing_the_session_takes_the_pairing_endpoint_with_it() {
        let state = offline_session(Arc::new(Recorder::default()));
        pair_start(&state, Arc::new(Recorder::default()), "win-1", A_CODE).expect("a pairing");
        let addr = pair_addr(&state);
        stop(&state, "win-1").expect("stop");
        assert!(state.live.lock().is_none());

        let guest = Guest::new();
        assert!(guest.try_dial(addr).is_err());
    }

    #[test]
    fn pairing_needs_a_session_to_hang_off() {
        let state = CollabState::default();
        assert!(pair_start(&state, Arc::new(Recorder::default()), "win-1", A_CODE).is_err());
        assert!(state.live.lock().is_none());
    }

    #[test]
    fn the_switch_being_off_binds_nothing() {
        let state = offline_session(Arc::new(Recorder::default()));
        assert!(pair_start_gated(
            &state,
            Arc::new(Recorder::default()),
            "win-1",
            A_CODE,
            false
        )
        .is_err());
        assert!(!has_pair(&state));
        stop(&state, "win-1").expect("stop");
    }

    #[test]
    fn a_target_is_the_endpoint_and_relay_the_code_names() {
        let (key, relay) = crate::pairing::derive(A_CODE).expect("a valid code");
        let target = pair_target("k7qm-3xpv").expect("a valid code");
        assert_eq!(target.endpoint_id, key.public().to_string());
        assert_eq!(target.relay_url, relay.to_string());
    }

    #[test]
    fn a_target_for_a_code_that_will_not_normalize_is_refused() {
        assert!(pair_target("OOOOOOOO").is_err());
    }

    /// A guest redeeming a code reaches the window that minted it, on the
    /// pairing channel rather than the session's: the session's listener would
    /// read one as a guest arriving with no hello and hang up on it.
    #[test]
    fn a_guest_redeeming_a_code_reaches_the_window_that_minted_it() {
        let events = Arc::new(Recorder::default());
        let state = offline_session(events.clone());
        pair_start(&state, events.clone(), "win-1", A_CODE).expect("a pairing endpoint");

        let guest = Guest::new();
        let (_conn, mut stream, recv) = guest.dial(pair_addr(&state));
        guest.write(&mut stream, b"{\"type\":\"pairHello\",\"name\":\"Sam\"}\n");

        events.wait("the pairing peer", |seen| !seen.pair_peers().is_empty());
        let conn_id = events.pair_peers()[0].clone();
        assert!(
            events.peers().is_empty(),
            "a pairing peer is not announced to the session's listener"
        );
        assert_eq!(
            events.pair_routes(&conn_id),
            vec![Some("win-1".to_string())],
            "the window that minted the code owns what redeems it"
        );
        events.wait("the pairHello", |seen| !seen.messages().is_empty());
        assert_eq!(
            events.message_routes(&conn_id),
            vec![Some("win-1".to_string())]
        );
        assert_eq!(
            events.messages(),
            vec!["{\"type\":\"pairHello\",\"name\":\"Sam\"}"]
        );

        // And the answer goes back the same way, which is the whole exchange:
        // the ticket a code hands over rides this line.
        let ack = "{\"type\":\"pairAck\",\"ticket\":\"ebb1:aGVsbG8\",\"name\":\"Alex\"}";
        send(&state, "win-1", &conn_id, ack.to_string()).expect("the ticket");
        assert_eq!(guest.read_lines(recv, 1), vec![ack.to_string()]);

        stop(&state, "win-1").expect("stop");
    }

    /// The guest derives, the host binds, and the two have to land on one
    /// endpoint or a code reaches nobody.
    ///
    /// The dial itself cannot be proven here: the address a code carries is a
    /// relay URL, and reaching one is the network. What is left, and what
    /// actually breaks when a derivation drifts, is that both halves name the
    /// same endpoint from the same characters.
    #[test]
    fn the_endpoint_a_guest_derives_is_the_one_the_host_bound() {
        let state = offline_session(Arc::new(Recorder::default()));
        let bound =
            pair_start(&state, Arc::new(Recorder::default()), "win-1", A_CODE).expect("a pairing");
        // As the guest types it, which is not how the host minted it.
        let target = pair_target("k7qm-3xpv").expect("a valid code");
        assert_eq!(target.endpoint_id, bound);
        assert!(
            crate::pairing::RELAYS.contains(&target.relay_url.as_str()),
            "a guest is sent to a relay this build ships"
        );
        stop(&state, "win-1").expect("stop");
    }
}
