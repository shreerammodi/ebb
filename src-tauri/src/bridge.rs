//! cardmirror-bridge endpoint (desktop).
//!
//! Two legs, both loopback only. Inbound is a blocking HTTP server on an
//! OS-assigned 127.0.0.1 port: `/ping` is answered here, `/flow` and `/reveal`
//! are handed to the renderer over a `bridge:request` event and back through
//! the `bridge_reply` command. Outbound, Rust reads CardMirror's handshake and
//! posts to it, so the webview never holds the peer's token or a socket.
//! The listener does not exist until CardMirror's session file does.
//!
//! The session token is all that stands between this port and every other
//! process on the machine, so it lives in a 0600 file, is compared in constant
//! time, and any request carrying a browser `Origin`/`Referer` is refused
//! before the token is even looked at.

use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use serde_json::{json, Value as Json};
use subtle::ConstantTimeEq;
use tauri::{AppHandle, Manager, State};

/// Handshake directory shared by every bridge-speaking app.
const DIR_NAME: &str = "cardmirror-bridge";
const APP_ID: &str = "ebb";
const KIND: &str = "flow";
const SCHEMA: u32 = 1;
const TOKEN_HEADER: &str = "x-bridge-token";
/// Identifies ebb to CardMirror on every gated outbound route. CardMirror
/// pins one consent decision per app id, and rejects an unidentified caller
/// outright, so this rides on all of them. `/ping` is spec'd identity-free:
/// discovery has to work before an identity is known.
const APP_ID_HEADER: &str = "X-App-Id";
/// An inbound body is a handful of extracted items at worst; past this it is a
/// resource attack, not a request.
const MAX_BODY: usize = 4 * 1024 * 1024;
/// `/flow` writes one cell per item, so the item count is the number of rows
/// one request can insert into the open flow. A send is the nodes of one card,
/// or of a selection of them; a whole pocket at once is a few hundred. Past
/// this a request is asking for more rows than a flow sheet ever holds, which
/// is a resource attack and not a paste. `/reveal` carries no such multiplier:
/// its keys go into one set and drive a single pass over the sheet.
const MAX_ITEMS: usize = 512;
/// A handshake file is a few hundred bytes. The cap keeps a corrupt or hostile
/// file from being read into memory.
const MAX_HANDSHAKE: u64 = 64 * 1024;
/// CardMirror gives an outbound POST 3000 ms, so ebb has to give up first or
/// the caller sees its own timeout instead of our error body.
const RENDERER_TIMEOUT: Duration = Duration::from_millis(2500);
const OUTBOUND_TIMEOUT: Duration = Duration::from_millis(3000);
/// How often ebb looks for a running CardMirror, which bounds how long a
/// CardMirror launch waits before it can reach ebb.
const PEER_POLL: Duration = Duration::from_secs(5);

// --- Handshake files -----------------------------------------------------------

/// The shared bridge directory: the `CARDMIRROR_BRIDGE_DIR` override first (it
/// is how tests and sandboxes redirect the pair), then the platform data dir.
/// XDG is honored on Linux only, because that is where the peer looks.
pub fn bridge_dir() -> Option<PathBuf> {
    if let Some(over) = std::env::var_os("CARDMIRROR_BRIDGE_DIR") {
        if !over.is_empty() {
            return Some(PathBuf::from(over));
        }
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME")?;
        Some(
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join(DIR_NAME),
        )
    }
    #[cfg(windows)]
    {
        let appdata = std::env::var_os("APPDATA")?;
        Some(PathBuf::from(appdata).join(DIR_NAME))
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        if let Some(xdg) = std::env::var_os("XDG_DATA_HOME") {
            if !xdg.is_empty() {
                return Some(PathBuf::from(xdg).join(DIR_NAME));
            }
        }
        let home = std::env::var_os("HOME")?;
        Some(
            PathBuf::from(home)
                .join(".local")
                .join("share")
                .join(DIR_NAME),
        )
    }
}

#[cfg(unix)]
fn create_dir_private(dir: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    // Every bridge-speaking app shares this directory, and
    // `CARDMIRROR_BRIDGE_DIR` can point it outside the user's own tree, so it
    // must not be reachable by anyone else: the session file inside it is the
    // token.
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)?;
    // `mode` applies only to a directory this call creates, and the shared
    // directory may have been made by another app under a permissive umask. The
    // token file is only as private as what holds it, so an inherited mode is
    // corrected rather than trusted.
    std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn create_dir_private(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)
}

fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    // Unlink, then refuse an existing path: `create` would open and write
    // through a symlink planted at this path, and `mode` would then only fix
    // the permissions of whatever it landed on. Losing the race to a re-planted
    // link fails the write instead of following it.
    let _ = std::fs::remove_file(path);
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut file = opts.open(path)?;
    file.write_all(bytes)
}

/// Writes `value` as JSON through `<path>.tmp` and renames it over the target,
/// so a peer scanning the directory never reads a half-written file.
fn write_private_json(path: &Path, value: &Json) -> std::io::Result<()> {
    let mut tmp = path.as_os_str().to_os_string();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    write_private(&tmp, value.to_string().as_bytes())?;
    std::fs::rename(&tmp, path)
}

