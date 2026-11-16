//! `add` and `upgrade`: the zerolith packages a project depends on, kept on
//! one version.
//!
//! Every zerolith package carries the same version, and a project that
//! mixes two fails its next build with `package_version_mismatch`. `add`
//! lists packages at the version the project is on, and `upgrade` moves
//! every one the project lists to one version together. Each writes all of
//! its changes to package.json first and then has the project's package
//! manager install once, since a manager asked to move the packages a few
//! at a time refuses the mix in between. A failed install puts package.json
//! back. A page that loads its packages through an import map then has
//! them vendored again.
//!
//! A package manager is started with arguments only, never through a shell,
//! and what is written to package.json is a package name from the list
//! below and a version `is_version` accepted.

use std::fs;
use std::io;
use std::ops::Range;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::term;

/// One package released with zerolith.
struct Package {
    /// The name on npm.
    name: &'static str,
    /// A project installs it for development only.
    dev: bool,
    /// The guide that covers it, by its name under `GUIDES`.
    guide: &'static str,
}

/// Every package released with zerolith, the core first. A test holds the list to the repository's `packages` folder.
const PACKAGES: [Package; 13] = [
    Package {
        name: "zerolith",
        dev: false,
        guide: "signals",
    },
    Package {
        name: "@zerolith/a11y",
        dev: false,
        guide: "accessibility",
    },
    Package {
        name: "@zerolith/browser",
        dev: false,
        guide: "browser",
    },
    Package {
        name: "@zerolith/cli",
        dev: true,
        guide: "command-line",
    },
    Package {
        name: "@zerolith/client",
        dev: false,
        guide: "client",
    },
    Package {
        name: "@zerolith/devtools",
        dev: false,
        guide: "dev-tools",
    },
    Package {
        name: "@zerolith/forms",
        dev: false,
        guide: "forms",
    },
    Package {
        name: "@zerolith/i18n",
        dev: false,
        guide: "i18n",
    },
    Package {
        name: "@zerolith/otel",
        dev: false,
        guide: "observability",
    },
    Package {
        name: "@zerolith/router",
        dev: false,
        guide: "routing",
    },
    Package {
        name: "@zerolith/state",
        dev: false,
        guide: "state",
    },
    Package {
        name: "@zerolith/test",
        dev: true,
        guide: "testing",
    },
    Package {
        name: "@zerolith/vite",
        dev: true,
        guide: "vite",
    },
];

/// Where the guides are published; a package's guide is this, its name, and a slash.
const GUIDES: &str = "https://zerolith.dev/guide/";

/// What each release contains.
const CHANGELOG: &str = "https://github.com/molexxxx/zerolith/blob/main/CHANGELOG.md";

/// The lockfile each package manager writes, which names the manager a project uses.
const LOCKFILES: [(&str, &str); 6] = [
    ("package-lock.json", "npm"),
    ("npm-shrinkwrap.json", "npm"),
    ("pnpm-lock.yaml", "pnpm"),
    ("yarn.lock", "yarn"),
    ("bun.lock", "bun"),
    ("bun.lockb", "bun"),
];

/// The list of package.json a dependency is in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Section {
    Dependencies,
    Dev,
}

impl Section {
    fn key(self) -> &'static str {
        match self {
            Section::Dependencies => "dependencies",
            Section::Dev => "devDependencies",
        }
    }
}

/// A zerolith package as package.json lists it.
struct Listed {
    package: &'static Package,
    section: Section,
    spec: String,
}

/// One dependency package.json is to list.
#[derive(Debug, PartialEq, Eq)]
struct Change {
    name: &'static str,
    section: Section,
    /// The range to write, such as `1.12.0` or `^1.12.0`.
    spec: String,
    /// What package.json lists for the package now, when it lists it.
    was: Option<String>,
}

/// What a command will do, settled before anything is written.
#[derive(Debug, PartialEq, Eq)]
struct Plan {
    /// The changes to package.json, in the order of `PACKAGES`.
    changes: Vec<Change>,
    /// What the plan leaves alone or adds unasked, for the report.
    notes: Vec<String>,
}

fn failure(message: String) -> io::Error {
    io::Error::other(message)
}

/// `text` as a JSON string.
fn quoted(text: &str) -> String {
    serde_json::Value::from(text).to_string()
}

/// True for a version as the packages carry them: three numbers, then an optional pre-release and build of letters, digits, dots, and dashes. Nothing else is written to package.json as a version.
fn is_version(text: &str) -> bool {
    let core = text.split(['-', '+']).next().unwrap_or_default();
    let numbers: Vec<&str> = core.split('.').collect();
    let rest = &text[core.len()..];
    text.len() <= 64
        && numbers.len() == 3
        && numbers.iter().all(|number| {
            !number.is_empty()
                && number.len() <= 9
                && number.bytes().all(|byte| byte.is_ascii_digit())
        })
        && rest.len() != 1
        && rest
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'+'))
}

/// How a dependency's range is written, as its prefix and its version: an exact version, or one after `^` or `~`. None for anything else, such as a tag, a path, or a workspace reference, which these commands leave as it is.
fn written(spec: &str) -> Option<(&'static str, &str)> {
    let (prefix, version) = if let Some(version) = spec.strip_prefix('^') {
        ("^", version)
    } else if let Some(version) = spec.strip_prefix('~') {
        ("~", version)
    } else {
        ("", spec)
    };
    is_version(version).then_some((prefix, version))
}

/// The first number of a version.
fn major(version: &str) -> u64 {
    version
        .split('.')
        .next()
        .and_then(|number| number.parse().ok())
        .unwrap_or(0)
}

/// The package a name on the command line means: its full name, or what follows `@zerolith/`.
fn package_named(name: &str) -> Option<&'static Package> {
    PACKAGES.iter().find(|package| {
        package.name == name || package.name.strip_prefix("@zerolith/") == Some(name)
    })
}

