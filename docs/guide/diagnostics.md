---
title: Diagnostics
description: The one record every error and warning uses, stable codes, documentation URLs, listeners, and production builds.
order: 17
group: Tooling
---

# Diagnostics

Every error and warning zerolith emits is the same record, whether the runtime, the build, or the dev tools found it. Tools read it as data: the inspector shows it, a test asserts on it, and a listener can send it anywhere.

## The record

| Field | Holds |
| --- | --- |
| `code` | A stable snake_case identifier, such as `signal_written_inside_computed` |
| `severity` | `"error"`, `"warning"`, `"deprecation"`, or `"info"` |
| `cause` | One sentence naming what happened |
| `fix` | One sentence naming what to do about it |
| `url` | The code's documentation page, with the arguments in its query string |
| `args` | The values the message is about, such as the index and the type of a refused value, kept apart so a tool can write its own text |
| `location` | Where it points, when known: a `file`, `line`, and `column` in the source, or a `selector` for a node in the page |
| `suggestion` | A change that would resolve it: its `description`, its `replacement` text, and its `applicability` |

The `applicability` of a suggestion follows the grades rustc uses for its own: `machine_applicable` for a change a tool can make without a human reading it, `maybe_incorrect` and `has_placeholders` for one a person should check or complete, and `unspecified` otherwise.

## Errors and warnings

| Severity | Delivered |
| --- | --- |
| `error` | Thrown as a `ZerolithError`, with the record on `.diagnostic` and a message that holds the code, the cause, the fix, and the URL |
| `warning`, `deprecation`, and `info` | Passed to every `onDiagnostic` listener, and listed in the inspector's Diagnostics tab; with no listener registered, the development build prints them to the console |

@include packages/zerolith/test/examples/signals.example.test.ts#diagnostics

`onDiagnostic` returns the function that removes the listener.

> [!IMPORTANT]
> While no listener is registered, the development build prints each warning to the console, worded as an error's message is, so none goes unseen; the production build prints nothing. Registering a listener, such as the one above, takes them over, to send them to the console in a format of your own or to the telemetry an application already has, and the inspector's Diagnostics tab lists every one either way.

## Production builds

The code and the URL are public API and never change meaning. The message text is not: production builds ship an empty catalog, so `cause` and `fix` are empty strings and an error's message carries only the code and the URL, and the page behind the URL carries the explanation. A report from production is still actionable: the code names the problem, and the URL's query string carries its arguments.

## Every code

Each code has a page at `https://zerolith.dev/e/<code>/` with its cause and its fix, and the [diagnostics index](https://zerolith.dev/e/) lists them all:

| Area | Codes |
| --- | --- |
| Signals and effects | `signal_written_inside_computed`, `computed_cycle`, `effect_loop`, `effect_async`, `on_dispose_outside_scope` |
| Templates and JSX | `binding_in_tag_position`, `binding_in_comment`, `binding_in_raw_text`, `binding_in_template_element`, `binding_not_single`, `script_in_template`, `template_unclosed_tag`, `unrenderable_value`, `event_handler_not_function`, `when_condition_function`, `boundary_caught`, `each_items_function`, `each_key_undefined`, `each_key_duplicate`, `ref_not_assignable`, `template_component_uncalled`, `template_frozen_read`, `template_not_prepared`, `jsx_not_lowered` |
| Unsafe values | `unsafe_property_binding`, `unsafe_attribute_binding`, `unsafe_url_blocked`, `css_value_not_allowed` |
| Mounting and hydration | `mount_target_missing`, `mount_component_uncalled`, `hydration_mismatch` |
| Accessibility | `image_without_alt`, `button_without_name`, `frame_without_title` |
| Async data | `resource_timed_out` |
| Routing | `route_name_unknown`, `route_path_invalid` |
| State | `state_storage_unreadable`, `state_storage_unavailable`, `state_value_not_json`, `state_key_duplicate`, `state_store_assigned`, `state_store_path_missing` |
| Browser | `in_view_options_invalid` |
| Builds and versions | `lazy_module_not_split`, `package_version_mismatch` |

The command line's own checks, such as the findings of `zerolith doctor`, use codes of their own with the same cause and fix, printed in the terminal; the [command line guide](command-line.md#doctor) lists them.