/// Publishes this launch: the identity file that keeps ebb listed in peers'
/// app pickers, and the session file that says how to reach it right now.
pub fn write_handshake(port: u16, token: &str, app_version: &str) -> std::io::Result<()> {
    let dir = bridge_dir().ok_or_else(|| std::io::Error::other("no bridge directory"))?;
    create_dir_private(&dir)?;
    let identity = json!({
        "schema": SCHEMA,
        "app": APP_ID,
        "appVersion": app_version,
        "kind": KIND,
    });
    let session = json!({ "port": port, "token": token, "pid": std::process::id() });
    write_private_json(&dir.join("ebb.json"), &identity)?;
    write_private_json(&dir.join("ebb.session.json"), &session)
}

/// Quit path. Only the session half goes: the identity file is what keeps a
/// closed ebb selectable in CardMirror's flow-app picker.
pub fn remove_session() {
    if let Some(dir) = bridge_dir() {
        let _ = std::fs::remove_file(dir.join("ebb.session.json"));
    }
}

// --- Request routing -----------------------------------------------------------

/// What every route answers with: an HTTP status and a JSON body.
pub type Reply = (u16, Json);

/// The `/flow` and `/reveal` round trip, injected so the routing rules can be
/// exercised on their own.
type Renderer = Box<dyn Fn(&str, Json) -> Reply + Send + Sync>;

fn fail(error: &str) -> Json {
    json!({ "ok": false, "error": error })
}

/// Whether a request asks for more work than the route's shape allows. The item
/// count is the one multiplier a caller chooses, so it is the one to bound.
fn oversized_send(body: &Json) -> bool {
    matches!(body.get("items").and_then(Json::as_array), Some(items) if items.len() > MAX_ITEMS)
}

/// Handles one inbound request. The renderer round trip is injected, so the
/// routing, auth and limit rules are exercisable without a running Tauri app.
pub struct Router {
    token: String,
    app_version: String,
    renderer: Renderer,
}

impl Router {
    pub fn new(
        token: String,
        app_version: String,
        renderer: impl Fn(&str, Json) -> Reply + Send + Sync + 'static,
    ) -> Self {
        Self {
            token,
            app_version,
            renderer: Box::new(renderer),
        }
    }

    pub fn handle(&self, method: &str, path: &str, headers: &[(&str, &str)], body: &[u8]) -> Reply {
        // Only a browser attaches these. A page that somehow learned the token
        // must still be turned away, so this precedes the token compare.
        if headers.iter().any(|(name, _)| {
            name.eq_ignore_ascii_case("origin") || name.eq_ignore_ascii_case("referer")
        }) {
            return (403, fail("unauthorized"));
        }
        // A page that resolved this port through a name it controls reaches us
        // as `Host: evil.tld:P`, which no loopback client sends, so the check
        // defeats DNS rebinding outright. A request with no `Host` at all is not
        // a browser.
        let host_is_loopback = headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case("host"))
            .is_none_or(|(_, value)| {
                let host = value.rsplit_once(':').map_or(*value, |(host, _)| host);
                matches!(host, "127.0.0.1" | "localhost")
            });
        if !host_is_loopback {
            return (403, fail("unauthorized"));
        }
        let given = headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(TOKEN_HEADER))
            .map(|(_, value)| *value)
            .unwrap_or_default();
        // Constant time in the bytes; the length difference it does leak is the
        // token length, which is fixed and public.
        if !bool::from(given.as_bytes().ct_eq(self.token.as_bytes())) {
            return (403, fail("unauthorized"));
        }
        if body.len() > MAX_BODY {
            return (400, fail("bad-request"));
        }
        // A query string is not part of the route.
        let path = path.split('?').next().unwrap_or(path);
        match (method, path) {
            ("GET", "/ping") => (
                200,
                json!({
                    "ok": true,
                    "app": APP_ID,
                    "appVersion": self.app_version,
                    "schema": SCHEMA,
                    "kind": KIND,
                }),
            ),
            ("POST", "/flow") => self.to_renderer("flow", body),
            ("POST", "/reveal") => self.to_renderer("reveal", body),
            _ => (404, fail("bad-request")),
        }
    }

    fn to_renderer(&self, route: &str, body: &[u8]) -> Reply {
        match serde_json::from_slice::<Json>(body) {
            Ok(parsed) if parsed.is_object() && !oversized_send(&parsed) => {
                (self.renderer)(route, parsed)
            }
            _ => (400, fail("bad-request")),
        }
    }
}

// --- Server threads ------------------------------------------------------------

fn json_response(status: u16, body: &Json) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let content_type =
        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
            .expect("static header");
    tiny_http::Response::from_string(body.to_string())
        .with_status_code(status)
        .with_header(content_type)
}

/// A `/flow` parked on a wedged renderer holds its worker for the full 2500 ms,
/// so a few of them share the listener and `/ping` keeps answering meanwhile.
/// The peer's own ping deadline is shorter than ours, and an unanswered ping
/// reads as "ebb is not running".
const WORKERS: usize = 4;