/// The names `add` takes, as its error lists them.
fn known() -> String {
    PACKAGES
        .iter()
        .map(|package| {
            package
                .name
                .strip_prefix("@zerolith/")
                .unwrap_or(package.name)
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// The zerolith packages a package.json lists as dependencies, in the order of `PACKAGES`.
fn listed(manifest: &serde_json::Value) -> Vec<Listed> {
    let mut found = Vec::new();
    for package in &PACKAGES {
        for section in [Section::Dependencies, Section::Dev] {
            if let Some(spec) = manifest[section.key()][package.name].as_str() {
                found.push(Listed {
                    package,
                    section,
                    spec: spec.to_string(),
                });
                break;
            }
        }
    }
    found
}

/// The prefix the project writes zerolith versions with: the first listed package's that has one, the core's when it is listed, and none, an exact version, for a project that lists no zerolith package yet, as the starter writes them.
fn prefix_of(listed: &[Listed]) -> &'static str {
    listed
        .iter()
        .filter_map(|entry| written(&entry.spec))
        .map(|(prefix, _)| prefix)
        .next()
        .unwrap_or("")
}

/// What `add` does for `names` in a project whose package.json is `manifest`, at `version`, the version the project is on.
fn plan_add(manifest: &serde_json::Value, names: &[String], version: &str) -> io::Result<Plan> {
    let listed = listed(manifest);
    let mut wanted: Vec<&'static Package> = Vec::new();
    for name in names {
        let Some(package) = package_named(name) else {
            return Err(failure(format!(
                "{name} is not a zerolith package; the packages are {}",
                known()
            )));
        };
        if !wanted.iter().any(|known| known.name == package.name) {
            wanted.push(package);
        }
    }
    let mut notes = Vec::new();
    let core = &PACKAGES[0];
    if !listed.iter().any(|entry| entry.package.name == core.name)
        && !wanted.iter().any(|package| package.name == core.name)
    {
        wanted.push(core);
        notes.push(format!(
            "{} is added too, since every package needs it and package.json does not list it",
            core.name
        ));
    }
    let prefix = prefix_of(&listed);
    let spec = format!("{prefix}{version}");
    let mut changes = Vec::new();
    for package in PACKAGES
        .iter()
        .filter(|package| wanted.iter().any(|wanted| wanted.name == package.name))
    {
        match listed
            .iter()
            .find(|entry| entry.package.name == package.name)
        {
            Some(entry) if entry.spec == spec => {
                notes.push(format!("{} is already listed at {version}", package.name));
            }
            Some(entry) if written(&entry.spec).is_none() => {
                notes.push(format!(
                    "{} is listed as {}, which is left as it is",
                    package.name, entry.spec
                ));
            }
            Some(entry) => changes.push(Change {
                name: package.name,
                section: entry.section,
                spec: spec.clone(),
                was: Some(entry.spec.clone()),
            }),
            None => changes.push(Change {
                name: package.name,
                section: if package.dev {
                    Section::Dev
                } else {
                    Section::Dependencies
                },
                spec: spec.clone(),
                was: None,
            }),
        }
    }
    Ok(Plan { changes, notes })
}

/// What `upgrade` does in a project whose package.json is `manifest`: every zerolith package it lists moves to `target`.
fn plan_upgrade(manifest: &serde_json::Value, target: &str) -> io::Result<Plan> {
    let listed = listed(manifest);
    if listed.is_empty() {
        return Err(failure(
            "package.json lists no zerolith package to upgrade; zerolith add installs one"
                .to_string(),
        ));
    }
    let spec = format!("{}{target}", prefix_of(&listed));
    let mut notes = Vec::new();
    let mut changes = Vec::new();
    for entry in &listed {
        if written(&entry.spec).is_none() {
            notes.push(format!(
                "{} is listed as {}, which is left as it is",
                entry.package.name, entry.spec
            ));
        } else if entry.spec != spec {
            changes.push(Change {
                name: entry.package.name,
                section: entry.section,
                spec: spec.clone(),
                was: Some(entry.spec.clone()),
            });
        }
    }
    Ok(Plan { changes, notes })
}

/// One member of a JSON object in its text: its key, where the key starts, and where its value sits.
struct Member {
    key: String,
    start: usize,
    value: Range<usize>,
}

fn skip_space(bytes: &[u8], mut at: usize) -> usize {
    while bytes.get(at).is_some_and(u8::is_ascii_whitespace) {
        at += 1;
    }
    at
}

/// The index after the JSON string that opens at `at`.
fn string_end(bytes: &[u8], at: usize) -> Option<usize> {
    let mut index = at + 1;
    while let Some(byte) = bytes.get(index) {
        match byte {
            b'\\' => index += 2,
            b'"' => return Some(index + 1),
            _ => index += 1,
        }
    }
    None
}

/// The index after the JSON value that starts at `at`.
fn value_end(bytes: &[u8], at: usize) -> Option<usize> {
    match *bytes.get(at)? {
        b'"' => string_end(bytes, at),
        b'{' | b'[' => {
            let mut depth = 0usize;
            let mut index = at;
            while let Some(byte) = bytes.get(index) {
                match byte {
                    b'"' => {
                        index = string_end(bytes, index)?;
                        continue;
                    }
                    b'{' | b'[' => depth += 1,
                    b'}' | b']' => {
                        depth = depth.checked_sub(1)?;
                        if depth == 0 {
                            return Some(index + 1);
                        }
                    }
                    _ => {}
                }
                index += 1;
            }
            None
        }
        _ => {
            let mut index = at;
            while bytes.get(index).is_some_and(|byte| {
                !matches!(byte, b',' | b'}' | b']') && !byte.is_ascii_whitespace()
            }) {
                index += 1;
            }
            (index > at).then_some(index)
        }
    }
}

/// The members of the JSON object that opens at `open`, and the index of the brace that closes it.
fn members(text: &str, open: usize) -> Option<(Vec<Member>, usize)> {
    let bytes = text.as_bytes();
    if bytes.get(open) != Some(&b'{') {
        return None;
    }
    let mut found = Vec::new();
    let mut at = skip_space(bytes, open + 1);
    if bytes.get(at) == Some(&b'}') {
        return Some((found, at));
    }
    loop {
        if bytes.get(at) != Some(&b'"') {
            return None;
        }
        let key_end = string_end(bytes, at)?;
        let key: String = serde_json::from_str(text.get(at..key_end)?).ok()?;
        let colon = skip_space(bytes, key_end);
        if bytes.get(colon) != Some(&b':') {
            return None;
        }
        let value_start = skip_space(bytes, colon + 1);
        let value_stop = value_end(bytes, value_start)?;
        found.push(Member {
            key,
            start: at,
            value: value_start..value_stop,
        });
        at = skip_space(bytes, value_stop);
        match bytes.get(at) {
            Some(b',') => at = skip_space(bytes, at + 1),
            Some(b'}') => return Some((found, at)),
            _ => return None,
        }
    }
}

/// `text`, a package.json, with `name` listed as `spec` in the list `section`. An entry the list has keeps its place, a new one goes where the names stay in order, and a list the file lacks is added after its last member, each written with the spacing the file already uses. Every other byte of the file stays.
fn with_dependency(text: &str, section: Section, name: &str, spec: &str) -> Option<String> {
    let root = skip_space(text.as_bytes(), text.find(|found| found != '\u{feff}')?);
    let (top, close) = members(text, root)?;
    let entry = format!("{}: {}", quoted(name), quoted(spec));
    let lead = top
        .first()
        .map_or("\n    ", |first| &text[root + 1..first.start]);
    let inner = format!("{lead}{}", lead.trim_start_matches(['\r', '\n']));
    match top.iter().find(|member| member.key == section.key()) {
        Some(list) => {
            let (entries, end) = members(text, list.value.start)?;
            if let Some(existing) = entries.iter().find(|member| member.key == name) {
                return Some(format!(
                    "{}{}{}",
                    &text[..existing.value.start],
                    quoted(spec),
                    &text[existing.value.end..]
                ));
            }
            let Some(first) = entries.first() else {
                return Some(format!(
                    "{}{inner}{entry}{lead}{}",
                    &text[..=list.value.start],
                    &text[end..]
                ));
            };
            let gap = &text[list.value.start + 1..first.start];
            match entries.iter().find(|member| member.key.as_str() > name) {
                Some(next) => Some(format!(
                    "{}{entry},{gap}{}",
                    &text[..next.start],
                    &text[next.start..]
                )),
                None => {
                    let last = entries.last()?.value.end;
                    Some(format!("{},{gap}{entry}{}", &text[..last], &text[last..]))
                }
            }
        }
        None => {
            let block = format!("{}: {{{inner}{entry}{lead}}}", quoted(section.key()));
            match top.last() {
                Some(last) => Some(format!(
                    "{},{lead}{block}{}",
                    &text[..last.value.end],
                    &text[last.value.end..]
                )),
                None => Some(format!(
                    "{}{lead}{block}\n{}",
                    &text[..=root],
                    &text[close..]
                )),
            }
        }
    }
}

/// `text`, a package.json, with the changes written into it. The result is checked against the same changes made to the parsed file, so it differs from `text` in those dependencies and nothing else, or it is refused.
fn edit_manifest(text: &str, changes: &[Change]) -> io::Result<String> {
    let refused = || {
        failure(
            "package.json could not be edited without touching something else in it, so it is left as it was; list the packages in it by hand"
                .to_string(),
        )
    };
    let parse = |text: &str| {
        serde_json::from_str::<serde_json::Value>(text.trim_start_matches('\u{feff}'))
            .ok()
            .filter(serde_json::Value::is_object)
    };
    let mut expected = parse(text).ok_or_else(refused)?;
    let mut edited = text.to_string();
    for change in changes {
        edited = with_dependency(&edited, change.section, change.name, &change.spec)
            .ok_or_else(refused)?;
        let list = &mut expected[change.section.key()];
        if list.is_null() {
            *list = serde_json::json!({});
        }
        list.as_object_mut()
            .ok_or_else(refused)?
            .insert(change.name.to_string(), change.spec.clone().into());
    }
    if parse(&edited).as_ref() == Some(&expected) {
        Ok(edited)
    } else {
        Err(refused())
    }
}

/// The folder of the nearest package.json, at `root` or above it.
fn project_of(root: &Path) -> io::Result<PathBuf> {
    let start = std::path::absolute(root)?;
    start
        .ancestors()
        .find(|folder| folder.join("package.json").is_file())
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            failure(format!(
                "no package.json in {} or above it; run this in a project, or start one with zerolith new",
                start.display()
            ))
        })
}

