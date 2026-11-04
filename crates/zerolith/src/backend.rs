//! A backend a proxy rule names with `run`: started with `dev`, `serve`,
//! and `preview` in the project folder, through the shell, with its output
//! on the server's own so one terminal shows both, watched while the
//! server runs, and stopped with the server together with every process it
//! started.

use std::io;
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::term;

/// A running backend command and the shell that leads it.
pub struct Backend {
    command: String,
    child: Child,
    ended: Option<ExitStatus>,
    reported: bool,
}

/// The backends a server holds, shared by the task that watches for one ending and the shutdown that stops them.
pub type Backends = Arc<Mutex<Vec<Backend>>>;

/// How long the backends get to end after being told to, before they are killed.
const GRACE: Duration = Duration::from_secs(5);

impl Backend {
    /// Starts `command` through the shell in `folder`: `cmd /d /s /c` on Windows, as npm runs a script, and `sh -c` elsewhere, where it leads a process group of its own, so stopping it reaches what it started. Its output goes where the server's does, and it reads no input.
    pub fn start(command: &str, folder: &Path) -> io::Result<Backend> {
        let mut shell = shell(command);
        let child = shell
            .current_dir(folder)
            .stdin(Stdio::null())
            .spawn()
            .map_err(|error| {
                io::Error::new(
                    error.kind(),
                    format!("could not start `{command}`: {error}"),
                )
            })?;
        Ok(Backend {
            command: command.to_string(),
            child,
            ended: None,
            reported: false,
        })
    }

    /// The status the leading shell ended with, once it has; polled without waiting.
    pub fn poll(&mut self) -> Option<ExitStatus> {
        if self.ended.is_none()
            && let Ok(Some(status)) = self.child.try_wait()
        {
            self.ended = Some(status);
        }
        self.ended
    }

    /// Stops this backend with what it started, as `stop_all` does for one.
    pub fn stop(self) {
        stop_all(vec![self]);
    }

    /// True while something of the backend still runs: on Windows its shell, which leads the tree taskkill ends, and elsewhere its process group, which outlives the shell while any member runs; the shell is reaped on the way.
    fn lingers(&mut self) -> bool {
        let shell_runs = self.poll().is_none();
        if cfg!(windows) {
            shell_runs
        } else {
            group_exists(self.child.id())
        }
    }
}

/// Stops every backend together with every process it started. On Windows each shell still running is ended outright with its tree through taskkill, since a console process there takes no signal from another program; elsewhere each process group that still exists gets a `TERM`, then after a few seconds a `KILL` where it still exists, all waited for against one deadline rather than one by one. A backend whose shell ended before, or whose group is gone, is left alone, so a process id that passed to another process is never signaled; one that outlives even the `KILL` is left with a note and never waited for, so stopping the server cannot hang. On Windows a command that ends its own shell at once, as `start` does, leaves what it started, since the tree is found from the shell.
pub fn stop_all(mut backends: Vec<Backend>) {
    if cfg!(windows) {
        for backend in &mut backends {
            if backend.poll().is_none() {
                taskkill(backend.child.id());
            }
        }
        wait_all(&mut backends, GRACE);
    } else {
        for backend in &mut backends {
            if backend.lingers() {
                signal_group(backend.child.id(), "TERM");
            }
        }
        wait_all(&mut backends, GRACE);
        for backend in &mut backends {
            if backend.lingers() {
                signal_group(backend.child.id(), "KILL");
            }
        }
        wait_all(&mut backends, Duration::from_secs(1));
    }
    for backend in &mut backends {
        if backend.lingers() {
            anstream::eprintln!(
                "{}",
                term::row(
                    "backend",
                    term::caution,
                    format!(
                        "`{}` did not stop with the server; end it yourself",
                        backend.command
                    )
                )
            );
        }
    }
}

/// Stops whatever backends are still held when it is dropped, so a server that ends any other way than its shutdown, as when serving fails, leaves none behind; the shutdown empties the list first, and the guard then finds nothing.
pub struct Guard(pub Backends);

impl Drop for Guard {
    fn drop(&mut self) {
        let held = self
            .0
            .lock()
            .map(|mut list| std::mem::take(&mut *list))
            .unwrap_or_default();
        if !held.is_empty() {
            stop_all(held);
        }
    }
}

/// Reports a backend that ends while the server runs, checking twice a second, so a crash or a missing script does not hide behind the banner: its paths answer 502 until it runs again.
pub async fn watch(backends: Backends) {
    loop {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if let Ok(mut list) = backends.lock() {
            for backend in list.iter_mut() {
                if backend.reported {
                    continue;
                }
                if let Some(status) = backend.poll() {
                    backend.reported = true;
                    anstream::eprintln!(
                        "{}",
                        term::row(
                            "backend",
                            term::caution,
                            format!(
                                "`{}` ended with {status}; its paths answer 502 until it runs again",
                                backend.command
                            )
                        )
                    );
                }
            }
        }
    }
}