fn serve(server: tiny_http::Server, router: Router) {
    let server = Arc::new(server);
    let router = Arc::new(router);
    for _ in 1..WORKERS {
        let (server, router) = (server.clone(), router.clone());
        let spawned = std::thread::Builder::new()
            .name("cardmirror-bridge".into())
            .spawn(move || accept(&server, &router));
        if let Err(e) = spawned {
            eprintln!("cardmirror bridge: worker spawn failed: {e}");
        }
    }
    accept(&server, &router);
}

fn accept(server: &tiny_http::Server, router: &Router) {
    while let Ok(mut request) = server.recv() {
        // A declared length past the cap is refused before the body is read:
        // there is nothing to gain from buffering a request that is already
        // answered.
        if request.body_length().is_some_and(|len| len > MAX_BODY) {
            let _ = request.respond(json_response(400, &fail("bad-request")));
            continue;
        }
        // One byte past the cap is enough to know the body is oversized,
        // without buffering whatever length the sender claimed.
        let mut body = Vec::new();
        let read = request
            .as_reader()
            .take(MAX_BODY as u64 + 1)
            .read_to_end(&mut body);
        if read.is_err() {
            continue;
        }
        let reply = {
            let headers: Vec<(&str, &str)> = request
                .headers()
                .iter()
                .map(|header| (header.field.as_str().as_str(), header.value.as_str()))
                .collect();
            router.handle(request.method().as_str(), request.url(), &headers, &body)
        };
        let _ = request.respond(json_response(reply.0, &reply.1));
    }
}

// --- Renderer round trip -------------------------------------------------------

/// Inbound requests parked on the renderer, keyed by the id sent out with
/// `bridge:request`.
#[derive(Default)]
pub struct BridgeState {
    pending: Mutex<HashMap<String, mpsc::Sender<Json>>>,
}

/// Blocks until the renderer answers or the deadline passes. A reply is
/// `{status, body}`; a reply of any other shape means the renderer never
/// produced a usable answer, which is the timeout case from the caller's side.
fn await_reply(rx: &Receiver<Json>, timeout: Duration) -> Reply {
    let Ok(reply) = rx.recv_timeout(timeout) else {
        return (500, fail("timeout"));
    };
    let status = reply.get("status").and_then(Json::as_u64).unwrap_or(0);
    match (u16::try_from(status), reply.get("body")) {
        (Ok(status @ 100..=599), Some(body)) => (status, body.clone()),
        _ => (500, fail("timeout")),
    }
}

fn call_renderer(app: &AppHandle, route: &str, body: Json) -> Reply {
    let id = random_id();
    let (tx, rx) = mpsc::channel();
    let state = app.state::<BridgeState>();
    state.pending.lock().insert(id.clone(), tx);
    // CardMirror pairs with whichever flow is in front, not every open one.
    let sent = crate::windows::emit_target(
        app,
        "bridge:request",
        json!({ "id": id, "route": route, "body": body }),
    );
    let reply = if sent.is_ok() {
        await_reply(&rx, RENDERER_TIMEOUT)
    } else {
        (500, fail("timeout"))
    };
    // A delivered reply already took its entry; this clears the ones that
    // timed out, which nothing else would.
    state.pending.lock().remove(&id);
    reply
}

#[tauri::command]
pub fn bridge_reply(state: State<'_, BridgeState>, id: String, response: Json) {
    // An id we do not know is one whose request already timed out.
    let waiter = state.pending.lock().remove(&id);
    if let Some(tx) = waiter {
        let _ = tx.send(response);
    }
}

// --- Random material -----------------------------------------------------------

/// 24 alphanumeric characters: URL-safe by construction, ~143 bits.
fn random_token() -> String {
    use rand::distr::{Alphanumeric, SampleString};
    Alphanumeric.sample_string(&mut rand::rng(), 24)
}

/// 16 hex characters naming one in-flight renderer round trip.
fn random_id() -> String {
    format!("{:016x}", rand::random::<u64>())
}

// --- Outbound to CardMirror ----------------------------------------------------

/// Where CardMirror is listening and the token to get in with.
struct Peer {
    port: u16,
    token: String,
}