fn manifest_of(project: &Path) -> io::Result<serde_json::Value> {
    let path = project.join("package.json");
    let text = fs::read_to_string(&path)?;
    serde_json::from_str::<serde_json::Value>(text.trim_start_matches('\u{feff}'))
        .ok()
        .filter(serde_json::Value::is_object)
        .ok_or_else(|| failure(format!("{} is not a JSON object", path.display())))
}

/// The package manager a project uses: the one whose lockfile is in the project or above it, as in a workspace, then the one that ran this command, then npm.
fn manager_of(project: &Path) -> &'static str {
    project
        .ancestors()
        .find_map(|folder| {
            LOCKFILES
                .iter()
                .find(|(file, _)| folder.join(file).is_file())
                .map(|(_, manager)| *manager)
        })
        .unwrap_or_else(crate::new::package_manager)
}

/// The program to start for `name`. On Windows the package managers are batch files, which a process starts only by their full path, so the first match on `PATH`; elsewhere the name.
fn program(name: &str) -> PathBuf {
    if cfg!(windows)
        && let Some(paths) = std::env::var_os("PATH")
    {
        for folder in std::env::split_paths(&paths) {
            for suffix in [".exe", ".cmd", ".bat"] {
                let candidate = folder.join(format!("{name}{suffix}"));
                if candidate.is_file() {
                    return candidate;
                }
            }
        }
    }
    PathBuf::from(name)
}

/// Runs a program in the project with its output shown, and fails when it does.
fn run(project: &Path, program: &Path, shown: &str, arguments: &[&str]) -> io::Result<()> {
    let status = Command::new(program)
        .args(arguments)
        .current_dir(project)
        .status()
        .map_err(|error| failure(format!("{shown} could not be started: {error}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(failure(format!(
            "{shown} {} did not finish",
            arguments.join(" ")
        )))
    }
}

