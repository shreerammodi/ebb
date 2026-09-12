//! Runtime window creation and focus tracking.
//!
//! ebb has no privileged "main" window: every dashboard and every flow editor
//! is a fully independent window, built here rather than declared in
//! tauri.conf.json (whose `app.windows` list is empty) so a cold launch, a
//! second launch, and Mod+N can each decide how many windows to open and
//! where each one starts. Opening a flow already showing in some window
//! focuses that window instead of duplicating it; opening one that isn't
//! creates a new window rather than steering an existing one, so a debater
//! who pulls up a second flow keeps the first exactly as it was.
//!
//! Two pieces of state are shared across windows. Which one is currently
//! focused: a menu accelerator and the CardMirror bridge both need "the
//! window the user is looking at", and neither Tauri callback hands that to
//! us directly. And which flow each window currently shows: the frontend
//! reports it on every navigation, which is what lets a duplicate open
//! resolve to a focus instead of a new window.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::webview::NewWindowResponse;
use tauri::{
    AppHandle, Emitter, Manager, Runtime, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

/// Chrome shared by every window; mirrors the single static entry
/// tauri.conf.json declared before windows became dynamic.
const TITLE: &str = "ebb";
const WIDTH: f64 = 1280.0;
const HEIGHT: f64 = 800.0;
const MIN_HEIGHT: f64 = 600.0;

static NEXT_ID: AtomicU64 = AtomicU64::new(0);

/// The most recently focused window's label.
static FOCUSED: Mutex<Option<String>> = Mutex::new(None);

pub fn note_focus<R: Runtime>(window: &tauri::Window<R>) {
    *FOCUSED.lock() = Some(window.label().to_string());
}

/// Clears the focus record if it still points at `label`, so a destroyed
/// window is never handed back as a stale target - and its recorded open
/// flow, so a later open of the same path is never focused onto a window
/// that no longer exists.
pub fn note_close(label: &str) {
    let mut focused = FOCUSED.lock();
    if focused.as_deref() == Some(label) {
        *focused = None;
    }
    OPEN_PATHS.lock().remove(label);
}

/// Which flow each window currently shows, keyed by label - reported by the
/// frontend on every navigation, not just at window creation, since opening
/// a different flow from within an already-open window changes it too.
static OPEN_PATHS: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Records which flow `label` shows, or that it shows none.
#[tauri::command]
pub fn report_open_path<R: Runtime>(window: WebviewWindow<R>, path: Option<String>) {
    let mut paths = OPEN_PATHS.lock();
    match path {
        Some(p) => {
            paths.insert(window.label().to_string(), p);
        }
        None => {
            paths.remove(window.label());
        }
    }
}

/// The window already showing `path`, if any.
fn window_open_on<R: Runtime>(app: &AppHandle<R>, path: &str) -> Option<WebviewWindow<R>> {
    let label = OPEN_PATHS
        .lock()
        .iter()
        .find(|(_, p)| p.as_str() == path)
        .map(|(l, _)| l.clone())?;
    app.get_webview_window(&label)
}

/// The window to route a single-recipient action (a menu accelerator, a
/// CardMirror request) at: the last-focused one, or - if focus was never
/// observed, e.g. the very first event after launch - any other open window.
pub fn target_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    let label = FOCUSED.lock().clone();
    label
        .and_then(|l| app.get_webview_window(&l))
        .or_else(|| app.webview_windows().values().next().cloned())
}

/// Sends `event` to exactly one window: the one `target_window` picks, or every
/// window when none has been observed yet.
///
/// Naming the label is what makes this single-recipient, and both halves have to
/// do it. `Emitter::emit` fans out to every webview whatever handle it is called
/// on - a `WebviewWindow` included - so emitting "through" a window narrows
/// nothing; and a listener registered for the default `Any` target matches a
/// narrowed emit regardless. The frontend half is `listenHere` in
/// `src/lib/windowEvents.ts`, which every listener for one of these events uses.
/// A broadcast still reaches those listeners, so an event every window must see
/// stays a plain `emit`.
pub fn emit_target<R: Runtime, S: Serialize + Clone>(
    app: &AppHandle<R>,
    event: &str,
    payload: S,
) -> tauri::Result<()> {
    match target_window(app) {
        Some(w) => app.emit_to(w.label(), event, payload),
        None => app.emit(event, payload),
    }
}

