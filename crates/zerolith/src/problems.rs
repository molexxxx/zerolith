//! The latest compile error or stylesheet warnings of each file the dev
//! server serves. A new problem is printed in the terminal and sent to every
//! connected browser, and a browser that connects later is sent every
//! problem still standing, so the console shows what broke even when the
//! failing module never ran.

use std::collections::BTreeMap;
use std::sync::Mutex;

use serde::Serialize;
use tokio::sync::broadcast;

use crate::term;

/// One file's problem, as the browser is told about it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Problem {
    /// The file as the root-relative path it is served under.
    pub path: String,
    /// `error` for a module or stylesheet that failed to compile, `warning` for a stylesheet the browser will read only in part.
    pub level: &'static str,
    /// What went wrong, with the file and the position where there is one.
    pub message: String,
}

/// The latest problem of each file, and the browsers to tell when one is new.
pub struct Problems {
    latest: Mutex<BTreeMap<String, Problem>>,
    sender: broadcast::Sender<Problem>,
}

impl Problems {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(64);
        Self {
            latest: Mutex::new(BTreeMap::new()),
            sender,
        }
    }

    /// Records `path`'s problem. One that differs from the problem recorded for the file is printed and sent to the browsers; the same one again, as when a reload asks for the file again, is not.
    pub fn report(&self, path: &str, level: &'static str, message: String) {
        let problem = Problem {
            path: path.to_string(),
            level,
            message,
        };
        {
            let Ok(mut latest) = self.latest.lock() else {
                return;
            };
            if latest.get(path) == Some(&problem) {
                return;
            }
            latest.insert(path.to_string(), problem.clone());
        }
        let style = if level == "error" {
            term::failure
        } else {
            term::caution
        };
        anstream::eprintln!("{}", term::row(level, style, &problem.message));
        let _ = self.sender.send(problem);
    }

    /// Forgets `path`'s problem, once the file is served without one or changes on disk, so the same problem after another save is reported again.
    pub fn clear(&self, path: &str) {
        if let Ok(mut latest) = self.latest.lock() {
            latest.remove(path);
        }
    }

    /// Every problem still standing, for a browser that connects.
    pub fn current(&self) -> Vec<Problem> {
        self.latest
            .lock()
            .map(|latest| latest.values().cloned().collect())
            .unwrap_or_default()
    }

    /// A receiver for the problems reported from now on.
    pub fn subscribe(&self) -> broadcast::Receiver<Problem> {
        self.sender.subscribe()
    }
}

#[cfg(test)]
mod tests {
    use super::Problems;

    #[test]
    fn sends_a_problem_once_until_the_file_is_cleared() {
        let problems = Problems::new();
        let mut receiver = problems.subscribe();
        problems.report("/src/a.ts", "error", "a.ts:1:1: expected".to_string());
        problems.report("/src/a.ts", "error", "a.ts:1:1: expected".to_string());
        problems.report("/src/b.css", "warning", "b.css:2:1: skipped".to_string());
        assert_eq!(receiver.try_recv().unwrap().path, "/src/a.ts");
        assert_eq!(receiver.try_recv().unwrap().path, "/src/b.css");
        assert!(receiver.try_recv().is_err());
        assert_eq!(
            problems
                .current()
                .iter()
                .map(|problem| problem.path.as_str())
                .collect::<Vec<_>>(),
            ["/src/a.ts", "/src/b.css"]
        );
        problems.report("/src/a.ts", "error", "a.ts:2:1: other".to_string());
        assert_eq!(receiver.try_recv().unwrap().message, "a.ts:2:1: other");
        problems.clear("/src/a.ts");
        problems.report("/src/a.ts", "error", "a.ts:2:1: other".to_string());
        assert_eq!(receiver.try_recv().unwrap().message, "a.ts:2:1: other");
        problems.clear("/src/a.ts");
        problems.clear("/src/b.css");
        assert!(problems.current().is_empty());
    }
}