/// The newest release, as the registry the project is set up for reports it through npm.
fn newest(project: &Path) -> io::Result<String> {
    let output = Command::new(program("npm"))
        .args(["view", "zerolith", "version"])
        .current_dir(project)
        .stderr(Stdio::inherit())
        .output();
    let text = match output {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => String::new(),
    };
    if is_version(&text) {
        Ok(text)
    } else {
        Err(failure(
            "the newest version could not be read from the registry with npm view zerolith version; name the version, as in zerolith upgrade 1.12.0"
                .to_string(),
        ))
    }
}

/// The version of zerolith installed in a project.
fn installed(project: &Path) -> Option<String> {
    crate::build::installed_version(project, "zerolith").filter(|version| is_version(version))
}

/// The version of zerolith a project is on: the exact one package.json lists for the core, which holds even while `node_modules` is behind it; for a range or no listing, the one installed, then the one the range starts at.
fn current_version(project: &Path, manifest: &serde_json::Value) -> Option<String> {
    let core = listed(manifest)
        .into_iter()
        .find(|entry| entry.package.name == "zerolith");
    match core.as_ref().and_then(|entry| written(&entry.spec)) {
        Some(("", version)) => Some(version.to_string()),
        range => installed(project).or_else(|| range.map(|(_, version)| version.to_string())),
    }
}

/// The project's own command line, which the install put in `node_modules`: after an upgrade it is the new version, where this process is still the old one.
fn project_command_line(project: &Path) -> Option<PathBuf> {
    let name = if cfg!(windows) {
        "zerolith.cmd"
    } else {
        "zerolith"
    };
    let path = project.join("node_modules").join(".bin").join(name);
    path.is_file().then_some(path)
}

/// How a project vendors its packages behind an import map.
#[derive(Debug, PartialEq, Eq)]
enum Vendoring {
    /// Its `importmap` script.
    Script,
    /// `zerolith importmap --html index.html`, as an earlier run of it left `vendor/importmap.json`.
    Command,
    /// The page holds an import map this command cannot tell how to write again.
    Unknown,
    /// The page holds no import map.
    None,
}

fn vendoring(project: &Path, manifest: &serde_json::Value) -> Vendoring {
    if manifest["scripts"]["importmap"].is_string() {
        return Vendoring::Script;
    }
    let page = fs::read_to_string(project.join("index.html")).unwrap_or_default();
    if crate::importmap::import_map_of(&page).is_none() {
        Vendoring::None
    } else if project.join("vendor").join("importmap.json").is_file() {
        Vendoring::Command
    } else {
        Vendoring::Unknown
    }
}

/// Vendors the packages again for a page that loads them through an import map. The step removes what an earlier run of it wrote for another version, so an upgrade leaves no folder of the old one.
fn vendor_again(project: &Path, manager: &str, manifest: &serde_json::Value) -> io::Result<()> {
    match vendoring(project, manifest) {
        Vendoring::None => Ok(()),
        Vendoring::Unknown => {
            anstream::println!(
                "{}",
                term::row(
                    "warning",
                    term::caution,
                    "index.html holds an import map, and this command found no step that writes it; run zerolith importmap --html index.html again, or name that step importmap in package.json's scripts, which this command then runs"
                )
            );
            Ok(())
        }
        Vendoring::Script => {
            anstream::println!(
                "{}\n",
                term::row("vendor", term::label, format!("{manager} run importmap"))
            );
            run(project, &program(manager), manager, &["run", "importmap"])?;
            Ok(())
        }
        Vendoring::Command => {
            anstream::println!(
                "{}",
                term::row(
                    "vendor",
                    term::label,
                    "zerolith importmap --html index.html"
                )
            );
            match project_command_line(project) {
                Some(command_line) => run(
                    project,
                    &command_line,
                    "zerolith",
                    &["importmap", "--html", "index.html"],
                )?,
                None => crate::importmap::run(
                    project,
                    Path::new("vendor"),
                    false,
                    &[PathBuf::from("index.html")],
                )?,
            }
            Ok(())
        }
    }
}

/// The packages the installed `name` needs beside it that are not installed, each with the range it asks for; a peer it marks optional is left out.
fn missing_peers(project: &Path, name: &str) -> Vec<(String, String)> {
    let Some(manifest) = project.ancestors().find_map(|folder| {
        let text =
            fs::read_to_string(folder.join("node_modules").join(name).join("package.json")).ok()?;
        serde_json::from_str::<serde_json::Value>(&text).ok()
    }) else {
        return Vec::new();
    };
    let Some(peers) = manifest["peerDependencies"].as_object() else {
        return Vec::new();
    };
    peers
        .iter()
        .filter(|(peer, _)| manifest["peerDependenciesMeta"][peer.as_str()]["optional"] != true)
        .filter(|(peer, _)| crate::build::installed_version(project, peer).is_none())
        .map(|(peer, range)| (peer.clone(), range.as_str().unwrap_or_default().to_string()))
        .collect()
}

/// True for a project that holds the zerolith skill for coding agents.
fn holds_skill(project: &Path) -> bool {
    crate::skill::FOLDERS
        .iter()
        .any(|folder| project.join(folder).is_dir())
}

/// Writes the zerolith skill again in a project that holds it, so it describes the version the project moved to: through the project's own command line, or by this one when it is that version. Otherwise the copy stays, and doctor reports it as outdated.
fn refresh_skill(project: &Path, target: &str) -> io::Result<()> {
    if !holds_skill(project) {
        return Ok(());
    }
    match project_command_line(project) {
        Some(command_line) => {
            anstream::println!("{}", term::row("skill", term::label, "zerolith skill"));
            run(project, &command_line, "zerolith", &["skill"])
        }
        None if env!("CARGO_PKG_VERSION") == target => {
            crate::skill::write(project)?;
            anstream::println!(
                "{}",
                term::row("skill", term::done, format!("written again for {target}"))
            );
            Ok(())
        }
        None => Ok(()),
    }
}