/// Whether the webview may open `url`, for a navigation and for a new window
/// alike.
///
/// Tauri permits both by default, and a peer's RFD note reaches the preview as
/// sanitized HTML that keeps its `http(s)` hrefs. A click that replaced the
/// window would put a page inside a webview holding this app's whole IPC
/// surface, so only what ebb serves is allowed. Every other scheme is left
/// alone: an allowlist of internal schemes would break the first one it failed
/// to anticipate, and the schemes the shell loads its own pages over vary by
/// platform. A link meant for the browser never arrives here - `openExternal`
/// calls `preventDefault` and hands it to the opener plugin, whose own
/// allowlist bounds it.
///
/// `dev` is threaded rather than read here so the production answer is provable
/// in a test whatever profile the suite is built under.
fn navigable_in(url: &Url, dev: bool) -> bool {
    match url.scheme() {
        "http" | "https" => match url.host_str() {
            // Windows serves the bundle over this host.
            Some("tauri.localhost") => true,
            // The dev server, and only while there is one. In a bundle a
            // loopback URL is some other process's server, so allowing it would
            // let a peer's note offer a one-click trip to any local port - the
            // CardMirror bridge included.
            Some("localhost" | "127.0.0.1" | "[::1]") => dev,
            _ => false,
        },
        _ => true,
    }
}

fn navigable(url: &Url) -> bool {
    navigable_in(url, cfg!(dev))
}

fn build<R: Runtime>(app: &AppHandle<R>, url: WebviewUrl) -> tauri::Result<WebviewWindow<R>> {
    let label = format!("win-{}", NEXT_ID.fetch_add(1, Ordering::SeqCst));
    WebviewWindowBuilder::new(app, label, url)
        .title(TITLE)
        .inner_size(WIDTH, HEIGHT)
        .min_inner_size(0.0, MIN_HEIGHT)
        .resizable(true)
        .fullscreen(false)
        .disable_drag_drop_handler()
        .on_navigation(navigable)
        // A separate hook from `on_navigation`, and unset it means Windows lets
        // WebView2 open and navigate the window itself, so `window.open` would
        // carry data straight out past both this guard and `connect-src`.
        .on_new_window(|url, _| {
            if navigable(&url) {
                NewWindowResponse::Allow
            } else {
                NewWindowResponse::Deny
            }
        })
        .build()
}

/// Opens a new window on the dashboard.
pub fn open_dashboard<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    build(app, WebviewUrl::App("index.html".into()))
}

/// The query a flow route carries. Reuses the `Url` query-pair encoder to
/// match the percent-encoding `encodeURIComponent` produces on the frontend
/// (see flowNav.ts's flowRouteFor); the scheme and host here are thrown away
/// immediately.
fn flow_query(path: &str) -> String {
    let mut qs = tauri::Url::parse("app://ebb").expect("static URL parses");
    qs.query_pairs_mut().append_pair("path", path);
    qs.query().unwrap_or_default().to_string()
}

/// Opens a new window on the given flow, or focuses the window already
/// showing it - a debater who double-clicks the same round twice should
/// land back on the one flow, not a duplicate beside it.
pub fn open_flow<R: Runtime>(app: &AppHandle<R>, path: &str) -> tauri::Result<WebviewWindow<R>> {
    if let Some(existing) = window_open_on(app, path) {
        let _ = existing.set_focus();
        return Ok(existing);
    }
    let route = format!("flow/?{}", flow_query(path));
    build(app, WebviewUrl::App(route.into()))
}

/// Points an already-open window at `path`, keeping whatever origin it is
/// already on - the scheme is a custom one in a bundle and the dev server in
/// development, and only the window knows which.
fn navigate_to_flow<R: Runtime>(window: &WebviewWindow<R>, path: &str) -> tauri::Result<()> {
    let mut target = window.url()?;
    target.set_path("/flow/");
    target.set_query(Some(&flow_query(path)));
    window.navigate(target)
}

/// Opens a new dashboard window. The JS side of `window.new` (Mod+N, the
/// Window menu, the command palette).
#[tauri::command]
pub fn new_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    open_dashboard(&app).map(|_| ()).map_err(|e| e.to_string())
}

/// Closes the window that asked, through the flush handshake rather than on
/// the spot. The JS side of `window.close` (Mod+W, the Window menu, the
/// command palette); closing the last open window quits, exactly as its
/// native close control does.
#[tauri::command]
pub fn close_window<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) {
    crate::shutdown::request_close(&app, window.label());
}