/// Ends the process `pid` with every process it started, through taskkill's tree flag.
fn taskkill(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

/// Waits up to `limit` for every backend to stop lingering, polling.
fn wait_all(backends: &mut [Backend], limit: Duration) {
    let deadline = Instant::now() + limit;
    while Instant::now() < deadline && backends.iter_mut().any(Backend::lingers) {
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// True while the process group `pgid` leads exists, asked through `kill -0`, which signals nothing.
fn group_exists(pgid: u32) -> bool {
    Command::new("kill")
        .args(["-0", "--", &format!("-{pgid}")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

/// The shell command that runs `command` as a user would type it.
fn shell(command: &str) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut shell = Command::new("cmd");
        shell
            .raw_arg("/d")
            .raw_arg("/s")
            .raw_arg("/c")
            .raw_arg(format!("\"{command}\""));
        shell
    }
    #[cfg(not(windows))]
    {
        use std::os::unix::process::CommandExt;
        let mut shell = Command::new("sh");
        shell.arg("-c").arg(command).process_group(0);
        shell
    }
}

/// Sends a signal to the process group `pid` leads, through the `kill` command, since the crate holds no unsafe code.
fn signal_group(pid: u32, signal: &str) {
    let _ = Command::new("kill")
        .args([&format!("-{signal}"), "--", &format!("-{pid}")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(test)]
mod tests {
    use super::{Backend, stop_all};
    use std::fs;
    use std::path::Path;
    use std::time::{Duration, Instant};

    /// A folder with a Node script that records its process id and runs until stopped.
    fn fixture(name: &str) -> std::path::PathBuf {
        let root =
            std::env::temp_dir().join(format!("zerolith-backend-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("child.js"),
            "require('fs').writeFileSync(process.argv[2], String(process.pid)); setInterval(() => {}, 1000);",
        )
        .unwrap();
        root
    }

    /// The process id a started script wrote, once it has.
    fn recorded(path: &Path) -> u32 {
        let deadline = Instant::now() + Duration::from_secs(20);
        while !path.is_file() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        fs::read_to_string(path)
            .expect("the command ran in the folder")
            .trim()
            .parse()
            .unwrap()
    }

    /// Whether a process with `pid` runs: through tasklist on Windows, and `kill -0` elsewhere.
    fn alive(pid: u32) -> bool {
        if cfg!(windows) {
            let output = std::process::Command::new("tasklist")
                .args(["/FI", &format!("PID eq {pid}"), "/NH"])
                .output()
                .unwrap();
            String::from_utf8_lossy(&output.stdout).contains(&pid.to_string())
        } else {
            std::process::Command::new("kill")
                .args(["-0", &pid.to_string()])
                .status()
                .map(|status| status.success())
                .unwrap_or(false)
        }
    }

    fn gone(pid: u32) -> bool {
        let deadline = Instant::now() + Duration::from_secs(10);
        while alive(pid) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        !alive(pid)
    }

    #[test]
    fn starts_a_command_in_the_folder_and_stops_it_with_what_it_started() {
        let root = fixture("stop");
        let backend = Backend::start("node child.js started.txt", &root).unwrap();
        let pid = recorded(&root.join("started.txt"));
        assert!(alive(pid));
        backend.stop();
        assert!(gone(pid), "the node process the shell started is gone");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn stops_several_at_once_against_one_deadline() {
        let root = fixture("several");
        let first = Backend::start("node child.js first.txt", &root).unwrap();
        let second = Backend::start("node child.js second.txt", &root).unwrap();
        let pids = [
            recorded(&root.join("first.txt")),
            recorded(&root.join("second.txt")),
        ];
        let started = Instant::now();
        stop_all(vec![first, second]);
        assert!(
            started.elapsed() < Duration::from_secs(4),
            "both were told at once"
        );
        assert!(gone(pids[0]) && gone(pids[1]));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn sees_a_command_end_on_its_own_with_its_status() {
        let root = std::env::temp_dir();
        let mut ended = Backend::start("node -e \"process.exit(3)\"", &root).unwrap();
        let deadline = Instant::now() + Duration::from_secs(20);
        while ended.poll().is_none() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(ended.poll().and_then(|status| status.code()), Some(3));
        ended.stop();
        let mut missing = Backend::start("definitely-not-a-command-zerolith", &root).unwrap();
        let deadline = Instant::now() + Duration::from_secs(20);
        while missing.poll().is_none() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(
            missing.poll().is_some_and(|status| !status.success()),
            "the shell starts, reports the missing command, and ends with a failure"
        );
    }

    #[cfg(unix)]
    #[test]
    fn stops_what_a_shell_left_running_in_its_group() {
        let root = fixture("group");
        let backend = Backend::start("node child.js left.txt &", &root).unwrap();
        let pid = recorded(&root.join("left.txt"));
        assert!(alive(pid));
        backend.stop();
        assert!(
            gone(pid),
            "the group outlived its shell and was still stopped"
        );
        let _ = fs::remove_dir_all(&root);
    }
}