/// Prints where the project is when it is not the folder the command was given, and what the plan leaves alone.
fn introduce(root: &Path, project: &Path, plan: &Plan) {
    let given = std::path::absolute(root).unwrap_or_else(|_| root.to_path_buf());
    if given != project {
        anstream::println!(
            "{}",
            term::row(
                "project",
                term::label,
                format!(
                    "{}, the nearest package.json",
                    project.join("package.json").display()
                )
            )
        );
    }
    for note in &plan.notes {
        anstream::println!("{}", term::row("note", term::label, note));
    }
}

/// Writes the plan's changes to package.json and has the package manager install once; a failed install puts package.json back. With `dry_run`, prints both and changes nothing. Returns false when nothing ran.
fn apply(project: &Path, manager: &str, plan: &Plan, dry_run: bool) -> io::Result<bool> {
    let path = project.join("package.json");
    let original = fs::read_to_string(&path)?;
    let edited = edit_manifest(&original, &plan.changes)?;
    for change in &plan.changes {
        anstream::println!(
            "{}",
            term::row(
                if dry_run { "would set" } else { "set" },
                term::label,
                format!(
                    "{} {} in {}, {}",
                    term::bold(change.name),
                    change.spec,
                    change.section.key(),
                    match &change.was {
                        Some(was) => format!("from {was}"),
                        None => "new".to_string(),
                    }
                )
            )
        );
    }
    let line = format!("{manager} install");
    if dry_run {
        anstream::println!("{}", term::row("would run", term::label, line));
        return Ok(false);
    }
    fs::write(&path, &edited)?;
    anstream::println!("{}\n", term::row("install", term::label, line));
    if let Err(error) = run(project, &program(manager), manager, &["install"]) {
        fs::write(&path, &original)?;
        return Err(failure(format!(
            "{error}, so package.json is put back as it was; node_modules is as {manager} left it"
        )));
    }
    anstream::println!();
    Ok(true)
}

/// Runs the `add` command: lists the named zerolith packages at the version the project is on, installs them, and vendors them for a page with an import map.
pub fn add(root: &Path, names: &[String], dry_run: bool) -> io::Result<()> {
    let project = project_of(root)?;
    let manifest = manifest_of(&project)?;
    let manager = manager_of(&project);
    let (version, from) = match current_version(&project, &manifest) {
        Some(version) => (version, "the version the project is on"),
        None => (
            env!("CARGO_PKG_VERSION").to_string(),
            "this command line's version, since the project has no zerolith yet",
        ),
    };
    let plan = plan_add(&manifest, names, &version)?;
    anstream::println!("{}", term::heading("add", &format!("{version}, {from}")));
    introduce(root, &project, &plan);
    if plan.changes.is_empty() {
        anstream::println!("{}\n", term::row("done", term::done, "nothing to add"));
        return Ok(());
    }
    if !apply(&project, manager, &plan, dry_run)? {
        if vendoring(&project, &manifest) != Vendoring::None {
            anstream::println!(
                "{}",
                term::row(
                    "would run",
                    term::label,
                    "the import map step, so the page maps the new packages"
                )
            );
        }
        anstream::println!();
        return Ok(());
    }
    vendor_again(&project, manager, &manifest)?;
    for change in &plan.changes {
        let name = change.name;
        let guide = package_named(name).map_or("", |package| package.guide);
        anstream::println!(
            "{}",
            term::row(
                "added",
                term::done,
                format!(
                    "{} {version}: import from \"{name}\", guide {GUIDES}{guide}/",
                    term::bold(name)
                )
            )
        );
        for (peer, range) in missing_peers(&project, name) {
            anstream::println!(
                "{}",
                term::row(
                    "warning",
                    term::caution,
                    format!(
                        "{name} needs {peer} {range}, which is not installed; add it with {manager}"
                    )
                )
            );
        }
    }
    anstream::println!();
    Ok(())
}