// --- Cold-launch bootstrap ------------------------------------------------------
//
// A .ebb opened from the file manager reaches Rust as argv (Windows and
// Linux) or as RunEvent::Opened (macOS), and the macOS half arrives before
// setup() runs: the open event is delivered while the event loop is being
// created, which is roughly a tenth of a second ahead of the setup hook that
// has to decide whether this launch shows a dashboard. So an open that lands
// before setup() is only recorded here, and setup() drains it and opens the
// flow - one window, and no dashboard ever built to be closed again.
//
// An open that lands after setup() is the same launch arriving late, and the
// dashboard setup() built with nothing requested is still blank, so that
// window is navigated onto the flow rather than left over beside a second
// window showing it. The shell navigates the webview itself rather than
// handing the path to that window's frontend to route, because the frontend
// is the far side of a race it cannot win: the open may land before its JS
// has loaded or after it has already asked whether anything was pending.
// A navigate needs nothing loaded and nothing listening.

/// Paths the file manager asked for before setup() ran.
static LAUNCH_OPENS: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// True once setup() has drained them and decided what the launch shows.
static STARTED: AtomicBool = AtomicBool::new(false);

/// Records `paths` for setup() to open, reporting whether it took them. A
/// `false` means the app is already up and the caller opens them itself.
pub fn queue_launch_opens(paths: &[String]) -> bool {
    if STARTED.load(Ordering::SeqCst) {
        return false;
    }
    LAUNCH_OPENS.lock().extend(paths.iter().cloned());
    true
}

/// The paths this launch was asked to open, argv's first, each only once -
/// macOS can deliver a path as an open event and in argv both. Called once,
/// by setup(); every later open is handled live.
pub fn take_launch_opens(argv: Vec<String>) -> Vec<String> {
    // Flagged before the drain, not after: a queue call that had already
    // passed the flag would otherwise append to a vector nobody reads again,
    // and that debater's round would never open. Refused instead, it reaches
    // the live route, which builds its window.
    STARTED.store(true, Ordering::SeqCst);
    let mut paths = argv;
    paths.append(&mut LAUNCH_OPENS.lock());
    let mut seen = Vec::with_capacity(paths.len());
    paths.retain(|p| {
        let fresh = !seen.contains(p);
        if fresh {
            seen.push(p.clone());
        }
        fresh
    });
    paths
}

/// How long after launch an open is still taken to be that launch's own.
/// macOS delivers it within the first turns of the run loop; past this, a
/// double-click is a debater opening a second flow, which gets its own
/// window.
const ADOPT_WINDOW: Duration = Duration::from_secs(5);

struct Bootstrap {
    /// The dashboard window setup() created with nothing requested.
    window: Option<String>,
    /// When that window was created, which is launch.
    at: Option<Instant>,
    /// True once the offer has been taken, so two files opened in the same
    /// gesture do not both try to land in the one window.
    taken: bool,
}

static BOOTSTRAP: Mutex<Bootstrap> = Mutex::new(Bootstrap {
    window: None,
    at: None,
    taken: false,
});

/// Marks `label` as the window a same-launch file open may take over.
/// Called at most once, right after setup() opens a dashboard with nothing
/// requested.
pub fn mark_bootstrap(label: &str) {
    let mut b = BOOTSTRAP.lock();
    b.window = Some(label.to_string());
    b.at = Some(Instant::now());
}

/// The bootstrap window's label, if an open observed at `now` is still
/// plausibly the launch's own; taking it consumes the offer.
fn claim(b: &mut Bootstrap, now: Instant) -> Option<String> {
    if b.taken {
        return None;
    }
    if now.duration_since(b.at?) > ADOPT_WINDOW {
        return None;
    }
    b.taken = true;
    b.window.clone()
}