fn read_handshake(path: &Path) -> Option<Json> {
    if std::fs::metadata(path).ok()?.len() > MAX_HANDSHAKE {
        return None;
    }
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn session_of(value: &Json) -> Option<Peer> {
    let port = u16::try_from(value.get("port")?.as_u64()?).ok()?;
    let token = value.get("token")?.as_str()?;
    if port == 0 || token.is_empty() {
        return None;
    }
    Some(Peer {
        port,
        token: token.to_string(),
    })
}

/// CardMirror's identity, plus its session when it is running. Port and token
/// live on the session file, except for a peer still writing the pre-split
/// combined shape that carries them on the identity file.
fn read_peer() -> Option<(Json, Option<Peer>)> {
    let dir = bridge_dir()?;
    let identity = read_handshake(&dir.join("cardmirror.json"))?;
    let session = read_handshake(&dir.join("cardmirror.session.json"))
        .as_ref()
        .and_then(session_of)
        .or_else(|| session_of(&identity));
    Some((identity, session))
}

fn post(path: &str, body: &Json) -> Result<Json, String> {
    let (_, session) = read_peer().ok_or("not-registered")?;
    let peer = session.ok_or("not-running")?;
    let sent = ureq::post(format!("http://127.0.0.1:{}{path}", peer.port))
        .config()
        // A rejected request still carries CardMirror's JSON body, which the
        // caller is entitled to see, so a 4xx has to stay a response here
        // rather than an error that drops it.
        .http_status_as_error(false)
        .timeout_global(Some(OUTBOUND_TIMEOUT))
        .build()
        .header("Content-Type", "application/json")
        .header("X-Bridge-Token", &peer.token)
        .header(APP_ID_HEADER, APP_ID)
        .send(body.to_string());
    let text = match sent {
        Ok(mut response) => response.body_mut().read_to_string(),
        Err(error) => {
            // A refused connect means the session file outlived the process;
            // a stalled or deadlined socket means the process is wedged.
            return Err(match error {
                ureq::Error::Io(io) if io.kind() == std::io::ErrorKind::ConnectionRefused => {
                    "not-running"
                }
                ureq::Error::ConnectionFailed | ureq::Error::HostNotFound => "not-running",
                ureq::Error::Timeout(_) | ureq::Error::Io(_) => "timeout",
                _ => "bad-response",
            }
            .to_string());
        }
    };
    let text = text.map_err(|_| "bad-response".to_string())?;
    serde_json::from_str(&text).map_err(|_| "bad-response".to_string())
}

#[tauri::command(async)]
pub fn cardmirror_jump(source: String) -> Result<Json, String> {
    post("/jump", &json!({ "source": source }))
}

#[tauri::command(async)]
pub fn cardmirror_insert(text: String, role: String, new_paragraph: bool) -> Result<Json, String> {
    // ebb never sends omitted text, but the field is part of the insert shape.
    post(
        "/insert",
        &json!({
            "text": text,
            "role": role,
            "newParagraph": new_paragraph,
            "omitted": false,
        }),
    )
}

// --- Startup -------------------------------------------------------------------

/// Binds the loopback listener and publishes this launch, retracting any
/// predecessor's advertisement first: a session file that outlives the run it
/// names points CardMirror at a port this process does not own, and a launch
/// that cannot bind would otherwise leave the previous one's standing. `None`
/// when the bridge cannot come up this run.
fn bind_and_publish(app_version: &str) -> Option<(tiny_http::Server, String)> {
    remove_session();
    let server = match tiny_http::Server::http(("127.0.0.1", 0)) {
        Ok(server) => server,
        Err(e) => {
            eprintln!("cardmirror bridge: bind failed: {e}");
            return None;
        }
    };
    let Some(port) = server.server_addr().to_ip().map(|addr| addr.port()) else {
        eprintln!("cardmirror bridge: listener has no IP address");
        return None;
    };
    let token = random_token();
    if let Err(e) = write_handshake(port, &token, app_version) {
        eprintln!("cardmirror bridge: handshake write failed: {e}");
        return None;
    }
    Some((server, token))
}

/// Whether CardMirror is running. Its session file is written on every launch
/// and deleted on quit; one a crash left behind reads as running, which costs
/// a listener nobody calls and nothing more.
fn peer_running() -> bool {
    bridge_dir().is_some_and(|dir| dir.join("cardmirror.session.json").is_file())
}

/// Binds the loopback listener, publishes the handshake, and serves, all on its
/// own thread and only once CardMirror is running. Until then ebb holds no
/// listener and writes no handshake files: an unsigned binary serving a local
/// port is what antivirus heuristics read as a backdoor, so ebb holds one only
/// while there is a peer to use it. Outbound calls need none of this, since
/// they read CardMirror's session at call time. Every failure here
/// is non-fatal: without the bridge ebb just has no CardMirror integration
/// this run.
pub fn start(app: &AppHandle) {
    app.manage(BridgeState::default());
    let handle = app.clone();
    if let Err(e) = std::thread::Builder::new()
        .name("cardmirror-bridge".into())
        .spawn(move || {
            // ponytail: polls a stat every PEER_POLL; a directory watcher if
            // the delay after a CardMirror launch ever matters.
            while !peer_running() {
                std::thread::sleep(PEER_POLL);
            }
            let app_version = handle.package_info().version.to_string();
            let Some((server, token)) = bind_and_publish(&app_version) else {
                return;
            };
            let router = Router::new(token, app_version, move |route, body| {
                call_renderer(&handle, route, body)
            });
            serve(server, router);
        })
    {
        eprintln!("cardmirror bridge: thread spawn failed: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The bridge directory comes from a process-wide env var, so the tests
    /// that set it must not overlap.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ebb-bridge-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn router() -> Router {
        Router::new("tok".into(), "0.6.1".into(), |route, body| {
            (200, json!({ "ok": true, "route": route, "echo": body }))
        })
    }

    fn auth() -> [(&'static str, &'static str); 1] {
        [("X-Bridge-Token", "tok")]
    }

    #[test]
    fn bridge_dir_honors_the_env_override() {
        let _guard = ENV_LOCK.lock();
        let dir = scratch_dir("override");
        std::env::set_var("CARDMIRROR_BRIDGE_DIR", &dir);
        assert_eq!(bridge_dir().as_deref(), Some(dir.as_path()));
        std::env::remove_var("CARDMIRROR_BRIDGE_DIR");
        let fallback = bridge_dir().expect("platform data dir resolves");
        assert!(fallback.ends_with(DIR_NAME), "{fallback:?}");
        assert_ne!(fallback, dir);
    }

    #[test]
    fn the_bridge_waits_for_cardmirror_to_run() {
        let _guard = ENV_LOCK.lock();
        let dir = scratch_dir("running");
        std::env::set_var("CARDMIRROR_BRIDGE_DIR", &dir);

        assert!(!peer_running(), "no directory, no peer");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("ebb.session.json"), "{}").unwrap();
        assert!(!peer_running(), "ebb's own session is not a peer");
        std::fs::write(dir.join("cardmirror.json"), "{}").unwrap();
        assert!(!peer_running(), "installed is not running");
        std::fs::write(dir.join("cardmirror.session.json"), "{}").unwrap();
        assert!(peer_running());

        std::env::remove_var("CARDMIRROR_BRIDGE_DIR");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn handshake_splits_identity_from_session() {
        let _guard = ENV_LOCK.lock();
        let dir = scratch_dir("handshake");
        std::env::set_var("CARDMIRROR_BRIDGE_DIR", &dir);

        write_handshake(49213, "sekrit", "0.6.1").unwrap();
        let read = |name: &str| -> Json {
            serde_json::from_str(&std::fs::read_to_string(dir.join(name)).unwrap()).unwrap()
        };

        let identity = read("ebb.json");
        assert_eq!(
            identity,
            json!({ "schema": 1, "app": "ebb", "appVersion": "0.6.1", "kind": "flow" }),
            "the identity file carries no port and no token"
        );
        let session = read("ebb.session.json");
        assert_eq!(session["port"], 49213);
        assert_eq!(session["token"], "sekrit");
        assert_eq!(session["pid"], std::process::id());
        assert!(
            !dir.join("ebb.session.json.tmp").exists(),
            "the atomic write renamed its tmp file away"
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode =
                |path: PathBuf| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode(dir.clone()), 0o700);
            assert_eq!(mode(dir.join("ebb.json")), 0o600);
            assert_eq!(mode(dir.join("ebb.session.json")), 0o600);
        }

        remove_session();
        assert!(!dir.join("ebb.session.json").exists(), "session cleared");
        assert!(dir.join("ebb.json").exists(), "identity outlives the run");

        std::env::remove_var("CARDMIRROR_BRIDGE_DIR");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The shared directory may already exist, made by another bridge-speaking
    /// app or by whoever got to a `CARDMIRROR_BRIDGE_DIR` override first, so its
    /// mode is corrected and its contents are never written through.
    #[cfg(unix)]
    #[test]
    fn an_inherited_directory_is_tightened_and_a_planted_tmp_is_not_followed() {
        use std::os::unix::fs::PermissionsExt;
        let _guard = ENV_LOCK.lock();
        let dir = scratch_dir("inherited");
        std::env::set_var("CARDMIRROR_BRIDGE_DIR", &dir);

        std::fs::create_dir_all(&dir).unwrap();
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o777)).unwrap();
        let planted = dir.join("planted");
        std::fs::write(&planted, b"untouched").unwrap();
        std::os::unix::fs::symlink(&planted, dir.join("ebb.session.json.tmp")).unwrap();

        write_handshake(49213, "sekrit", "0.6.1").unwrap();

        let mode = |path: PathBuf| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(dir.clone()), 0o700, "an inherited mode is corrected");
        assert_eq!(
            std::fs::read_to_string(&planted).unwrap(),
            "untouched",
            "the token never reached the symlink's target"
        );
        let session = dir.join("ebb.session.json");
        let kind = std::fs::symlink_metadata(&session).unwrap().file_type();
        assert!(kind.is_file(), "the session file is the one this run made");
        assert_eq!(mode(session.clone()), 0o600);
        let written: Json =
            serde_json::from_str(&std::fs::read_to_string(&session).unwrap()).unwrap();
        assert_eq!(written["token"], "sekrit");

        std::env::remove_var("CARDMIRROR_BRIDGE_DIR");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_wrong_or_missing_token_is_rejected() {
        let (status, body) = router().handle("GET", "/ping", &[("X-Bridge-Token", "nope")], b"");
        assert_eq!(status, 403);
        assert_eq!(body, json!({ "ok": false, "error": "unauthorized" }));
        assert_eq!(router().handle("GET", "/ping", &[], b"").0, 403);
    }

    #[test]
    fn a_browser_origin_is_rejected_even_with_the_right_token() {
        for header in ["Origin", "Referer"] {
            let headers = [(header, "http://evil.example"), ("X-Bridge-Token", "tok")];
            let (status, body) = router().handle("GET", "/ping", &headers, b"");
            assert_eq!(status, 403, "{header}");
            assert_eq!(body["error"], "unauthorized");
        }
    }

    #[test]
    fn a_host_that_is_not_loopback_is_rejected() {
        for host in [
            "evil.example",
            "evil.example:49213",
            "127.0.0.1.evil.example",
        ] {
            let headers = [("Host", host), ("X-Bridge-Token", "tok")];
            let (status, body) = router().handle("GET", "/ping", &headers, b"");
            assert_eq!(status, 403, "{host}");
            assert_eq!(body["error"], "unauthorized");
        }
        for host in ["127.0.0.1", "127.0.0.1:49213", "localhost:49213"] {
            let headers = [("Host", host), ("X-Bridge-Token", "tok")];
            assert_eq!(
                router().handle("GET", "/ping", &headers, b"").0,
                200,
                "{host}"
            );
        }
    }

    #[test]
    fn ping_is_answered_locally() {
        let (status, body) = router().handle("GET", "/ping", &auth(), b"");
        assert_eq!(status, 200);
        assert_eq!(
            body,
            json!({
                "ok": true, "app": "ebb", "appVersion": "0.6.1",
                "schema": 1, "kind": "flow"
            })
        );
    }

    #[test]
    fn flow_and_reveal_reach_the_renderer_and_answer_verbatim() {
        let calls: Arc<Mutex<Vec<String>>> = Arc::default();
        let seen = calls.clone();
        let router = Router::new("tok".into(), "0.6.1".into(), move |route, body| {
            seen.lock().push(route.to_string());
            (200, json!({ "ok": true, "echo": body }))
        });

        let (status, body) = router.handle("POST", "/flow", &auth(), br#"{"mode":"column"}"#);
        assert_eq!(status, 200);
        assert_eq!(body, json!({ "ok": true, "echo": { "mode": "column" } }));

        let (status, body) = router.handle("POST", "/reveal", &auth(), br#"{"keys":["d|a b"]}"#);
        assert_eq!(status, 200);
        assert_eq!(body["echo"]["keys"][0], "d|a b");

        assert_eq!(*calls.lock(), ["flow", "reveal"]);
    }

    #[test]
    fn an_unknown_route_is_a_404() {
        for (method, path) in [("GET", "/flow"), ("POST", "/ping"), ("POST", "/nope")] {
            let (status, body) = router().handle(method, path, &auth(), b"{}");
            assert_eq!(status, 404, "{method} {path}");
            assert_eq!(body["error"], "bad-request");
        }
    }

    #[test]
    fn a_body_over_the_cap_is_a_400() {
        let body = vec![b'x'; MAX_BODY + 1];
        let (status, reply) = router().handle("POST", "/flow", &auth(), &body);
        assert_eq!(status, 400);
        assert_eq!(reply["error"], "bad-request");
    }

    #[test]
    fn a_body_that_is_not_a_json_object_is_a_400() {
        for body in [&b"not json"[..], &b"[1,2]"[..], &b""[..]] {
            let (status, reply) = router().handle("POST", "/flow", &auth(), body);
            assert_eq!(status, 400);
            assert_eq!(reply["error"], "bad-request");
        }
    }

    #[test]
    fn a_send_over_the_item_cap_is_a_400() {
        let send = |count: usize| -> Vec<u8> {
            let items: Vec<Json> = (0..count).map(|_| json!({ "text": "a" })).collect();
            json!({ "mode": "column", "items": items })
                .to_string()
                .into_bytes()
        };
        let capped = send(MAX_ITEMS);
        assert_eq!(router().handle("POST", "/flow", &auth(), &capped).0, 200);

        let over = send(MAX_ITEMS + 1);
        let (status, reply) = router().handle("POST", "/flow", &auth(), &over);
        assert_eq!(status, 400);
        assert_eq!(reply["error"], "bad-request");
    }

    #[test]
    fn a_silent_renderer_times_out_with_a_500() {
        let router = Router::new("tok".into(), "0.6.1".into(), |_, _| {
            // The sender stays alive, so this is a real deadline rather than a
            // disconnected channel returning early.
            let (_tx, rx) = mpsc::channel();
            await_reply(&rx, Duration::from_millis(10))
        });
        let (status, body) = router.handle("POST", "/flow", &auth(), b"{}");
        assert_eq!(status, 500);
        assert_eq!(body, json!({ "ok": false, "error": "timeout" }));
    }

    #[test]
    fn a_renderer_reply_keeps_its_own_status_and_body() {
        let (tx, rx) = mpsc::channel();
        tx.send(json!({ "status": 200, "body": { "ok": false, "error": "no-active-sheet" } }))
            .unwrap();
        assert_eq!(
            await_reply(&rx, Duration::from_millis(10)),
            (200, json!({ "ok": false, "error": "no-active-sheet" }))
        );

        let (tx, rx) = mpsc::channel();
        tx.send(json!({ "nonsense": true })).unwrap();
        assert_eq!(await_reply(&rx, Duration::from_millis(10)).0, 500);
    }

    #[test]
    fn a_combined_peer_file_still_yields_a_session() {
        let combined = json!({
            "schema": 1, "app": "cardmirror", "kind": "editor",
            "port": 49999, "token": "peer-token"
        });
        let peer = session_of(&combined).expect("pre-split shape tolerated");
        assert_eq!(peer.port, 49999);
        assert_eq!(peer.token, "peer-token");
        assert!(session_of(&json!({ "schema": 1, "app": "cardmirror" })).is_none());
        assert!(session_of(&json!({ "port": 0, "token": "t" })).is_none());
    }

    #[test]
    fn a_session_token_is_url_safe_and_long_enough() {
        let token = random_token();
        assert_eq!(token.len(), 24);
        assert!(token.chars().all(|c| c.is_ascii_alphanumeric()), "{token}");
        assert_ne!(token, random_token());

        let id = random_id();
        assert_eq!(id.len(), 16);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()), "{id}");
    }

    /// The routing tests above stop at the seam; this one drives the real
    /// listener, so the header plumbing and the body cap are covered too.
    #[test]
    fn the_listener_serves_json_over_loopback() {
        let server = tiny_http::Server::http(("127.0.0.1", 0)).expect("ephemeral port");
        let port = server.server_addr().to_ip().expect("ip listener").port();
        std::thread::spawn(move || serve(server, router()));
        let url = |path: &str| format!("http://127.0.0.1:{port}{path}");
        // A refusal is asserted on the status and body it carries, so 4xx has
        // to stay a response rather than an error that drops the body.
        let get = |path: &str| {
            ureq::get(url(path))
                .config()
                .http_status_as_error(false)
                .build()
                .header("X-Bridge-Token", "tok")
        };
        let post = |path: &str| {
            ureq::post(url(path))
                .config()
                .http_status_as_error(false)
                .build()
                .header("X-Bridge-Token", "tok")
                .header("Content-Type", "application/json")
        };
        let outcome = |mut response: ureq::http::Response<ureq::Body>| -> (u16, Json) {
            let status = response.status().as_u16();
            assert_eq!(
                response.headers().get("Content-Type").unwrap(),
                "application/json"
            );
            let text = response.body_mut().read_to_string().unwrap();
            (status, serde_json::from_str(&text).unwrap())
        };

        let ok = outcome(get("/ping").call().unwrap());
        assert_eq!(ok.0, 200);
        assert_eq!(ok.1["app"], "ebb");

        let refused = get("/ping")
            .header("Origin", "http://evil.example")
            .call()
            .unwrap();
        assert_eq!(outcome(refused), (403, fail("unauthorized")));

        let sent = post("/flow").send(r#"{"mode":"cell"}"#).unwrap();
        assert_eq!(outcome(sent).1["echo"]["mode"], "cell");

        let too_big = post("/flow").send("x".repeat(MAX_BODY + 1)).unwrap();
        assert_eq!(outcome(too_big), (400, fail("bad-request")));

        let missing = get("/nope").call().unwrap();
        assert_eq!(outcome(missing).0, 404);
    }

    /// A refusal carries CardMirror's own reason on a 4xx, and the caller is
    /// entitled to see it, so a status code must not be allowed to stand in for
    /// the body and swallow it.
    #[test]
    fn a_four_hundred_from_the_peer_still_yields_its_body() {
        let _guard = ENV_LOCK.lock();
        let dir = scratch_dir("peer-4xx");
        let server = tiny_http::Server::http(("127.0.0.1", 0)).expect("ephemeral port");
        let peer_port = server.server_addr().to_ip().expect("ip listener").port();
        std::thread::spawn(move || {
            for request in server.incoming_requests() {
                let _ = request.respond(json_response(400, &fail("no-consent")));
            }
        });

        create_dir_private(&dir).unwrap();
        let identity = json!({ "schema": 1, "app": "cardmirror", "kind": "editor" });
        let session = json!({ "port": peer_port, "token": "peer-token", "pid": 1 });
        write_private_json(&dir.join("cardmirror.json"), &identity).unwrap();
        write_private_json(&dir.join("cardmirror.session.json"), &session).unwrap();

        std::env::set_var("CARDMIRROR_BRIDGE_DIR", &dir);
        let refused = cardmirror_jump("cmsrc1abc".into());
        std::env::remove_var("CARDMIRROR_BRIDGE_DIR");
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(refused, Ok(fail("no-consent")));
    }

    /// A body the caller declares but never sends must not buy it a 4 MiB
    /// buffer, so the refusal precedes the read.
    #[test]
    fn a_declared_body_over_the_cap_is_refused_before_it_arrives() {
        use std::io::Write;
        let server = tiny_http::Server::http(("127.0.0.1", 0)).expect("ephemeral port");
        let port = server.server_addr().to_ip().expect("ip listener").port();
        std::thread::spawn(move || serve(server, router()));

        let mut socket = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let head = format!(
            "POST /flow HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-Bridge-Token: tok\r\n\
             Content-Length: {}\r\n\r\n",
            MAX_BODY + 1
        );
        socket.write_all(head.as_bytes()).unwrap();

        // Not one body byte follows.
        let mut answer = [0u8; 15];
        socket
            .read_exact(&mut answer)
            .expect("answered without waiting for the body");
        assert_eq!(&answer, b"HTTP/1.1 400 Ba");
    }

    /// A session file names a port this process holds, so a launch that cannot
    /// publish leaves none behind rather than the previous run's.
    #[test]
    fn a_launch_retracts_the_previous_runs_session_before_publishing() {
        let _guard = ENV_LOCK.lock();
        let dir = scratch_dir("relaunch");
        std::env::set_var("CARDMIRROR_BRIDGE_DIR", &dir);
        let session = dir.join("ebb.session.json");
        let stale = || json!({ "port": 1, "token": "dead-token", "pid": 1 });
        let read_session = || -> Json {
            serde_json::from_str(&std::fs::read_to_string(&session).unwrap()).unwrap()
        };

        create_dir_private(&dir).unwrap();
        write_private_json(&session, &stale()).unwrap();
        let (server, token) = bind_and_publish("0.6.1").expect("the bridge comes up");
        assert_eq!(read_session()["token"], token);
        assert_ne!(read_session()["port"], 1, "the dead port is replaced");
        drop(server);

        // The identity write fails, so this launch never reaches its own session
        // write, let alone a port it could answer on.
        write_private_json(&session, &stale()).unwrap();
        std::fs::create_dir(dir.join("ebb.json.tmp")).unwrap();
        assert!(
            bind_and_publish("0.6.1").is_none(),
            "a failed publish is no start"
        );
        assert!(
            !session.exists(),
            "the dead run's advertisement is retracted"
        );

        std::env::remove_var("CARDMIRROR_BRIDGE_DIR");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Drives the outbound leg against a stand-in CardMirror, so the posted
    /// shapes and the failure mapping are checked against a real socket.
    #[test]
    fn outbound_calls_reach_the_peer_and_map_its_failures() {
        let _guard = ENV_LOCK.lock();
        let dir = scratch_dir("peer");
        std::env::set_var("CARDMIRROR_BRIDGE_DIR", &dir);

        assert_eq!(
            cardmirror_jump("cmsrc1".into()),
            Err("not-registered".into())
        );

        let server = tiny_http::Server::http(("127.0.0.1", 0)).expect("ephemeral port");
        let peer_port = server.server_addr().to_ip().expect("ip listener").port();
        let log: Arc<Mutex<Vec<Json>>> = Arc::default();
        let seen = log.clone();
        std::thread::spawn(move || {
            for mut request in server.incoming_requests() {
                let mut body = Vec::new();
                let _ = request.as_reader().read_to_end(&mut body);
                let header = |name: &'static str| {
                    request
                        .headers()
                        .iter()
                        .find(|header| header.field.equiv(name))
                        .map(|header| header.value.as_str().to_string())
                };
                let token = header("X-Bridge-Token");
                let app_id = header(APP_ID_HEADER);
                seen.lock().push(json!({
                    "url": request.url(),
                    "token": token,
                    "appId": app_id,
                    "body": serde_json::from_slice::<Json>(&body).unwrap_or(Json::Null),
                }));
                let reply = json!({ "ok": false, "error": "doc-not-open", "docTitle": "AT" });
                let _ = request.respond(json_response(200, &reply));
            }
        });

        create_dir_private(&dir).unwrap();
        let identity =
            json!({ "schema": 1, "app": "cardmirror", "appVersion": "3.2.0", "kind": "editor" });
        let session = json!({ "port": peer_port, "token": "peer-token", "pid": 1 });
        write_private_json(&dir.join("cardmirror.json"), &identity).unwrap();
        write_private_json(&dir.join("cardmirror.session.json"), &session).unwrap();

        let jumped = cardmirror_jump("cmsrc1abc".into()).unwrap();
        assert_eq!(
            jumped["error"], "doc-not-open",
            "the peer body comes back whole"
        );
        cardmirror_insert("Perm solves".into(), "cite".into(), true).unwrap();

        let calls = log.lock().clone();
        assert_eq!(calls.len(), 2, "{calls:?}");
        assert_eq!(calls[0]["url"], "/jump");
        assert_eq!(calls[0]["token"], "peer-token");
        assert_eq!(calls[0]["body"], json!({ "source": "cmsrc1abc" }));
        assert_eq!(calls[1]["url"], "/insert");
        assert_eq!(
            calls[1]["body"],
            json!({ "text": "Perm solves", "role": "cite", "newParagraph": true, "omitted": false })
        );

        // CardMirror gates every route but /ping on a per-app consent
        // decision, and rejects an unidentified caller outright.
        assert_eq!(calls[0]["appId"], APP_ID, "/jump identifies ebb");
        assert_eq!(calls[1]["appId"], APP_ID, "/insert identifies ebb");

        // CardMirror quits: the identity file stays, the session file goes.
        std::fs::remove_file(dir.join("cardmirror.session.json")).unwrap();
        assert_eq!(
            cardmirror_jump("cmsrc1abc".into()),
            Err("not-running".into())
        );

        // A session file left behind by a crash points at a dead port.
        let stale = json!({ "port": 1, "token": "peer-token", "pid": 1 });
        write_private_json(&dir.join("cardmirror.session.json"), &stale).unwrap();
        assert_eq!(
            cardmirror_jump("cmsrc1abc".into()),
            Err("not-running".into())
        );

        std::env::remove_var("CARDMIRROR_BRIDGE_DIR");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