/// Runs the `upgrade` command: moves every zerolith package the project lists to one version, installs them, vendors them again for a page with an import map, and checks the project.
pub fn upgrade(
    root: &Path,
    version: Option<&str>,
    allow_major: bool,
    dry_run: bool,
) -> io::Result<()> {
    let project = project_of(root)?;
    let manifest = manifest_of(&project)?;
    let manager = manager_of(&project);
    if let Some(version) = version
        && !is_version(version)
    {
        return Err(failure(format!(
            "{version} is not a version; name one as the packages carry it, as in zerolith upgrade 1.12.0"
        )));
    }
    if listed(&manifest).is_empty() {
        return Err(failure(
            "package.json lists no zerolith package to upgrade; zerolith add installs one"
                .to_string(),
        ));
    }
    let target = match version {
        Some(version) => version.to_string(),
        None => newest(&project)?,
    };
    let current = current_version(&project, &manifest);
    let from = current.as_deref().unwrap_or("an unknown version");
    anstream::println!(
        "{}",
        term::heading("upgrade", &format!("{from} to {target}"))
    );
    if let Some(current) = &current
        && major(&target) > major(current)
        && !allow_major
    {
        return Err(failure(format!(
            "{target} is a new major version, which may change or remove what {current} has; read its breaking changes in {CHANGELOG}, then pass --major"
        )));
    }
    let plan = plan_upgrade(&manifest, &target)?;
    introduce(root, &project, &plan);
    if plan.changes.is_empty() {
        anstream::println!(
            "{}",
            term::row(
                "done",
                term::done,
                format!("every zerolith package is already listed at {target}")
            )
        );
        if let Some(held) = installed(&project).filter(|held| *held != target) {
            anstream::println!(
                "{}",
                term::row(
                    "note",
                    term::label,
                    format!(
                        "node_modules holds {held}; {manager} install brings it to what package.json lists"
                    )
                )
            );
        }
        anstream::println!();
        return Ok(());
    }
    if !apply(&project, manager, &plan, dry_run)? {
        if vendoring(&project, &manifest) != Vendoring::None {
            anstream::println!(
                "{}",
                term::row(
                    "would run",
                    term::label,
                    "the import map step, which vendors the new version and removes the folders of the one left behind"
                )
            );
        }
        if holds_skill(&project) {
            anstream::println!("{}", term::row("would run", term::label, "zerolith skill"));
        }
        anstream::println!(
            "{}\n",
            term::row("would run", term::label, "zerolith doctor")
        );
        return Ok(());
    }
    vendor_again(&project, manager, &manifest)?;
    refresh_skill(&project, &target)?;
    let healthy = match project_command_line(&project) {
        Some(command_line) => run(&project, &command_line, "zerolith", &["doctor"]).is_ok(),
        None => {
            if env!("CARGO_PKG_VERSION") != target {
                anstream::println!(
                    "{}",
                    term::row(
                        "warning",
                        term::caution,
                        format!(
                            "this command line is {}, and the project has none of its own; install @zerolith/cli {target} to match the packages",
                            env!("CARGO_PKG_VERSION")
                        )
                    )
                );
            }
            crate::doctor::passes(&project)
        }
    };
    anstream::println!(
        "{}\n",
        term::row(
            "upgraded",
            term::done,
            format!(
                "{} to {target}; what changed: {CHANGELOG}",
                match plan.changes.len() {
                    1 => "1 package".to_string(),
                    count => format!("{count} packages"),
                }
            )
        )
    );
    if healthy {
        Ok(())
    } else {
        Err(failure(
            "the packages are upgraded, and zerolith doctor found problems in the project; its findings are above"
                .to_string(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(text: &str) -> serde_json::Value {
        serde_json::from_str(text).unwrap()
    }

    fn scratch(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("zerolith-packages-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn change(name: &'static str, section: Section, spec: &str, was: Option<&str>) -> Change {
        Change {
            name,
            section,
            spec: spec.to_string(),
            was: was.map(str::to_string),
        }
    }

    #[test]
    fn accepts_versions_and_nothing_else() {
        for version in [
            "1.11.0",
            "0.1.0-alpha.10",
            "0.0.0-canary.20261116.g3e67bac",
            "2.0.0-rc.1+build.5",
        ] {
            assert!(is_version(version), "{version}");
        }
        for text in [
            "",
            "1",
            "1.2",
            "1.2.3.4",
            "v1.2.3",
            "1.2.x",
            "latest",
            "^1.2.3",
            "1.2.3-",
            "1.2.3 ",
            "1.2.3&calc",
            "1.2.3|x",
            "1.2.3;x",
            "1.2.3%PATH%",
            "1.2.3\"",
            "1.2.3\n",
            "1.2.3 --global",
            "../1.2.3",
            "1.2.3/x",
            "-1.2.3",
            "1.-2.3",
            "1.2.3-$(x)",
            "1.2.3-`x`",
            "1.2.3-a b",
            "1234567890.1.1",
            "1.2.3\\",
            "1.2.3-\u{e9}",
        ] {
            assert!(!is_version(text), "{text:?}");
        }
        assert!(!is_version(&format!("1.2.3-{}", "a".repeat(64))));
    }

    #[test]
    fn reads_how_a_range_is_written() {
        assert_eq!(written("1.11.0"), Some(("", "1.11.0")));
        assert_eq!(written("^1.11.0"), Some(("^", "1.11.0")));
        assert_eq!(written("~1.11.0"), Some(("~", "1.11.0")));
        for spec in [
            "latest",
            "*",
            "workspace:*",
            "file:../zerolith",
            ">=1.0.0",
            "^1.x",
            "npm:other@1.0.0",
            "",
        ] {
            assert_eq!(written(spec), None, "{spec}");
        }
    }

    #[test]
    fn lists_every_package_of_the_repository_and_no_other() {
        let packages = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages");
        let Ok(folders) = fs::read_dir(&packages) else {
            return;
        };
        let mut published: Vec<String> = folders
            .filter_map(|folder| {
                let text = fs::read_to_string(folder.ok()?.path().join("package.json")).ok()?;
                let manifest: serde_json::Value = serde_json::from_str(&text).ok()?;
                let name = manifest["name"].as_str()?;
                (manifest["private"] != true
                    && (name == "zerolith" || name.starts_with("@zerolith/")))
                .then(|| name.to_string())
            })
            .collect();
        published.sort();
        let mut known: Vec<String> = PACKAGES
            .iter()
            .map(|package| package.name.to_string())
            .collect();
        known.sort();
        assert_eq!(known, published);
        let guides = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../docs/guide");
        for package in &PACKAGES {
            assert!(
                guides.join(format!("{}.md", package.guide)).is_file(),
                "{} names the guide {}, which docs/guide does not hold",
                package.name,
                package.guide
            );
        }
        assert_eq!(PACKAGES[0].name, "zerolith");
    }

    #[test]
    fn adds_packages_at_the_projects_version_in_the_list_each_belongs_to() {
        let project = manifest(
            r#"{ "dependencies": { "zerolith": "1.11.0", "@zerolith/router": "1.11.0" }, "devDependencies": { "@zerolith/cli": "1.11.0" } }"#,
        );
        let names = ["forms", "@zerolith/test", "state", "forms"].map(str::to_string);
        let plan = plan_add(&project, &names, "1.11.0").unwrap();
        assert_eq!(
            plan.changes,
            vec![
                change("@zerolith/forms", Section::Dependencies, "1.11.0", None),
                change("@zerolith/state", Section::Dependencies, "1.11.0", None),
                change("@zerolith/test", Section::Dev, "1.11.0", None),
            ]
        );
        assert!(plan.notes.is_empty());
    }

    #[test]
    fn adds_the_core_to_a_project_that_does_not_list_it_and_writes_ranges_as_the_project_does() {
        let plan = plan_add(&manifest("{}"), &["router".to_string()], "1.11.0").unwrap();
        assert_eq!(
            plan.changes,
            vec![
                change("zerolith", Section::Dependencies, "1.11.0", None),
                change("@zerolith/router", Section::Dependencies, "1.11.0", None),
            ]
        );
        assert_eq!(plan.notes.len(), 1);
        let ranged = manifest(r#"{ "dependencies": { "zerolith": "^1.11.0" } }"#);
        let plan = plan_add(&ranged, &["forms".to_string()], "1.11.2").unwrap();
        assert_eq!(
            plan.changes,
            vec![change(
                "@zerolith/forms",
                Section::Dependencies,
                "^1.11.2",
                None
            )]
        );
    }

    #[test]
    fn keeps_a_listed_package_in_its_list_and_skips_one_already_at_the_version() {
        let project = manifest(
            r#"{ "dependencies": { "zerolith": "1.11.0", "@zerolith/forms": "1.11.0" }, "devDependencies": { "@zerolith/devtools": "1.10.0", "@zerolith/state": "workspace:*" } }"#,
        );
        let names = ["devtools", "forms", "state"].map(str::to_string);
        let plan = plan_add(&project, &names, "1.11.0").unwrap();
        assert_eq!(
            plan.changes,
            vec![change(
                "@zerolith/devtools",
                Section::Dev,
                "1.11.0",
                Some("1.10.0")
            )]
        );
        assert_eq!(plan.notes.len(), 2);
    }

    #[test]
    fn refuses_a_name_that_is_not_a_zerolith_package() {
        for name in [
            "react",
            "@zerolith/nothing",
            "forms@1.0.0",
            "forms && calc",
            "../forms",
            "",
            "@zerolith/",
            "Forms",
        ] {
            let error = plan_add(&manifest("{}"), &[name.to_string()], "1.11.0").unwrap_err();
            assert!(
                error.to_string().contains("is not a zerolith package"),
                "{name}"
            );
        }
    }

    #[test]
    fn upgrades_every_listed_package_together_and_leaves_other_references_alone() {
        let project = manifest(
            r#"{ "dependencies": { "zerolith": "1.10.0", "@zerolith/router": "1.11.0", "@zerolith/forms": "workspace:*", "react": "19.0.0" }, "devDependencies": { "@zerolith/cli": "1.10.0", "@zerolith/vite": "1.12.0" } }"#,
        );
        let plan = plan_upgrade(&project, "1.12.0").unwrap();
        assert_eq!(
            plan.changes,
            vec![
                change("zerolith", Section::Dependencies, "1.12.0", Some("1.10.0")),
                change("@zerolith/cli", Section::Dev, "1.12.0", Some("1.10.0")),
                change(
                    "@zerolith/router",
                    Section::Dependencies,
                    "1.12.0",
                    Some("1.11.0")
                ),
            ]
        );
        assert_eq!(plan.notes.len(), 1);
        assert!(
            plan_upgrade(
                &manifest(r#"{ "dependencies": { "react": "19.0.0" } }"#),
                "1.12.0"
            )
            .is_err()
        );
        let settled = manifest(r#"{ "dependencies": { "zerolith": "^1.12.0" } }"#);
        assert!(plan_upgrade(&settled, "1.12.0").unwrap().changes.is_empty());
    }

    #[test]
    fn edits_package_json_in_place_and_keeps_every_other_byte() {
        let text = "{\r\n    \"name\": \"app\",\r\n    \"dependencies\": {\r\n        \"@zerolith/router\": \"1.11.0\",\r\n        \"react\": \"19.0.0\",\r\n        \"zerolith\": \"1.11.0\"\r\n    },\r\n    \"overrides\": { \"zerolith\": \"1.11.0\", \"note\": \"a \\\"quoted\\\" } brace\" }\r\n}\r\n";
        let edited = edit_manifest(
            text,
            &[
                change("zerolith", Section::Dependencies, "1.12.0", Some("1.11.0")),
                change("@zerolith/forms", Section::Dependencies, "1.12.0", None),
                change("@zerolith/state", Section::Dependencies, "1.12.0", None),
                change("@zerolith/cli", Section::Dev, "1.12.0", None),
            ],
        )
        .unwrap();
        assert_eq!(
            edited,
            "{\r\n    \"name\": \"app\",\r\n    \"dependencies\": {\r\n        \"@zerolith/forms\": \"1.12.0\",\r\n        \"@zerolith/router\": \"1.11.0\",\r\n        \"@zerolith/state\": \"1.12.0\",\r\n        \"react\": \"19.0.0\",\r\n        \"zerolith\": \"1.12.0\"\r\n    },\r\n    \"overrides\": { \"zerolith\": \"1.11.0\", \"note\": \"a \\\"quoted\\\" } brace\" },\r\n    \"devDependencies\": {\r\n        \"@zerolith/cli\": \"1.12.0\"\r\n    }\r\n}\r\n"
        );
    }

    #[test]
    fn edits_package_json_written_in_other_styles() {
        let two = "{\n  \"dependencies\": {\n    \"zerolith\": \"^1.11.0\"\n  },\n  \"devDependencies\": {}\n}";
        assert_eq!(
            edit_manifest(
                two,
                &[
                    change(
                        "zerolith",
                        Section::Dependencies,
                        "^1.12.0",
                        Some("^1.11.0")
                    ),
                    change("@zerolith/vite", Section::Dev, "^1.12.0", None),
                    change("zzz", Section::Dependencies, "1.0.0", None),
                ]
            )
            .unwrap(),
            "{\n  \"dependencies\": {\n    \"zerolith\": \"^1.12.0\",\n    \"zzz\": \"1.0.0\"\n  },\n  \"devDependencies\": {\n    \"@zerolith/vite\": \"^1.12.0\"\n  }\n}"
        );
        let tabs = "{\n\t\"dependencies\": {\n\t\t\"zerolith\": \"1.11.0\"\n\t}\n}\n";
        assert_eq!(
            edit_manifest(
                tabs,
                &[change(
                    "@zerolith/a11y",
                    Section::Dependencies,
                    "1.11.0",
                    None
                )]
            )
            .unwrap(),
            "{\n\t\"dependencies\": {\n\t\t\"@zerolith/a11y\": \"1.11.0\",\n\t\t\"zerolith\": \"1.11.0\"\n\t}\n}\n"
        );
        let line = "{ \"dependencies\": { \"zerolith\": \"1.11.0\" } }";
        assert_eq!(
            edit_manifest(
                line,
                &[change(
                    "@zerolith/forms",
                    Section::Dependencies,
                    "1.11.0",
                    None
                )]
            )
            .unwrap(),
            "{ \"dependencies\": { \"@zerolith/forms\": \"1.11.0\", \"zerolith\": \"1.11.0\" } }"
        );
        assert_eq!(
            edit_manifest(
                "{}",
                &[change("zerolith", Section::Dependencies, "1.11.0", None)]
            )
            .unwrap(),
            "{\n    \"dependencies\": {\n        \"zerolith\": \"1.11.0\"\n    }\n}"
        );
        assert_eq!(
            edit_manifest(
                "\u{feff}{\n    \"name\": \"\u{e9}t\u{e9}\"\n}",
                &[change("zerolith", Section::Dependencies, "1.11.0", None)]
            )
            .unwrap(),
            "\u{feff}{\n    \"name\": \"\u{e9}t\u{e9}\",\n    \"dependencies\": {\n        \"zerolith\": \"1.11.0\"\n    }\n}"
        );
    }

    #[test]
    fn refuses_a_package_json_it_cannot_edit_safely() {
        let one = [change("zerolith", Section::Dependencies, "1.11.0", None)];
        for text in [
            "",
            "[]",
            "\"text\"",
            "{ \"dependencies\": [] }",
            "{ \"dependencies\": \"zerolith\" }",
            "{ \"dependencies\": { \"zerolith\": \"1.0.0\" }, }",
            "{ \"dependencies\": { \"zerolith\": \"1.0.0\" } } trailing",
            "{ // comment\n \"dependencies\": {} }",
            "[{ \"dependencies\": {} }]",
        ] {
            assert!(edit_manifest(text, &one).is_err(), "{text}");
        }
        let twice = "{ \"dependencies\": { \"zerolith\": \"1.0.0\" }, \"dependencies\": { \"zerolith\": \"1.0.0\" } }";
        assert!(edit_manifest(twice, &one).is_err());
    }

    #[test]
    fn finds_the_project_and_its_package_manager_from_a_folder_inside_it() {
        let root = scratch("project");
        fs::create_dir_all(root.join("apps/site/src")).unwrap();
        fs::write(root.join("apps/site/package.json"), "{}").unwrap();
        fs::write(root.join("pnpm-lock.yaml"), "").unwrap();
        let project = project_of(&root.join("apps/site/src")).unwrap();
        assert_eq!(
            project,
            std::path::absolute(root.join("apps/site")).unwrap()
        );
        assert_eq!(manager_of(&project), "pnpm");
        fs::write(root.join("apps/site/yarn.lock"), "").unwrap();
        assert_eq!(manager_of(&project), "yarn");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn reads_how_a_page_with_an_import_map_is_vendored() {
        let root = scratch("vendoring");
        assert_eq!(vendoring(&root, &manifest("{}")), Vendoring::None);
        fs::write(
            root.join("index.html"),
            "<script type=\"importmap\">{\"imports\":{}}</script>",
        )
        .unwrap();
        assert_eq!(vendoring(&root, &manifest("{}")), Vendoring::Unknown);
        fs::create_dir_all(root.join("vendor")).unwrap();
        fs::write(root.join("vendor/importmap.json"), "{}").unwrap();
        assert_eq!(vendoring(&root, &manifest("{}")), Vendoring::Command);
        assert_eq!(
            vendoring(
                &root,
                &manifest(
                    r#"{ "scripts": { "importmap": "zerolith importmap --out web --html index.html" } }"#
                )
            ),
            Vendoring::Script
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn reports_a_peer_that_is_not_installed_and_no_optional_one() {
        let root = scratch("peers");
        fs::create_dir_all(root.join("node_modules/@zerolith/otel")).unwrap();
        fs::create_dir_all(root.join("node_modules/zerolith")).unwrap();
        fs::write(
            root.join("node_modules/zerolith/package.json"),
            r#"{ "version": "1.11.0" }"#,
        )
        .unwrap();
        fs::write(
            root.join("node_modules/@zerolith/otel/package.json"),
            r#"{ "peerDependencies": { "@opentelemetry/api": ">=1.9.0 <2.0.0", "@zerolith/client": "^1.11.0", "zerolith": "^1.11.0" }, "peerDependenciesMeta": { "@zerolith/client": { "optional": true } } }"#,
        )
        .unwrap();
        assert_eq!(
            missing_peers(&root, "@zerolith/otel"),
            vec![(
                "@opentelemetry/api".to_string(),
                ">=1.9.0 <2.0.0".to_string()
            )]
        );
        assert!(missing_peers(&root, "@zerolith/forms").is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn takes_the_projects_version_from_package_json_before_a_stale_install() {
        let root = scratch("current");
        fs::create_dir_all(root.join("node_modules/zerolith")).unwrap();
        fs::write(
            root.join("node_modules/zerolith/package.json"),
            r#"{ "version": "1.10.0" }"#,
        )
        .unwrap();
        let exact = manifest(r#"{ "dependencies": { "zerolith": "1.11.0" } }"#);
        assert_eq!(current_version(&root, &exact).as_deref(), Some("1.11.0"));
        let ranged = manifest(r#"{ "dependencies": { "zerolith": "^1.9.0" } }"#);
        assert_eq!(current_version(&root, &ranged).as_deref(), Some("1.10.0"));
        assert_eq!(
            current_version(&root, &manifest("{}")).as_deref(),
            Some("1.10.0")
        );
        let other = manifest(r#"{ "dependencies": { "zerolith": "workspace:*" } }"#);
        assert_eq!(current_version(&root, &other).as_deref(), Some("1.10.0"));
        fs::remove_dir_all(root.join("node_modules")).unwrap();
        assert_eq!(current_version(&root, &ranged).as_deref(), Some("1.9.0"));
        assert_eq!(current_version(&root, &other), None);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn compares_major_versions() {
        assert!(major("2.0.0") > major("1.11.0"));
        assert_eq!(major("1.12.0"), major("1.0.0-rc.1"));
    }
}