/// Opens `path`, taking over the launch's own still-blank dashboard if that
/// offer is still good, otherwise opening a brand new window.
pub fn adopt_or_open<R: Runtime>(app: &AppHandle<R>, path: &str) {
    let claimed = claim(&mut BOOTSTRAP.lock(), Instant::now());
    if let Some(window) = claimed.and_then(|label| app.get_webview_window(&label)) {
        if navigate_to_flow(&window, path).is_ok() {
            let _ = window.set_focus();
            return;
        }
    }
    let _ = open_flow(app, path);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(raw: &str, dev: bool) -> bool {
        navigable_in(&Url::parse(raw).expect("parse"), dev)
    }

    /// Refusing what ebb serves would leave a blank window rather than a
    /// hardened one. The custom scheme production uses on macOS and Linux falls
    /// through to the catch-all arm, so it holds in either profile.
    #[test]
    fn the_app_can_open_what_it_shipped() {
        for dev in [true, false] {
            assert!(allowed("tauri://localhost/index.html", dev));
            assert!(allowed("http://tauri.localhost/index.html", dev));
        }
        assert!(allowed("http://localhost:1280/index.html", true));
    }

    /// A peer's RFD note keeps its `http(s)` hrefs, and a click that replaced
    /// the window would hand that page this app's whole IPC surface.
    #[test]
    fn a_remote_page_is_refused() {
        for dev in [true, false] {
            assert!(!allowed("https://example.com/", dev));
            assert!(!allowed("http://example.com/", dev));
            // A host that merely ends in a permitted one is a different host.
            assert!(!allowed("https://tauri.localhost.example.com/", dev));
            assert!(!allowed("https://localhost.example.com/", dev));
        }
    }

    /// In a bundle a loopback URL is some other process's server, and the
    /// CardMirror bridge is one of them. A peer's note may not offer a debater
    /// a one-click trip to a local port.
    #[test]
    fn a_shipped_build_refuses_loopback() {
        for raw in [
            "http://localhost:1280/index.html",
            "http://127.0.0.1:53821/flow",
            "http://[::1]:53821/flow",
            "https://127.0.0.1/",
        ] {
            assert!(!allowed(raw, false), "{raw} must be refused in a bundle");
            assert!(allowed(raw, true), "{raw} must work against the dev server");
        }
    }

    /// macOS hands over a double-clicked file about a tenth of a second
    /// before setup() runs, so nothing may open a window on its own that
    /// early: setup() opened a dashboard beside the flow when it did.
    #[test]
    fn a_pre_setup_open_waits_for_setup_to_build_it() {
        assert!(queue_launch_opens(&["/flows/berkeley.ebb".to_string()]));

        // Argv leads, and a path delivered both ways is one flow.
        let paths = take_launch_opens(vec!["/flows/berkeley.ebb".into(), "/flows/pf.ebb".into()]);
        assert_eq!(paths, ["/flows/berkeley.ebb", "/flows/pf.ebb"]);

        assert!(
            !queue_launch_opens(&["/flows/later.ebb".to_string()]),
            "the app is up, so a later open is the caller's to handle"
        );
    }

    /// The whole point of the bootstrap record: one double-clicked round is
    /// one window. The launch's blank dashboard is navigated onto the flow
    /// in place, and nothing opens beside it.
    ///
    /// Both halves live in one test because the record is process-wide, and
    /// two tests over it would race each other rather than the run loop.
    #[test]
    fn a_launch_open_lands_in_the_window_the_launch_made() {
        let app = tauri::test::mock_app();
        let handle = app.handle().clone();
        let dashboard = open_dashboard(&handle).expect("a dashboard");
        mark_bootstrap(dashboard.label());

        adopt_or_open(&handle, "/flows/berkeley r1.ebb");

        assert_eq!(handle.webview_windows().len(), 1, "no window beside it");
        let url = dashboard.url().expect("a url");
        assert_eq!(url.path(), "/flow/");
        assert_eq!(url.query(), Some("path=%2Fflows%2Fberkeley+r1.ebb"));

        // A second path in the same gesture, and every open after the
        // launch's own, is a flow of its own and gets its own window.
        adopt_or_open(&handle, "/flows/harvard r2.ebb");
        assert_eq!(handle.webview_windows().len(), 2);
        assert_eq!(
            dashboard.url().expect("a url").query(),
            Some("path=%2Fflows%2Fberkeley+r1.ebb"),
            "the adopted window keeps the flow it took"
        );
    }

    /// A file open that arrives long after launch is a debater opening a
    /// second flow, not the launch's own argument, so the offer expires
    /// rather than steering whatever window happens to be sitting there.
    #[test]
    fn the_offer_is_launch_scoped_and_single_use() {
        let now = Instant::now();
        let fresh = || Bootstrap {
            window: Some("win-0".into()),
            at: Some(now),
            taken: false,
        };

        let mut b = fresh();
        assert_eq!(claim(&mut b, now), Some("win-0".into()));
        assert_eq!(claim(&mut b, now), None, "one taker only");

        let mut b = fresh();
        assert_eq!(claim(&mut b, now + ADOPT_WINDOW), Some("win-0".into()));

        let mut b = fresh();
        assert_eq!(
            claim(&mut b, now + ADOPT_WINDOW + Duration::from_millis(1)),
            None
        );

        // A launch that opened a flow directly marks nothing, so there is
        // no window to take over.
        let mut unmarked = Bootstrap {
            window: None,
            at: None,
            taken: false,
        };
        assert_eq!(claim(&mut unmarked, now), None);
    }
}
